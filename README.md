# DIL Reply Fix

> **项目状态：已停止更新（2026 年 10 月 23 日）**。现有扩展和技术调查记录保留供使用与参考，后续不再主动维护或发布新版本。

一个适用于 Brave、Chrome 和 Edge 的非官方浏览器扩展，用于解决 ChatGPT 中部分 GPT-6 历史回复出现“无法加载此回复”、正文无法正常显示的问题。

**当前版本：v1.1.5（测试版）**。已在 Brave 中实际验证：插件可以利用页面已收到的备用内容恢复回复正文，并显示常见 Markdown 格式。少数对话首次打开时可能未完整显示，刷新页面通常可以恢复。复杂的原生交互组件目前无法完全还原。

## 重要发现：DIL Runner 加载失败可能是根本原因

**发现日期：2026 年 10 月 23 日。**

> [!IMPORTANT]
> **遇到 GPT-6 回复“无法加载此回复”，建议先检查 DIL Runner 是否被 CDN 拒绝。**
>
> 实测发现：部分故障中，ChatGPT 已收到完整的回复数据，但 `cdn.platform.openai.com` 的 `runner-*.js` 请求返回 **403 Forbidden**，导致原生 DIL 无法正常渲染。**更换能够正常访问该资源的网络线路后，原生回复直接恢复，无需重新生成。**
>
> **检查方法：** 打开浏览器开发者工具（F12）→ **Network** → 搜索 `runner-` → 检查 `cdn.platform.openai.com` 的请求状态。若返回 403，优先检查该域名的网络访问；使用支持域名分流的代理软件时，可检查对应线路。
>
> **区别：** 恢复 CDN 访问可恢复原生 DIL；**本扩展不能修复 CDN 403**，它在原生显示失败时使用 `fallbackMarkdown` 恢复可读正文。

详细测试记录见 [技术调查与开发踩坑](DEVELOPMENT_NOTES.md#8-dil-runner-cdn-加载故障调查2026-10-23)。

## 下载与安装

**[下载 DIL Reply Fix v1.1.5 安装包](dist/DIL_Reply_Fix_v1.1.5.zip)**（进入 GitHub 文件页后点击 **Download raw file**）

[SHA-256 校验文件](dist/SHA256SUMS.txt) · [版本记录](CHANGELOG.md) · [技术调查与开发踩坑](DEVELOPMENT_NOTES.md) · [开源许可证](LICENSE)

安装包大小：31,003 字节。**SHA-256：**

```text
8ff5be6ed89ed57295d6795ed07676249c1f6296971638e32253e00528679be1
```

Windows PowerShell 校验命令：

```powershell
Get-FileHash .\DIL_Reply_Fix_v1.1.5.zip -Algorithm SHA256
```

1. 下载 ZIP 并解压至固定文件夹。
2. 打开浏览器的扩展管理页面：Brave 为 `brave://extensions`，Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`。
3. 开启**开发者模式**，点击**加载已解压的扩展程序**。
4. 选择解压后包含 `manifest.json` 的 `DIL_Reply_Fix` 文件夹。
5. 如果使用过同类 Tampermonkey 脚本，先将其禁用，避免重复执行。
6. 刷新 ChatGPT 页面，打开此前显示异常的历史对话验证效果。

升级版本时，替换本地扩展文件夹中的文件，再到扩展管理页面刷新扩展，最后重新加载 ChatGPT。

## 功能与适用范围

- **恢复历史回复**：当部分 GPT-6 回复的官方显示区域加载失败时，显示浏览器已经收到的备用 Markdown 正文。
- **保留基础排版**：支持标题、粗体、斜体、列表、表格、引用、代码块和常见链接。
- **优先使用官方显示**：如果页面能够正常显示原回复，就不需要使用备用正文。
- **本地运行**：不需要 Tampermonkey、后台服务或额外的扩展 API 权限。

目前主要用于历史回复的文本显示恢复，不是聊天备份或批量导出工具。对复杂的富交互内容支持有限，且 ChatGPT 页面结构更新后可能需要适配。

**遇到显示不完整时**，可先刷新页面（`Ctrl + R`）。如果出现重复内容或位置错乱，请检查是否同时运行了旧版脚本或其他同类扩展。

欢迎在 Issues 中反馈可复现的问题。请勿提交未脱敏的聊天截图、完整网络响应、HAR 文件或账号凭证。

## 隐私与工作原理

扩展仅在 `chatgpt.com` 和 `chat.openai.com` 运行。它使用 Chromium Manifest V3 的页面脚本注入方式，读取 ChatGPT 的 GET 文本响应，提取其中的 `fallbackMarkdown`，在需要时渲染为页面内容。

- **数据处理范围**：运行期间可能接触包含个人聊天内容的网络响应，目前监听范围不只限于单个历史对话接口。
- **数据处理方式**：当前源码没有向第三方上传聊天内容或将聊天记录写入持久化存储的功能；恢复过程在本地页面内完成。
- **权限说明**：虽然未申请额外扩展 API 权限，但插件仍可以访问其所运行页面中的相关数据。

建议在安装前查看 [content.js](content.js) 和 [manifest.json](manifest.json)，确认其行为符合你的使用预期。

## 项目说明

**非官方项目**：DIL Reply Fix 由个人独立维护，与 OpenAI 没有隶属、合作或赞助关系，也未获得其官方认可。文中出现的 ChatGPT、GPT 等名称仅用于说明软件适用平台和模型，相关商标归其权利人所有。使用时仍应遵守相关服务条款。

**作者与开发方式**：项目主要通过 AI 辅助开发，并结合实际使用测试逐步调整。欢迎其他开发者审查源码、提出建议或提交改进。

**许可**：项目采用 [MIT License](LICENSE)，允许在遵守许可证条款的前提下使用、修改和分发代码。

## 项目文件

```text
manifest.json             # 扩展配置
content.js                # 回复恢复逻辑
README.md                 # 使用说明
CHANGELOG.md              # 版本记录
DEVELOPMENT_NOTES.md      # 调查过程、实现踩坑与改进建议
LICENSE                   # MIT 许可证
dist/
  DIL_Reply_Fix_v1.1.5.zip          # 当前安装包
  GPT6_DIL_Fix_Extension_v1.1.4.zip # 历史安装包
  SHA256SUMS.txt                    # 固定安装包校验值
```

旧版安装包保留用于版本对照。上面的 SHA-256 对应固定版本安装包，不适用于 GitHub **Code → Download ZIP** 自动生成的源码压缩包。
