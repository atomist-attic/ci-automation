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
    EventFired,
    EventHandler,
    failure,
    GraphQL,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Secret,
    Secrets,
    Success,
    success,
    Tags,
} from "@atomist/automation-client";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { Project } from "@atomist/automation-client/project/Project";
import { CachingDirectoryManager } from "@atomist/automation-client/spi/clone/CachingDirectoryManager";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import * as slack from "@atomist/slack-messages";

import {
    AddWebhookToCI,
    BuildSystem,
    constructWebhookUrl,
} from "../commands/AddWebhookToCI";
import * as graphql from "../typings/types";

export type NoneType = "none";
export const None: NoneType = "none";
export type BuildSystemOption = BuildSystem | NoneType;

@EventHandler("Prompt to add webhook to CI configuration", GraphQL.subscriptionFromFile("graphql/channelLink"))
@Tags("ci")
export class ChannelLinkCIWebhook implements HandleEvent<graphql.ChannelRepoLink.Subscription> {

    @MappedParameter(MappedParameters.SlackTeam)
    public slackTeamId: string;

    @MappedParameter("atomist://base_webhook_url")
    public baseWebhookUrl: string;

    @Secret(Secrets.OrgToken)
    public githubToken: string;

    public handle(e: EventFired<graphql.ChannelRepoLink.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.debug(`incoming event is ${JSON.stringify(e.data)}`);

        return Promise.all(e.data.ChannelLink.map(cl => {
            const slug = `${cl.repo.owner}/${cl.repo.name}`;
            const credentials = { token: this.githubToken };
            const apiBase = (cl.repo.org && cl.repo.org.provider && cl.repo.org.provider.apiUrl) ?
                cl.repo.org.provider.apiUrl : undefined;
            const grr = new GitHubRepoRef(cl.repo.owner, cl.repo.name, cl.repo.defaultBranch, apiBase);
            return GitCommandGitProject.cloned(credentials, grr, {}, CachingDirectoryManager)
                .then(project => checkCIConfigs(project, this.baseWebhookUrl, this.slackTeamId))
                .then(buildSystem => {
                    if (buildSystem === None) {
                        logger.info(`no CI configuration found in ${slug}:${cl.repo.defaultBranch}`);
                        return;
                    }
                    const msg = addCIWebhookMessage(cl.repo, buildSystem);
                    const msgId = `channel-link-ci-webhook:${slug}:${cl.channel.channelId}`;
                    return ctx.messageClient.addressChannels(msg, cl.channel.name, { id: msgId });
                })
                .catch(err => logger.info(`not sending add CI webhook message: ${err}`));

        }))
            .then(success, failure);
    }
}

interface BuildSystemConfig {
    buildSystem: BuildSystem;
    config: string;
}

function buildSystemConfig(buildSystem: BuildSystem, config: string): BuildSystemConfig {
    return { buildSystem, config };
}

/**
 * Check CI configs in project.  If a CI config exists and does not
 * include the Atomist webhook URL, return the name of the build
 * system.  Otherwise return None.
 *
 * @param project project to look in
 * @param baseUrl base Atomist CI webhook URL
 * @param teamId Slack team ID
 * @return name of BuildSystem or None
 */
export function checkCIConfigs(project: Project, baseUrl: string, teamId: string): Promise<BuildSystemOption> {
    return Promise.resolve()
        .then(() => project.findFile(".travis.yml")
            .then(travisConfig => travisConfig.getContent())
            .then(travisYaml => buildSystemConfig("travis", travisYaml)))
        .catch(err => project.findFile(".circle.yml")
            .then(circle1Config => circle1Config.getContent())
            .then(circle1Yaml => buildSystemConfig("circle", circle1Yaml)))
        .catch(err => project.findFile(".circleci/config.yml")
            .then(circle2Config => circle2Config.getContent())
            .then(circle2Yaml => buildSystemConfig("circle", circle2Yaml)))
        .catch(err => project.findFile("Jenkinsfile")
            .then(jenkinsFile => jenkinsFile.getContent())
            .then(jenkins => buildSystemConfig("jenkins", jenkins)))
        .then(bsContent => {
            const webhookUrl = constructWebhookUrl(baseUrl, bsContent.buildSystem, teamId);
            if (bsContent.config.indexOf(webhookUrl) > -1) {
                return None;
            }
            return bsContent.buildSystem;
        }, err => None);
}

/**
 * Create Slack message prompting to add the Atomist CI webhook to the
 * notifications section of a CI configuration.
 *
 * @param cl event data
 * @param buildSystem name of BuildSystem
 * @return formatted Slack message
 */
export function addCIWebhookMessage(repo: graphql.ChannelRepoLink.Repo, buildSystem: BuildSystem): slack.SlackMessage {

    const buildSystemName = {
        travis: "Travis CI",
        circle: "Circle CI",
        jenkins: "Jenkins",
    }[buildSystem];

    const addAtomistToCI = new AddWebhookToCI();
    addAtomistToCI.buildSystem = buildSystem;
    addAtomistToCI.repo = repo.name;
    addAtomistToCI.owner = repo.owner;
    addAtomistToCI.slackTeamId = repo.org.chatTeam.id;

    const slug = `${repo.owner}/${repo.name}`;
    const baseUrl = (repo.org && repo.org.provider && repo.org.provider.url) ?
        repo.org.provider.url.replace(/\/*$/, "") : "https://github.com";
    const repoUrl = `${baseUrl}/${slug}`;
    const text = `It looks like ${slack.url(repoUrl, slug)} builds on ${slack.bold(buildSystemName)}.` +
        ` Press the button below to start seeing CI build status as part of GitHub notifications.` +
        ` You can also do it later with: ${slack.codeLine("@atomist " + AddWebhookToCI.Intent)}.`;
    const fallback = `Press the button below to start seeing CI build status on GitHub notifications.`;

    const msg: slack.SlackMessage = {
        text: "Let's integrate Atomist with your CI system!",
        attachments: [{
            fallback,
            text,
            mrkdwn_in: ["text"],
            actions: [buttonForCommand({ text: "Get build events" }, addAtomistToCI)],
        }],
    };
    return msg;
}
