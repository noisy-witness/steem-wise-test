import * as path from "path";
import * as fs from "fs";
import * as lib from "./lib";
import axios from "axios";
import { config } from "./config";

async function run() {
    const out = {
        short: "",
        long: "",
        txtLog: "",
        notify: false
    };

    if (!config.webhookUrlFile || config.webhookUrlFile.length === 0) throw new Error("Webhook url file not specified");
    if (!fs.existsSync(config.webhookUrlFile)) throw new Error("Webhook url file does not exist");
    const webHookUrl = fs.readFileSync(config.webhookUrlFile, "UTF-8").trim();

    try {
        const logBaseDir = process.env.LOG_BASE_DIR;
        if (!logBaseDir) throw new Error("LOG_BASE_DIR env must be defined");

        const currentLogDir = process.env.CURRENT_LOG_DIR;
        if (!currentLogDir) throw new Error("CURRENT_LOG_DIR env must be defined");

        let currentJsonResult: any | undefined = undefined;
        let currenTxtOutput: string | undefined = undefined;
        let lastJsonResult: any | undefined = undefined;

        const currentJsonResultFile = path.resolve(currentLogDir, "result.json");
        if (fs.existsSync(currentJsonResultFile)) {
            currentJsonResult = JSON.parse(fs.readFileSync(currentJsonResultFile, "UTF-8"));
        }

        const txtOutputFile = path.resolve(currentLogDir, "output.txt");
        if (fs.existsSync(txtOutputFile)) {
            currenTxtOutput = fs.readFileSync(txtOutputFile, "UTF-8");
        }

        const logBaseDirChildren = fs.readdirSync(logBaseDir)
        .filter(name => name.indexOf(".") !== 0)
        .filter(name => name !== path.basename(currentLogDir))
        .sort().reverse();
        if (logBaseDirChildren.length > 0) {
            const lastResultDir = path.resolve(logBaseDir, logBaseDirChildren[0]);
            if (fs.existsSync(lastResultDir)) {
                const lastJsonResultDir = path.resolve(logBaseDir, logBaseDirChildren[0]);
                const lastJsonResultFile = path.resolve(lastJsonResultDir, "result.json");
                if (fs.existsSync(lastJsonResultFile)) {
                    lastJsonResult = JSON.parse(fs.readFileSync(lastJsonResultFile, "UTF-8"));
                    console.log("Loaded last json result from '" + lastJsonResultFile + "'");
                }
            }
        }

        if (!currentJsonResult) {
            if (currenTxtOutput) {
                out.short = "Error: Tests did not produce correct JSON output. Here is the output log:";
                out.long = out.txtLog = currenTxtOutput;
                out.notify = true;
            }
            else {
                out.short = "Fatal error: Tests did not produce any output. You have to check it manually";
                out.long = "No output";
                out.txtLog = "No output";
                out.notify = true;
            }
        }
        else {
            if (!lastJsonResult) {
                out.short = "Healthcheck tests performed. Passes: " + currentJsonResult.stats.passes + ", failures: " + currentJsonResult.stats.failures + ", pending: " + currentJsonResult.stats.pending + " /total: " + currentJsonResult.stats.total;
                out.long = JSON.stringify(currentJsonResult, undefined, 2);
                if (currenTxtOutput) out.txtLog = currenTxtOutput;
                out.notify = true;
            }
            else {
                out.short = "Healthcheck tests performed _(previous->*current*)_: "
                     + "[total: " + lastJsonResult.stats.total + "->*" + currentJsonResult.stats.total + "*] "
                     + "[passes: " + lastJsonResult.stats.passes + "->*" + currentJsonResult.stats.passes + "*] "
                     + "[pending: " + lastJsonResult.stats.pending + "->*" + currentJsonResult.stats.pending + "*] "
                     + "[failures: " + lastJsonResult.stats.failures + "->*" + currentJsonResult.stats.failures + "*] ";
                out.short += "\n ";
                let changes: boolean = false;
                out.long = "Start time: " + currentJsonResult.startTime + ", end time: " + currentJsonResult.endTime + ". Tests: ";
                out.long += "```";
                currentJsonResult.tests.forEach((test: { name: string; state: "pass" | "fail" | "pending"; message: string }) => {
                    let previousTest: { name: string; state: "pass" | "fail" | "pending"; message: string } | undefined = undefined;
                    const prevMatches = lastJsonResult.tests.filter((prevTest: any) => prevTest.name === test.name);
                    if (prevMatches.length > 0) previousTest = prevMatches[0];

                    if (previousTest && previousTest.state !== test.state) {
                        out.short += "- [" + previousTest.state + " -> " + test.state + "] " + test.name + ": " + test.message + "\n";
                        changes = true;
                        out.notify = true; // notify on test changes
                    }
                    else if (!previousTest) {
                        out.short += "- [*" + test.state + "] " + test.name + ": " + test.message + "\n";
                        changes = true;
                        out.notify = true;
                    }

                    out.long += " - [" + (test.state === "pass" ? ":white_check_mark:" : (test.state === "fail" ? ":x:" : (test.state === "pending" ? ":lock:" : ":question:")));
                    out.long += " " + (test.state + "       ").substring(0, 7) + "] *" + test.name + "*: _" + test.message + "_ \n";
                });
                out.long += "```";
                if (!changes) out.short += "No changes since previous healthcheck \n";
                if (currenTxtOutput) out.txtLog = currenTxtOutput;
            }
        }
    }
    catch (error) {
        console.error(error);
        out.short = "Error: " + error;
        out.long = "*" + error.message + "*\n" + error.stack;
    }

    console.log(JSON.stringify(out));


    console.log("Sending to slack...");
    /**
     * Send to slack
     */
    const mentions = "\n" + config.mentions.map(mention => "<@" + mention + ">").join(" ");
    const attachements: any [] = [];
    if (out.long) attachements.push({
        title: "Tests result",
        text: lib.sanitizeForSlack(out.long)
    });
    if (out.txtLog) attachements.push({
        title: "Stdout & stderr",
        text: lib.sanitizeForSlack(out.txtLog)
    });

    const title = "*Wise healthckeck finished at " + (new Date().toISOString()) + "* \n";

    const slackMessage = {
        text: lib.sanitizeForSlack(title + out.short)  + (out.notify ? mentions : ""),
        attachments: attachements,
        mrkdwn: true
    };

    const response = await axios.post(webHookUrl, slackMessage);
    console.log("Message to slack sent. Got response: " + JSON.stringify(response.data, undefined, 2));
}

run();