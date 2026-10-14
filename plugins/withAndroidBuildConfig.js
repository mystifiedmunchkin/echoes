const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const GRADLE_MEMORY = '-Xmx6g -XX:MaxMetaspaceSize=1024m';
const SIGNING_MARKER = '// echoes-release-signing';

function withAndroidBuildConfig(config) {
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (property) => property.key !== 'org.gradle.jvmargs',
    );
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: GRADLE_MEMORY,
    });
    return config;
  });

  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1',
    );

    const signingConfig = `
${SIGNING_MARKER}
def echoesLocalProperties = new java.util.Properties()
def echoesLocalPropertiesFile = rootProject.file('local.properties')
if (echoesLocalPropertiesFile.exists()) {
    echoesLocalProperties.load(new java.io.FileInputStream(echoesLocalPropertiesFile))
}
def echoesSigningProperty = { String name ->
    echoesLocalProperties.getProperty(name) ?: findProperty(name) ?: System.getenv(name)
}
def echoesSigningKeys = [
    'MYAPP_UPLOAD_STORE_FILE',
    'MYAPP_UPLOAD_STORE_PASSWORD',
    'MYAPP_UPLOAD_KEY_ALIAS',
    'MYAPP_UPLOAD_KEY_PASSWORD'
]
def echoesReleaseBuildRequested = gradle.startParameter.taskNames.any { taskName ->
    taskName.toLowerCase().contains('release')
}
def echoesMissingSigningKeys = echoesSigningKeys.findAll { !echoesSigningProperty(it) }
android {
    signingConfigs {
        if (!echoesMissingSigningKeys) {
            release {
                storeFile file(echoesSigningProperty('MYAPP_UPLOAD_STORE_FILE'))
                storePassword echoesSigningProperty('MYAPP_UPLOAD_STORE_PASSWORD')
                keyAlias echoesSigningProperty('MYAPP_UPLOAD_KEY_ALIAS')
                keyPassword echoesSigningProperty('MYAPP_UPLOAD_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            if (echoesReleaseBuildRequested && echoesMissingSigningKeys) {
                throw new GradleException(
                    "Missing release signing properties: " + echoesMissingSigningKeys.join(', ') +
                    ". Configure android/local.properties, Gradle properties, or environment variables."
                )
            }
            if (!echoesMissingSigningKeys) {
                signingConfig signingConfigs.release
            }
        }
    }
}
`;

    const markerIndex = contents.indexOf(SIGNING_MARKER);
    if (markerIndex >= 0) contents = contents.slice(0, markerIndex).trimEnd();
    contents += signingConfig;
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidBuildConfig;
