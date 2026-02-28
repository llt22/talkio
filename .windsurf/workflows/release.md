---
description: Talkio 版本发布流程（macOS + Android + Web）
---

# Talkio 发布流程

Talkio 已配置 GitHub Actions CI/CD（`.github/workflows/release.yml`），推送 tag 后自动构建所有平台产物并创建 draft release。

## 前置条件

- 所有功能已合并到 `main` 分支
- 本地代码已拉取最新：`git pull --rebase`
- 工作区无未提交改动：`git status` 干净
- GitHub Secrets 已配置（Android 签名）：
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`

## 1. 确定新版本号

根据改动范围决定版本号（遵循 semver）：
- **patch**（x.y.Z）：bug 修复、小调整
- **minor**（x.Y.0）：新功能、非破坏性改动
- **major**（X.0.0）：破坏性变更

## 2. 更新版本号（3 个文件）

以下 3 个文件中的版本号必须同步更新：

// turbo
1. `package.json` → `"version": "X.Y.Z"`
2. `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
3. `src-tauri/Cargo.toml` → `version = "X.Y.Z"`

> `__APP_VERSION__` 由 `vite.config.ts` 从 `package.json` 自动读取，无需额外处理。

## 3. 提交版本变更

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "🔖 release: vX.Y.Z"
```

## 4. 打 Git Tag

```bash
git tag vX.Y.Z
```

## 5. 推送代码和 Tag（触发自动构建）

```bash
git push origin main
git push origin vX.Y.Z
```

> 推送 tag 后 GitHub Actions 自动触发 `release.yml`，执行以下操作：
> 1. 创建 **Draft Release**
> 2. 并行构建 **Desktop**（Windows x64 `.msi/.exe` + macOS Universal `.dmg` + Linux x64 `.AppImage/.deb`）
> 3. 并行构建 **Android APK**（release 签名）
> 4. 所有产物自动上传到 Draft Release

## 6. 等待 GitHub Actions 完成

前往 https://github.com/llt22/talkio/actions 查看构建进度。

所有 job 完成后，前往 https://github.com/llt22/talkio/releases 找到 draft release。

## 7. 编辑并发布 Release

1. 编辑 Draft Release 的 body，补充 Release Notes（列出主要改动）
2. 确认所有产物已上传（dmg、msi、AppImage、deb、apk）
3. 取消 "Set as a draft" → 点击 "Publish release"

## 8. 本地测试验证（可选）

### 本地 macOS 构建（跳过 CI）

```bash
npx tauri build
```

产物：`src-tauri/target/release/bundle/dmg/talkio_X.Y.Z_aarch64.dmg`

### 本地 Android Debug 构建（快速测试）

```bash
npx tauri android build -d -t aarch64 --apk
adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
```

### Web 版构建

```bash
npm run build
```

产物目录：`dist/`

---

## CI/CD 架构参考

### GitHub Actions Workflows

| Workflow | 触发条件 | 用途 |
|----------|----------|------|
| `ci.yml` | push/PR to `main` | TypeScript 类型检查 |
| `release.yml` | push tag `v*.*.*` 或手动 workflow_dispatch | 全平台构建 + Draft Release |

### release.yml 构建矩阵

| Job | Runner | 产物 |
|-----|--------|------|
| `build-desktop` (Windows) | `windows-latest` | `.msi`, `.exe` |
| `build-desktop` (macOS) | `macos-latest` | `.dmg` (Universal: Intel + Apple Silicon) |
| `build-desktop` (Linux) | `ubuntu-22.04` | `.AppImage`, `.deb` |
| `build-android` | `ubuntu-latest` | `Talkio-vX.Y.Z.apk` (release 签名) |

### 手动触发构建（无需打 tag）

在 GitHub Actions 页面 → Release workflow → Run workflow → 输入 tag 名称。

---

## 快速参考

| 项目 | 路径/命令 |
|------|----------|
| 版本号文件 | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` |
| CI/CD 配置 | `.github/workflows/release.yml`, `.github/workflows/ci.yml` |
| macOS 本地构建 | `npx tauri build` |
| Android debug | `npx tauri android build -d -t aarch64 --apk` |
| Web 构建 | `npm run build` |
| 安装到手机 | `adb install -r <apk-path>` |
| 版本注入 | `vite.config.ts` → `__APP_VERSION__` from `package.json` |
| GitHub Releases | https://github.com/llt22/talkio/releases |
| GitHub Actions | https://github.com/llt22/talkio/actions |
