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

import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";

import { Project } from "@atomist/automation-client/project/Project";

import * as yaml from "js-yaml";
import {TravisWebhook} from "../../src/webhooks/TravisWebhook";

describe("TravisWebhook", () => {

    describe("add webhook", () => {

        const travisYaml = `.travis.yml`;
        const webhookUrl = `https://webhook.atomist.com/atomist/travis/teams/TK421WAYA`;

        const atomistWebhookConfigured = (config: string) => {
            const buildConfig = yaml.safeLoad(config);
            const webhookUrls = buildConfig.notifications.webhooks.urls as string[];
            assert(webhookUrls.filter(url => url === webhookUrl).length === 1);
        };

        const allNotificationsTurnedOn = (config: string) => {
            const buildConfig = yaml.safeLoad(config);
            const webhookConfig = buildConfig.notifications.webhooks;
            assert("always" === webhookConfig.on_cancel);
            assert("always" === webhookConfig.on_error);
            assert("always" === webhookConfig.on_success);
            assert("always" === webhookConfig.on_start);
            assert("always" === webhookConfig.on_failure);
        };

        const testAddingWebhookToConfig = (project: Project, done: MochaDone) => {
            new TravisWebhook().addWebhook(project, webhookUrl)
                .then(p => {
                    const travisConfig = p.findFileSync(travisYaml).getContentSync();
                    atomistWebhookConfigured(travisConfig);
                    allNotificationsTurnedOn(travisConfig);
                })
                .then(() => done(), done);
        };

        it("should fail when config does not exist", done => {
            new TravisWebhook().addWebhook(InMemoryProject.of(), webhookUrl)
                .then(() => {
                    assert.fail("should fail on missing Travis config");
                }, err => {
                    assert(err === "File not found at .travis.yml");
                })
                .then(() => done(), done);
        });

        it("should add Travis webhook to config with no notifications", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - GITHUB_TOKEN=nonesuch
script: ./travis-build.sh
cache:
  directories:
  - $HOME/.m2
`,
                }), done,
            );
        });

        it("should add Travis webhook to config with existing notifications but no webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
notifications:
  email: yay@home.com
cache:
  directories:
  - $HOME/.m2
`,
                }), done,
            );
        });

        it("should add Travis webhook to config with existing webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
notifications:
  webhooks: http://internal.com/travis-yo
  email: yay@home.com
cache:
  directories:
  - $HOME/.m2
`,
                }), done,
            );
        });

        it("should add Travis webhook to config with multiple existing webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
notifications:
  webhooks:
    urls:
    - http://internal.com/travis-yo
    - http://external.com/travis-hey
    on_cancel: change
    on_start: never
  email: yay@home.com
cache:
  directories:
  - $HOME/.m2
`,
                }), done,
            );
        });

        it("should add Travis webhook to config with multiple existing webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
notifications:
  webhooks:
    urls:
    - http://internal.com/travis-yo
    - http://external.com/travis-hey
    on_cancel: change
    on_start: never
  email: yay@home.com
cache:
  directories:
  - $HOME/.m2
`,
                }), done,
            );
        });

        it("should add Travis webhook to config with existing webhook and fewer notifications", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
notifications:
  webhooks:
    urls: http://internal.com/travis-yo
    on_start: never
  email: yay@home.com
cache:
  directories:
  - $HOME/.m2
`,
                }), done,
            );
        });

        it("should add Travis webhook to config with atomist webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
cache:
  directories:
  - $HOME/.m2
notifications:
  webhooks:
    urls:
    - http://internal.com/travis-yo
    - https://webhook.atomist.com/atomist/travis/teams/TK421WAYA
    on_cancel: always
    on_start: always
    on_error: always
    on_failure: always
    on_success: always
  email: yay@home.com
`,
                }), done,
            );
        });

        it("should enable notifications in Travis config with atomist webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: travisYaml,
                    content: `language: clojure
env:
  global:
  - COMMIT: $\\{TRAVIS_COMMIT::7}
script: ./travis-build.sh
cache:
  directories:
  - $HOME/.m2
notifications:
  webhooks:
    urls:
    - http://internal.com/travis-yo
    - https://webhook.atomist.com/atomist/travis/teams/TK421WAYA
    on_cancel: always
    on_start: change
    on_error: never
  email: yay@home.com
`,
                }), done,
            );
        });

    });

});
