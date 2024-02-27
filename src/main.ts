/// <reference types="vite/client" />

type aim = { role: "system" | "user" | "assistant"; content: { text: string } }[];
type chatgptm = { role: "system" | "user" | "assistant"; content: string }[];
type geminim = { parts: [{ text: string }]; role: "user" | "model" }[];
type aiconfig = { type: "chatgpt" | "gemini"; key?: string; url?: string; option?: Object; insertV?: boolean };

let config: aiconfig;
const system = `请你扮演一个计算机函数，下面会给出若干函数定义，对于每个函数，你接受可能存在的输入，根据需求，返回能被机器解析的JSON输出。其中，输入定义和输出模版均以JSON表示，key为参数名，value为解释和可能存在的typescript类型。需求中使用$来标记参数名。函数只返回输出模版JSON`;

function setConfig(_config: aiconfig) {
    config = _config;
}

let chatgpt = {
    url: `https://api.openai.com/v1/chat/completions`,
    headers: {
        "content-type": "application/json",
    },
    config: {
        model: "gpt-3.5-turbo",
    },
};
let gemini = {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    headers: { "content-type": "application/json" },
    config: {},
};

function confChatgpt(m: aim, config: aiconfig) {
    let url = config.url || chatgpt.url;
    let headers = chatgpt.headers;
    let con = {};
    if (config.key) headers["Authorization"] = `Bearer ${config.key}`;
    for (let i in config.option) {
        con[i] = config.option[i];
    }
    let messages: chatgptm = [];
    for (let i of m) {
        messages.push({ role: i.role, content: i.content.text });
    }
    con["messages"] = messages;
    return { url: url, headers: headers, con: con };
}

function confGemini(m: aim, config: aiconfig) {
    let con = {};
    let newurl = new URL(config.url || gemini.url);
    if (config.key) newurl.searchParams.set("key", config.key);
    let url = newurl.toString();
    for (let i in config.option) {
        con[i] = config.option[i];
    }
    let geminiPrompt: geminim = [];
    for (let i of m) {
        let role: (typeof geminiPrompt)[0]["role"];
        role = { system: "user", user: "user", assistant: "model" }[i.role] as "user" | "model";
        geminiPrompt.push({ parts: [{ text: i.content.text }], role });
    }
    con["contents"] = geminiPrompt;
    return { url: url, headers: gemini.headers, con: con };
}

function postAi(
    url: string,
    headers: HeadersInit,
    con: object,
    signal: AbortSignal,
    type: "chatgpt" | "gemini",
    tryN: number
) {
    return new Promise(async (re: (json: unknown) => void, rj: (err: Error) => void) => {
        try {
            const t = await (
                await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(con),
                    signal: signal,
                })
            ).json();
            re(checkAiResult(t, url, headers, con, signal, type, tryN));
        } catch (e) {
            if (e.name === "AbortError") {
                return;
            } else {
                rj(e);
            }
        }
    });
}

function getAiRaw(t: any, type: "chatgpt" | "gemini") {
    let text = "";
    if (type === "chatgpt") {
        text = t.choices[0].message.content;
    } else {
        text = t.candidates[0].content.parts[0].text;
    }
    if (text.startsWith("```json")) {
        const l = text.split("\n");
        text = l.slice(1, l.length - 1).join("\n");
    }
    return text;
}

function checkAiResult(
    t: unknown,
    url: string,
    headers: HeadersInit,
    con: object,
    signal: AbortSignal,
    type: "chatgpt" | "gemini",
    tryN: number
) {
    let text = getAiRaw(t, type);
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        if (tryN < 3) {
            return postAi(url, headers, con, signal, type, tryN + 1);
        } else {
            throw "无法解析";
        }
    }
}

function ai(m: aim, config: aiconfig) {
    let url = "";
    let headers = {};
    let con = {};
    if (config.type === "chatgpt") {
        let conf = confChatgpt(m, config);
        url = conf.url;
        headers = conf.headers;
        con = conf.con;
    }
    if (config.type === "gemini") {
        let conf = confGemini(m, config);
        url = conf.url;
        headers = conf.headers;
        con = conf.con;
    }
    let abort = new AbortController();
    return {
        stop: abort,
        result: postAi(url, headers, con, abort.signal, config.type, 1),
    };
}

type St = string[] | string;
type testType = { input: obj | string; output: unknown };
type obj = { [key: string]: obj | string | number };

class def {
    public input: obj;
    public output: unknown;
    public script: St;
    public test: testType | testType[];
    public aiText: string;
    public aiConfig: aiconfig;
    public system = system;

    constructor(op: { input?: obj; output?: unknown; script: St; test?: testType | testType[] }) {
        this.input = op.input;
        this.output = op.output;
        this.script = op.script;
        this.test = op.test;
        this.aiText = this.getText();
    }

    private arrayToList(arr: string[] | string): string {
        if (Array.isArray(arr)) return arr.map((i) => `- ${i}`).join("\n");
        else return arr;
    }

    public getText(): string {
        let text = "";
        if (this.input) text += `\n输入定义：${JSON.stringify(this.input)}`;
        if (this.output) text += `\n输出模版：${JSON.stringify(this.output)}`;
        text += `\n需求：${this.arrayToList(this.script)}`;
        let test = [];
        if (this.test)
            if (!Array.isArray(this.test)) {
                test = [this.test];
            } else {
                test = this.test;
            }
        for (let t of test) {
            text += [
                `\n这是测试样例，对于输入`,
                `\`\`\`\n${JSON.stringify(t.input)}\n\`\`\``,
                `应当返回`,
                `\`\`\`\n${JSON.stringify(t.output)}\n\`\`\``,
            ].join("\n");
        }

        return text;
    }

    public run(input?: obj | string) {
        let messages: aim = [];
        messages.push({ role: "system", content: { text: system } });
        messages.push({
            role: "user",
            content: { text: getRunText(this.getText(), input, this.input) },
        });
        return ai(messages, config);
    }
}

function getRunText(t: string, input: obj | string, sourceInput: obj) {
    let inputObj = {};
    if (sourceInput)
        if (typeof input === "string") inputObj[Object.keys(sourceInput)[0]] = input;
        else inputObj = input;
    if (config.insertV) {
        const r = new RegExp(
            `(${Object.keys(inputObj)
                .map((i) => `\\$${i}`)
                .join("|")})`,
            "g"
        );
        t = t.replace(/输入定义.+/, "");
        t = t.replaceAll(r, (_, i: string) => inputObj[i.replace("$", "")]);
        return `运行：\n${t}`;
    } else {
        if (sourceInput) return `运行函数：\n输入${JSON.stringify(inputObj)}\n${t}`; // 输入在定义前，符合认知逻辑
        else return `运行函数：${JSON.stringify(inputObj)}\n${t}`;
    }
}

/** 合并多个fun，以减少并发请求，但对token数影响不大 */
async function runList(functions: { fun: def; input: obj | string }[]) {
    let messages: aim = [];
    messages.push({ role: "system", content: { text: system } });
    for (let f of functions) {
        messages.push({
            role: "user",
            content: { text: getRunText(f.fun.getText(), f.input, f.fun.input) },
        });
    }
    const len = functions.length;
    const t: string[] = [];
    for (let i in functions) {
        t.push(`返回${Number(i) + 1}`);
    }
    const tt = t.join(",");
    messages.push({
        role: "user",
        content: {
            text: `上面的${len}个函数分别有${len}个输出，请返回一个JSON数组，数组按顺序包含上述${len}个函数的返回输出\n[${tt}]`,
        },
    });
    const r = ai(messages, config);
    const text = await r.result;
    return parseRunList(text);
}

function parseRunList(input: any) {
    if (!Array.isArray(input)) {
        if (Object.keys(input).length === 1) {
            return input[Object.keys(input)[0]];
        }
    }
    return input;
}

export default { def, config: setConfig, runList };
