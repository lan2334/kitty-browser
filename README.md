# kitty-browser

`kitty-browser` 是一个面向浏览器自动化场景的轻量库，提供更顺手的页面启动、Turnstile 交互辅助和 Chrome UA 切换能力。

支持平台：

- Windows
- macOS
- Linux

Linux 说明：

- 当 `headless: false` 且系统没有 `DISPLAY` 时，库会自动尝试启动 `xvfb`
- 这样调用方通常只需要直接执行 `node demo.js`
- 如果你不想自动启用，可以传 `disableXvfb: true`
- Linux 主机仍然需要安装系统级 `xvfb`

核心能力：

- `turnstile: true`
  自动持续执行 Turnstile 交互点击逻辑
- `page.SetChromeUserAgent(platform, version)`
  按平台和版本快速切换 Chrome UA，并自动同步 `--fingerprint-brand` / `--fingerprint-brand-version`

适用场景：

- 需要统一浏览器启动参数的自动化任务
- 需要在 Windows / macOS / Linux 三个平台下切换 Chrome UA 的测试或调试场景
- 需要对 Turnstile 页面执行自动交互辅助的浏览器工作流

## 安装

```bash
npm install kitty-browser
```

## 快速开始

```js
const { launch } = require("kitty-browser");

(async () => {
  const browser = await launch({
    headless: false,
    humanize: true,
    turnstile: true,
    chromeUserAgent: {
      platform: "Windows",
      version: 146,
    },
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
})();
```

## 用法

### 普通启动

```js
const { launch } = require("kitty-browser");

(async () => {
  const browser = await launch({
    headless: false,
    humanize: true,
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
})();
```

### 自动点击 Turnstile

```js
const { launch } = require("kitty-browser");

(async () => {
  const browser = await launch({
    headless: false,
    turnstile: true,
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("https://nopecha.com/demo/cloudflare", {
    waitUntil: "domcontentloaded",
  });
})();
```

开启 `turnstile: true` 后，页面会在后台持续执行 Turnstile 交互点击逻辑，适合需要自动化交互辅助的页面流程。

### 设置 Chrome UA

```js
const { launch } = require("kitty-browser");

(async () => {
  const browser = await launch({
    headless: false,
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.SetChromeUserAgent("Windows", 146);
  await page.goto("https://example.com");
})();
```

### 启动时自动设置 UA 和指纹版本

```js
const { launch } = require("kitty-browser");

(async () => {
  const browser = await launch({
    headless: false,
    chromeUserAgent: {
      platform: "Windows",
      version: 146,
    },
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("https://example.com");
})();
```

这会自动补上：

```js
--fingerprint-brand=Chrome
--fingerprint-brand-version=146
```

## API

### `launch(options)`

浏览器启动方法。

额外支持：

- `turnstile?: boolean`
- `turnstileIntervalMs?: number`
- `chromeUserAgent?: { platform: 'Windows' | 'Linux' | 'MacOS', version: number }`
- `disableXvfb?: boolean`

### `launchPersistentContext(options)`

和 `launch()` 一样，但会使用持久化浏览器目录。

### `page.SetChromeUserAgent(platform, version)`

支持：

- 平台：`Windows` / `Linux` / `MacOS`
- 版本：`140` 到 `150`

示例：

```js
await page.SetChromeUserAgent("Linux", 144);
await page.SetChromeUserAgent("MacOS", 150);
```

### `buildChromeUserAgent(platform, version)`

单独生成 UA 字符串：

```js
const { buildChromeUserAgent } = require("kitty-browser");

console.log(buildChromeUserAgent("Windows", 146));
```

## 说明

- `chromeUserAgent.version` 的支持范围是 `140` 到 `150`
- 启动时传入 `chromeUserAgent` 后，会自动同步 `--fingerprint-brand=Chrome` 和对应的 `--fingerprint-brand-version`
- `turnstile: true` 提供的是页面交互辅助能力，适合需要自动点击 Turnstile 区域的自动化流程
