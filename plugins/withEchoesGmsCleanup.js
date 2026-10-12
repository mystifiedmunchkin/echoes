const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const GMS_LOCATION_DEPENDENCY =
  /\s*(?:\/\/ Required for ARCore Geospatial API\s*\r?\n\s*)?implementation ['"]com\.google\.android\.gms:play-services-location:[^'"]+['"]\s*\r?\n/g;

module.exports = function withEchoesGmsCleanup(config) {
  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      GMS_LOCATION_DEPENDENCY,
      '\n',
    );
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const appBuildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle',
      );
      const contents = fs.readFileSync(appBuildGradlePath, 'utf8');
      fs.writeFileSync(
        appBuildGradlePath,
        contents.replace(GMS_LOCATION_DEPENDENCY, '\n'),
      );
      return config;
    },
  ]);
};
