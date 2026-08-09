---
description: Talkio 版本发布流程（macOS + Android + Web）
---

# Talkio 发布流程

Talkio 已配置 GitHub Actions CI/CD（`.github/workflows/release.yml`），推送 tag 后自动构建所有平台产物；全部成功后自动发布 Release，任一平台失败则保留 Draft Release。

## 前置条件

- 所有功能已合并到 `main` 分支，且最新 CI 已通过
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

## 2. 更新版本号（5 个文件）

以下 5 个文件中的版本号必须同步更新：

// turbo
1. `package.json` → `"version": "X.Y.Z"`
2. `package-lock.json` → 根节点及 `packages[""]` 的 `"version": "X.Y.Z"`
3. `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
4. `src-tauri/Cargo.toml` → `version = "X.Y.Z"`
5. `src-tauri/Cargo.lock` → `talkio` package 的 `version = "X.Y.Z"`

> `__APP_VERSION__` 由 `vite.config.ts` 从 `package.json` 自动读取，无需额外处理。

## 3. 提交版本变更

```bash
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "release: 发布 vX.Y.Z"
```

推送版本提交并等待 CI 通过后，再创建 tag，避免失败提交触发 Release workflow。

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
> 5. 所有平台构建成功后自动发布 Release；任一平台失败时保留 Draft

重复触发同一 tag 时会复用已有 Draft Release、保留现有 Release Notes，并替换同名 APK，不会创建重复 Release。

## 6. 等待 GitHub Actions 完成

前往 https://github.com/llt22/talkio/actions 查看构建进度。

无需持续等待。所有 job 成功后 Release 会自动发布；失败时可在 Actions 查看日志，修复后使用同一 tag 手动重跑。

## 7. Release Notes

### 7.1 生成 Release Notes

运行以下命令获取上次 tag 以来的所有提交：

```bash
git log $(git describe --tags --abbrev=0 HEAD~1)..HEAD --oneline --no-merges
```

### 7.2 编写 Release Notes

使用以下模板（根据实际改动填写，删除无关分类）：

```markdown
## What's New

### ✨ New Features
- 功能描述 1
- 功能描述 2

### 🐛 Bug Fixes
- 修复描述 1

### 🎨 Improvements
- 改进描述 1

### ⬇️ Downloads

| Platform | File |
|----------|------|
| Windows | `Talkio_X.Y.Z_x64-setup.exe` |
| macOS | `Talkio_X.Y.Z_universal.dmg` |
| Linux | `Talkio_X.Y.Z_amd64.AppImage` / `.deb` |
| Android | `Talkio-vX.Y.Z.apk` |
```

### 7.3 完善 Release Notes

新建 Draft 时 GitHub 会自动生成 Release Notes。需要自定义内容时，可在构建期间编辑 Draft；流水线重跑不会覆盖已有说明。

所有平台构建成功后流水线自动发布，无需手动点击 **Publish release**。

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
| `release.yml` | push tag `v*.*.*` 或手动 workflow_dispatch | 全平台构建 + 自动发布 Release |

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
| 版本号文件 | `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` |
| CI/CD 配置 | `.github/workflows/release.yml`, `.github/workflows/ci.yml` |
| macOS 本地构建 | `npx tauri build` |
| Android debug | `npx tauri android build -d -t aarch64 --apk` |
| Web 构建 | `npm run build` |
| 安装到手机 | `adb install -r <apk-path>` |
| 版本注入 | `vite.config.ts` → `__APP_VERSION__` from `package.json` |
| GitHub Releases | https://github.com/llt22/talkio/releases |
| GitHub Actions | https://github.com/llt22/talkio/actions |
