const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Reads release signing credentials from android/local.properties:
 *   RELEASE_STORE_FILE=../release-key.jks
 *   RELEASE_STORE_PASSWORD=xxx
 *   RELEASE_KEY_ALIAS=release-key
 *   RELEASE_KEY_PASSWORD=xxx
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes("signingConfigs.release")) return cfg;

    const signingBlock = `        release {
            def props = new Properties()
            def propsFile = rootProject.file("local.properties")
            if (propsFile.exists()) props.load(new FileInputStream(propsFile))
            storeFile file(props.getProperty("RELEASE_STORE_FILE", "../../release-key.jks"))
            storePassword props.getProperty("RELEASE_STORE_PASSWORD", "")
            keyAlias props.getProperty("RELEASE_KEY_ALIAS", "release-key")
            keyPassword props.getProperty("RELEASE_KEY_PASSWORD", "")
        }`;

    // Add release entry inside signingConfigs block
    gradle = gradle.replace(
      /signingConfigs\s*\{([\s\S]*?)(    \})\n    buildTypes/,
      (match, inner) =>
        `signingConfigs {${inner}${signingBlock}\n    }\n    buildTypes`
    );

    // Point release buildType to signingConfigs.release
    gradle = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig signingConfigs.release"
    );

    cfg.modResults.contents = gradle;
    return cfg;
  });
}

module.exports = withReleaseSigning;
