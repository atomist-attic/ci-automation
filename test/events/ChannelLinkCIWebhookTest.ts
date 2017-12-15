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

import { EventFired, HandlerContext } from "@atomist/automation-client/Handlers";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";

import {
    addCIWebhookMessage,
    checkCIConfigs,
    None,
} from "../../src/events/ChannelLinkCIWebhook";
import * as graphql from "../../src/typings/types";

describe("ChannelLinkCIWebhook", () => {

    describe("checkCIConfigs", () => {

        const baseUrl = `https://webhook.hamilton.com/atomist`;
        const teamId = `TSCHUYLER`;

        it("should find no CI config", done => {
            const p = InMemoryProject.of();
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === None))
                .then(() => done(), done);
        });

        it("should find a Travis CI config", done => {
            const p = InMemoryProject.of({ path: ".travis.yml", content: "" });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === "travis"))
                .then(() => done(), done);
        });

        it("should find a CircleCI config", done => {
            const p = InMemoryProject.of({ path: ".circle.yml", content: "" });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === "circle"))
                .then(() => done(), done);
        });

        it("should find a CircleCI v2 config", done => {
            const p = InMemoryProject.of({ path: ".circleci/config.yml", content: "" });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === "circle"))
                .then(() => done(), done);
        });

        it("should find a Jenkinsfile", done => {
            const p = InMemoryProject.of({ path: "Jenkinsfile", content: "" });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === "jenkins"))
                .then(() => done(), done);
        });

        it("should return none when a Travis CI config contains the webhook", done => {
            const travisYml = `dist: trusty
sudo: false
language: node_js
node_js:
- 8.7.0
script: bash scripts/travis-build.bash
notifications:
  email: false
  webhooks:
    urls:
    - ${baseUrl}/travis/teams/${teamId}
    on_success: always
    on_failure: always
    on_start: always
    on_cancel: always
    on_error: always
`;
            const p = InMemoryProject.of({ path: ".travis.yml", content: travisYml });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === None))
                .then(() => done(), done);
        });

        it("should return none when a CircleCI config contains the webhook", done => {
            const circleYml = `version: 2
jobs:
  build:
    working_directory: ~/other
    docker:
      - image: ubuntu:latest
    environment:
      - CIRCLECI: true
    steps:
      - checkout
      - run:
          name: "Install requirements"
          command: |
            docker --version
            pre-commit install
notify:
  webhooks:
    - url: https://someurl.com/hooks/circle
    - url: ${baseUrl}/circle/teams/${teamId}
`;
            const p = InMemoryProject.of({ path: ".circleci/config.yml", content: circleYml });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === None))
                .then(() => done(), done);
        });

        it("should return none when a Jenkinsfile contains the webhook", done => {
            /* tslint:disable:max-line-length */
            const jenkinsFile = `import groovy.json.JsonOutput

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
def notifyAtomist(buildStatus, buildPhase="FINALIZED", endpoint="${baseUrl}/jenkins/teams/${teamId}") {

    def payload = JsonOutput.toJson([
        name: env.JOB_NAME,
        duration: currentBuild.duration,
        build: [
            number: env.BUILD_NUMBER,
            phase: buildPhase,
            status: buildStatus,
            full_url: env.BUILD_URL,
            scm: getSCMInformation()
        ]
    ])

    sh "curl --silent -XPOST -H 'Content-Type: application/json' -d '\${payload}' \${endpoint}"
}

node {
    try {
        echo "doing something"
        try {
            echo "not the last one"
        } finally {
            echo "nothing here"
        }

        try {
            checkout scm
            notifyAtomist("STARTED", "STARTED")
            echo("doing stuff....")
        } catch(e) {
            echo "boom"
        } finally {
            echo("finished");
        }
        notifyAtomist("SUCCESS")
    } catch(e) {
        notifyAtomist("FAILURE")
        throw e
    }
}
`;
            /* tslint:enable:max-line-length */
            const p = InMemoryProject.of({ path: "Jenkinsfile", content: jenkinsFile });
            checkCIConfigs(p, baseUrl, teamId)
                .then(buildSystem => assert(buildSystem === None))
                .then(() => done(), done);
        });

    });

    describe("addCIWebhookMessage", () => {

        it("should create a Slack message with link action", () => {
            const owner = "the-pixies";
            const name = "doolittle";
            const slug = `${owner}/${name}`;
            const teamId = "TLIMS23";
            const baseUrl = "https://git.4ad.com";
            const repo: graphql.ChannelRepoLink.Repo = {
                owner,
                name,
                defaultBranch: "debaser",
                org: {
                    provider: {
                        apiUrl: "https://git.4ad.com/v3",
                        url: baseUrl,
                    },
                    chatTeam: {
                        id: teamId,
                    },
                },
            };
            const buildSystem = "travis";
            const msg = addCIWebhookMessage(repo, buildSystem);
            assert(msg.text === "Let's integrate Atomist with your CI system!");
            assert(msg.attachments.length === 1);
            assert(msg.attachments[0].text.includes(`<${baseUrl}/${slug}|${slug}>`));
            assert(msg.attachments[0].text.includes("*Travis CI*"));
            assert(msg.attachments[0].actions.length === 1);
            assert(msg.attachments[0].actions[0].text === "Get build events");
            const cmd: any = (msg.attachments[0].actions[0] as any).command;
            assert(cmd.name === "AddWebhookToCI");
            assert(cmd.parameters.buildSystem === buildSystem);
            assert(cmd.parameters.owner === owner);
            assert(cmd.parameters.repo === name);
            assert(cmd.parameters.slackTeamId === teamId);
        });

    });

});
