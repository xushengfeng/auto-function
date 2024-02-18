# auto function

## 简介（introduction）

借助 ai 让你的 ts/js 函数更智能

## 安装（installation）

```bash
npm i auto-fun
```

```js
import * as autoFun from "auto-fun";

aiFun.config({
    type: "chatgpt",
    key: "sk-****",
});
let f = new autoFun.def({ input: { sen: "句子" }, output: { type: "'积极'|'消极'" }, script: ["返回sen的感情"] });
let type0 = await f.run("我好开心").result.type; // "积极"
let type1 = await f.run("我好难过").result.type; // "消极"
```

```html
<script src="./dist/autoFun.umd.js"></script>
<script></script>
```
