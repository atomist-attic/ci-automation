import {Project} from "@atomist/automation-client/project/Project";
import {BuildSystem} from "../commands/AddWebhookToCI";

export interface Webhook {
    buildSystem: BuildSystem;
    addWebhook(project: Project, url: string): Promise<Project>;
}
