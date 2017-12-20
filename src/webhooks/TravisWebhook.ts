
import {Project} from "@atomist/automation-client/project/Project";
import {BuildSystem} from "../commands/AddWebhookToCI";

import { updateYamlDocument } from "@atomist/yaml-updater/Yaml";

import * as yaml from "js-yaml";
import {Webhook} from "./Webhook";

export class TravisWebhook implements Webhook {

    public readonly buildSystem: BuildSystem = "travis";

    public addWebhook(project: Project, url: string): Promise<Project> {
        const travisConfigPath = ".travis.yml";
        return project.findFile(travisConfigPath).then(file => {
            return file.getContent().then(yml => {
                let travisConfig;
                try {
                    travisConfig = yaml.safeLoad(yml);
                } catch (e) {
                    return Promise
                        .reject(new Error(`failed to parse Travis config ${travisConfigPath}: ${JSON.stringify(e)}`));
                }
                const notifications = this.standardizeNotifications(travisConfig.notifications);
                if (!notifications.webhooks.urls.some(z => z === url)) {
                    notifications.webhooks.urls.push(url);
                }
                notifications.webhooks.on_cancel = "always";
                notifications.webhooks.on_error = "always";
                notifications.webhooks.on_start = "always";
                notifications.webhooks.on_failure = "always";
                notifications.webhooks.on_success = "always";

                const newYml = updateYamlDocument({notifications}, yml);
                return file.setContent(newYml).then(() => Promise.resolve(project));
            });
        });
    }

    private standardizeNotifications(existingNotifications: any): Notifications {
        if (!existingNotifications) {
            return { webhooks: { urls: [] } };
        }
        if (!existingNotifications.webhooks) {
            return {
                ...existingNotifications,
                webhooks: { urls: [] },
            };
        }
        if (typeof existingNotifications.webhooks === "string") {
            return {
                ...existingNotifications,
                webhooks: { urls: [existingNotifications.webhooks] },
            };
        }
        if (!existingNotifications.webhooks.urls) {
            return {
                ...existingNotifications,
                webhooks: {
                    ...existingNotifications.webhooks,
                    urls: [],
                },
            };
        }
        if (typeof existingNotifications.webhooks.urls === "string") {
            return {
                ...existingNotifications,
                webhooks: {
                    ...existingNotifications.webhooks,
                    urls: [existingNotifications.webhooks.urls],
                },
            };
        }
        return existingNotifications;
    }

}

interface Notifications {
    webhooks: {
        urls: string[]
        on_cancel?: string
        on_error?: string
        on_start?: string
        on_failure?: string
        on_success?: string,
    };
}
