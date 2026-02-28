---
description: Talkio 版本发布流程（macOS + Android + Web）
---

# Talkio 发布流程

## 前置条件

- 所有功能已合并到 `main` 分支
- 本地代码已拉取最新：`git pull --rebase github main`
- 工作区无未提交改动：`git status` 干净

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

## 5. 推送代码和 Tag

```bash
git push github main
git push github vX.Y.Z
```

## 6. 构建 macOS 桌面端

```bash
npx tauri build
```

产物路径：
- `.dmg`: `src-tauri/target/release/bundle/dmg/talkio_X.Y.Z_aarch64.dmg`
- `.app`: `src-tauri/target/release/bundle/macos/talkio.app`

## 7. 构建 Android APK

### Debug 版（测试用）

```bash
npx tauri android build -d -t aarch64 --apk
```

产物路径：`src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

### Release 版（发布用）

需要先配置签名环境变量：

```bash
export ANDROID_KEYSTORE_PATH="/path/to/your/keystore.jks"
export ANDROID_KEYSTORE_PASSWORD="your-password"
export ANDROID_KEY_ALIAS="your-alias"
export ANDROID_KEY_PASSWORD="your-key-password"
```

然后构建：

```bash
npx tauri android build -t aarch64 --apk
```

产物路径：`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

## 8. 构建 Web 版（可选）

```bash
npm run build
```

产物目录：`dist/`

## 9. 创建 GitHub Release

1. 前往 https://github.com/llt22/talkio/releases/new
2. 选择 tag `vX.Y.Z`
3. 标题：`vX.Y.Z`
4. 填写 Release Notes（列出主要改动）
5. 上传构建产物：
   - `talkio_X.Y.Z_aarch64.dmg`（macOS）
   - `app-universal-release.apk`（Android，重命名为 `talkio-X.Y.Z-android-arm64.apk`）
6. 发布

## 10. 安装到手机验证（可选）

```bash
adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
```

---

## 快速参考

| 项目 | 路径/命令 |
|------|----------|
| 版本号文件 | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` |
| macOS 构建 | `npx tauri build` |
| Android debug | `npx tauri android build -d -t aarch64 --apk` |
| Android release | `npx tauri android build -t aarch64 --apk`（需签名环境变量） |
| Web 构建 | `npm run build` |
| 安装到手机 | `adb install -r <apk-path>` |
| 版本注入 | `vite.config.ts` → `__APP_VERSION__` from `package.json` |
