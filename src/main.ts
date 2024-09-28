/// <reference types="vite/client" />

type aim = {
    role: "system" | "user" | "assistant";
    content: { text: string };
}[];
type chatgptm = { role: "system" | "user" | "assistant"; content: string }[];
type geminim = { parts: [{ text: string }]; role: "user" | "model" }[];
type aiconfig = {
    type: "chatgpt" | "gemini";
    key?: string;
    url?: string;
    option?: Record<string, unknown>;
    insertV?: boolean;
};

let config: aiconfig;
const system =
    "请你扮演一个计算机函数，下面会给出若干函数定义，对于每个函数，你接受可能存在的输入，根据需求，返回能被机器解析的JSON输出。其中，输入定义和输出模版均以JSON表示，key为参数名，value为解释和可能存在的typescript类型。需求中使用$来标记参数名。函数只返回输出模版JSON";

function setConfig(_config: aiconfig) {
    config = _config;
}

const chatgpt = {
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
        "content-type": "application/json",
    },
    config: {
        model: "gpt-3.5-turbo",
    },
};
const gemini = {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    headers: { "content-type": "application/json" },
    config: {},
};

function confChatgpt(m: aim, config: aiconfig) {
    const url = config.url || chatgpt.url;
    const headers = chatgpt.headers;
    const con = {};
    // @ts-ignore
    if (config.key) headers.Authorization = `Bearer ${config.key}`;
    for (const i in config.option) {
        con[i] = config.option[i];
    }
    const messages: chatgptm = [];
    for (const i of m) {
        messages.push({ role: i.role, content: i.content.text });
    }
    // @ts-ignore
    con.messages = messages;
    return { url: url, headers: headers, con: con };
}

function confGemini(m: aim, config: aiconfig) {
    const con = {};
    const newurl = new URL(config.url || gemini.url);
    if (config.key) newurl.searchParams.set("key", config.key);
    const url = newurl.toString();
    for (const i in config.option) {
        con[i] = config.option[i];
    }
    const geminiPrompt: geminim = [];
    for (const i of m) {
        const role = {
            system: "user",
            user: "user",
            assistant: "model",
        }[i.role] as "user" | "model";
        geminiPrompt.push({ parts: [{ text: i.content.text }], role });
    }
    // @ts-ignore
    con.contents = geminiPrompt;
    return { url: url, headers: gemini.headers, con: con };
}

async function postAi(
    url: string,
    headers: HeadersInit,
    con: object,
    signal: AbortSignal,
    type: "chatgpt" | "gemini",
    tryN: number,
): Promise<unknown> {
    try {
        const t = await (
            await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(con),
                signal: signal,
            })
        ).json();
        return checkAiResult(t, url, headers, con, signal, type, tryN);
    } catch (e) {
        if (e.name === "AbortError") {
            return new Promise(() => {});
        }
        throw e;
    }
}

function getAiRaw(t, type: "chatgpt" | "gemini") {
    let text = "";
    if (type === "chatgpt") {
        text = t.choices[0].message.content;
    } else {
        text = t.candidates[0].content.parts[0].text;
    }
    return text;
}
function getAiJSON(t, type: "chatgpt" | "gemini") {
    let text = getAiRaw(t, type);
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
    tryN: number,
) {
    const text = getAiJSON(t, type);
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        if (tryN < 3) {
            return postAi(url, headers, con, signal, type, tryN + 1);
        }
        throw "无法解析";
    }
}

async function aiRaw(m: aim) {
    let url = "";
    let headers = {};
    let con = {};
    if (config.type === "chatgpt") {
        const conf = confChatgpt(m, config);
        url = conf.url;
        headers = conf.headers;
        con = conf.con;
    }
    if (config.type === "gemini") {
        const conf = confGemini(m, config);
        url = conf.url;
        headers = conf.headers;
        con = conf.con;
    }
    return getAiRaw(
        await (await fetch(url, { headers, method: "POST", body: JSON.stringify(con) })).json(),
        config.type,
    );
}

function ai(m: aim, config: aiconfig) {
    let url = "";
    let headers = {};
    let con = {};
    if (config.type === "chatgpt") {
        const conf = confChatgpt(m, config);
        url = conf.url;
        headers = conf.headers;
        con = conf.con;
    }
    if (config.type === "gemini") {
        const conf = confGemini(m, config);
        url = conf.url;
        headers = conf.headers;
        con = conf.con;
    }
    const abort = new AbortController();
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

    constructor(op: {
        input?: obj;
        output?: unknown;
        script: St;
        test?: testType | testType[];
    }) {
        this.input = op.input;
        this.output = op.output;
        this.script = op.script;
        this.test = op.test;
        this.aiText = this.getText();
    }

    private arrayToList(arr: string[] | string): string {
        if (Array.isArray(arr)) return arr.map((i) => `- ${i}`).join("\n");
        return arr;
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
        for (const t of test) {
            text += [
                "\n这是测试样例，对于输入",
                `\`\`\`\n${JSON.stringify(t.input)}\n\`\`\``,
                "应当返回",
                `\`\`\`\n${JSON.stringify(t.output)}\n\`\`\``,
            ].join("\n");
        }

        return text;
    }

    public run(input?: obj | string) {
        const messages: aim = [];
        messages.push({ role: "system", content: { text: system } });
        messages.push({
            role: "user",
            content: { text: getRunText(this.getText(), input, this.input) },
        });
        return ai(messages, config);
    }
}

function getRunText(_t: string, input: obj | string, sourceInput: obj) {
    let inputObj = {};
    if (sourceInput)
        if (typeof input === "string") inputObj[Object.keys(sourceInput)[0]] = input;
        else inputObj = input;
    if (config.insertV) {
        const r = new RegExp(
            `(${Object.keys(inputObj)
                .map((i) => `\\$${i}`)
                .join("|")})`,
            "g",
        );
        let t = _t.replace(/输入定义.+/, "");
        t = t.replaceAll(r, (_, i: string) => inputObj[i.replace("$", "")]);
        return `运行：\n${t}`;
    }
    if (sourceInput) return `运行函数：\n输入${JSON.stringify(inputObj)}\n${_t}`;
    return `运行函数：${JSON.stringify(inputObj)}\n${_t}`;
}

/** 合并多个fun，以减少并发请求，但对token数影响不大 */
async function runList(functions: { fun: def; input: obj | string }[]) {
    const messages: aim = [];
    messages.push({ role: "system", content: { text: system } });
    for (const f of functions) {
        messages.push({
            role: "user",
            content: { text: getRunText(f.fun.getText(), f.input, f.fun.input) },
        });
    }
    const len = functions.length;
    const t: string[] = [];
    for (const i in functions) {
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

function parseRunList(input) {
    if (!Array.isArray(input)) {
        if (Object.keys(input).length === 1) {
            return input[Object.keys(input)[0]];
        }
    }
    return input;
}

async function boolean(input: string[], tj?: string): Promise<boolean[]>;
async function boolean(input: string): Promise<boolean>;
async function boolean(input: string | string[], tj = "为真") {
    function isTrue(i: string) {
        if (i.includes("True") || i.includes("true")) return true;
        if (i.includes("False") || i.includes("false")) return false;
        return undefined;
    }
    if (typeof input === "string") {
        const m: aim = [
            { role: "user", content: { text: "1+1=2 为真吗？" } },
            { role: "user", content: { text: "请回答true或false" } },
            { role: "assistant", content: { text: "true" } },
            { role: "user", content: { text: "2+2=5 为真吗？" } },
            { role: "user", content: { text: "请回答true或false" } },
            { role: "assistant", content: { text: "false" } },
            { role: "user", content: { text: `${input} 为真吗？` } },
            { role: "user", content: { text: "请回答true或false" } },
        ];
        const r = await aiRaw(m);

        return isTrue(r);
    }
    const m: aim = [
        { role: "user", content: { text: "下面有若干句话，请判断他们为真" } },
        { role: "user", content: { text: "返回true或false，一行一个结果，无须解释" } },
        { role: "user", content: { text: "1+1=2\n2+2=5\n3+3=6" } },
        { role: "assistant", content: { text: "true\nfalse\ntrue" } },
        { role: "user", content: { text: input.map((i) => `${i} ${tj}?`).join("\n") } },
    ];
    const r = await aiRaw(m);
    console.log(r);

    return r.split("\n").map((i) => isTrue(i));
}

export default { def, config: setConfig, runList, boolean };
