import fs from 'fs';
import path from 'path';
import plist from '@expo/plist';
import xcode from 'xcode';

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const packageJson = JSON.parse(read('package.json'));
const properties = JSON.parse(read('ios', 'Podfile.properties.json'));
const info = plist.parse(read('ios', 'TestApp', 'Info.plist'));
const podfile = read('ios', 'Podfile');
const delegate = read('ios', 'TestApp', 'AppDelegate.swift');
const project = xcode.project(path.join(root, 'ios', 'TestApp.xcodeproj', 'project.pbxproj')).parseSync();
const configurations = Object.values(project.pbxXCBuildConfigurationSection())
  .filter(config => config.buildSettings);
const targets = configurations.filter(config => config.buildSettings.PRODUCT_NAME);
const plugin = name => app.plugins.find(entry => Array.isArray(entry) ? entry[0] === name : entry === name);

test('keeps the iOS deployment minimum aligned with the installed device-only ViroKit', () => {
  expect(plugin('expo-build-properties')[1].ios.deploymentTarget).toBe('17.6');
  expect(properties['ios.deploymentTarget']).toBe('17.6');
  expect(configurations).toHaveLength(4);
  configurations.forEach(config => {
    expect(String(config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET)).toBe('17.6');
  });
  expect(podfile).toContain("podfile_properties.fetch('ios.deploymentTarget')");
});

test('aligns the bundle ID, version and build number in Debug and Release', () => {
  expect(app.ios.bundleIdentifier).toBe('com.sophiehorner.echoes');
  expect(targets.map(config => config.name)).toEqual(['Debug', 'Release']);
  targets.forEach(({ buildSettings }) => {
    expect(buildSettings.PRODUCT_BUNDLE_IDENTIFIER).toBe(app.ios.bundleIdentifier);
    expect(String(buildSettings.MARKETING_VERSION)).toBe(app.version);
    expect(String(buildSettings.CURRENT_PROJECT_VERSION)).toBe(app.ios.buildNumber);
    expect(buildSettings.CODE_SIGN_STYLE).toBe('Automatic');
  });
});

test('does not leave dangling signing entitlement references', () => {
  targets.forEach(({ buildSettings }) => {
    if (buildSettings.CODE_SIGN_ENTITLEMENTS) {
      const relativePath = buildSettings.CODE_SIGN_ENTITLEMENTS.replace(/^"|"$/g, '');
      expect(fs.existsSync(path.join(root, 'ios', relativePath))).toBe(true);
    }
  });
});

test('keeps the ARKit hardware requirement in both Expo and the native plist', () => {
  expect(app.ios.infoPlist.UIRequiredDeviceCapabilities).toEqual(['arm64', 'arkit']);
  expect(info.UIRequiredDeviceCapabilities).toEqual(app.ios.infoPlist.UIRequiredDeviceCapabilities);
});

test.each([
  'NSCameraUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
])('keeps %s synchronized after native configuration changes', permission => {
  expect(info[permission]).toBe(app.ios.infoPlist[permission]);
  expect(info[permission].length).toBeGreaterThan(0);
});

test('keeps the display name and URL scheme aligned with Expo configuration', () => {
  expect(info.CFBundleDisplayName).toBe(app.name);
  expect(info.CFBundleURLTypes.flatMap(type => type.CFBundleURLSchemes)).toContain(app.scheme);
  expect(delegate).toContain('RCTLinkingManager.application');
});

test('starts the Expo-registered main component through the Expo native factory', () => {
  expect(read('index.js')).toContain('registerRootComponent(App)');
  expect(delegate).toContain('class AppDelegate: ExpoAppDelegate');
  expect(delegate).toContain('ExpoReactNativeFactory(delegate: delegate)');
  expect(delegate).toContain('withModuleName: "main"');
  expect(delegate).toContain('.expo/.virtual-metro-entry');
});

test('links Expo modules and Viro pods exactly once with New Architecture enabled', () => {
  expect(podfile).toContain('scripts/autolinking');
  expect(podfile).toContain('use_expo_modules!');
  expect(podfile).toContain("ENV['RCT_NEW_ARCH_ENABLED'] = '1'");
  expect(podfile.match(/pod 'ViroReact'/g)).toHaveLength(1);
  expect(podfile.match(/pod 'ViroKit'/g)).toHaveLength(1);
  expect(plugin('@reactvision/react-viro')).toBeDefined();
});

test('wires MapLibre native installation and its regeneration plugin', () => {
  expect(plugin('@maplibre/maplibre-react-native')).toBeDefined();
  expect(podfile).toContain('$MLRN.post_install(installer)');
});

test('links Nitro dependencies directly while excluding only Expo Location on Android', () => {
  expect(packageJson.dependencies['react-native-nitro-modules']).toBeDefined();
  expect(packageJson.dependencies['react-native-nitro-image']).toBeDefined();
  expect(packageJson.dependencies['expo-location']).toBeDefined();
  expect(packageJson.expo.autolinking.android.exclude).toContain('expo-location');
  expect(packageJson.expo.autolinking.exclude).toBeUndefined();
  expect(packageJson.expo.autolinking.apple?.exclude).toBeUndefined();
});

test('uses Expo for Metro and Release bundling and prompts for a physical device', () => {
  expect(packageJson.scripts.start).toBe('expo start --dev-client');
  expect(packageJson.scripts.ios).toBe('expo run:ios --device');
  const bundlePhase = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase)
    .find(phase => phase.name === '"Bundle React Native code and images"');
  expect(bundlePhase.shellScript).toContain('export:embed');
  expect(bundlePhase.shellScript).toContain('expo/scripts/resolveAppEntry');
});
