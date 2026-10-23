# ChatGPT GPT-6 DIL Reply Fix

用于恢复 ChatGPT 历史对话中无法正常显示的 GPT-6 回复的 **Chromium Manifest V3 浏览器扩展**。

> **状态：v1.1.4，仍有已知 Bug，非完全稳定版。** 已在 Brave 浏览器实际使用，但有时仍会发生异常；大多数情况下刷新 ChatGPT 页面后可以恢复。不能保证每次都正常。项目目前保存在私有仓库。

## 当前已知问题（请先阅读）

- **偶发异常**：扩展并非每次都能正确恢复回复，个别情况下可能出现显示异常。
- **临时处理方法**：刷新 ChatGPT 页面（例如按 `Ctrl + R`）；根据当前使用反馈，**多数情况下刷新后可以恢复**，但并不保证全部成功。
- **问题状态**：尚未定位完整触发条件，也未完成彻底修复。在问题解决前请将本项目视为测试版，不应将其宣传为完全稳定。
- 如果要反馈问题，请描述出现时的操作步骤及刷新是否有效，避免上传包含私人聊天内容的完整网络日志。



## 功能

- 从 ChatGPT 历史 GET 文本响应中提取 `fallbackMarkdown`；
- 根据 GPT-6 模型标识与回复分组恢复失败的 DIL 正文；
- 支持常见 Markdown：标题、列表、表格、代码块、引用、粗体、斜体和链接；
- 隐藏出错的官方 DIL；当官方内容恢复正常时撤销临时恢复内容；
- 不需要 Tampermonkey、后台 Service Worker 或额外扩展 API 权限。

> 这不是通用 Markdown 渲染器；复杂嵌套格式、富 UI 组件及下载链接的实际行为仍受浏览器与 ChatGPT 页面影响。

## 安装（Brave / Chrome / Edge）

1. 点击 GitHub 的 **Code → Download ZIP** 并解压，或克隆本仓库。
2. 打开扩展管理页面：
   - Brave：`brave://extensions`
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
3. 开启 **开发者模式**，点击 **加载已解压的扩展程序**。
4. 选择包含 `manifest.json` 的仓库根目录。
5. **禁用 Tampermonkey 中旧的 GPT-6 修复脚本**，避免重复监听或重复注入。
6. 刷新 ChatGPT，使用此前出现“无法加载此回复”的历史对话验证。

更新：从 GitHub 获取新版本并覆盖本地扩展目录后，在扩展管理页点击 **刷新**，再重新加载 ChatGPT。

## 安装包 SHA-256

此前在 ChatGPT 中提供的独立安装压缩包：`GPT6_DIL_Fix_Extension_v1.1.4.zip`

```text
SHA-256  f46441a93b253f7f4a0942f7f2281b2a656006bedef3694fc33d5afe03b3f6f8
```

此值是对**此前提供的原始插件安装 ZIP** 计算得到的，仅用于验证该文件。GitHub 的 **Code → Download ZIP** 是动态生成的源码包，文件内容及 SHA-256 与原安装 ZIP 不一定相同，不能使用上述校验值验证 GitHub 自动生成的 ZIP。

Windows PowerShell 校验本地原安装包：

```powershell
Get-FileHash .\GPT6_DIL_Fix_Extension_v1.1.4.zip -Algorithm SHA256
```

## 工作原理

`manifest.json` 在 `chatgpt.com` 与 `chat.openai.com` 的页面启动时，以 `world: "MAIN"` 注入 `content.js`。脚本包装网页环境中的 `fetch` 和 `XMLHttpRequest`，解析 GET 文本响应中的 fallback 数据，按回复结束标记分组，并在 DIL 显示失败时构造 DOM 作为临时正文。

代码与数据处理都在本机页面内执行；不会修改 ChatGPT 服务器数据，也不会主动额外请求历史聊天。

## 隐私与权限

- **不内置聊天记录、账号凭证或个人信息**。
- **没有内置向第三方上传聊天内容的代码**，也没有持久化存储聊天记录的功能。
- **仅匹配 ChatGPT 的两个域名**，不注入其他网站。
- **运行时可以读取 ChatGPT 页面上的 GET 文本响应**，其中可能包含个人聊天信息。该能力是恢复历史回复所需，但当前监听范围比只监听特定历史对话 API 更宽。
- 没有申请 `permissions` 或 `host_permissions`，但 `content_scripts.matches` 与 `MAIN` 环境仍使其可以访问匹配页面的数据；**不应理解为无法读取聊天内容**。

源码适合自己检查；不要把包含聊天数据的浏览器开发者工具日志、截图或网络响应提交到公开仓库。

## 排查

**安装提示“清单文件缺失”**：应选择包含 `manifest.json` 的文件夹，而不是 ZIP 本身或上一层目录。

**安装后无效果**：确认已刷新 ChatGPT、油猴旧脚本已禁用、目标确实是 GPT-6 历史回复且网页响应包含 `fallbackMarkdown`。

**出现重复正文或其他回复错位**：停用扩展、刷新页面，并记录重现步骤。不要直接发布原始网络响应，因为可能包含私密对话。

**如何查看日志**：本地将 `content.js` 中的 `const DEBUG = false` 改成 `true`，在扩展管理页刷新扩展，然后在 ChatGPT 的开发者工具 Console 中筛选 `[GPT6-Fix]`。请在分享前删除日志中的敏感正文。

## 项目结构

```text
chatgpt-gpt6-dil-fix/
├── manifest.json    # Manifest V3 配置
├── content.js       # 回复解析、分组及 DOM 恢复
└── README.md        # 项目说明
```

## 已知限制

- 依赖 ChatGPT 当前的网络响应、DIL 数据结构和 CSS 类名，网站更新后可能失效；
- 仅用于页面内临时恢复失败内容，不是聊天备份或数据导出工具；
- Markdown 回退渲染不能完全替代 ChatGPT 原生富 UI；
- 浏览器端实际下载 `sandbox:` 链接的行为，需要以实际页面验证为准；
- 尚未在所有 Chromium 版本、所有对话分支与混合模型对话中实测。

## 作者与代码能力说明

**作者并非专业软件开发人员，也不具备独立开发、审计或维护代码的专业能力。** 本项目由作者提出需求并进行实际测试，借助 AI 工具生成与修改代码。作者不提供专业级别的安全性、正确性、兼容性或长期维护保证，使用前请自行检查源码。

## 开发说明

这是个人用途的修复项目，当前未选择开源许可证。**私有仓库不会因存在 README 而自动公开**。
