module.exports = {
  preset: '@react-native/jest-preset',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
    '^.+\\.glb$': '@react-native/jest-preset/jest/assetFileTransformer.js',
  },
};
