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

import "mocha";
import * as assert from "power-assert";

import axios from "axios";
import MockAdapter = require("axios-mock-adapter");

import { HandlerContext, HandlerResult, logger } from "@atomist/automation-client";
import { LoggingConfig } from "@atomist/automation-client/internal/util/logger";

import { EnableTravis } from "../../src/commands/EnableTravis";

LoggingConfig.format = "cli";
(logger as any).level = process.env.LOG_LEVEL || "info";

describe("EnableTravis", () => {

    const repo = `middle-cyclone`;
    const owner = `neko-case`;
    const ghApiUrl = "https://github.anti.com/v3/";
    const token = `thistornadolovesyou`;
    const slug = `${owner}/${repo}`;
    const ciApiUrl = `https://api.travis-ci.org`;
    const enableTravis = new EnableTravis();
    enableTravis.repo = repo;
    enableTravis.owner = owner;
    enableTravis.githubApiUrl = ghApiUrl;
    enableTravis.githubToken = token;
    enableTravis.retries = 1;

    it("should enable Travis CI on a repo", done => {
        let responseMessage: string;
        const ctx = {
            messageClient: {
                respond(msg: string): Promise<any> {
                    responseMessage = msg;
                    return Promise.resolve(msg);
                },
            },
        } as HandlerContext;

        const mock = new MockAdapter(axios);
        mock
            .onGet(`${ghApiUrl}repos/${slug}`).replyOnce(200, { private: false })
            .onPost(`${ciApiUrl}/auth/github`).replyOnce(200, { access_token: "peoplegottalotofnerve" })
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(200, { repo: { id: 2009 } })
            .onPut(`${ciApiUrl}/hooks`).replyOnce(200);

        enableTravis.handle(ctx)
            .then(result => {
                assert(result.code === 0);
                assert(responseMessage === `Successfully enabled Travis CI builds on ${slug}`);
            }).then(() => done(), done);

    });

    it("should sync if Travis does not know about repo", done => {
        let responseMessage: string;
        const ctx = {
            messageClient: {
                respond(msg: string): Promise<any> {
                    responseMessage = msg;
                    return Promise.resolve(msg);
                },
            },
        } as HandlerContext;

        let synced = false;
        const mock = new MockAdapter(axios);
        mock
            .onGet(`${ghApiUrl}repos/${slug}`).replyOnce(200, { private: false })
            .onPost(`${ciApiUrl}/auth/github`).replyOnce(200, { access_token: "peoplegottalotofnerve" })
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(404)
            .onPost(`${ciApiUrl}/users/sync`).replyOnce(config => {
                synced = true;
                return [200];
            })
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(200, { repo: { id: 2009 } })
            .onPut(`${ciApiUrl}/hooks`).replyOnce(200);

        enableTravis.handle(ctx)
            .then(result => {
                assert(synced, "Travis CI user sync was called");
                assert(result.code === 0);
                assert(responseMessage === `Successfully enabled Travis CI builds on ${slug}`);
            }).then(() => done(), done);

    });

    it("should deal with some failures when enabling Travis CI on a repo", done => {
        let responseMessage: string;
        const ctx = {
            messageClient: {
                respond(msg: string): Promise<any> {
                    responseMessage = msg;
                    return Promise.resolve(msg);
                },
            },
        } as HandlerContext;

        const mock = new MockAdapter(axios);
        mock
            .onGet(`${ghApiUrl}repos/${slug}`).replyOnce(500)
            .onGet(`${ghApiUrl}repos/${slug}`).replyOnce(200, { private: false })
            .onPost(`${ciApiUrl}/auth/github`).replyOnce(500)
            .onPost(`${ciApiUrl}/auth/github`).replyOnce(200, { access_token: "peoplegottalotofnerve" })
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(404)
            .onPost(`${ciApiUrl}/users/sync`).replyOnce(409)
            .onPost(`${ciApiUrl}/users/sync`).replyOnce(409)
            .onPost(`${ciApiUrl}/users/sync`).replyOnce(200)
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(404)
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(200, { repo: { id: 2009 } })
            .onPut(`${ciApiUrl}/hooks`).replyOnce(500)
            .onPut(`${ciApiUrl}/hooks`).replyOnce(200);

        enableTravis.handle(ctx)
            .then(result => {
                assert(result.code === 0);
                assert(responseMessage === `Successfully enabled Travis CI builds on ${slug}`);
            }).then(() => done(), err => done(err));

    }).timeout(10000);

    it("should fail when getting GitHUb repo fails", done => {
        let responseMessage: string;
        const ctx = {
            messageClient: {
                respond(msg: string): Promise<any> {
                    responseMessage = msg;
                    return Promise.resolve(msg);
                },
            },
        } as HandlerContext;

        const errStatus = 500;
        const mock = new MockAdapter(axios);
        mock.onGet(`${ghApiUrl}repos/${slug}`).reply(errStatus);

        enableTravis.handle(ctx)
            .then(result => {
                assert(result.code === 1);
                const urlMsg = `: GET ${ghApiUrl}repos/${slug}`;
                const errMsg = `Error: Request failed with status code ${errStatus}`;
                assert(responseMessage === `Failed to enable Travis CI build on ${slug}${urlMsg}: \`${errMsg}\``);
            }).then(() => done(), err => done(err));

    }).timeout(5000);

    it("should fail when user sync never returns 200", done => {
        let responseMessage: string;
        const ctx = {
            messageClient: {
                respond(msg: string): Promise<any> {
                    responseMessage = msg;
                    return Promise.resolve(msg);
                },
            },
        } as HandlerContext;

        const errStatus = 409;
        const mock = new MockAdapter(axios);
        mock
            .onGet(`${ghApiUrl}repos/${slug}`).replyOnce(200, { private: false })
            .onPost(`${ciApiUrl}/auth/github`).replyOnce(200, { access_token: "peoplegottalotofnerve" })
            .onGet(`${ciApiUrl}/repos/${slug}`).replyOnce(404)
            .onPost(`${ciApiUrl}/users/sync`).reply(errStatus);

        enableTravis.handle(ctx)
            .then(result => {
                assert(result.code === 1);
                const urlMsg = `: POST ${ciApiUrl}/users/sync`;
                const errMsg = `Error: Request failed with status code ${errStatus}`;
                assert(responseMessage === `Failed to enable Travis CI build on ${slug}${urlMsg}: \`${errMsg}\``);
            }).then(() => done(), err => done(err));

    }).timeout(10000);

});
