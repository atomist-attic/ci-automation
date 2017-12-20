
import {BuildSystem} from "../commands/AddWebhookToCI";

import {File} from "@atomist/automation-client/project/File";
import {Project} from "@atomist/automation-client/project/Project";

import { updateYamlDocument } from "@atomist/yaml-updater/Yaml";

import * as yaml from "js-yaml";
import {Webhook} from "./Webhook";

export class CircleWebhook implements Webhook {

    public readonly buildSystem: BuildSystem = "circle";

    public addWebhook(project: Project, url: string): Promise<Project> {
        return project.findFile(circle1ConfigPath).then(
            configFile => {
                return this.addWebhookSection(configFile, url).then(file => project);
            },
            () => {
                return project.findFile(circle2ConfigPath).then(
                    configFile => {
                        return this.addWebhookSection(configFile, url).then(file => project);
                    },
                    () => {
                        return Promise.reject("Circle config files not found");
                    },
                );
            },
        );
    }

    private addWebhookSection(file: File, url: string): Promise<File> {
        return file.getContent().then(content => {
            try {
                // single YAML document scenario
                // is it worth loading it vs
                const yml = yaml.safeLoad(content);
                try {
                    const newYml = this.updateYamlDocument(yml, content, url);
                    return file.setContent(newYml);
                } catch (e) {
                    throw new Error(`could not update CircleCI configuration: ${(e as Error).message}`);
                }
            } catch (e) {
                try {
                    // multi documents scenario but we still have to update each
                    // one of them as a single document
                    const docs: string[] = [];
                    content.split(/^(---(?:[ \t]+.*)?\n)/m).forEach(doc => {
                        if (!doc || doc === "---\n") {
                            return;
                        }
                        const yml = yaml.safeLoad(doc);
                        const newYml = this.updateYamlDocument(yml, doc, url);
                        docs.push(newYml);
                    });
                    return file.setContent("---\n" + docs.join("---\n"));
                } catch (e) {
                    throw new Error(`could not update CircleCI multi-configuration: ${(e as Error).message}`);
                }
            }
        });
    }

    /**
     * Add the webhook to a Yaml document if it doesn't already exist. It does
     * preserve the existing structure of the notification webhook section if
     * it already exists as well.
     *
     * Two calls are added:
     * - one explicit call as soon as the build starts (with Circle 1, it
     *   happens after the checkout, with Circle 2, it happens as the first
     *   step of the build job)
     * - one implicit at the end of the build job through the notification
     *   section
     *
     * @param yml parsed yaml document
     * @return the update yaml document as a string
     */
    private updateYamlDocument(yml: any, original: string, url: string): string {
        let notify = yml.notify;
        if (!notify) {
            notify = {
                webhooks: [{
                    url,
                }],
            };
        }
        const webhooks = notify.webhooks as any[];
        if (!webhooks) {
            notify.webhooks = [{ url }];
        } else if (!webhooks.some(wh => wh.url === url)) {
            notify.webhooks.push({ url });
        }

        // tslint:disable-next-line:max-line-length
        const startNotificationStep = `curl -H 'Content-Type: application/json' -d '{"payload": {"lifecycle": "started", "build_num": "'\${CIRCLE_BUILD_NUM}'", "vcs_revision": "'\${CIRCLE_SHA1}'", "branch": "'\${CIRCLE_BRANCH}'", "reponame": "'\${CIRCLE_PROJECT_REPONAME}'", "username": "'\${CIRCLE_PROJECT_USERNAME}'"}}' "${url}"`;

        const updates = {} as any;

        // the next section is to try to insert the notification when the build
        // starts. There is webhook section for this so we have to do our best.
        // When it comes to Circle
        if (yml.version === 2) {
            // when running a workflow, this job may not be called `build`
            // but we wouldn't know which one to use
            if (yml.jobs.build) {
                updates.jobs = {
                    build: {
                        steps:
                            [
                                { run: startNotificationStep },
                                ...yml.jobs.build.steps,
                            ],
                    },
                };
            }
        } else {
            let checkout = yml.checkout;
            if (!checkout) {
                checkout = {
                    post: [startNotificationStep],
                };
            } else if (!checkout.post) {
                checkout.post = [startNotificationStep];
            } else {
                checkout.post = [startNotificationStep, ...checkout.post];
            }
            updates.checkout = checkout;
        }

        updates.notify = notify;

        return updateYamlDocument(updates, original);
    }

}

export const circle1ConfigPath = "circle.yml";
export const circle2ConfigPath = ".circleci/config.yml";
