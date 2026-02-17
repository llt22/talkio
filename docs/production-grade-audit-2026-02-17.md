# Avatar 项目生产级审计报告

> 日期：2026-02-17  
> 审计类型：只读静态审计（不修改业务代码）  
> 范围：架构/数据层/权限与隐私/网络策略/安全边界/MCP 工具链/工程化与发布配置

## 1. 总体结论（Executive Summary）

- 当前状态：核心聊天链路（含流式、工具调用 follow-up、备份恢复事务保护、会话列表同步、异步竞态防护）相较 2026-02-11 已有明显改进；但仍**未达到生产发布安全基线**。
- 主要阻塞风险集中在：
  - **明文传输与局域网配置服务的攻击面**
  - **WebView 渲染不可信内容/远程脚本加载的注入面**
  - **权限最小化与合规叙事（声明与实际能力边界）**

## 2. 方法与限制

- 静态审计：基于仓库文件读取/全局搜索结果，未进行真机抓包、渗透测试或 App Store/Play 预审。
- 结论以“证据路径 + 可复现风险面”为主；涉及运行态行为（例如 Expo prebuild 自动注入权限字符串）仅给出“需验证项”。

## 3. 架构概览（高层）

- **入口与路由**：`expo-router`（`app/_layout.tsx`、`app/(tabs)`、`app/chat/[id].tsx`）。
- **状态管理**：Zustand stores（`src/stores/*`），聊天核心为 `src/stores/chat-store.ts`。
- **数据层**：SQLite + Drizzle（`db/schema.ts`、`src/storage/database.ts`），消息包含 `toolCalls/toolResults/branchId/images/reasoning*` 等字段。
- **AI Provider/网络层**：`src/services/api-client.ts` 统一发起请求与流式解析。
- **工具层（MCP）**：
  - SDK Client：`src/services/mcp-client.ts`
  - RN Transport：`src/services/mcp/rn-streamable-http-transport.ts`
  - 远程 server 连接/发现/调用：`src/services/mcp/connection-manager.ts`（由 `chat-service` 触发发现/执行）
  - 本地内置工具：`src/services/built-in-tools.ts`
- **WebView 渲染**：
  - HTML 预览：`src/components/common/HtmlPreview.tsx`
  - Mermaid：`src/components/markdown/MermaidRenderer.tsx`
- **本地配置服务**：`src/services/config-server.ts`（局域网 HTTP 配置 Provider）。

## 4. 依赖与工程化健康度

- **技术栈**：Expo SDK 54 + RN 0.81 + React 19（`package.json`）。
- **Lint/格式化**：
  - 已采用 ESLint v9 + flat config（`eslint.config.js`），并开启 `@typescript-eslint/no-explicit-any: error`。
  - 风险：仓库中仍存在多处 `any`（例如 `src/services/mcp-client.ts`、`src/services/logger.ts`、`src/storage/database.ts`、`src/services/chat-service.ts`、`src/services/api-client.ts` 等），导致 `npm run lint` 在严格规则下可能无法通过（需在 CI 验证）。
- **CI/开源基线文件缺失**：根目录未发现：
  - `README.md`
  - `LICENSE`
  - `CONTRIBUTING.md`
  - `.github/` workflows

> 证据：文件搜索（排除 `node_modules`）无结果。

## 5. 安全/隐私/网络策略审计

### 5.1 明文传输（Cleartext Traffic）

- Android 强制开启 cleartext：`plugins/withCleartextTraffic.js` 将 `android:usesCleartextTraffic="true"` 写入 manifest。
- 影响：任意 HTTP（含局域网）通信会被系统允许，若误配到公网/代理环境，风险显著。

### 5.2 局域网配置服务（Config Server）

- 服务端口固定 `19280`，组装 URL `http://{ip}:{PORT}`（`src/services/config-server.ts:6, 337-339`）。
- 关键风险点：
  - **无认证/无配对码**：`/api/config` 直接接收 `{name, baseUrl, apiKey}` 并回调写入 App（`src/services/config-server.ts:244-261`）。
  - **CORS 放开为 `*`**：多个路由均返回 `Access-Control-Allow-Origin: *`（`src/services/config-server.ts:240-260, 279-307`）。
  - **对外暴露测试接口**：`/api/test` 使用 `baseUrl + '/models'` 携带 `Authorization: Bearer {apiKey}` 发起请求（`src/services/config-server.ts:272-301`）。
- 影响：同一局域网内的恶意设备/网页可向该服务发送配置（甚至诱导用户访问恶意页面触发跨域请求），造成：
  - API Key 被替换/注入到恶意 BaseURL
  - 利用 `/api/test` 帮助“探测/滥用”用户 API Key（虽然返回截断错误文本，但本质上是一个可被触发的带凭据请求器）

### 5.3 WebView 注入面与远程脚本依赖

- `HtmlPreview`：
  - `originWhitelist={['*']}` + `javaScriptEnabled`（`src/components/common/HtmlPreview.tsx:175-183, 221-228`）
  - 注入远程脚本 `https://cdn.tailwindcss.com`（`src/components/common/HtmlPreview.tsx:57`）
  - 直接把 `code` 拼进 `<body>${...}</body>`（`src/components/common/HtmlPreview.tsx:52-74`）
- `MermaidRenderer`：
  - `originWhitelist={['*']}` + `javaScriptEnabled`（`src/components/markdown/MermaidRenderer.tsx:69-76`）
  - 远程脚本 `https://cdn.jsdelivr.net/.../mermaid.min.js`（`src/components/markdown/MermaidRenderer.tsx:9, 45`）
  - `securityLevel: 'loose'`（`src/components/markdown/MermaidRenderer.tsx:47-52`）
- 影响：一旦渲染的内容来自模型输出或用户粘贴（不可完全信任），等价于把“脚本执行能力”交给不可信输入；再叠加远程 CDN 脚本加载，属于高危链路。

### 5.4 本地敏感信息存储

- 已实现 MMKV 加密实例：`new MMKV({ id: 'avatar-storage-v2', encryptionKey })`（`src/storage/mmkv.ts:37-40`）。
- 但加密密钥存放在另一个**未加密**的 MMKV 实例：`new MMKV({ id: 'avatar-keychain' })`（`src/storage/mmkv.ts:28-34`）。
- Expo Go/原生模块不可用场景会降级 AsyncStorage（明文）并带内存 cache（`src/storage/mmkv.ts:59-77`）。
- WebDAV 凭据持久化：设置 store 会把 `webdavUser/webdavPass` 随 `settings` 一起落盘（`src/stores/settings-store.ts:56-60`；UI 录入见 `app/(tabs)/settings/sync.tsx:74-101`）。

## 6. 权限最小化（声明 vs 实际使用）

- Android manifest 权限显式声明（`app.json:34-45`）：
  - `READ_CONTACTS`：在 `src/` 未搜索到 `expo-contacts`/`Contacts.*` 使用痕迹（静态搜索无结果）。存在“过度权限”风险。
  - `ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION`：代码侧仅在内置工具 `handleGetLocation` 请求（`src/services/built-in-tools.ts:310-349`）。且内置工具默认 `enabled: false`（`src/services/built-in-tools.ts:16-105`）。
  - `READ_CALENDAR/WRITE_CALENDAR`：仅在内置工具 `handleCreateReminder` 请求（`src/services/built-in-tools.ts:256-307`）。同样默认关闭。
  - `RECORD_AUDIO/MODIFY_AUDIO_SETTINGS`：聊天输入确实使用录音权限（`src/components/chat/ChatInput.tsx:141-149`）。
- iOS `infoPlist` 同样声明了日历/提醒/位置/麦克风/通讯录用途（`app.json:19-25`）。

结论：除麦克风外，其它敏感权限目前更像“为内置工具预留”，但默认关闭；这会显著影响合规/审核叙事，建议按功能开关/身份绑定做到权限按需启用或至少在隐私页明确解释。

## 7. 数据层与一致性

- **分支消息**：`getMessages` 在主线分支时 `isNull(messages.branchId)`，分支时 `eq(messages.branchId, branchId)`（`src/storage/database.ts:190-213`），避免把主线混入分支。
- **会话列表 lastMessage 同步**：
  - 用户消息在 store + DB 同步更新（`src/stores/chat-store.ts:167-176`）。
  - assistant 完成后也会更新 DB + store（`src/services/chat-service.ts:379-391`）。
- **会话切换竞态**：`loadSequence` 丢弃过期结果（`src/stores/chat-store.ts:112-118`）。
- **备份恢复**：已在恢复过程中使用事务，失败回滚并保留原数据（`src/services/backup-service.ts:66-86`）。

## 8. MCP/工具链闭环

- 工具发现：`buildTools` 仅把“身份绑定/启用”的工具暴露给模型；远程 server 发现带 10s 超时（`src/services/chat-service.ts:518-576`）。
- 工具执行：
  - 远程工具调用带 30s 超时（`src/services/chat-service.ts:593-611`）。
  - 工具结果会被写入 `toolResults`，并构造 `role: 'tool'` 消息回传，开启 follow-up stream 继续推理（`src/services/chat-service.ts:296-359`）。

结论：相较旧版本，“工具调用链闭环”已落地；后续重点转向“远程 MCP server 风险治理”（域名/证书/权限/日志脱敏/超时与重试策略）。

## 9. 构建与发布配置要点

- `app.json` plugins：包含 `./plugins/withCleartextTraffic.js`、`withDevSuffix.js`、`withReleaseSigning.js`。
- 关注点：cleartext plugin 不区分 build profile；建议至少按 dev/preview/production 分层启用，或改为 Network Security Config 白名单。

---

## 10. 问题清单（P0-P3）

> 优先级定义：
> - P0：发布阻塞（安全/隐私/资金损失/账号泄露等高风险）
> - P1：建议上线前修复（合规/质量门禁/用户信任）
> - P2：优化项（性能/体验/可维护性）
> - P3：建议项（开源治理/文档/流程完善）

### P0（发布阻塞）

#### P0-1 Android 全局启用 Cleartext Traffic
- 证据：`plugins/withCleartextTraffic.js:3-12` 强制 `android:usesCleartextTraffic="true"`。
- 风险：任何 HTTP 明文请求都可能被允许；配合局域网服务/自定义 BaseURL，扩大 MITM 面。
- 建议：
  - 仅在 dev 构建开启；production 禁用。
  - 如必须支持 `http://localhost`/局域网，使用 Network Security Config 对域名/IP 白名单化。

#### P0-2 局域网配置服务无认证 + CORS 放开
- 证据：`src/services/config-server.ts`：
  - `/api/config` 无鉴权（`244-261`）
  - `/api/test` 携带 Bearer token 发请求（`272-301`）
  - 多处 `Access-Control-Allow-Origin: *`（`240-260, 279-307`）
- 风险：同网段攻击/CSRF 类攻击导致 API Key 注入/替换。
- 建议：
  - 增加一次性配对码（App 端生成，页面必须携带），并对请求进行校验。
  - 限制 CORS：只允许同源；或直接不需要浏览器跨域能力。
  - 将 server 绑定到更小的攻击面（如仅在前台/短时间窗口运行，或仅接受来自指定 IP 的请求）。

#### P0-3 WebView 渲染链路存在高危注入面（含远程 CDN 脚本）
- 证据：
  - `src/components/common/HtmlPreview.tsx`：`originWhitelist={['*']}`、`javaScriptEnabled`、加载 `cdn.tailwindcss.com`，并把 `code` 直接拼接进 HTML。
  - `src/components/markdown/MermaidRenderer.tsx`：`originWhitelist={['*']}`、`javaScriptEnabled`、加载 mermaid CDN，且 `securityLevel: 'loose'`。
- 风险：模型输出/用户粘贴的内容被当作可执行脚本环境处理，属于典型 RCE/注入面。
- 建议：
  - 严格限制 `originWhitelist`（至少不为 `*`）。
  - 禁用远程脚本加载：将 tailwind/mermaid 资源本地化（bundle）或使用纯 RN 渲染方案。
  - 对输入进行净化（HTML sanitizer）并关闭不必要的 JS 能力。
  - Mermaid 使用更严格的 `securityLevel`（如 `strict`），并避免直接拼接不可信文本。

#### P0-4 敏感凭据存储安全边界仍不够“可审计可信”
- 证据：
  - `src/storage/mmkv.ts`：加密 key 存在未加密 MMKV 中（`28-34`），降级 AsyncStorage（`59-77`）。
  - `src/stores/settings-store.ts`：WebDAV 用户名/密码随 settings 持久化（`56-60`）。
- 风险：在设备被 root/调试/备份提取场景下，凭据保护不符合“强安全叙事”。
- 建议：
  - 将加密 key 存入系统 Keychain/Keystore（而非普通 MMKV）。
  - WebDAV 凭据使用系统安全存储；或提供“仅会话内保存/每次输入”的选项。
  - 对“Expo Go 降级明文”的场景在 UI 明确提示（尤其是隐私页）。

### P1（建议上线前修复）

#### P1-1 权限最小化不满足“默认最小权限”
- 证据：`app.json` Android permissions 与 iOS infoPlist 声明（`app.json:19-45`）；同时内置工具默认关闭（`src/services/built-in-tools.ts`）。
- 风险：审核/用户信任成本高；若隐私页叙事不充分，容易被认定为过度采集。
- 建议：
  - 对 `READ_CONTACTS`：若短期不用，移除声明。
  - 对 location/calendar：按功能开关/身份绑定启用，或至少在文案解释“仅当你启用某工具才会请求”。

#### P1-2 ESLint 规则与现有代码不一致（any 使用面）
- 证据：`eslint.config.js:17` 禁止 `any`；但多处存在 `any`（例如 `src/services/mcp-client.ts:107`、`src/services/logger.ts:64`、`src/storage/database.ts:92` 等）。
- 风险：无法建立稳定质量门禁；或者为了通过 lint 被迫降低规则，形成长期债务。
- 建议：
  - 逐步消除 `any`：先从高频/边界层（API client、MCP response parsing、DB row casting）开始。
  - 为“不可避免的 any”设置可审计的例外策略（局部 disable + 说明）。

#### P1-3 缺少 CI 与发布门禁
- 证据：未发现 `.github/workflows`。
- 风险：回归不可控；开源协作与发布质量难保证。
- 建议：
  - 至少加入：`typecheck`、`lint`、`format:check`、基础单测（如后续引入）。

### P2（优化项）

#### P2-1 开源/生产项目必备文档缺失
- 证据：根目录未发现 `README.md/LICENSE/CONTRIBUTING.md`。
- 影响：无法明确安装/运行/贡献/许可边界，阻碍外部协作。
- 建议：补齐最小文档集，并在 README 中明确：
  - 数据存储位置与加密边界
  - 局域网配置服务的安全模型（何时开启、威胁模型）

### P3（建议项）

#### P3-1 隐私页文案建议更“可审计”
- 证据：`app/(tabs)/settings/privacy.tsx` 仅展示通用描述，具体风险边界由 i18n 文案决定。
- 建议：
  - 明确指出：哪些数据会被发送到第三方 AI Provider（模型推理必然是“出设备”的）。
  - 明确指出：局域网配置服务的工作方式与风险告知。

---

## 11. 与 2026-02-11 报告对照（已修复/已改善项）

以下条目在本次代码状态中已观察到明确改进（静态证据）：

- **工具调用链闭环**：已实现 tool result → `role: 'tool'` 回传 → follow-up stream（`src/services/chat-service.ts:296-359`）。
- **MMKV 加密落地**：`avatar-storage-v2` 使用 `encryptionKey`（`src/storage/mmkv.ts:37-40`）。
- **备份恢复事务保护**：restore 包裹 transaction，失败回滚并保留原数据（`src/services/backup-service.ts:66-86`）。
- **会话切换竞态防护**：`loadSequence` 丢弃过期 load（`src/stores/chat-store.ts:112-118`）。
- **会话列表 lastMessage 同步**：assistant 结束后 DB+store 同步更新（`src/services/chat-service.ts:379-391`）。
- **Lint 基础设施**：已存在 `eslint.config.js` flat config（对比旧报告中的“配置缺失/不兼容”问题）。

> 注意：上述“已改善项”不代表完全达标（例如 MMKV 密钥管理仍需提升）。

## 12. 建议整改路线（最小可发布路径）

1. **先做 P0**：
   - production 禁用 cleartext 或白名单化
   - config-server 加认证/配对 + 收敛 CORS
   - WebView 渲染链路收敛（本地化脚本/禁用 JS/净化输入）
   - 凭据存储迁移到系统 Keychain/Keystore（或提供“无需落盘”选项）
2. **再做 P1**：
   - 权限最小化：去掉未用权限/按功能开启
   - `any` 治理 + 让 lint 在 CI 变成硬门禁
   - 增加 GitHub Actions
3. **补齐 P2/P3**：
   - README/LICENSE/贡献指南
   - 更可审计的隐私/安全说明
