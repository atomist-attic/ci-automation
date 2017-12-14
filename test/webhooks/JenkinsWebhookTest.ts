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

import {fail} from "power-assert";
import {JenkinsWebhook} from "../../src/webhooks/JenkinsWebhook";
import {AtomistPipelineFunctions} from "../../src/webhooks/JenkinsWebhook";

describe("JenkinsWebhook", () => {

    const webhookUrl = `https://webhook.atomist.com/atomist/jenkins/teams/TK421WAYA`;
    const configuredJenkinsFile = `${AtomistPipelineFunctions.replace("WEBHOOK_URL", webhookUrl)}
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
            sh date
        } catch(o) {
            echo "bam"
            sh rm doh
        } catch(y) {
            echo "kapow"
            sh killall
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

    describe("add webhook", () => {

        it("should edit Jenkins config", done => {
            new JenkinsWebhook().addWebhook(InMemoryProject.of({
                path: "Jenkinsfile",
                content: `
node {
    echo "doing something"
    try {
        echo "not the last one"
    } finally {
        echo "nothing here"
    }
    try {
        checkout scm
        echo("doing stuff....")
    } catch(e) {
        echo "boom"
        sh date
    } catch(o) {
        echo "bam"
        sh rm doh
    } catch(y) {
        echo "kapow"
        sh killall
    } finally {
        echo("finished");
    }
}
`,
            }), webhookUrl)
                .then( p => {
                    p.findFile("Jenkinsfile").then(f => {
                        f.getContent().then(c => assert.deepEqual(c, configuredJenkinsFile))
                            .then(() => done(), done);
                        },
                    );
                });
        });

        it("should not change an already configured Jenkins", done => {
            new JenkinsWebhook().addWebhook(InMemoryProject.of({
                path: "Jenkinsfile",
                content: configuredJenkinsFile,
            }), webhookUrl)
                .then( p => {
                    p.findFile("Jenkinsfile").then(f => {
                            f.getContent().then(c => assert.deepEqual(c, configuredJenkinsFile))
                                .then(() => done(), done);
                        },
                    );
                });
        });

        it("should fail if Jenkins config is not understood", done => {
            new JenkinsWebhook().addWebhook(InMemoryProject.of({
                path: "Jenkinsfile",
                content: "BAM",
            }), webhookUrl)
                .then(
                    () => {
                        fail("Should fail to understand Jenkins file.");
                        done();
                    }, err => {
                    assert.deepEqual(err, "Failed to detect the Jenkins file syntax in 'Jenkinsfile'");
                    done();
                },
            );
        });

        it("should fail if Jenkins config is not found", done => {
            new JenkinsWebhook().addWebhook(InMemoryProject.of(), webhookUrl)
                .then(() => {
                    fail("Should fail to find Jenkins file.");
                    done();
                }, err => {
                    assert.deepEqual(err, "Failed to find Jenkins file 'Jenkinsfile'");
                    done();
                });
        });

    });

});
