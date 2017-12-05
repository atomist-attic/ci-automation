declare module "promise-retry";

declare module "logzio-nodejs";

interface LogzioLogger {

    log: (m: any) => void;
}

interface LogzioOptions {

    token: string;
    environmentId: string;
    applicationId: string;

}

declare function createLogger(opts: LogzioOptions): LogzioLogger;

declare module "serialize-error";

declare module "cfenv";
