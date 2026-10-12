const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const PACKAGE_PATH = path.join('com', 'sophiehorner', 'echoes');
const JAVA_FILES = ['EchoesLocationModule.java', 'EchoesLocationPackage.java'];

module.exports = function withEchoesLocation(config) {
  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /\s*\/\/ Required for ARCore Geospatial API\s*\n\s*implementation ['"]com\.google\.android\.gms:play-services-location:[^'"]+['"]\s*\n/,
      '\n',
    );
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appBuildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle',
      );
      const appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf8').replace(
        /\r?\n\s*\/\/ Required for ARCore Geospatial API\r?\n\s*implementation ['"]com\.google\.android\.gms:play-services-location:[^'"]+['"]\r?\n/,
        '\n',
      );
      fs.writeFileSync(appBuildGradlePath, appBuildGradle);

      const sourceDirectory = path.join(projectRoot, 'native', 'android', 'src', 'main', 'java', PACKAGE_PATH);
      const androidDirectory = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        PACKAGE_PATH,
      );

      fs.mkdirSync(androidDirectory, { recursive: true });
      for (const fileName of JAVA_FILES) {
        fs.copyFileSync(
          path.join(sourceDirectory, fileName),
          path.join(androidDirectory, fileName),
        );
      }

      const mainApplicationPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        PACKAGE_PATH,
        'MainApplication.kt',
      );
      let mainApplication = fs.readFileSync(mainApplicationPath, 'utf8');
      const registration = '            add(EchoesLocationPackage())';
      if (!mainApplication.includes(registration)) {
        const marker = '          // Packages that cannot be autolinked yet can be added manually here, for example:';
        if (!mainApplication.includes(marker)) {
          throw new Error('Unable to register EchoesLocationPackage: MainApplication marker not found.');
        }
        mainApplication = mainApplication.replace(
          marker,
          `${marker}\n${registration}`,
        );
        fs.writeFileSync(mainApplicationPath, mainApplication);
      }

      return config;
    },
  ]);
};
