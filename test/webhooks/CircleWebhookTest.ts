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
import {CircleWebhook} from "../../src/webhooks/CircleWebhook";
import {circle1ConfigPath, circle2ConfigPath} from "../../src/webhooks/CircleWebhook";

describe("CircleWebhook", () => {

    describe("add webhook", () => {

        const webhookUrl = `https://webhook.atomist.com/atomist/circle/teams/TK421WAYA`;

        const testAddingWebhookToConfig = (project: Project, done: MochaDone) => {
            new CircleWebhook().addWebhook(project, webhookUrl)
                .then(p => {
                    const config = p.findFileSync(circle1ConfigPath).getContentSync();
                    const buildConfig = yaml.safeLoad(config);
                    const webhookUrls = buildConfig.notify.webhooks as any[];
                    assert(webhookUrls.filter(wh => wh.url === webhookUrl).length === 1);
                })
                .then(() => done(), done);
        };

        const testAddingWebhookToConfigForCircle2 = (project: Project, done: MochaDone) => {
            new CircleWebhook().addWebhook(project, webhookUrl)
                .then(p => {
                    const config = p.findFileSync(circle2ConfigPath).getContentSync();
                    yaml.safeLoadAll(config, buildConfig => {
                        if (!buildConfig.notify) {
                            throw new Error("failed to add notify section to Circle multi documents");
                        }
                        const webhookUrls = buildConfig.notify.webhooks as any[];
                        const atomistWebhooks = webhookUrls.filter(z => z.url === webhookUrl);
                        if (atomistWebhooks.length === 0) {
                            throw new Error("failed to add webhook to Circle multi document");
                        } else if (atomistWebhooks.length > 1) {
                            throw new Error("duplicated webhook URL in CircleCI document");
                        }
                    });
                })
                .then(() => done(), done);
        };

        it("should fail when config does not exist", done => {
            new CircleWebhook().addWebhook(InMemoryProject.of(), webhookUrl)
                .then(() => {
                    assert.fail("should fail on missing Circle config");
                }, err => {
                    assert(err === "Circle config files not found");
                })
                .then(() => done(), done);
        });

        it("should add webhook to config with no existing webhooks", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: circle1ConfigPath,
                    content: `## Customize deployment commands
deployment:
  staging:
    branch: master
    heroku:
      appname: foo-bar-123
`,
                }), done,
            );
        });

        it("should add webhook to config with one existing webhook", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: circle1ConfigPath,
                    content: `## Customize deployment commands
deployment:
  staging:
    branch: master
    heroku:
      appname: foo-bar-123
## Custom notifications
notify:
  webhooks:
    # A list of hashes representing hooks. Only the url field is supported.
    - url: https://someurl.com/hooks/circle
`,
                }), done,
            );
        });

        it("should add webhook to config with two existing webhooks", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: circle1ConfigPath,
                    content: `## Custom notifications
notify:
  webhooks:
    # A list of hashes representing hooks. Only the url field is supported.
    - url: https://someurl.com/hooks/circle
    - url: http://more.stuff
## Customize deployment commands
deployment:
  staging:
    branch: master
    heroku:
      appname: foo-bar-123
`,
                }), done,
            );
        });

        it("should not add webhook to config with existing Atomist webhooks", done => {
            testAddingWebhookToConfig(
                InMemoryProject.of({
                    path: circle1ConfigPath,
                    content: `## Customize deployment commands
deployment:
  staging:
    branch: master
    heroku:
      appname: foo-bar-123
## Custom notifications
notify:
  webhooks:
    # A list of hashes representing hooks. Only the url field is supported.
    - url: https://someurl.com/hooks/circle
    - url: https://webhook.atomist.com/atomist/circle/teams/TK421WAYA
`,
                }), done,
            );
        });

        it("should add webhook to config with Circle 2", done => {
            testAddingWebhookToConfigForCircle2(
                InMemoryProject.of({
                    path: circle2ConfigPath,
                    content: `## Customize deployment commands
deployment:
  staging:
    branch: master
    heroku:
      appname: foo-bar-123
checkout:
  post:
    - echo "cloning"
## Custom notifications
notify:
  webhooks:
    # A list of hashes representing hooks. Only the url field is supported.
    - url: https://someurl.com/hooks/circle
`,
                }), done,
            );
        });

        it("should add webhook to config with Circle 2 multi documents", done => {
            testAddingWebhookToConfigForCircle2(
                InMemoryProject.of({
                    path: circle2ConfigPath,
                    content: `---
version: 2
jobs:
  build:
    working_directory: ~/src
    docker:
      - image: centos:7
    environment:
       - CIRCLECI: true
    steps:
      - setup_remote_docker:
          version: 8
      - checkout
      - run:
          name: "Install requirements"
          command: |
            docker --version
            pre-commit install
      - run:
          name: "Validate code quality"
          command: |
             pre-commit run --all-files
---
version: 2
jobs:
    build:
        working_directory: ~/other
        docker:
            - image: ubuntu:latest
        environment:
            - CIRCLECI: true
        steps:
            - setup_remote_docker:
                version: 8
            - checkout
            - run:
                name: "Install requirements"
                command: |
                   docker --version
                   pre-commit install
notify:
    webhooks:
    - url: https://webhook.atomist.com/atomist/circle/teams/TK421WAYA
---
version: 2
jobs:
    build:
        working_directory: ~/bam
        docker:
            - image: ubuntu:latest
        environment:
            - CIRCLECI: true
        steps:
            - setup_remote_docker:
                version: 8
            - checkout
            - run:
                name: "Install requirements"
                command: |
                    docker --version
                    pre-commit install
notify:
    webhooks:
    - url: 'https://kaboom'
`,
                }), done,
            );
        });

    });

});
