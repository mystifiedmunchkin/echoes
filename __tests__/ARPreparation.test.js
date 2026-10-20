import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, BackHandler } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import App from '../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExperienceControls } from '../src/experiences/ExperienceControls';

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Image: 'Image', ActivityIndicator: 'ActivityIndicator',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Alert: { alert: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('react-native-device-info', () => ({
  getManufacturerSync: jest.fn(() => 'Google'), getModel: jest.fn(() => 'Pixel 8'), getDeviceId: () => 'husky',
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
  useAuth: () => mockAuth,
}));
jest.mock('../src/services/auth', () => ({
  getAuthToken: async () => mockAuth.token,
  getStoredUser: async () => mockAuth.user,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(),
  multiSet: jest.fn().mockResolvedValue(),
}));
jest.mock('../src/hooks/useInventory', () => ({
  useInventory: () => ({
    collectedMemories: [], showInventory: false,
    setShowInventory: jest.fn(), handleCollectMemory: jest.fn().mockResolvedValue(), clearInventory: jest.fn().mockResolvedValue(),
  }),
}));
jest.mock('../constants/i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  translate: key => key,
}));
jest.mock('../src/components/InventoryModal', () => 'InventoryModal');
jest.mock('../src/components/MenuModal', () => 'MenuModal');
jest.mock('../src/components/CollectionParticle', () => 'CollectionParticle');
jest.mock('../src/components/MemoryAudioPlayer', () => ({ MemoryAudioPlayer: 'MemoryAudioPlayer' }));
jest.mock('../src/components/MemoryInfoModal', () => ({ MemoryInfoModal: 'MemoryInfoModal' }));
jest.mock('../src/components/FullscreenMediaViewer', () => ({ FullscreenMediaViewer: 'FullscreenMediaViewer' }));
jest.mock('../src/components/AccountModal', () => ({ AccountModal: 'AccountModal' }));
jest.mock('../src/components/ViroModelViewer', () => 'ViroModelViewer');
jest.mock('../src/experiences/ExperienceViewer', () => ({
  __esModule: true,
  default: (props) => require('react').createElement('ExperienceViewer', props),
}));
jest.mock('../src/components/ViroARView', () => ({
  __esModule: true,
  default: (props) => require('react').createElement('ViroARView', props),
}));

const origin = { latitude: 0, longitude: 0 };
const memoryAt = (meters) => ({
  id: meters, location_id: 700, name: `Memory ${meters}`, lat: 0, lng: (meters / 6371000) * (180 / Math.PI),
});
const mockRadar = {
  location: origin, memories: [], isLoadingApi: false,
  refreshData: jest.fn(), requestGpsPermission: jest.fn(),
  cacheMemoryAssets: jest.fn(), loadNearbyMemories: jest.fn(),
};
let renderer;
let mockAuth;
const originalFetch = global.fetch;

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuth = { user: null, token: null };
  AsyncStorage.getItem.mockResolvedValue(null);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  DeviceInfo.getManufacturerSync.mockReturnValue('Google');
  DeviceInfo.getModel.mockReturnValue('Pixel 8');
  mockRadar.memories = [];
  mockRadar.location = origin;
  mockRadar.loadNearbyMemories.mockResolvedValue({
    location: origin, memories: [memoryAt(49), memoryAt(51)],
  });
  await act(async () => { renderer = TestRenderer.create(<App />); });
});

afterEach(() => {
  act(() => renderer.unmount());
  jest.useRealTimers();
  global.fetch = originalFetch;
});

test('shows the native user marker with a compass heading indicator', () => {
  const marker = renderer.root.findByType('UserLocation');
  expect(marker.props.renderMode).toBe('native');
  expect(marker.props.androidRenderMode).toBe('compass');
  expect(marker.props.showsUserHeadingIndicator).toBe(true);
});

test('wires account deletion from the map', async () => {
  mockAuth = { user: { id: 1 }, token: 'test-token', deleteAccount: jest.fn() };
  await act(async () => { renderer.update(<App />); });
  await act(async () => {
    await renderer.root.findByType('AccountModal').props.onDeleteAccount();
  });
  expect(mockAuth.deleteAccount).toHaveBeenCalledTimes(1);
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

test('selecting an experience routes to its template without entering legacy placement', async () => {
  const memory = {
    ...memoryAt(10),
    type: 'images',
    interactive: {
      logic: {
        games: [
          {
            id: 100,
            type: 'images',
            assets: [],
            objects: [],
            target: {
              id: 200,
              imageUrl: 'file://poster.jpg',
              physicalWidth: 0.5,
            },
          },
        ],
      },
    },
  };
  mockRadar.loadNearbyMemories.mockResolvedValue({
    location: origin,
    memories: [memory],
  });
  mockRadar.cacheMemoryAssets.mockImplementation(async item => item);
  await act(async () => {
    await renderer.root
      .findByProps({ accessibilityLabel: 'scanAr' })
      .props.onPress();
  });
  await act(async () => {
    await renderer.root
      .findByType('ViroARView')
      .props.onMemorySelected({ nativeEvent: { id: 10 } });
  });
  const arView = renderer.root.findByType('ViroARView');
  expect(arView.props.experience.games[0].type).toBe('images');
  expect(arView.props.memoryToPlace).toBeNull();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('experienceHint_images');
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'closeExperience' })
      .props.onPress(),
  );
  expect(renderer.root.findByType('ViroARView').props.experience).toBeNull();
});

test('selecting another AR bubble switches to that bubble game', async () => {
  const firstMemory = {
    ...memoryAt(10),
    interactive: {
      logic: {
        games: [{ id: 100, type: 'discovery', assets: [], objects: [] }],
      },
    },
  };
  const secondMemory = {
    ...memoryAt(11),
    interactive: {
      logic: {
        games: [{ id: 101, type: 'treasure', assets: [], objects: [] }],
      },
    },
  };
  mockRadar.loadNearbyMemories.mockResolvedValue({
    location: origin,
    memories: [firstMemory, secondMemory],
  });
  mockRadar.cacheMemoryAssets.mockImplementation(async item => item);

  await act(async () => {
    await renderer.root.findByProps({ accessibilityLabel: 'scanAr' }).props.onPress();
  });
  await act(async () => {
    const onMemorySelected = renderer.root.findByType('ViroARView').props.onMemorySelected;
    await onMemorySelected({ nativeEvent: { id: 10 } });
  });
  expect(renderer.root.findByType('ViroARView').props.experience.games[0].type)
    .toBe('discovery');

  await act(async () => {
    const onMemorySelected = renderer.root.findByType('ViroARView').props.onMemorySelected;
    await onMemorySelected({ nativeEvent: { id: 11 } });
  });
  expect(renderer.root.findByType('ViroARView').props.experience.games[0].type)
    .toBe('treasure');
});

test('Galaxy A opens an experience without a model URL in the fallback scene', async () => {
  jest.useFakeTimers();
  DeviceInfo.getManufacturerSync.mockReturnValue('samsung');
  DeviceInfo.getModel.mockReturnValue('Galaxy A55');
  const memory = {
    ...memoryAt(10),
    type: 'discovery',
    interactive: {
      logic: {
        games: [
          {
            id: 100,
            type: 'discovery',
            assets: [],
            objects: [
              { id: 101, properties: { text: 'Place information' } },
            ],
          },
        ],
      },
    },
  };
  mockRadar.memories = [memory];
  mockRadar.cacheMemoryAssets.mockImplementation(async item => item);
  await act(async () => {
    renderer.unmount();
    renderer = TestRenderer.create(<App />);
  });
  await act(async () => {
    await renderer.root.findByType('MemoryInfoModal').props.onViewModel(memory);
    jest.advanceTimersByTime(500);
  });
  expect(renderer.root.findAllByType('ViroModelViewer')).toHaveLength(0);
  expect(renderer.root.findAllByType('ViroARView')).toHaveLength(0);
  expect(
    renderer.root.findByType('ExperienceViewer').props.experience.games[0].type,
  ).toBe('discovery');
});

const progressMemory = () => ({
  ...memoryAt(10),
  interactive: {
    logic: {
      games: [
        {
          id: 100, type: 'aiming',
          assets: [{ id: 10, type: 'GLB', url: 'file://ball.glb' }],
          objects: [
            { id: 1, properties: { asset: 10, collider: { type: 'sphere', size: [0.1, 0.1, 0.1] } } },
            { id: 2, properties: { asset: 10, collectible: true, collider: { type: 'basket', size: [1, 1, 1], thickness: 0.05 } } },
          ],
          settings: {
            plane: { minWidth: 1, minLength: 1 },
            projectile: { objectId: 1 }, targets: [2],
          },
        },
        {
          id: 101, type: 'discovery', assets: [],
          objects: [{ id: 2, properties: { text: 'Key', collectible: true } }],
        },
      ],
    },
  },
});

async function openProgressExperience() {
  mockAuth = { user: { id: 1 }, token: 'test-token', deleteAccount: jest.fn() };
  const memory = progressMemory();
  mockRadar.loadNearbyMemories.mockResolvedValue({ location: origin, memories: [memory] });
  mockRadar.cacheMemoryAssets.mockImplementation(async item => item);
  await act(async () => {
    renderer.unmount();
    renderer = TestRenderer.create(<App />);
  });
  await act(async () => {
    await renderer.root.findByProps({ accessibilityLabel: 'scanAr' }).props.onPress();
  });
  await act(async () => {
    await renderer.root.findByType('ViroARView').props.onMemorySelected({ nativeEvent: { id: 10 } });
  });
}

test('wires account deletion from the AR camera', async () => {
  await openProgressExperience();
  await act(async () => {
    await renderer.root.findByType('AccountModal').props.onDeleteAccount();
  });
  expect(mockAuth.deleteAccount).toHaveBeenCalledTimes(1);
});

test('POSTs on game switch and close, including final scores and deduplicated named object IDs', async () => {
  await openProgressExperience();
  const event = { type: 'aiming', gameId: 100, objectId: 2, name: 'collect' };
  await act(async () => {
    const onEvent = renderer.root.findByType('ViroARView').props.onExperienceEvent;
    onEvent(event);
    onEvent(event);
    onEvent({ ...event, objectId: 1 }); // Not collectible.
    onEvent({
      type: 'aiming', gameId: 100, objectId: 2, name: 'collision',
      data: { scoringContact: true, projectileId: -1 },
    });
  });
  expect(Alert.alert).toHaveBeenCalledWith('scoreAddedTitle', 'scoreAdded');
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByType(ExperienceControls).props.onSelect(1);
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
    scores: [{ location_id: 700, game_type: 'aiming', score: 1 }],
    visited_location_ids: [700],
    collected_items: [{ location_id: 700, game_id: 100, item_id: 2, quantity: 1 }],
  });
  await act(async () => {
    renderer.root.findByType(ExperienceControls).props.onSelect(1);
    renderer.root.findByType('ViroARView').props.onExperienceEvent({
      type: 'discovery', gameId: 101, objectId: 2, name: 'collect',
    });
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'closeExperience' }).props.onPress();
  });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(global.fetch.mock.calls[1][1].body).collected_items).toEqual([
    { location_id: 700, game_id: 100, item_id: 2, quantity: 1 },
    { location_id: 700, game_id: 101, item_id: 2, quantity: 1 },
  ]);
  await act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'closeCamera' }).props.onPress();
  });
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test.each(['button', 'hardware'])('closing the AR camera via %s sends the active game progress', async method => {
  await openProgressExperience();
  await act(async () => {
    if (method === 'hardware') BackHandler.addEventListener.mock.calls.at(-1)[1]();
    else renderer.root.findByProps({ accessibilityLabel: 'closeCamera' }).props.onPress();
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each(['button', 'hardware'])('closing the fallback experience via %s sends its progress', async method => {
  jest.useFakeTimers();
  mockAuth = { user: { id: 1 }, token: 'test-token' };
  DeviceInfo.getManufacturerSync.mockReturnValue('samsung');
  DeviceInfo.getModel.mockReturnValue('Galaxy A55');
  const memory = progressMemory();
  mockRadar.memories = [memory];
  mockRadar.cacheMemoryAssets.mockImplementation(async item => item);
  await act(async () => {
    renderer.unmount();
    renderer = TestRenderer.create(<App />);
  });
  await act(async () => {
    await renderer.root.findByType('MemoryInfoModal').props.onViewModel(memory);
    jest.advanceTimersByTime(500);
  });
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => {
    if (method === 'hardware') BackHandler.addEventListener.mock.calls.at(-1)[1]();
    else renderer.root.findByProps({ accessibilityLabel: 'closeModelViewer' }).props.onPress();
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('selects separate games at one location and sends location IDs rather than game IDs', async () => {
  mockAuth = { user: { id: 1 }, token: 'test-token' };
  const games = [101, 102].map((id, index) => {
    const type = index === 0 ? 'discovery' : 'aiming';
    return {
      ...memoryAt(10),
      id, location_id: 7, name: `Game ${id}`,
      interactive: { logic: { games: [{
        id, type,
        assets: [{ id: 0, type: 'GLB', url: `file://model-${id}.glb` }],
        objects: [{ id: 1, properties: { asset: 0, collectible: true } }],
      }] } },
    };
  });
  mockRadar.memories = games;
  mockRadar.loadNearbyMemories.mockResolvedValue({ location: origin, memories: games });
  mockRadar.cacheMemoryAssets.mockImplementation(async item => item);
  await act(async () => {
    renderer.unmount();
    renderer = TestRenderer.create(<App />);
  });
  const markers = renderer.root.findByProps({ id: 'memory-markers' });
  expect(markers.props.shape.features.map(item => item.properties)).toEqual([
    { gameId: '101', locationId: 7, isNearby: true },
    { gameId: '102', locationId: 7, isNearby: true },
  ]);
  expect(renderer.root.findByType('MapView').props.onPress).toBeUndefined();
  await act(async () => {
    markers.props.onPress({ features: [{ properties: { gameId: '102' } }] });
  });
  expect(renderer.root.findByType('MemoryInfoModal').props.memory.id).toBe(102);
  act(() => renderer.root.findByType('MemoryInfoModal').props.onClose());
  await act(async () => {
    await renderer.root.findByProps({ accessibilityLabel: 'scanAr' }).props.onPress();
  });
  expect(renderer.root.findByType('ViroARView').props.arMemories.map(item => item.id))
    .toEqual([101, 102]);
  for (const [index, id] of [101, 102].entries()) {
    await act(async () => {
      await renderer.root.findByType('ViroARView').props.onMemorySelected({ nativeEvent: { id } });
    });
    const arView = renderer.root.findByType('ViroARView');
    expect(arView.props.experience.games[0].id).toBe(id);
    await act(async () => {
      const type = index === 0 ? 'discovery' : 'aiming';
      arView.props.onExperienceEvent({ type, gameId: id, objectId: 1, name: 'collect' });
      if (type === 'aiming') arView.props.onExperienceEvent({
        type, gameId: id, objectId: 1, name: 'collision',
        data: { scoringContact: true, projectileId: -1, points: 2 },
      });
    });
  }
  await act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'closeCamera' }).props.onPress();
  });
  const payload = JSON.parse(global.fetch.mock.calls.at(-1)[1].body);
  expect(payload).toEqual({
    scores: [{ location_id: 7, game_type: 'aiming', score: 2 }],
    visited_location_ids: [7],
    collected_items: [
      { location_id: 7, game_id: 101, item_id: 1, quantity: 1 },
      { location_id: 7, game_id: 102, item_id: 1, quantity: 1 },
    ],
  });
  const menu = renderer.root.findByType('MenuModal');
  expect(menu.props.places.map(item => item.id).sort()).toEqual([101, 102]);
  await act(async () => {
    menu.props.onSelectPlace(menu.props.places.find(item => item.id === 102));
  });
  expect(renderer.root.findByType('MemoryInfoModal').props.memory).toMatchObject({
    id: 102, location_id: 7, name: 'Game 102',
  });
});
