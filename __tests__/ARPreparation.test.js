import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import App from '../App';

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
  Alert: { alert: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('react-native-device-info', () => ({
  getManufacturerSync: () => 'Google', getModel: () => 'Pixel 8', getDeviceId: () => 'husky',
}));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'GestureHandlerRootView' }));
jest.mock('react-native-vision-camera', () => ({
  useCameraPermission: () => ({ hasPermission: true, requestPermission: jest.fn() }),
}));
jest.mock('@maplibre/maplibre-react-native', () => ({
  Camera: 'Camera', CircleLayer: 'CircleLayer', FillLayer: 'FillLayer',
  LineLayer: 'LineLayer', MapView: 'MapView', ShapeSource: 'ShapeSource',
  UserLocation: 'UserLocation',
}));
jest.mock('../src/hooks/useRadar', () => ({ useRadar: () => mockRadar }));
jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../src/hooks/useInventory', () => ({
  useInventory: () => ({
    collectedMemories: [], showInventory: false,
    setShowInventory: jest.fn(), handleCollectMemory: jest.fn(), clearInventory: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useVisitedPlaces', () => ({
  useVisitedPlaces: () => ({ visitedPlaces: [], markPlaceVisited: jest.fn() }),
}));
jest.mock('../constants/i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));
jest.mock('../src/components/InventoryModal', () => 'InventoryModal');
jest.mock('../src/components/MenuModal', () => 'MenuModal');
jest.mock('../src/components/CollectionParticle', () => 'CollectionParticle');
jest.mock('../src/components/MemoryAudioPlayer', () => ({ MemoryAudioPlayer: 'MemoryAudioPlayer' }));
jest.mock('../src/components/MemoryInfoModal', () => ({ MemoryInfoModal: 'MemoryInfoModal' }));
jest.mock('../src/components/FullscreenMediaViewer', () => ({ FullscreenMediaViewer: 'FullscreenMediaViewer' }));
jest.mock('../src/components/AccountModal', () => ({ AccountModal: 'AccountModal' }));
jest.mock('../src/components/ViroModelViewer', () => 'ViroModelViewer');
jest.mock('../src/components/ViroARView', () => ({
  __esModule: true,
  default: (props) => require('react').createElement('ViroARView', props),
}));

const origin = { latitude: 0, longitude: 0 };
const memoryAt = (meters) => ({
  id: meters, name: `Memory ${meters}`, lat: 0, lng: (meters / 6371000) * (180 / Math.PI),
});
const mockRadar = {
  location: origin, memories: [], isLoadingApi: false,
  refreshData: jest.fn(), requestGpsPermission: jest.fn(),
  cacheMemoryAssets: jest.fn(), loadNearbyMemories: jest.fn(),
};
let renderer;

beforeEach(async () => {
  jest.clearAllMocks();
  mockRadar.location = origin;
  mockRadar.loadNearbyMemories.mockResolvedValue({
    location: origin, memories: [memoryAt(49), memoryAt(51)],
  });
  await act(async () => { renderer = TestRenderer.create(<App />); });
});

afterEach(() => {
  act(() => renderer.unmount());
});

test('shows the native user marker with a compass heading indicator', () => {
  const marker = renderer.root.findByType('UserLocation');
  expect(marker.props.renderMode).toBe('native');
  expect(marker.props.androidRenderMode).toBe('compass');
  expect(marker.props.showsUserHeadingIndicator).toBe(true);
});

test('waits for a GPS position before mounting the user marker', async () => {
  mockRadar.location = null;
  await act(async () => { renderer.update(<App />); });
  expect(renderer.root.findAllByType('UserLocation')).toHaveLength(0);
});

test('does not mount AR until the nearby list and its media are ready', async () => {
  let releaseDownload;
  let opening;
  mockRadar.cacheMemoryAssets.mockImplementation((memory) => new Promise((resolve) => {
    releaseDownload = () => resolve({ ...memory, model_url: 'file://local.glb' });
  }));
  await act(async () => {
    opening = renderer.root.findByProps({ accessibilityLabel: 'scanAr' }).props.onPress();
  });
  expect(mockRadar.loadNearbyMemories).toHaveBeenCalledTimes(1);
  expect(mockRadar.cacheMemoryAssets).toHaveBeenCalledTimes(1);
  expect(mockRadar.cacheMemoryAssets).toHaveBeenCalledWith(memoryAt(49));
  expect(renderer.root.findAllByType('ViroARView')).toHaveLength(0);
  await act(async () => {
    releaseDownload();
    await opening;
  });
  const arView = renderer.root.findByType('ViroARView');
  expect(arView.props.arMemories).toHaveLength(1);
  expect(arView.props.arMemories[0]).toMatchObject({
    id: 49, model_url: 'file://local.glb',
    relativePosition: expect.any(Array),
  });
});

test('a failed media download keeps the map visible and reports the error', async () => {
  mockRadar.cacheMemoryAssets.mockRejectedValue(new Error('Download failed'));
  await act(async () => {
    await renderer.root.findByProps({ accessibilityLabel: 'scanAr' }).props.onPress();
  });
  expect(renderer.root.findAllByType('ViroARView')).toHaveLength(0);
  expect(renderer.root.findAllByType('MapView')).toHaveLength(1);
  expect(Alert.alert).toHaveBeenCalledWith('arPreparationError', 'Download failed');
});
