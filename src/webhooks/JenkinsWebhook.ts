
import {Project} from "@atomist/automation-client/project/Project";
import {BuildSystem} from "../commands/AddWebhookToCI";

import {addWebhookToPipelineSection, getPipelineSection} from "../../src/webhooks/DeclarativeJenkinsfileGrammar";
import {Webhook} from "../../src/webhooks/Webhook";
import {addWebhookToNodes} from "./ScriptedJenkinsfileGrammar";

export class JenkinsWebhook implements Webhook {

    public readonly buildSystem: BuildSystem = "jenkins";

    private jenkinsfilePath: string = "Jenkinsfile";

    public addWebhook(project: Project, url: string): Promise<Project> {
        return project.findFile(this.jenkinsfilePath).then(jenkinsfile => {
            return jenkinsfile.getContent().then(content => {
                if (isAtomistConfiguredForNotification(content)) {
                    return project;
                }
                let newContent;
                const syntax = this.detectSyntax(content);
                if (syntax === "declarative-pipeline") {
                    const pipelineSection = getPipelineSection(content);
                    newContent = addWebhookToPipelineSection(content, pipelineSection, url);
                } else if (syntax === "scripted-pipeline") {
                    newContent = addWebhookToNodes(content, url);
                } else {
                    const msg = `Failed to detect the Jenkins file syntax in '${jenkinsfile.path}'`;
                    return Promise.reject(msg);
                }
                if (newContent !== content) {
                    return jenkinsfile.setContent(newContent).then(() => project);
                }
                return project;
            });
        }, err => {
            const msg = `Failed to find Jenkins file '${this.jenkinsfilePath}'`;
            return Promise.reject(msg);
        });
    }

    /**
     * Detecs which style is used in this Jenkinsfile: declarative or scripted
     * pipeline definition.
     *
     * The detection is rather simplistic for now as it looks for the `pipeline`
     * block for the decelarative syntax, and a `node` block for the scripted
     * syntax.
     *
     * @param content the Jenkinsfile content to inspect
     * @return "declarative-pipeline", "scripted-pipeline" or null when failed to
     *         detect any of them
     */
    private detectSyntax(content: string): "declarative-pipeline" | "scripted-pipeline" {
        if (content.search(/^pipeline\s*{/m) > -1) {
            return "declarative-pipeline";
        }
        if (content.search(/^node\s*{/m) > -1) {
            return "scripted-pipeline";
        }
        return null;
    }

}

export function isAtomistConfiguredForNotification(content: string): boolean {
    return content.indexOf("notifyAtomist\(") > -1;
}

/**
 * Check if the given node block performs a checkout call. Without a checkout
 * we cannot extract commit information so we can't add our webhook.
 *
 * @param nodeBlock
 */
export function findCheckoutCall(content: string): RegExpMatchArray {
    let pattern = /^(\s*)checkout scm.*$/m;
    let match = pattern.exec(content);

    // maybe they use a direct `git clone ...` command
    if (!match) {
        pattern = /^(\s*)git\s+clone\s.*$/m;
        match = pattern.exec(content);
    }

    return match;
}

// tslint:disable:max-line-length
export const AtomistPipelineFunctions = `import groovy.json.JsonOutput
/*
 * Retrieve current SCM information from local checkout
 */
def getSCMInformation() {
    def gitRemoteUrl = sh(returnStdout: true, script: 'git config --get remote.origin.url').trim()
    def gitCommitSha = sh(returnStdout: true, script: 'git rev-parse HEAD').trim()
    def gitBranchName = sh(returnStdout: true, script: 'git name-rev --always --name-only HEAD').trim().replace('remotes/origin/', '')
    return [
        url: gitRemoteUrl,
        branch: gitBranchName,
        commit: gitCommitSha
    ]
}
/*
 * Notify the Atomist services about the status of a build based from a
 * git repository.
 */
def notifyAtomist(buildStatus, buildPhase="FINALIZED",
                  endpoint="WEBHOOK_URL") {
    def payload = JsonOutput.toJson([
        name: env.JOB_NAME,
        duration: currentBuild.duration,
        build      : [
            number: env.BUILD_NUMBER,
            phase: buildPhase,
            status: buildStatus,
            full_url: env.BUILD_URL,
            scm: getSCMInformation()
        ]
    ])
    sh "curl --silent -XPOST -H 'Content-Type: application/json' -d '\${payload}' \${endpoint}"
}
`;
