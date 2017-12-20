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

import {constructWebhookUrl} from "../../src/commands/AddWebhookToCI";

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

});
