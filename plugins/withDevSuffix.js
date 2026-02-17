const {
  withAppBuildGradle,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withDevSuffix(config) {
  // 1. Add applicationIdSuffix to debug buildType in build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;
    if (!gradle.includes("applicationIdSuffix")) {
      cfg.modResults.contents = gradle.replace(
        /buildTypes\s*\{/,
        `buildTypes {\n        debug {\n            applicationIdSuffix ".dev"\n        }`
      );
    }
    return cfg;
  });

  // 2. Override app_name in debug resources so launcher shows "Avatar Dev"
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const debugResDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/debug/res/values"
      );
      fs.mkdirSync(debugResDir, { recursive: true });
      fs.writeFileSync(
        path.join(debugResDir, "strings.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">Avatar Dev</string>\n</resources>\n`
      );
      return cfg;
    },
  ]);

  return config;
}

module.exports = withDevSuffix;
