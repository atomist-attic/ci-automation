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
    success,
    Tags,
} from "@atomist/automation-client";
import { doWithRetry } from "@atomist/automation-client/util/retry";
import axios, { AxiosResponse } from "axios";

interface TravisHeaders {
    Accept: string;
    "Content-Type": string;
    "User-Agent": string;
    Authorization?: string;
}

@CommandHandler("Enable Travis CI build for a GitHub.com repository", "enable travis")
@Tags("travis", "ci", "github")
export class EnableTravis implements HandleCommand {

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public githubApiUrl: string;

    @Secret(Secrets.userToken(["repo", "read:org", "user:email"]))
    public githubToken: string;

    public retries = 5;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        const slug = `${this.owner}/${this.repo}`;
        const githubRepoUrl = `${this.githubApiUrl}repos/${slug}`;
        const githubHeaders = {
            Accept: "application/vnd.github.v3+json",
            Authorization: `token ${this.githubToken}`,
        };
        const retryConfig = { retries: this.retries };
        return doWithRetry(() => axios.get(githubRepoUrl, { headers: githubHeaders }),
            `github:getRepo:${slug}`, retryConfig)
            .then(ghRepo => ghRepo.data.private as boolean)
            .then(repoPrivate => {
                const travisBaseUrl = "https://api.travis-ci." + (repoPrivate ? "com" : "org");
                const travisAuthUrl = `${travisBaseUrl}/auth/github`;
                const postData = { github_token: this.githubToken };
                const travisHeaders: TravisHeaders = {
                    "Accept": "application/vnd.travis-ci.2+json",
                    "Content-Type": "application/json",
                    "User-Agent": "Travis/1.6.8",
                };
                const travisRepoUrl = `${travisBaseUrl}/repos/${slug}`;
                return doWithRetry(() => axios.post(travisAuthUrl, postData, { headers: travisHeaders }),
                    `travis:getRepo:${slug}`, retryConfig)
                    .then(response => response.data.access_token as string)
                    .then(token => {
                        travisHeaders.Authorization = `token ${token}`;
                        return axios.get(travisRepoUrl, { headers: travisHeaders })
                            .catch(getRepoErr => {
                                // force Travis to sync with GitHub
                                const travisSyncUrl = `${travisBaseUrl}/users/sync`;
                                const syncRetryConfig = { retries: 2 * this.retries };
                                return doWithRetry(() => axios.post(travisSyncUrl, {}, { headers: travisHeaders }),
                                    `travis:userSync`, syncRetryConfig)
                                    .then(() => doWithRetry(() => axios.get(travisRepoUrl, { headers: travisHeaders }),
                                        `travis:getRepoAfterSync:${slug}`, retryConfig));
                            });
                    })
                    .then(travisRepo => travisRepo.data.repo.id as number)
                    .then(repoId => {
                        const travisHookUrl = `${travisBaseUrl}/hooks`;
                        const travisHookData = {
                            hook: {
                                id: repoId,
                                active: true,
                            },
                        };
                        return doWithRetry(() => axios.put(travisHookUrl, travisHookData, { headers: travisHeaders }),
                            `travis:putHook:${slug}`, retryConfig);
                    })
                    .then(() => ctx.messageClient.respond(`Successfully enabled Travis CI builds on ${slug}`))
                    .then(success);
            })
            .catch(err => {
                const errMsg = `${err}`;
                const method = (err && err.config && err.config.method) ?
                    " " + (err.config.method as string).toUpperCase() : "";
                const url = (err && err.config && err.config.url) ? err.config.url as string : "";
                const urlMsg = (url) ? `:${method} ${url}` : "";
                const errResponse = `Failed to enable Travis CI build on ${slug}${urlMsg}: \`${errMsg}\``;
                return ctx.messageClient.respond(errResponse)
                    .then(failure, failure);
            });

    }

}
