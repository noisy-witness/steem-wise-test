import * as Docker from "dockerode";
import * as exitHook from "exit-hook";
import * as tar from "tar-fs";
import * as path from "path";
import * as fs from "fs";
import * as getStream from "get-stream";
import * as BluebirdPromise from "bluebird";

import { Config } from "./config";

export class Container {
    public static KEEP_RUNNING_CMD: string [] = [
        "/usr/bin/env", "sh", "-c", "while true; do date; sleep 1; done"
    ];

    private config: Config;
    private docker: Docker;
    private container?: Docker.Container;
    private imageName: string;
    private imageBuilt: boolean = false;

    public constructor(config: Config, imageName: string) {
        this.config = config;
        this.imageName = imageName;
        this.docker = new Docker();
    }

    public async buildImage(contextDir: string): Promise<string> {
        console.log("Building " + this.imageName + " (context=" + contextDir + ")");

        const buildStream = await this.doBuildImage(this.config.repositories.cli.path, "steem-wise-cli-");
        this.imageBuilt = true;

        const stdoutLines: { stream?: string; errorDetail?: object; error?: string } [] = [];
        let stdoutStr: string = "";
        const stderrLines: string [] = [];
        let stderrStr: string = "";
        buildStream.on("data", (chunk) => {
            const lines = chunk.toString("utf8").split("\n");
            lines.forEach((line: string) => {
                if (line.length > 0) {
                    const obj = JSON.parse(line);
                    stdoutLines.push(obj);
                    if (obj.error) {
                        stderrLines.push(obj.error);
                        stderrStr += obj.error;
                        stdoutStr += obj.error;
                        console.error("<build " + this.imageName + " err> " + obj.error);
                    }
                    else {
                        stdoutStr += obj.stream;
                        console.log("<build " + this.imageName + " out> " + obj.stream);
                    }
                }
            });
        });

        await getStream(buildStream, {  }); // await stream end
        console.log("Done building " + this.imageName);

        if (stderrLines.length > 0) throw new Error("Error while building: " + stderrStr);

        return stdoutStr;
    }

    private async doBuildImage(contextDir: string, imageName_: string): Promise<NodeJS.ReadableStream> {
        /*let dockerIgnores = [];
        const dotDockerignorePath = path.resolve(contextDir, ".dockerignore");
        if (fs.existsSync(dotDockerignorePath)) {
            dockerIgnores = fs.readFileSync(dotDockerignorePath, "UTF-8").split("\n");
        }*/

        const tarStream = tar.pack(contextDir);
        return this.docker.buildImage(tarStream,
            {
                t: this.imageName,
                rm: true,
                "no-cache": true
            }
        );
    }

    public async start(cmd: string []) {
        if (this.container) throw new Error("Container already started");

        return this.docker.createContainer({
            Image: this.imageName,
            AttachStdin: false,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            Cmd: cmd,
            OpenStdin: false,
            StdinOnce: false
        })
        .then(container => {
            console.log("Container " + this.imageName + " created");
            this.container = container;
            return this.container.start();
        });
    }

    public async exec(cmd: string []): Promise<any> {
        return new BluebirdPromise<any>((resolve, reject) => {
            if (!this.container) throw new Error("Container not started");

            this.container.exec({Cmd: cmd, AttachStdin: false, AttachStdout: true}, (error: Error, exec: Docker.Exec) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                else {
                    exec.start({hijack: false, stdin: false}, (error: Error, stream: any) => {
                        if (error) {
                            console.error(error);
                            reject(error);
                        }
                        else {
                            console.log(stream);
                            resolve(stream);
                        }
                    });
                }
            });
        });
    }

    public async cleanup() {
        try {
            if (this.container) {
                await this.container.stop()
                .then(() => { if (this.container) return this.container.remove(); })
                .then(() => { this.container = undefined; console.log("Container " + this.imageName + " removed"); });
            }
        }
        catch (error) {
            console.log("Ignoring error during cleanup: " + error.message);
        }

        if (this.imageBuilt) {
            try {
                const image = this.docker.getImage(this.imageName);
                if (image) await image.remove().then(
                    () => { console.log("Image " + this.imageName + " removed"); },
                    (error) => console.log("Ignoring error during cleanup: " + error.message)
                );
            }
            catch (error) {
                console.log("Ignoring error during cleanup: " + error.message);
            }
        }
    }
}