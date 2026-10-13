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
    if (config.modResults.contents.includes(SIGNING_MARKER)) {
      return config;
    }

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
def echoesMissingSigningKeys = echoesSigningKeys.findAll {
    !echoesSigningProperty(it)
}
if (echoesMissingSigningKeys) {
    throw new GradleException(
        "Missing release signing properties: " + echoesMissingSigningKeys.join(', ') +
        ". Configure android/local.properties, Gradle properties, or environment variables."
    )
}
android {
    signingConfigs {
        release {
            storeFile file(echoesSigningProperty('MYAPP_UPLOAD_STORE_FILE'))
            storePassword echoesSigningProperty('MYAPP_UPLOAD_STORE_PASSWORD')
            keyAlias echoesSigningProperty('MYAPP_UPLOAD_KEY_ALIAS')
            keyPassword echoesSigningProperty('MYAPP_UPLOAD_KEY_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`;

    config.modResults.contents += signingConfig;
    return config;
  });
}

module.exports = withAndroidBuildConfig;
