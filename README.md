# DIL Reply Fix

> **Unofficial browser extension. Not affiliated with, endorsed by, or sponsored by OpenAI.**

DIL Reply Fix 是一个独立开发的 Chromium 浏览器扩展，用于尝试恢复 **ChatGPT 中部分 GPT-6 历史回复显示失败**（例如“无法加载此回复”）时，浏览器已收到但未正常渲染的 Markdown 正文。

**当前版本：v1.1.5 Beta（测试版）**。已在 Brave 中进行实际使用测试，**仍有偶发 Bug**：部分对话可能出现异常，刷新页面后大多数情况下可以恢复，但不能保证每次成功。它不是 OpenAI 官方修复方案。

## 下载和安装

**推荐：下载固定版本压缩包，而不是 GitHub 自动生成的源码 ZIP。**

- **[DIL Reply Fix v1.1.5 安装包](dist/DIL_Reply_Fix_v1.1.5.zip)**
- [SHA-256 校验文件](dist/SHA256SUMS.txt)
- [版本更新记录](CHANGELOG.md)
- [MIT 许可证](LICENSE)

v1.1.5 安装包大小：**31,003 字节**。对应 SHA-256：

```text
8ff5be6ed89ed57295d6795ed07676249c1f6296971638e32253e00528679be1
```

Windows PowerShell 校验：

```powershell
Get-FileHash .\DIL_Reply_Fix_v1.1.5.zip -Algorithm SHA256
```

1. 下载上方 v1.1.5 ZIP 并解压。
2. Brave 打开 `brave://extensions`；Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 启用**开发者模式**，选择“**加载已解压的扩展程序**”。
4. 选择解压后的 `DIL_Reply_Fix` 文件夹（文件夹内应有 `manifest.json`）。
5. **关闭原来的 Tampermonkey 同类修复脚本**，避免重复拦截。
6. 刷新 ChatGPT 页面，打开出现过显示问题的历史对话进行测试。

后续更新插件时，请先更新本地扩展文件夹，再在扩展管理页面点击“刷新”，最后重新加载 ChatGPT。

## 功能与工作方式

- 在 `chatgpt.com`、`chat.openai.com` 页面启动时注入 Manifest V3 内容脚本。
- 在浏览器页面环境中监听 GET 响应，读取已有的 `fallbackMarkdown`。
- 仅针对识别出的 GPT-6 回复尝试恢复文本，在官方 DIL 无法正常显示时渲染备用 Markdown。
- 支持基础标题、列表、表格、引用、代码块、粗体、斜体和链接。
- 当官方内容可以正常显示时，优先使用官方渲染结果。
- 无需后台 Service Worker，也未申请额外的浏览器扩展 API 权限。

**说明：** 这是面向特定显示故障的临时修复，不是通用聊天备份工具，也无法完整替代 ChatGPT 的富 UI、附件交互或所有 Markdown 特性。

## 已知 Bug 与临时处理

- **偶发异常**：部分对话的恢复过程可能失败或显示错误。
- **临时解决办法**：刷新 ChatGPT 页面（`Ctrl + R`）。根据实际测试反馈，大多数情况下能够恢复，但不保证始终有效。
- **未根治**：可能受到 ChatGPT 网络响应、DOM 结构、对话分支和其他脚本的影响，尚未确认所有触发条件。
- 若发现重复、错位、无法显示等情况，先禁用其他同类脚本并刷新。

欢迎通过 Issues 反馈可复现的问题，**但不要公开上传含有个人聊天内容的 HAR 文件、完整网络响应、令牌或未脱敏截图**。

## 隐私与使用风险

- 安装包和仓库不包含开发者的聊天记录、账号凭证或预置的个人资料。
- 目前代码不含主动向第三方服务器发送聊天内容的功能，也不将聊天记录写入持久化存储。
- **运行时插件能读取匹配页面的 GET 文本响应，其中可能包含你的个人聊天内容。** 现有监听范围比单独监听特定历史消息接口更广。
- `world: "MAIN"` 使内容脚本与页面 JavaScript 共享执行环境。因此，“没有申请扩展额外权限”不表示它无权读取页面内容。
- 软件没有得到 OpenAI 的授权或背书；使用仍可能受到 ChatGPT 服务条款限制。**不保证不存在账户限制或其他风险。**

使用前建议审查源码，并在浏览器中自行决定是否安装。

## 名称、商标与非官方声明

**DIL Reply Fix 为独立项目，并非 OpenAI 官方产品。** 本项目与 OpenAI 没有隶属、合作、赞助或认可关系。

`ChatGPT`、`GPT` 及相关名称属于其各自权利人；项目提及这些名称仅用于说明适用平台、模型标识和兼容性，不表示获得官方授权。请勿使用官方标志或将本项目描述为官方修复工具。

## 作者与开源说明

**作者不是专业软件开发人员，不具备独立编写、审查或维护软件代码的专业能力。** 本项目由作者提出需求、提供测试与反馈，并借助 AI 生成和修改代码。因此，作者无法提供专业级别的安全性、正确性、兼容性或持续维护保证。

本项目以 [MIT License](LICENSE) 提供。它允许其他人在遵守许可证条件的情况下使用、修改和分发源码，但**不能代替 OpenAI 服务条款，也不代表 OpenAI 对扩展的认可或许可**。

## 项目文件

```text
dil-reply-fix/
├── manifest.json        # Manifest V3 配置
├── content.js           # 回复数据解析与页面恢复逻辑
├── README.md            # 项目文档
├── CHANGELOG.md         # 版本记录
├── LICENSE              # MIT License
└── dist/
    ├── DIL_Reply_Fix_v1.1.5.zip
    ├── GPT6_DIL_Fix_Extension_v1.1.4.zip
    └── SHA256SUMS.txt
```

之前的 v1.1.4 历史 ZIP 会继续保留，但**新用户应优先下载 v1.1.5**。每个固定 ZIP 的哈希均列在 [SHA256SUMS.txt](dist/SHA256SUMS.txt)；这些哈希不适用于 GitHub **Code → Download ZIP** 自动生成的源码包。

