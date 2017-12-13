/*
 * Copyright © 2017 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    CommandHandler,
    failure,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secret,
    Secrets,
    Success,
    success,
    Tags,
} from "@atomist/automation-client";
import { ActionResult } from "@atomist/automation-client/action/ActionResult";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { Project } from "@atomist/automation-client/project/Project";
import { CachingDirectoryManager } from "@atomist/automation-client/spi/clone/CachingDirectoryManager";
import { updateYamlDocument } from "@atomist/yaml-updater/Yaml";

import * as yaml from "js-yaml";

import { combineErrors } from "./EnableTravis";

export type BuildSystem = "travis" | "jenkins" | "circle";

@CommandHandler("Add the Atomist webhook to a project CI configuration", "add ci webhook")
@Tags("ci", "circle", "jenkins", "travis")
export class AddWebhookToCI implements HandleCommand {

    @Parameter({
        displayName: "Project CI Provider",
        pattern: /^(travis|jenkins|circle)$/,
        description: "the name of the project CI",
        validInput: "this should be one of the supported providers: travis, jenkins, circle or codeship",
        minLength: 5,
        maxLength: 8,
        required: true,
        displayable: true,
    })
    public buildSystem: BuildSystem;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public slackTeamId: string;

    @MappedParameter("atomist://base_webhook_url")
    public baseWebhookUrl: string;

    @Secret(Secrets.UserToken)
    public githubToken: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return GitCommandGitProject.cloned({ token: this.githubToken },
            new GitHubRepoRef(this.owner, this.repo), {}, CachingDirectoryManager)
            .then(project => addWebhook(project, this.baseWebhookUrl, this.buildSystem, this.slackTeamId))
            .then(project => createCIWebhookPullRequest(project as GitProject, this.buildSystem))
            .then(success, err => {
                const errResponse = `Failed to create PR adding ${this.buildSystem} Atomist webhook to build` +
                    ` configuration: ${err.message}`;
                return ctx.messageClient.respond(errResponse)
                    .then(() => failure(err), msgErr => failure(combineErrors(err, msgErr)));
            });
    }

}

/**
 * Create a standard Atomist webhook URL from the provided parameters.
 *
 * @param baseUrl first part of URL, i.e., the part before the build system
 * @param buildSystem name of CI, e.g., "travis" or "circle"
 * @param teamId Slack team like, e.g., T12345ABC
 * @return standard webhook URL
 */
export function constructWebhookUrl(baseUrl: string, buildSystem: string, teamId: string): string {
    const cleanBaseUrl = baseUrl.replace(/\/*$/, "");
    return `${cleanBaseUrl}/${buildSystem}/teams/${teamId}`;
}

export function addWebhook(
    project: Project,
    webhookBaseUrl: string,
    buildSystem: BuildSystem,
    teamId: string,
): Promise<Project> {

    const editor = {
        travis: addWebhookToTravis,
        circle: addWebhookToCircle,
        jenkins: addWebhookToJenkins,
    }[buildSystem];
    const url = constructWebhookUrl(webhookBaseUrl, buildSystem, teamId);

    return editor(project, url);
}

export function addWebhookToTravis(project: Project, url: string): Promise<Project> {
    const travisConfigPath = ".travis.yml";
    const file = project.findFileSync(travisConfigPath);
    if (!file) {
        throw new Error(`File ${travisConfigPath} not found`);
    }
    const yml = file.getContentSync();
    let travisConfig;
    try {
        travisConfig = yaml.safeLoad(yml);
    } catch (e) {
        throw new Error(`failed to parse Travis config ${travisConfigPath}: ${JSON.stringify(e)}`);
    }
    const notifications = standardizeNotifications(travisConfig.notifications);
    if (!notifications.webhooks.urls.some(z => z === url)) {
        notifications.webhooks.urls.push(url);
    }
    notifications.webhooks.on_cancel = "always";
    notifications.webhooks.on_error = "always";
    notifications.webhooks.on_start = "always";
    notifications.webhooks.on_failure = "always";
    notifications.webhooks.on_success = "always";

    const newYml = updateYamlDocument({ notifications }, yml);
    file.setContentSync(newYml);
    return Promise.resolve(project);
}

interface Notifications {
    webhooks: {
        urls: string[]
        on_cancel?: string
        on_error?: string
        on_start?: string
        on_failure?: string
        on_success?: string,
    };
}

function standardizeNotifications(existingNotifications: any): Notifications {
    if (!existingNotifications) {
        return { webhooks: { urls: [] } };
    }
    if (!existingNotifications.webhooks) {
        return {
            ...existingNotifications,
            webhooks: { urls: [] },
        };
    }
    if (typeof existingNotifications.webhooks === "string") {
        return {
            ...existingNotifications,
            webhooks: { urls: [existingNotifications.webhooks] },
        };
    }
    if (!existingNotifications.webhooks.urls) {
        return {
            ...existingNotifications,
            webhooks: {
                ...existingNotifications.webhooks,
                urls: [],
            },
        };
    }
    if (typeof existingNotifications.webhooks.urls === "string") {
        return {
            ...existingNotifications,
            webhooks: {
                ...existingNotifications.webhooks,
                urls: [existingNotifications.webhooks.urls],
            },
        };
    }
    return existingNotifications;
}

export function addWebhookToCircle(project: Project, url: string): Promise<Project> {
    return Promise.resolve(project);
}

export function addWebhookToJenkins(project: Project, url: string): Promise<Project> {
    return Promise.resolve(project);
}

export function createCIWebhookPullRequest(
    project: GitProject,
    buildSystem: BuildSystem,
): Promise<ActionResult<GitProject>> {

    const title = "Receive build notifications via Atomist";
    const body = `Send build events to Atomist.

They'll be incorporated into GitHub push and PR notifications,
so you'll see dynamically updated build results along with your commits.

https://docs.atomist.com/user/#continuous-integration`;
    return project.raisePullRequest(title, body);
}
