---
description: 构建并安装 Android debug APK 到手机
---

# Android Debug APK 构建与安装

## 前置条件
- 手机已通过 USB 连接并开启开发者模式
- `adb devices` 能看到设备
- 已安装 Android SDK、NDK 27.x、Rust aarch64-linux-android target

## 构建步骤

// turbo
1. 只编译 arm64 debug APK（约15秒）：
```
npx tauri android build -d -t aarch64 --apk
```
**关键参数说明：**
- `-d` = debug 模式（跳过签名、不压缩，编译快）
- `-t aarch64` = 只编译 arm64 架构（现代手机都是这个）
- `--apk` = 输出 APK 而非 AAB

产物路径：`src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

## 安装步骤

// turbo
2. 安装到手机：
```
adb install -r "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
```

## 常见问题

### 签名不匹配 (INSTALL_FAILED_UPDATE_INCOMPATIBLE)
手机上已有 release 签名的版本，无法覆盖安装 debug 版本。解决：
```
adb uninstall com.lilongtao.talkio
adb install "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
```
⚠️ 卸载会清空本地数据，需重新配置供应商和 API Key。

### Release 签名构建
如需 release 构建，需设置环境变量：
```powershell
$env:ANDROID_KEYSTORE_PATH = "C:\Users\lee\WebstormProjects\talkio\talkio-release.keystore"
$env:ANDROID_KEYSTORE_PASSWORD = "<密码>"
$env:ANDROID_KEY_ALIAS = "<别名>"
$env:ANDROID_KEY_PASSWORD = "<密码>"
npx tauri android build -t aarch64 --apk
```

### 构建太慢
- 不要省略 `-t aarch64`，否则会编译 4 个架构
- 不要省略 `-d`（除非需要 release），debug 跳过优化和签名
- 首次编译 Rust 较慢（~2分钟），后续增量编译很快（~15秒）
