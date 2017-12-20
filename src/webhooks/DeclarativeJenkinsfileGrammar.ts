import {File} from "@atomist/automation-client/project/File";
import { block } from "@atomist/microgrammar/matchers/lang/cfamily/CBlock";
import {
    NestingDepthStateMachine,
} from "@atomist/microgrammar/matchers/lang/cfamily/NestingDepthStateMachine";
import {
    DoubleString, Normal, SlashSlashComment, SlashStarComment,
} from "@atomist/microgrammar/matchers/lang/cfamily/States";
import { LangState, LangStateMachine } from "@atomist/microgrammar/matchers/lang/LangStateMachine";
import { RestOfLine, takeUntil } from "@atomist/microgrammar/matchers/skip/Skip";
import { Microgrammar } from "@atomist/microgrammar/Microgrammar";
import { firstOf, optional, when } from "@atomist/microgrammar/Ops";
import { PatternMatch } from "@atomist/microgrammar/PatternMatch";
import { zeroOrMore } from "@atomist/microgrammar/Rep";
import {AtomistPipelineFunctions, findCheckoutCall} from "./JenkinsWebhook";

export interface PostConditionBlock {
    name: string;
    content: string;
}

export interface PostSection {
    conditions: PostConditionBlock[];
}

export interface Steps {
    openingStepBlock: string & PatternMatch;
    lines: string;
    closingStepBlock: string & PatternMatch;
}

export interface StageSection {
    children: PatternMatch[];
}

export interface PipelineSection {
    openingPipelineBlock: string & PatternMatch;
    children: PatternMatch[];
    closingPipelineBlock: string & PatternMatch;
}

const SingleString = new LangState("string", false, true);

/**
 * A state machine that is aware of double quoted strings
 * as well as single quoted strings, both can exist in a
 * a Groovy file.
 */
class StringAwareStateMachine extends LangStateMachine {

    constructor(state: LangState = Normal) {
        super(state);
    }

    public clone(): StringAwareStateMachine {
        return new StringAwareStateMachine(this.state);
    }

    public consume(ch: string): void {
        this.previousState = this.state;
        switch (this.state) {
            case SlashSlashComment:
                if (ch === "\n") {
                    this.state = Normal;
                }
                break;
            case SlashStarComment:
                if (ch === "/" && this.previousChar === "*") {
                    this.state = Normal;
                }
                break;
            case Normal:
                switch (ch) {
                    case '"':
                        this.state = DoubleString;
                        break;
                    case "'":
                        this.state = SingleString;
                        break;
                    case "/":
                        if (this.previousChar === "/") {
                            this.state = SlashSlashComment;
                        }
                        break;
                    case "*":
                        if (this.previousChar === "/") {
                            this.state = SlashStarComment;
                        }
                        break;
                    default:
                }
                break;
            case SingleString:
                if (ch === "'" && this.previousChar !== "\\") {
                    this.state = Normal;
                }
                break;
            case DoubleString:
                if (ch === '"' && this.previousChar !== "\\") {
                    this.state = Normal;
                }
                break;
        }
        this.previousChar = ch;
    }
}

const DirectiveBlock = block(() => new StringAwareStateMachine());

export const postConditionBlockGrammar: Microgrammar<PostConditionBlock> =
    Microgrammar.fromDefinitions<PostConditionBlock>({
        name: /^(success|changed|failure|success|unstable|aborted)/,
        content: DirectiveBlock,
    });

export const postSectionGrammar: Microgrammar<PostSection> =
    Microgrammar.fromDefinitions<PostSection>({
        _section: "post",
        _lcb: "{",
        conditions: zeroOrMore(postConditionBlockGrammar),
        _rcb: "}",
    });

export const stepsGrammar: Microgrammar<Steps> =
    Microgrammar.fromDefinitions<Steps>({
        _section: "steps",
        openingStepBlock: "{",
        lines: /^.*\n/m,
        closingStepBlock: "}",
    });

export const stageSectionGrammar: Microgrammar<StageSection> =
    Microgrammar.fromDefinitions<StageSection>({
        _section: "stage",
        _lp: "(",
        name: /[^)]+/,
        _rp: ")",
        _lcb: "{",
        children: zeroOrMore(
            when(
                {
                    name: /^[-a-zA-Z0-9]+/,
                    content: firstOf(DirectiveBlock, RestOfLine),
                },
                _ => true,
                is => (is.listeners.nested as NestingDepthStateMachine).depth === 2,
            ),
        ),
        _rcb: "}",
    });

export const pipelineSectionGrammar: Microgrammar<PipelineSection> =
    Microgrammar.fromDefinitions<PipelineSection>({
        _section: "pipeline",
        openingPipelineBlock: "{",
        children: zeroOrMore({
            comment: optional(
                firstOf(
                    {
                        _slashslash: /^\/\//,
                        text: RestOfLine,
                    },
                    {
                        _slashstar: /^\/\*/,
                        text: takeUntil(/\*\//),
                        _starslash: /\*\//,
                    },
                ),
            ),
            name: /^[-a-zA-Z0-9]+/,
            arg: optional({
                _lp: "(",
                name: /[^)]*/,
                _rp: ")",
            }),
            content: firstOf(DirectiveBlock, RestOfLine),
        }),
        closingPipelineBlock: "}",
    });

export function getPipelineSection(jenkinsfile: string): (PipelineSection & PatternMatch) {
    const matchedPipelineSection = pipelineSectionGrammar.findMatches(
        jenkinsfile);

    if (matchedPipelineSection.length === 0) {
        return null;
    }

    const pipelineSection = matchedPipelineSection[0];
    return pipelineSection;
}

export function getPostSectionFromSection(section: PatternMatch): PostSection {
    for (const child of (section as any).children) {
        if ((child as any).name === "post") {
            return postSectionGrammar.firstMatch(child.$matched);
        }
    }

    return null;
}

export function getFirstStageSectionFromPipeline(
    pipelineSection: PipelineSection & PatternMatch): StageSection & PatternMatch {
    for (const section of pipelineSection.children) {
        if ((section as any).name === "stages") {
            const stageSections = stageSectionGrammar.findMatches(section.$matched,
                {}, { nested: new NestingDepthStateMachine() });

            if (stageSections.length === 0) {
                return null;
            }

            for (const stage of stageSections) {
                if (findCheckoutCall(stage.$matched)) {
                    return stage;
                }
            }
        }
    }

    return null;
}

export function getFirstStepFromStage(
    stageSection: StageSection & PatternMatch): Steps & PatternMatch {
    for (const section of stageSection.children) {
        if ((section as any).name === "steps") {
            const steps = stepsGrammar.findMatches(section.$matched,
                {}, { nested: new NestingDepthStateMachine() });

            if (steps.length === 0) {
                return null;
            }

            for (const step of steps) {
                if (findCheckoutCall(step.$matched)) {
                    return step;
                }
            }
        }
    }

    return null;
}

export function addWebhookToPipelineSection(
    content: string,
    pipelineSection: PipelineSection & PatternMatch,
    webhookUrl: string,
): string {
    let updated = false;

    if (!findCheckoutCall(content)) {
        return null;
    }

    const stageSection = getFirstStageSectionFromPipeline(pipelineSection);
    if (stageSection) {
        const step = getFirstStepFromStage(stageSection);
        if (step) {
            let found = false;
            for (const line of step.lines) {
                if (line === AtomistStageStepSection) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                const stepStartOffset = (step as any).$valueMatches.openingStepBlock.$offset + 1;
                const stepEndOffset = (step as any).$valueMatches.closingStepBlock.$offset - 1;

                const stepContent = step.$matched;
                const newStep = stepContent.substr(step.$offset, stepStartOffset) +
                    stepContent.substring(stepStartOffset, stepEndOffset) +
                    "    " +
                    AtomistStageStepSection +
                    "\n                }";
                content = content.replace(step.$matched, newStep);
                updated = true;
            }
        }
    }

    if (updated) {
        pipelineSection = getPipelineSection(content);
    }

    // Stitch the new Jenkinsfile content together
    const pipelineStartOffset = (pipelineSection as any).$offset;
    const pipelineEndOffset = (pipelineSection as any).$valueMatches.closingPipelineBlock.$offset;
    return AtomistPipelineFunctions.replace("WEBHOOK_URL", webhookUrl) +
        content.substring(pipelineStartOffset, pipelineEndOffset - 1) +
        AtomistPostSection +
        "\n}";
}

export function getNodes(jenkinsfile: string): (PipelineSection & PatternMatch) {
    const pipelineSection = pipelineSectionGrammar.findMatches(
        jenkinsfile, {}, { nested: new NestingDepthStateMachine() });

    if (pipelineSection.length === 0) {
        return null;
    }

    return pipelineSection[0];
}

const AtomistStageStepSection = `notifyAtomist("STARTED", "STARTED")`;

const AtomistPostSection = `
    post {
        success {
            notifyAtomist("SUCCESS")
        }
        unstable {
            notifyAtomist("UNSTABLE")
        }
        failure {
            notifyAtomist("FAILURE")
        }
    }`
;
