/// <reference types="vite/client" />

type aim = { role: "system" | "user" | "assistant"; content: { text: string } }[];
type chatgptm = { role: "system" | "user" | "assistant"; content: string }[];
type geminim = { parts: [{ text: string }]; role: "user" | "model" }[];
type aiconfig = { type: "chatgpt" | "gemini"; key?: string; url?: string; option?: Object };

let config: aiconfig;
const system = `请你扮演一个计算机函数，接受输出，根据需求，返回能被机器解析的JSON`;

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
    return new Promise(async (re: (json: Object) => void, rj: (err: Error) => void) => {
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
        return JSON.parse(text) as object;
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
type testType = { input: obj; output: obj };
type obj = { [key: string]: string };

class def {
    public input: obj;
    public output: obj;
    public script: St;
    public test: testType | testType[];
    public aiText: string;
    public aiConfig: aiconfig;
    public system = system;

    constructor(op: { input?: obj; output?: obj; script: St; test?: testType | testType[] }) {
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
        if (this.input)
            text += `\n
            这是输入的参数名：${JSON.stringify(this.input)}
            每个参数名后可能用冒号以typescript类型模式标出了其类型，以及相关注解`;
        if (this.output)
            text += `\n
            这是输出模版：${JSON.stringify(this.output)}
            每个输出后可能用冒号以typescript类型模式标出了其类型，以及相关注解`;
        text += `\n\n这是需求：${this.arrayToList(this.script)}`;
        let test = [];
        if (this.test)
            if (!Array.isArray(this.test)) {
                test = [this.test];
            } else {
                test = this.test;
            }
        for (let t of test) {
            text += `这是测试样例，对于输入
            \`\`\`\n${JSON.stringify(t.input)}\n\`\`\`
            应当返回
            \`\`\`\n${JSON.stringify(t.output)}\n\`\`\`\n`;
        }

        return text;
    }

    public run(input: obj | string) {
        let messages: aim = [];
        messages.push({ role: "system", content: { text: system } });
        let inputObj = {};
        if (typeof input === "string") inputObj = { input: input };
        else inputObj = input;
        messages.push({
            role: "user",
            content: { text: `定义函数：\n${this.getText()}\n输入${JSON.stringify(inputObj)}` },
        });
        return ai(messages, config);
    }
}

/** 合并多个fun，以减少并发请求，但对token数影响不大 */
function runList(functions: { fun: def; input: obj | string }[]) {
    let messages: aim = [];
    messages.push({ role: "system", content: { text: system } });
    for (let f of functions) {
        let inputObj = {};
        if (typeof f.input === "string") inputObj = { input: f.input };
        else inputObj = f.input;
        messages.push({
            role: "user",
            content: { text: `定义函数：\n${f.fun.getText()}\n输入${JSON.stringify(inputObj)}` },
        });
    }
    messages.push({
        role: "user",
        content: { text: "请返回一个JSON数组，数组中的每个元素是上述函数返回输出，请按顺序返回" },
    });
    return ai(messages, config);
}

export default { def, config: setConfig, runList };
