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

import { HandlerContext, HandlerResult } from "@atomist/automation-client";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";

import { addWebhookToTravis, constructWebhookUrl } from "../../src/commands/AddWebhookToCI";

describe("AddWebhookToCI", () => {

    describe("constructWebhookUrl", () => {

        it("should create the proper webhook URL", () => {
            const base = `https://webhook.atomist.com/atomist`;
            const ci = `travis`;
            const team = "TK421WAYA";
            const e = `https://webhook.atomist.com/atomist/travis/teams/TK421WAYA`;
            assert(constructWebhookUrl(base, ci, team) === e);
        });

        it("should deal with trailing slash on base webhook URL", () => {
            const base = `https://webhook.atomist.com/atomist/`;
            const ci = `travis`;
            const team = "TK421WAYA";
            const e = `https://webhook.atomist.com/atomist/travis/teams/TK421WAYA`;
            assert(constructWebhookUrl(base, ci, team) === e);
        });

    });

    describe("AddWebhookToTravis", () => {

        const travisYaml = `.travis.yml`;

        it("should add webhook to Travis with no notifications", done => {
            const noNotifications = `language: clojure
env:
  global:
  - GITHUB_TOKEN=nonesuch
script: ./travis-build.sh
cache:
  directories:
  - $HOME/.m2
`;
            const project = InMemoryProject.of({ path: travisYaml, content: noNotifications });
            const url = `https://webhook.atomist.com/atomist/travis/teams/TK421WAYA`;
            addWebhookToTravis(project, url)
                .then(p => {
                    const expected = noNotifications + `notifications:
  email: false
  webhooks:
    urls:
    - https://webhook.atomist.com/atomist/travis/teams/TK421WAYA
    on_success: always
    on_failure: always
    on_start: always
    on_cancel: always
    on_error: always
`;
                    assert(p.findFileSync(travisYaml).getContentSync() === expected);
                })
                .then(() => done(), done);
        });

    });

});
