import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ViroARTrackingTargets, ViroAnimations } from '@reactvision/react-viro';
import { ExperienceContent } from '../src/experiences/ExperienceTemplates';
import ExperienceViewer from '../src/experiences/ExperienceViewer';
import ViroARView from '../src/components/ViroARView';
import { readExperience } from '../src/experiences/experience';

jest.mock('../constants/i18n', () => ({ translate: (key: string) => key }));

jest.mock('@reactvision/react-viro', () => {
  const ReactMock = require('react');
  type MockNavigatorProps = {
    initialScene: { scene: React.ComponentType };
    viroAppProps: unknown;
  };
  return {
    ViroScene: class extends ReactMock.Component {
      render() {
        return ReactMock.createElement(
          'ViroScene',
          this.props,
          this.props.children,
        );
      }
    },
    Viro3DSceneNavigator: ({
      initialScene,
      viroAppProps,
    }: MockNavigatorProps) =>
      ReactMock.createElement(initialScene.scene, {
        sceneNavigator: { viroAppProps },
      }),
    ViroARSceneNavigator: ({
      initialScene,
      viroAppProps,
    }: MockNavigatorProps) =>
      ReactMock.createElement(initialScene.scene, {
        sceneNavigator: { viroAppProps },
      }),
    ViroARScene: 'ViroARScene',
    ViroARPlane: 'ViroARPlane',
    ViroTrackingStateConstants: { TRACKING_NORMAL: 3 },
    Viro3DObject: 'Viro3DObject',
    ViroARImageMarker: 'ViroARImageMarker',
    ViroImage: 'ViroImage',
    ViroVideo: 'ViroVideo',
    ViroSound: 'ViroSound',
    ViroText: 'ViroText',
    ViroNode: 'ViroNode',
    ViroAmbientLight: 'ViroAmbientLight',
    ViroDirectionalLight: 'ViroDirectionalLight',
    ViroSphere: 'ViroSphere',
    ViroMaterials: { createMaterials: jest.fn() },
    ViroAnimations: { registerAnimations: jest.fn() },
    ViroARTrackingTargets: {
      createTargets: jest.fn(),
      deleteTarget: jest.fn(),
    },
  };
});

const source = {
  type: 'images',
  interactive: {
    logic: {
      gravity: [0, -2, 0],
      games: [
        {
          id: 300,
          assets: [{ id: 301, type: 'GLB', url: 'file://butterfly.glb' }],
          target: {
            id: 302,
            imageUrl: 'file://poster.jpg',
            physicalWidth: 0.6,
          },
          objects: [
            {
              id: 303,
              properties: {
                asset: 301,
                physics: {
                  type: 'Dynamic',
                  shape: { type: 'Sphere', params: [0.1] },
                },
                animation: { rotateY: 360, duration: 2000 },
              },
              actions: { onClick: { type: 'custom' } },
            },
          ],
        },
      ],
    },
  },
};
const experience = readExperience(source)!;
let renderer: TestRenderer.ReactTestRenderer;
const onError = jest.fn();
const onEvent = jest.fn();
const host = (name: string) =>
  renderer.root.findAll(node => node.type === name);

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

test('registers native image target before mounting its marker and cleans up on unmount', async () => {
  await act(async () => {
    renderer = TestRenderer.create(
      <ExperienceContent
        game={experience.games[0]}
        mode="ar"
        onEvent={onEvent}
        onError={onError}
      />,
    );
  });
  const marker = host('ViroARImageMarker')[0];
  const targetName = marker.props.target;
  expect(ViroARTrackingTargets.createTargets).toHaveBeenCalledWith({
    [targetName]: {
      source: { uri: 'file://poster.jpg' },
      physicalWidth: 0.6,
      orientation: 'Up',
      type: 'Image',
    },
  });
  expect(host('Viro3DObject')).toHaveLength(0);
  act(() => marker.props.onAnchorFound({ anchorId: 'found' }));
  expect(host('Viro3DObject')).toHaveLength(1);
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'targetFound', type: 'images' }),
  );
  act(() => marker.props.onAnchorUpdated({ trackingMethod: 'notTracking' }));
  expect(host('Viro3DObject')).toHaveLength(0);
  act(() => marker.props.onAnchorUpdated({ trackingMethod: 'tracking' }));
  expect(host('Viro3DObject')).toHaveLength(1);
  act(() => marker.props.onAnchorRemoved());
  expect(host('Viro3DObject')).toHaveLength(0);
  act(() => renderer.unmount());
  expect(ViroARTrackingTargets.deleteTarget).toHaveBeenCalledWith(targetName);
});

test.each(['aiming', 'treasure', 'discovery', 'images'] as const)(
  '%s uses the same physics and interaction contract in the fallback scene',
  async type => {
    const configured = {
      ...experience,
      games: [{ ...experience.games[0], type }],
    };
    await act(async () => {
      renderer = TestRenderer.create(
        <ExperienceViewer
          experience={configured}
          gameIndex={0}
          onEvent={onEvent}
          onError={onError}
        />,
      );
    });
    expect(host('ViroScene')[0].props.physicsWorld).toEqual({
      gravity: [0, -2, 0],
    });
    expect(host('ViroARImageMarker')).toHaveLength(0);
    expect(ViroARTrackingTargets.createTargets).not.toHaveBeenCalled();
    const node = host('ViroNode').find(item => item.props.viroTag === '303')!;
    expect(node.props.physicsBody).toEqual(
      experience.games[0].objects[0].properties.physics,
    );
    expect(node.props.animation).toMatchObject({ run: true, loop: true });
    expect(ViroAnimations.registerAnimations).toHaveBeenCalled();
    act(() => node.props.onClick());
    expect(onEvent).toHaveBeenCalledWith({
      type,
      gameId: 300,
      objectId: 303,
      name: 'press',
      data: { onClick: { type: 'custom' } },
    });
    act(() => node.props.onCollision('floor', [0, 0, 0], [0, 1, 0]));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'collision' }),
    );
  },
);

test('AR navigator reads current app props when the selected experience changes', async () => {
  await act(async () => {
    renderer = TestRenderer.create(
      <ViroARView arMemories={[{ id: 1, name: 'Place', model_url: '' }]} />,
    );
  });
  expect(host('ViroSphere')).toHaveLength(1);
  await act(async () => {
    renderer.update(
      <ViroARView experience={experience} onExperienceError={onError} />,
    );
  });
  expect(host('ViroSphere')).toHaveLength(0);
  expect(host('ViroARImageMarker')).toHaveLength(1);
  expect(host('ViroARScene')[0].props.physicsWorld).toEqual({
    gravity: [0, -2, 0],
  });
});

test('reports native registration errors and never mounts an unregistered marker', async () => {
  jest
    .mocked(ViroARTrackingTargets.createTargets)
    .mockImplementationOnce(() => {
      throw new Error('Registration failed');
    });
  await act(async () => {
    renderer = TestRenderer.create(
      <ExperienceContent
        game={experience.games[0]}
        mode="ar"
        onError={onError}
      />,
    );
  });
  expect(onError).toHaveBeenCalledWith('Registration failed');
  expect(host('ViroARImageMarker')).toHaveLength(0);
});

test('a replacement target requires a new detection and releases the previous registration', async () => {
  await act(async () => {
    renderer = TestRenderer.create(
      <ExperienceContent
        game={experience.games[0]}
        mode="ar"
        onError={onError}
      />,
    );
  });
  const targetName = host('ViroARImageMarker')[0].props.target;
  act(() => host('ViroARImageMarker')[0].props.onAnchorFound({}));
  expect(host('Viro3DObject')).toHaveLength(1);
  const updated = {
    ...experience.games[0],
    target: {
      ...experience.games[0].target!,
      imageUrl: 'file://replacement.jpg',
    },
  };
  await act(async () => {
    renderer.update(
      <ExperienceContent game={updated} mode="ar" onError={onError} />,
    );
  });
  expect(ViroARTrackingTargets.deleteTarget).toHaveBeenCalledWith(targetName);
  expect(ViroARTrackingTargets.createTargets).toHaveBeenCalledTimes(2);
  expect(host('Viro3DObject')).toHaveLength(0);
  act(() =>
    host('ViroARImageMarker')[0].props.onError({
      nativeEvent: { error: { message: 'Invalid native image' } },
    }),
  );
  expect(onError).toHaveBeenCalledWith('Invalid native image');
});

describe('configured aiming runtime', () => {
  const aiming = readExperience({
    type: 'aiming',
    logic: {
      games: [
        {
          id: 400,
          assets: [
            { id: 401, type: 'GLB', url: 'file://ball.glb' },
            { id: 402, type: 'OBJ', url: 'file://basket.obj' },
          ],
          objects: [
            {
              id: 403,
              properties: {
                asset: 401,
                scale: [2, 2, 2],
                collider: { type: 'sphere', size: [0.1, 0.1, 0.1] },
              },
            },
            {
              id: 404,
              properties: {
                asset: 402,
                position: [0, 0.5, -0.5],
                collider: { type: 'basket', size: [1, 1, 1], thickness: 0.05 },
              },
            },
          ],
          settings: {
            plane: { minWidth: 2, minLength: 3, stableMs: 1000 },
            projectile: {
              objectId: 403,
              speed: 6,
              maxActive: 1,
              lifetimeMs: 2000,
            },
            targets: [404],
          },
        },
      ],
    },
  })!;
  const anchor = {
    anchorId: 'floor',
    type: 'plane',
    alignment: 'HorizontalUpward',
    position: [1, -1, -3],
    rotation: [0, 90, 0],
    center: [0.5, 0, 0.25],
    width: 2,
    height: 3,
  };
  const camera = {
    position: [2, 1, 0],
    rotation: [0, 90, 0],
    forward: [2, 0, 0],
  };
  const scene = () => host('ViroARScene')[0];
  const floor = () =>
    host('ViroNode').find(node => node.props.viroTag === 'aiming-floor');
  const projectiles = () =>
    host('ViroNode').filter(
      node =>
        typeof node.props.viroTag === 'string' &&
        Number(node.props.viroTag) < 0,
    );
  const mountAR = async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <ViroARView
          experience={aiming}
          onExperienceEvent={onEvent}
          onExperienceError={onError}
        />,
      );
    });
  };
  const detectFloor = () => {
    act(() => scene().props.onTrackingUpdated(3));
    act(() => host('ViroARPlane')[0].props.onAnchorFound(anchor));
    act(() => jest.advanceTimersByTime(1000));
    act(() => scene().props.onCameraTransformUpdate(camera));
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('requires normal tracking, minimum plane dimensions and a stable pose before creating a static world-space floor', async () => {
    await mountAR();
    const detector = host('ViroARPlane')[0];
    expect(detector.props).toMatchObject({
      minWidth: 2,
      minHeight: 3,
      alignment: 'HorizontalUpward',
    });
    act(() => detector.props.onAnchorFound(anchor));
    act(() => jest.advanceTimersByTime(1500));
    expect(floor()).toBeUndefined();
    expect(host('Viro3DObject')).toHaveLength(0);
    act(() => scene().props.onClick());
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'shotBlocked',
        data: { reason: 'plane' },
      }),
    );
    act(() => scene().props.onTrackingUpdated(3));
    act(() => detector.props.onAnchorUpdated({ ...anchor, width: 1.99 }));
    act(() => jest.advanceTimersByTime(1000));
    expect(floor()).toBeUndefined();
    act(() =>
      detector.props.onAnchorUpdated({ ...anchor, alignment: 'Vertical' }),
    );
    act(() => jest.advanceTimersByTime(1000));
    expect(floor()).toBeUndefined();
    act(() => detector.props.onAnchorUpdated(anchor));
    act(() => jest.advanceTimersByTime(999));
    expect(floor()).toBeUndefined();
    act(() =>
      detector.props.onAnchorUpdated({ ...anchor, position: [1.1, -1, -3] }),
    );
    act(() => jest.advanceTimersByTime(999));
    expect(floor()).toBeUndefined();
    act(() => jest.advanceTimersByTime(1));
    expect(floor()!.props.physicsBody).toEqual({
      type: 'Static',
      friction: 0.7,
      restitution: 0.2,
      shape: { type: 'Box', params: [2, 0.05, 3] },
    });
    expect(floor()!.parent!.props.position).toEqual([1.35, -1, -3.5]);
    expect(floor()!.parent!.props.rotation).toEqual([0, 90, 0]);
    expect(host('ViroARPlane')).toHaveLength(0);
    expect(host('Viro3DObject')).toHaveLength(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'planeReady' }),
    );
  });

  test('resets plane stability on anchor removal and tracking loss', async () => {
    await mountAR();
    act(() => scene().props.onTrackingUpdated(3));
    act(() => host('ViroARPlane')[0].props.onAnchorFound(anchor));
    act(() => jest.advanceTimersByTime(500));
    act(() => host('ViroARPlane')[0].props.onAnchorRemoved());
    act(() => jest.advanceTimersByTime(1000));
    expect(floor()).toBeUndefined();
    act(() => host('ViroARPlane')[0].props.onAnchorFound(anchor));
    act(() => jest.advanceTimersByTime(500));
    act(() => scene().props.onTrackingUpdated(2));
    act(() => jest.advanceTimersByTime(1500));
    act(() => scene().props.onTrackingUpdated(3));
    act(() => jest.advanceTimersByTime(1500));
    expect(floor()).toBeUndefined();
    act(() => host('ViroARPlane')[0].props.onAnchorUpdated(anchor));
    act(() => jest.advanceTimersByTime(1000));
    expect(floor()).toBeDefined();
  });

  test('fires the GLB along the normalized camera axis, limits shots and removes expired bodies', async () => {
    await mountAR();
    detectFloor();
    act(() => scene().props.onClick());
    const shot = projectiles()[0];
    expect(shot.props.position).toEqual([2.3, 1, 0]);
    expect(shot.props.physicsBody).toMatchObject({
      type: 'Dynamic',
      mass: 1,
      velocity: [6, 0, 0],
      shape: { type: 'Sphere', params: [0.05] },
    });
    expect(shot.props.scale).toBeUndefined();
    expect(
      shot.findAll(node => String(node.type) === 'ViroNode')[1].props.scale,
    ).toEqual([2, 2, 2]);
    expect(host('Viro3DObject').map(node => node.props.type)).toEqual([
      'OBJ',
      'GLB',
    ]);
    act(() => shot.props.onCollision(404, [0, 0, 0], [0, 1, 0]));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'collision',
        objectId: -1,
        data: { tag: 404, point: [0, 0, 0], normal: [0, 1, 0] },
      }),
    );
    act(() => scene().props.onClick());
    expect(projectiles()).toHaveLength(1);
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'shotBlocked',
        data: { reason: 'limit' },
      }),
    );
    act(() => jest.advanceTimersByTime(2000));
    expect(projectiles()).toHaveLength(0);
    act(() => scene().props.onClick());
    expect(projectiles()).toHaveLength(1);
    act(() => renderer.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  test('keeps the floor fixed on tracking loss and requires a fresh camera pose before resuming', async () => {
    await mountAR();
    detectFloor();
    const pose = floor()!.parent!.props.position;
    act(() => scene().props.onTrackingUpdated(2));
    act(() => scene().props.onClick());
    expect(projectiles()).toHaveLength(0);
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { reason: 'tracking' } }),
    );
    expect(floor()!.parent!.props.position).toEqual(pose);
    act(() => scene().props.onTrackingUpdated(3));
    act(() => scene().props.onClick());
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { reason: 'camera' } }),
    );
    act(() => scene().props.onCameraTransformUpdate(camera));
    act(() =>
      host('ViroNode')
        .find(node => node.props.viroTag === '404')!
        .props.onClick(),
    );
    expect(projectiles()).toHaveLength(1);
  });

  test('provides an immediate synthetic floor and the same firing mechanics in the 3D fallback', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <ExperienceViewer
          experience={aiming}
          gameIndex={0}
          onEvent={onEvent}
          onError={onError}
        />,
      );
    });
    expect(host('ViroARPlane')).toHaveLength(0);
    expect(floor()!.parent!.props.position).toEqual([0, -1, -2]);
    act(() => host('ViroScene')[0].props.onCameraTransformUpdate(camera));
    act(() => host('ViroScene')[0].props.onClick());
    expect(projectiles()).toHaveLength(1);
  });

  test('switching games discards the previous floor, projectile bodies and expiry timers', async () => {
    await mountAR();
    detectFloor();
    act(() => scene().props.onClick());
    expect(projectiles()).toHaveLength(1);
    await act(async () => {
      renderer.update(
        <ViroARView
          experience={{
            ...aiming,
            games: [{ ...aiming.games[0], id: 405 }],
          }}
          onExperienceEvent={onEvent}
          onExperienceError={onError}
        />,
      );
    });
    expect(projectiles()).toHaveLength(0);
    expect(floor()).toBeUndefined();
    expect(host('ViroARPlane')).toHaveLength(1);
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
    act(() => scene().props.onClick());
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        gameId: 405,
        name: 'shotBlocked',
        data: { reason: 'plane' },
      }),
    );
  });
});
