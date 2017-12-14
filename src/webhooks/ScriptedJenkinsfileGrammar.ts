import { JavaBlock } from "@atomist/microgrammar/matchers/lang/cfamily/java/JavaBody";
import { NestingDepthStateMachine } from "@atomist/microgrammar/matchers/lang/cfamily/NestingDepthStateMachine";
import { Microgrammar } from "@atomist/microgrammar/Microgrammar";
import { optional } from "@atomist/microgrammar/Ops";
import { PatternMatch } from "@atomist/microgrammar/PatternMatch";
import {AtomistPipelineFunctions, findCheckoutCall, isAtomistConfiguredForNotification} from "./JenkinsWebhook";

type Node = NodeBlock & PatternMatch;
export interface NodeBlock {
    parameters: string;
    content: PatternMatch;
}

export const nodeGrammar: Microgrammar<NodeBlock> =
    Microgrammar.fromDefinitions<NodeBlock>({
        _section: "node",
        parameters: optional({
            _lp: "(",
            value: /[^)]*/,
            _rp: ")",
        }),
        content: JavaBlock,
    });

export function getNodeBlocks(jenkinsfile: string): Array<NodeBlock & PatternMatch> {
    return nodeGrammar.findMatches(jenkinsfile,
        {}, { nested: new NestingDepthStateMachine() });
}

/**
 * Add the necessary webhook incrementally to each node found in the file.
 *
 * We have to reparse the file everytime we make a change to recompute the
 * various offsets.
 *
 * The code is so bleak I don't even know where to start. Not my proudest code.
 *
 * @param jenkinsfile
 * @param webhookUrl the Atomist webhook URL to post to
 * @return true if at least one node was edited, otherwise false
 */
export function addWebhookToNodes(initialContent: string, webhookUrl: string): string {
    let content = AtomistPipelineFunctions.replace("WEBHOOK_URL", webhookUrl) + initialContent;
    let atLeastOneChange = false;
    let updated = true;

    // when no updates takes place anymore (when we have exhausted all nodes)
    // then this will be false
    while (updated) {
        updated = false;

        // we have parse each round because we may have updated a node block
        // and all indexes are invalid
        for (const nodeBlock of getNodeBlocks(content)) {

            // do not update a block we already visited
            if (isAtomistConfiguredForNotification(nodeBlock.$matched)) {
                continue;
            }

            // no checkout call in this node? let's move on
            if (findCheckoutCall(nodeBlock.$matched) === null) {
                continue;
            }

            const newContent = wrapAllInTryCatchBlock(nodeBlock);
            content = content.replace(nodeBlock.$matched, newContent);
            // good, at least one node should be updated
            atLeastOneChange = true;
            updated = true;

            // one node was updated, let's escape and recompute offsets
            break;
        }
    }
    return content;
}

/**
 * Wrap a node block in a try catch block so that we have a greater control
 * over sending notifications. There is less fiddling with the content of the
 * Jenkinsfile that way.
 *
 * This expects that inner try/catch block throw the error they may have caught.
 *
 * @param nodeBlock
 */
function wrapAllInTryCatchBlock(nodeBlock: Node): string {
    const content = nodeBlock.$matched;

    // we want offsets relative to the block, not from the beginning of the file
    const blockStartOffset = nodeBlock.content.$offset - nodeBlock.$offset + 1;
    const blockEndOffset = nodeBlock.content.$matched.length + blockStartOffset - 2;
    const indented = content.
    substring(blockStartOffset, blockEndOffset).
    split("\n").
    map(l => l.length === 0 ? l : "    " + l).
    join("\n").
    trim();

    // wrap everything into a try/catch
    let newContent = content.substring(0, blockStartOffset);
    newContent = newContent + "\n    try {\n        ";
    newContent = newContent + indented;
    newContent = newContent +
        "\n        " +
        AtomistFinishedWithSuccessNotification +
        "\n    } catch(e) {\n        " +
        AtomistFinishedWithFailureNotification +
        "\n        throw e\n    }\n}";

    /* Add the 'started' notification right after the checkout */
    const match = findCheckoutCall(newContent);
    const lastIndex = match.index + match[0].replace(/\s*$/, "").length;
    newContent = newContent.substring(0, lastIndex) +
        "\n" +
        new Array(match[1]).join(" ") + // indent the next line properly
        AtomistStartedNotification +
        newContent.substr(lastIndex);

    return newContent;
}

const AtomistStartedNotification = `notifyAtomist("STARTED", "STARTED")`;
const AtomistFinishedWithSuccessNotification = `notifyAtomist("SUCCESS")`;
const AtomistFinishedWithFailureNotification = `notifyAtomist("FAILURE")`;
