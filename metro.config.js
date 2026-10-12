const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('glb')) {
  config.resolver.assetExts.push('glb');
}

module.exports = config;
