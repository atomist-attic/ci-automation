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

import { Configuration } from "@atomist/automation-client";
import { initMemoryMonitoring } from "@atomist/automation-client/internal/util/memory";
import { AutomationEventListener } from "@atomist/automation-client/server/AutomationEventListener";
import * as appRoot from "app-root-path";

import { EnableTravis } from "./commands/EnableTravis";
import { secret } from "./util/secrets";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);

const token = secret("github.token", process.env.GITHUB_TOKEN);
const notLocal = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";

const logzioOptions: LogzioOptions = {
    applicationId: secret("applicationId"),
    environmentId: secret("environmentId"),
    token: secret("logzio.token", process.env.LOGZIO_TOKEN),
};

// Set up automation event listeners
const listeners: AutomationEventListener[] = [];

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    keywords: pj.keywords,
    teamIds: [],
    token,
    commands: [EnableTravis],
    listeners,
    ws: {
        enabled: true,
    },
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
    applicationEvents: {
        enabled: true,
        teamId: "T29E48P34",
    },
    cluster: {
        enabled: false,
        workers: 2,
    },
};
if (process.env.NODE_ENV === "production") {
    (configuration as any).groups = ["all"];
}

// For now, we enable a couple of interesting memory and heap commands on this automation-client
initMemoryMonitoring(`${appRoot.path}/node_modules/@atomist/automation-client/public/heap`);
