/// <reference types="vite/client" />

type aim = { role: "system" | "user" | "assistant"; content: { text: string } }[];
type chatgptm = { role: "system" | "user" | "assistant"; content: string }[];
type geminim = { parts: [{ text: string }]; role: "user" | "model" }[];
type aiconfig = { type: "chatgpt" | "gemini"; key?: string; url?: string; option?: Object };

let config: aiconfig;

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

class def {
    public input: string[];
    public output: string[];
    public script: string[];
    public test: { input: string; output: Object };
    public aiText: string;
    public aiConfig: aiconfig;

    constructor(
        op: { input?: string[]; output?: string[]; script: string[]; test?: { input: string; output: Object } },
        aiop?: aiconfig
    ) {
        this.input = op.input;
        this.output = op.output;
        this.script = op.script;
        this.test = op.test;
        this.aiConfig = aiop ?? config;
        this.aiText = this.getText();
    }

    private arrayToList(arr: string[]): string {
        return arr.map((i) => `- ${i}`).join("\n");
    }

    public getText(): string {
        let text = `请你扮演一个TypeScript类，接受输出，根据需求，返回能被机器解析的JSON`;
        if (this.input)
            text += `\n
            这是输入的参数名：${this.arrayToList(this.input)}
            每个参数名后可能用冒号标出了其类型，以及相关注解`;
        if (this.output)
            text += `\n
            这是输出：${this.arrayToList(this.output)}
            每个输出后可能用冒号标出了其类型，以及相关注解`;
        text += `\n\n这是需求：${this.script}`;
        if (this.test)
            text += `这是测试样例，对于输入\`${this.test.input}\`，应当返回\`\`\`\n${JSON.stringify(
                this.test.output
            )}\`\`\``;

        return text;
    }

    public run(input: string) {
        let messages: aim = [];
        messages.push({ role: "system", content: { text: this.aiText } });
        messages.push({ role: "user", content: { text: input } });
        return ai(messages, this.aiConfig);
    }
}

export default { def, config: setConfig };
