import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ViroARTrackingTargets, ViroAnimations } from '@reactvision/react-viro';
import { ExperienceContent } from '../src/experiences/ExperienceTemplates';
import ExperienceViewer from '../src/experiences/ExperienceViewer';
import ViroARView from '../src/components/ViroARView';
import { readExperience } from '../src/experiences/experience';
import { colliderShape } from '../src/experiences/aiming';
import type { AimingCollider, AimingSettings, AimingSubtype } from '../src/experiences/aiming';

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
    ViroARCamera: 'ViroARCamera',
    ViroCamera: 'ViroCamera',
    ViroARPlane: 'ViroARPlane',
    ViroTrackingStateConstants: { TRACKING_NORMAL: 3 },
    Viro3DObject: 'Viro3DObject',
    ViroARImageMarker: 'ViroARImageMarker',
    ViroImage: 'ViroImage',
    ViroVideo: 'ViroVideo',
    ViroSound: 'ViroSound',
    ViroText: 'ViroText',
    ViroQuad: 'ViroQuad',
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
          type: 'images',
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
      drawBounds: false,
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
      <ViroARView arMemories={[{ id: 1, location_id: 7, name: 'Place', model_url: '' }]} />,
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
    drawBounds: false,
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
          type: 'aiming',
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
                collider: { type: 'bounding', size: [1, 1, 1] },
              },
            },
          ],
          settings: {
            plane: { minWidth: 2, minLength: 3, stableMs: 1000 },
            projectile: {
              objectId: 403,
              speed: 6,
              maxActive: 1,
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
  const tap = (node = scene()) => {
    act(() => node.props.onClickState(1));
    act(() => node.props.onClickState(2));
    act(() => node.props.onClickState(3));
  };
  const getBodyTransform = jest.fn();
  const getModelTransform = jest.fn();
  const getModelBounds = jest.fn();
  let diagnosticLog: jest.SpyInstance;
  let diagnosticWarning: jest.SpyInstance;
  const bottomPoint = [0.75, -0.95, -3.5];
  const floor = () =>
    host('ViroNode').find(node => node.props.viroTag === 'aiming-floor');
  const projectiles = () =>
    host('ViroNode').filter(
      node =>
        typeof node.props.viroTag === 'string' &&
        Number(node.props.viroTag) < 0 &&
        node.props.physicsBody !== undefined,
    );
  const mountAR = async (configured = aiming) => {
    await act(async () => {
      renderer = TestRenderer.create(
        <ViroARView
          experience={configured}
          onExperienceEvent={onEvent}
          onExperienceError={onError}
        />,
        {
          createNodeMock: element =>
            element.type === 'ViroNode'
              ? { getTransformAsync: getBodyTransform }
              : element.type === 'Viro3DObject'
              ? {
                  getTransformAsync: getModelTransform,
                  getBoundingBoxAsync: getModelBounds,
                }
              : null,
        },
      );
    });
  };
  const detectFloor = () => {
    act(() => scene().props.onTrackingUpdated(3));
    act(() => host('ViroARPlane')[0].props.onAnchorFound(anchor));
    act(() => host('ViroARPlane')[0].props.onClick());
    act(() => scene().props.onCameraTransformUpdate(camera));
  };
  const withRules = (rules: Partial<AimingSettings>, secondTarget = false) => {
    const game = aiming.games[0];
    const target = {
      ...game.objects[1],
      properties: {
        ...game.objects[1].properties,
        ...(rules.fall ? { physics: {
          type: 'Dynamic' as const,
          shape: { type: 'Box' as const, params: [1, 1, 1] },
        } } : {}),
      },
    };
    return {
      ...aiming,
      games: [{
        ...game,
        assets: [...game.assets, { id: 406, type: 'image' as const, url: 'file://reward.png' }],
        objects: [game.objects[0], target, ...(secondTarget ? [{ ...target, id: 405 }] : [])],
        settings: { ...game.settings!, ...rules, targets: secondTarget ? [404, 405] : [404] },
      }],
    };
  };
  const scoringEvents = () => onEvent.mock.calls
    .map(([event]) => event)
    .filter(event => event.data?.scoringContact === true);
  const targetBody = (id = '404') => host('ViroNode').find(node => node.props.viroTag === id)!;
  const withSubtype = (
    subtype: AimingSubtype,
    rules: Partial<AimingSettings> = {},
    secondTarget = false,
  ) => {
    const configured = withRules({
      ...(subtype === 'bowling' ? { fall: true } : {}),
      ...rules,
    }, secondTarget);
    return readExperience({
      logic: {
        ...configured,
        games: configured.games.map(game => ({ ...game, subtype })),
      },
    })!;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    diagnosticLog = jest.spyOn(console, 'info').mockImplementation(() => {});
    diagnosticWarning = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    getBodyTransform.mockResolvedValue({
      position: [0.75, -0.5, -3.5],
      rotation: [0, 90, 0],
    });
    getModelTransform.mockResolvedValue({
      position: [0.75, -0.5, -3.5],
      rotation: [0, 90, 0],
      scale: [2, 2, 2],
    });
    getModelBounds.mockResolvedValue({
      boundingBox: {
        minX: 0.7,
        maxX: 0.8,
        minY: -0.55,
        maxY: -0.45,
        minZ: -3.55,
        maxZ: -3.45,
      },
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
    diagnosticLog.mockRestore();
    diagnosticWarning.mockRestore();
    jest.useRealTimers();
  });

  test.each([
    ['ar', 'basket'], ['ar', 'dartboard'], ['ar', 'bowling'], ['ar', undefined],
    ['viewer', 'basket'], ['viewer', 'dartboard'], ['viewer', 'bowling'], ['viewer', undefined],
  ] as const)(
    'holds the %s %s projectile in the native camera with a non-interactive white gesture hint',
    async (mode, subtype) => {
      const configured = subtype ? withSubtype(subtype) : aiming;
      if (mode === 'ar') {
        await mountAR(configured);
        expect(host('ViroNode').find(node => node.props.viroTag === 'aiming-ready-projectile'))
          .toBeUndefined();
        detectFloor();
      } else {
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
      }
      const cameraNode = host(mode === 'ar' ? 'ViroARCamera' : 'ViroCamera')[0];
      const held = host('ViroNode').find(node => node.props.viroTag === 'aiming-ready-projectile')!;
      expect(cameraNode.findAll(node => node === held)).toHaveLength(1);
      expect(held.props.position).toEqual([0, 0, -0.3]);
      const model = held.find(node => String(node.type) === 'Viro3DObject');
      expect(model.props.source).toEqual({ uri: 'file://ball.glb' });
      const body = held.find(node => node.props.viroTag === '403');
      expect(body.props.position).toEqual([0, 0, 0]);
      expect(body.props.rotation).toEqual([0, 0, 0]);
      expect(body.props.scale).toEqual([0.1, 0.1, 0.1]);
      expect(body.props.physicsBody).toBeUndefined();
      expect(projectiles()).toHaveLength(0);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  test.each([[0, 6], [1000, 9], [3000, 12]])(
    'keeps collectible ammunition attached during a %s ms press and launches once at speed %s on release',
    async (heldMs, speed) => {
      const configured = withSubtype('dartboard');
      configured.games[0].objects[0].properties.collectible = true;
      await mountAR(configured);
      detectFloor();
      const held = targetBody('403');
      act(() => held.props.onClickState(1));
      act(() => jest.advanceTimersByTime(heldMs));
      expect(projectiles()).toHaveLength(0);
      expect(host('ViroNode').some(node => node.props.viroTag === 'aiming-ready-projectile')).toBe(true);
      act(() => held.props.onClickState(2));
      act(() => scene().props.onClickState(2));
      expect(projectiles()).toHaveLength(1);
      expect(projectiles()[0].props.position).toEqual([2.3, 1, 0]);
      expect(projectiles()[0].props.physicsBody.instantVelocity).toEqual([speed, 0, 0]);
      expect(onEvent.mock.calls.filter(([event]) => event.name === 'shot')).toHaveLength(1);
      expect(onEvent.mock.calls.filter(([event]) => event.name === 'collect')).toHaveLength(0);
      expect(host('ViroNode').some(node => node.props.viroTag === 'aiming-ready-projectile')).toBe(false);
    },
  );

  test('hides the held projectile and hint on tracking loss without removing launched bodies', async () => {
    const configured = withSubtype('dartboard');
    configured.games[0].settings!.projectile.maxActive = 2;
    await mountAR(configured);
    detectFloor();
    tap();
    expect(projectiles()).toHaveLength(1);
    act(() => scene().props.onTrackingUpdated(2));
    expect(host('ViroNode').some(node => node.props.viroTag === 'aiming-ready-projectile')).toBe(false);
    expect(projectiles()).toHaveLength(1);
    act(() => scene().props.onTrackingUpdated(3));
    expect(projectiles()).toHaveLength(1);
  });

  test.each(['basket', 'bounding'] as const)(
    'basket subtype removes a shot only at the %s bottom, awards once and releases its slot',
    async colliderType => {
      const configured = withSubtype('basket', { multiplier: 5, reward: 406 });
      if (colliderType === 'basket') {
        configured.games[0].objects[1].properties.collider = {
          type: 'basket', size: [1, 1, 1], thickness: 0.05,
        };
      }
      await mountAR(configured);
      detectFloor();
      tap();
      expect(targetBody().props.physicsBody.shape.type).toBe('Compound');
      await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 0, 1]));
      expect(projectiles()).toHaveLength(1);
      expect(scoringEvents()).toHaveLength(0);
      // Off-center bottom hits still award the full basket value.
      const offCenterBottom = [0.75, -0.95, -3.7];
      await act(async () => targetBody().props.onCollision('-1', offCenterBottom, [0, 1, 0]));
      expect(projectiles()).toHaveLength(0);
      expect(host('ViroNode').some(node => node.props.viroTag === 'aiming-ready-projectile')).toBe(false);
      expect(scoringEvents()).toHaveLength(1);
      expect(scoringEvents()[0].data).toMatchObject({ points: 5, projectileId: -1 });
      expect(host('ViroImage')).toHaveLength(1);
      await act(async () => targetBody().props.onCollision('-1', offCenterBottom, [0, 1, 0]));
      expect(scoringEvents()).toHaveLength(1);
      tap();
      expect(projectiles()).toHaveLength(1);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  test('dartboard subtype keeps multiple darts frozen and scores center, half-radius and edge hits', async () => {
    const configured = withSubtype('dartboard', { reward: 406 });
    configured.games[0].settings!.projectile.maxActive = 3;
    await mountAR(configured);
    detectFloor();
    const points = [
      [0.85, -0.5, -3.5],
      [0.85, -0.25, -3.5],
      [0.85, 0, -3.5],
    ];
    for (const [index, point] of points.entries()) {
      tap();
      const id = String(-(index * 2 + 1)); // Each reward also consumes an instance ID.
      await act(async () => targetBody().props.onCollision(id, point, [1, 0, 0]));
      const frozen = targetBody(id);
      expect(frozen.props.position).toEqual([0.75, -0.5, -3.5]);
      expect(frozen.props.rotation).toEqual([0, 90, 0]);
      expect(frozen.props.physicsBody).toMatchObject({ type: 'Static', useGravity: false });
      await act(async () => targetBody().props.onCollision(id, point, [1, 0, 0]));
    }
    expect(scoringEvents().map(event => event.data.points)).toEqual([10, 6, 1]);
    expect(projectiles()).toHaveLength(3);
    expect(host('ViroImage')).toHaveLength(3);
    act(() => jest.advanceTimersByTime(10000));
    expect(projectiles()).toHaveLength(3);
    tap();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'shotBlocked', data: { reason: 'limit' },
    }));
    expect(onError).not.toHaveBeenCalled();
  });

  test('bowling subtype awards a constant value only on falls, including indirect hits', async () => {
    await mountAR(withSubtype('bowling', { multiplier: 7 }, true));
    detectFloor();
    tap();
    const edge = [0.85, 0, -3.5];
    await act(async () => targetBody('405').props.onCollision('404', edge, [1, 0, 0]));
    await act(async () => targetBody().props.onCollision('-1', edge, [1, 0, 0]));
    expect(scoringEvents()).toHaveLength(0);
    expect(targetBody('-1').props.physicsBody.type).toBe('Dynamic');
    getBodyTransform.mockResolvedValue({ position: [0.75, -0.5, -3.5], rotation: [59.999, 90, 0] });
    await act(async () => jest.advanceTimersByTime(100));
    expect(scoringEvents()).toHaveLength(0);
    getBodyTransform.mockResolvedValue({ position: [0.75, -0.5, -3.5], rotation: [60, 90, 0] });
    await act(async () => jest.advanceTimersByTime(100));
    expect(scoringEvents().map(event => event.data.points)).toEqual([7, 7]);
    expect(scoringEvents().every(event => event.data.fallen)).toBe(true);
    await act(async () => jest.advanceTimersByTime(500));
    expect(scoringEvents()).toHaveLength(2);
    expect(projectiles()).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test.each(['basket', 'dartboard', 'bowling'] as const)(
    'applies %s subtype rules in the 3D viewer too',
    async subtype => {
      await act(async () => {
        renderer = TestRenderer.create(
          <ExperienceViewer
            experience={withSubtype(subtype)}
            gameIndex={0}
            onEvent={onEvent}
            onError={onError}
          />,
          {
            createNodeMock: element =>
              element.type === 'ViroNode'
                ? { getTransformAsync: getBodyTransform }
                : element.type === 'Viro3DObject'
                ? {
                    getTransformAsync: getModelTransform,
                    getBoundingBoxAsync: getModelBounds,
                  }
                : null,
          },
        );
      });
      const viewer = host('ViroScene')[0];
      act(() => viewer.props.onCameraTransformUpdate(camera));
      tap(viewer);
      expect(projectiles()).toHaveLength(1);
      await act(async () => targetBody().props.onCollision(
        '-1',
        subtype === 'basket' ? bottomPoint : [0.85, -0.5, -3.5],
        subtype === 'basket' ? [0, 1, 0] : [1, 0, 0],
      ));
      if (subtype === 'bowling') {
        expect(scoringEvents()).toHaveLength(0);
        getBodyTransform.mockResolvedValue({
          position: [0.75, -0.5, -3.5], rotation: [60, 90, 0],
        });
        await act(async () => jest.advanceTimersByTime(100));
      }
      expect(scoringEvents()).toHaveLength(1);
      expect(scoringEvents()[0].data.points).toBe(subtype === 'dartboard' ? 10 : 1);
      expect(projectiles()).toHaveLength(subtype === 'basket' ? 0 : 1);
      if (subtype === 'dartboard')
        expect(targetBody('-1').props.physicsBody.type).toBe('Static');
      expect(onError).not.toHaveBeenCalled();
    },
  );

  test('scores radial impacts once per shot, displays the reward and freezes at the native pose', async () => {
    await mountAR(withRules({ reward: 406, freeze: true, multiplier: 10 }, true));
    detectFloor();
    tap();
    expect(targetBody().props.physicsBody.shape.type).toBe('Box');
    await act(async () => targetBody().props.onCollision('-1', [0.85, -0.5, -3.5], [1, 0, 0]));
    expect(scoringEvents()).toHaveLength(1);
    expect(scoringEvents()[0].data).toMatchObject({ points: 10, projectileId: -1 });
    expect(host('ViroImage')[0].props.source).toEqual({ uri: 'file://reward.png' });
    const frozen = targetBody('-1');
    expect(frozen.props.position).toEqual([0.75, -0.5, -3.5]);
    expect(frozen.props.rotation).toEqual([0, 90, 0]);
    expect(frozen.props.physicsBody).toMatchObject({ type: 'Static', useGravity: false, mass: 0 });
    expect(frozen.props.physicsBody.instantVelocity).toBeUndefined();
    await act(async () => {
      await targetBody().props.onCollision('-1', [0.85, -0.5, -3.5], [1, 0, 0]);
      await targetBody('405').props.onCollision('-1', [0.85, -0.5, -3.5], [1, 0, 0]);
    });
    expect(scoringEvents()).toHaveLength(1);
    expect(host('ViroImage')).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('explicit false rules enable contact scoring without freezing or displaying a reward', async () => {
    await mountAR(withRules({ freeze: false, fall: false }));
    detectFloor();
    tap();
    await act(async () => targetBody().props.onCollision('-999', bottomPoint, [0, 1, 0]));
    expect(scoringEvents()).toHaveLength(0);
    await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 1, 0]));
    expect(scoringEvents()[0].data.points).toBe(1);
    expect(targetBody('-1').props.physicsBody.type).toBe('Dynamic');
    expect(host('ViroImage')).toHaveLength(0);
  });

  test('new basket rules still reject wall contacts and score only the interior bottom', async () => {
    const configured = withRules({ multiplier: 5 });
    configured.games[0].objects[1].properties.collider = {
      type: 'basket', size: [1, 1, 1], thickness: 0.05,
    };
    await mountAR(configured);
    detectFloor();
    tap();
    await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 0, 1]));
    expect(scoringEvents()).toHaveLength(0);
    await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 1, 0]));
    expect(scoringEvents()[0].data.points).toBe(5);
  });

  test('waits for the exact fall threshold, propagates pin collisions and scores each pin once', async () => {
    await mountAR(withRules({ fall: true, multiplier: 10, reward: 406 }, true));
    detectFloor();
    tap();
    // Native callbacks can report the pin-to-pin contact before the ball-to-pin contact.
    await act(async () => targetBody('405').props.onCollision('404', [0.85, -0.5, -3.5], [1, 0, 0]));
    await act(async () => targetBody().props.onCollision('-1', [0.85, -0.5, -3.5], [1, 0, 0]));
    expect(scoringEvents()).toHaveLength(0);
    expect(host('ViroImage')).toHaveLength(0);
    getBodyTransform.mockResolvedValue({ position: [0.75, -0.5, -3.5], rotation: [59.999, 90, 0] });
    await act(async () => jest.advanceTimersByTime(100));
    expect(scoringEvents()).toHaveLength(0);
    getBodyTransform.mockResolvedValue({ position: [0.75, -0.5, -3.5], rotation: [60, 90, 0] });
    await act(async () => jest.advanceTimersByTime(100));
    expect(scoringEvents()).toHaveLength(2);
    expect(scoringEvents().map(event => event.objectId).sort()).toEqual([404, 405]);
    expect(scoringEvents().map(event => event.data.points)).toEqual([10, 10]);
    expect(host('ViroImage')).toHaveLength(2);
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 1, 0]));
    await act(async () => jest.advanceTimersByTime(500));
    expect(scoringEvents()).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  test('surfaces native impact and fall query errors and stops monitoring on unmount', async () => {
    await mountAR(withRules({ fall: true }));
    detectFloor();
    tap();
    getBodyTransform.mockRejectedValueOnce(new Error('Impact transform unavailable'));
    await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 1, 0]));
    expect(onError).toHaveBeenCalledWith('Impact transform unavailable');
    getBodyTransform.mockResolvedValueOnce({ position: [NaN, 0, 0], rotation: [0, 0, 0] });
    await act(async () => jest.advanceTimersByTime(100));
    expect(onError).toHaveBeenCalledWith('Invalid native target transform');
    act(() => renderer.unmount());
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
  });

  test('reports freeze errors without pretending the projectile has stopped', async () => {
    await mountAR(withRules({ freeze: true }));
    detectFloor();
    tap();
    getBodyTransform
      .mockResolvedValueOnce({ position: [0.75, -0.5, -3.5], rotation: [0, 90, 0] })
      .mockRejectedValueOnce(new Error('Cannot freeze projectile'));
    await act(async () => targetBody().props.onCollision('-1', bottomPoint, [0, 1, 0]));
    expect(onError).toHaveBeenCalledWith('Cannot freeze projectile');
    expect(targetBody('-1').props.physicsBody.type).toBe('Dynamic');
  });

  test('does not award a collision whose native query finishes after leaving the game', async () => {
    await mountAR(withRules({ multiplier: 10, reward: 406 }));
    detectFloor();
    tap();
    let finish: (value: unknown) => void = () => { throw new Error('Missing native query'); };
    getBodyTransform.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => targetBody().props.onCollision('-1', bottomPoint, [0, 1, 0]));
    act(() => renderer.unmount());
    await act(async () => finish({ position: [0.75, -0.5, -3.5], rotation: [0, 90, 0] }));
    expect(scoringEvents()).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  test('samples native body/model transforms after contact without removing or replacing the shot', async () => {
    await mountAR();
    detectFloor();
    tap();
    const shot = projectiles()[0];
    const originalBody = shot.props.physicsBody;
    await act(async () =>
      shot.props.onCollision('aiming-floor', [0, -1, 0], [0, 1, 0]),
    );
    await act(async () =>
      shot.props.onCollision('aiming-floor', [0, -1, 0], [0, 1, 0]),
    );
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(3);
    getBodyTransform.mockResolvedValue({
      position: [0, -2, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    getModelTransform.mockResolvedValue({
      position: [0, -2, 0],
      rotation: [0, 0, 0],
      scale: [NaN, 2, 2],
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    const entries = diagnosticLog.mock.calls
      .filter(([prefix]) => prefix === '[AimingPhysics]')
      .map(([, json]) => JSON.parse(json));
    expect(entries.filter(entry => entry.phase === 'contact')).toHaveLength(1);
    expect(entries.map(entry => entry.phase)).toEqual(
      expect.arrayContaining([
        'mounted',
        'contact-now',
        'contact+250ms',
        'contact+1000ms',
        'contact+3000ms',
      ]),
    );
    expect(
      entries.find(entry => entry.phase === 'contact+3000ms').data,
    ).toMatchObject({
      floorY: -1,
      bodyTransform: { position: [0, -2, 0] },
      modelTransform: { scale: ['NaN', 2, 2] },
    });
    expect(projectiles()[0]).toBe(shot);
    expect(projectiles()[0].props.physicsBody).toBe(originalBody);
    act(() => renderer.unmount());
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
    expect(diagnosticLog).toHaveBeenLastCalledWith(
      '[AimingPhysics]',
      expect.stringContaining('"phase":"unmounted"'),
    );
  });

  test('reports diagnostic native query failures and cancels pending samples on unmount', async () => {
    await mountAR();
    detectFloor();
    tap();
    getModelBounds.mockRejectedValueOnce(new Error('Bounds unavailable'));
    await act(async () =>
      projectiles()[0].props.onCollision('404', bottomPoint, [0, 1, 0]),
    );
    expect(diagnosticWarning).toHaveBeenCalledWith(
      '[AimingPhysics] native snapshot failed',
      expect.objectContaining({ error: 'Bounds unavailable' }),
    );
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(3);
    act(() => renderer.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  test('requires normal tracking, a valid plane and an explicit tap before creating a static world-space floor', async () => {
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
    tap();
    expect(onEvent).toHaveBeenCalledWith(
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
    expect(floor()).toBeUndefined();
    act(() => detector.props.onClick());
    expect(floor()!.props.physicsBody).toEqual({
      type: 'Static',
      friction: 0.7,
      restitution: 0,
      shape: { type: 'Box', params: [100, 1, 100] },
    });
    expect(floor()!.props.onCollision).toEqual(expect.any(Function));
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
    expect(floor()).toBeUndefined();
    act(() => host('ViroARPlane')[0].props.onClick());
    expect(floor()).toBeDefined();
  });

  test.each([
    ['ar', 'capsule'],
    ['ar', 'diamond'],
    ['viewer', 'capsule'],
    ['viewer', 'diamond'],
  ] as const)(
    'wires %s %s colliders to projectile and target bodies and preserves them after contact',
    async (mode, type) => {
      const collider: AimingCollider = type === 'diamond'
        ? { type, base: 0.2, middle: 0.15, height: 0.6 }
        : { type, size: [0.2, 0.6, 0.2] };
      const configured = readExperience({
        logic: {
          games: aiming.games.map(game => ({
            ...game,
            objects: game.objects.map(object => ({
              ...object,
              properties: { ...object.properties, collider },
            })),
          })),
        },
      })!;
      if (mode === 'ar') {
        await mountAR(configured);
        detectFloor();
      } else {
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
        act(() => host('ViroScene')[0].props.onCameraTransformUpdate(camera));
      }
      tap(mode === 'ar' ? scene() : host('ViroScene')[0]);
      const shot = projectiles()[0];
      const targetNode = host('ViroNode').find(
        node => node.props.viroTag === '404',
      )!;
      const shape = colliderShape(collider);
      expect(shape.type).toBe('Compound');
      expect(shape.children!.some(part => part.type === 'Sphere')).toBe(true);
      expect(shot.props.physicsBody).toMatchObject({
        type: 'Dynamic',
        useGravity: true,
        shape,
      });
      expect(targetNode.props.physicsBody).toMatchObject({
        type: 'Static',
        shape,
      });
      await act(async () => {
        targetNode.props.onCollision('-1', [0, 0, 0], [0, 1, 0]);
      });
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'collision',
          objectId: 404,
          data: { tag: '-1', point: [0, 0, 0], normal: [0, 1, 0] },
        }),
      );
      act(() => jest.advanceTimersByTime(3000));
      expect(projectiles()[0]).toBe(shot);
      expect(projectiles()[0].props.physicsBody.shape).toEqual(shape);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  test('collects only after a long press, cancels the charged shot and uses the server ID for projectiles', async () => {
    const configured = readExperience({
      logic: {
        games: aiming.games.map(game => ({
          ...game,
          objects: game.objects.map(object => ({
            ...object, properties: { ...object.properties, collectible: true },
          })),
        })),
      },
    })!;
    await mountAR(configured);
    detectFloor();
    const targetNode = host('ViroNode').find(node => node.props.viroTag === '404')!;
    act(() => {
      scene().props.onClickState(1);
      targetNode.props.onClickState(1);
      jest.advanceTimersByTime(599);
    });
    expect(onEvent.mock.calls.filter(([event]) => event.name === 'collect')).toHaveLength(0);
    act(() => jest.advanceTimersByTime(1));
    expect(onEvent).toHaveBeenCalledWith({
      type: 'aiming', gameId: 400, objectId: 404, name: 'collect',
    });
    act(() => {
      scene().props.onClickState(2);
      targetNode.props.onClickState(2);
      jest.advanceTimersByTime(1000);
    });
    expect(projectiles()).toHaveLength(0);
    expect(onEvent.mock.calls.filter(([event]) => event.name === 'collect')).toHaveLength(1);
    act(() => {
      targetNode.props.onClickState(1);
      jest.advanceTimersByTime(100);
      targetNode.props.onClickState(2);
    });
    expect(projectiles()).toHaveLength(1);
    act(() => {
      projectiles()[0].props.onClickState(1);
      jest.advanceTimersByTime(600);
      projectiles()[0].props.onClickState(2);
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'aiming', gameId: 400, objectId: 403, name: 'collect',
    });
  });

  test('cancels collection on tracking loss and unmount', async () => {
    const configured = readExperience({
      logic: {
        games: aiming.games.map(game => ({
          ...game,
          objects: game.objects.map(object => ({
            ...object, properties: { ...object.properties, collectible: true },
          })),
        })),
      },
    })!;
    await mountAR(configured);
    detectFloor();
    const targetNode = host('ViroNode').find(node => node.props.viroTag === '404')!;
    act(() => {
      targetNode.props.onClickState(1);
      jest.advanceTimersByTime(300);
      scene().props.onTrackingUpdated(2);
    });
    act(() => jest.advanceTimersByTime(600));
    expect(onEvent.mock.calls.filter(([event]) => event.name === 'collect')).toHaveLength(0);
    act(() => {
      targetNode.props.onClickState(2);
      targetNode.props.onClickState(1);
      jest.advanceTimersByTime(600);
    });
    expect(onEvent.mock.calls.filter(([event]) => event.name === 'collect')).toHaveLength(0);
    act(() => {
      scene().props.onTrackingUpdated(3);
      targetNode.props.onClickState(1);
      jest.advanceTimersByTime(300);
      renderer.unmount();
    });
    act(() => jest.advanceTimersByTime(600));
    expect(onEvent.mock.calls.filter(([event]) => event.name === 'collect')).toHaveLength(0);
  });

  test('fires the GLB along the normalized camera axis, limits shots and keeps unlimited bodies', async () => {
    await mountAR();
    detectFloor();
    tap();
    const shot = projectiles()[0];
    expect(shot.props.position).toEqual([2.3, 1, 0]);
    expect(shot.props.physicsBody).toMatchObject({
      type: 'Dynamic',
      mass: 1,
      useGravity: true,
      instantVelocity: [6, 0, 0],
      shape: { type: 'Sphere', params: [0.05] },
    });
    expect(shot.props.scale).toBeUndefined();
    expect(
      shot.findAll(node => String(node.type) === 'ViroNode')[1].props.scale,
    ).toEqual([2, 2, 2]);
    const targetNode = host('ViroNode').find(
      node => node.props.viroTag === '404',
    )!;
    expect(targetNode.props.physicsBody).toMatchObject({
      type: 'Static',
      shape: {
        type: 'Compound',
        children: expect.any(Array),
      },
    });
    expect(targetNode.props.position[0]).toBe(0);
    expect(targetNode.props.position[1]).toBeCloseTo(0.5);
    expect(targetNode.props.position[2]).toBe(-0.5);
    expect(
      targetNode.findAll(node => String(node.type) === 'ViroNode')[1].props
        .position,
    ).toBeUndefined();
    expect(targetNode.props.physicsBody.shape.children).toHaveLength(5);
    expect(targetNode.props.onCollision).toEqual(expect.any(Function));
    expect(host('Viro3DObject').map(node => node.props.type)).toEqual([
      'OBJ',
      'GLB',
    ]);
    act(() => shot.props.onCollision('404', [0, 0, 0], [0, 1, 0]));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'collision',
        objectId: -1,
        data: {
          tag: '404',
          point: [0, 0, 0],
          normal: [0, 1, 0],
        },
      }),
    );
    expect(projectiles()).toHaveLength(1);
    expect(projectiles()[0].props.physicsBody.type).toBe('Dynamic');
    await act(async () =>
      targetNode.props.onCollision('-1', bottomPoint, [0, 0, 1]),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'collision',
        objectId: 404,
        data: {
          tag: '-1',
          point: bottomPoint,
          normal: [0, 0, 1],
          scoringContact: false,
        },
      }),
    );
    await act(async () =>
      targetNode.props.onCollision('-1', bottomPoint, [0, 1, 0]),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'collision',
        objectId: 404,
        data: {
          tag: '-1',
          point: bottomPoint,
          normal: [0, 1, 0],
          scoringContact: true,
          projectileId: -1,
        },
      }),
    );
    await act(async () =>
      targetNode.props.onCollision('-1', bottomPoint, [0, 1, 0]),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scoringContact: false }),
      }),
    );
    await act(async () =>
      shot.props.onCollision('aiming-floor', bottomPoint, [0, 1, 0]),
    );
    tap();
    expect(projectiles()).toHaveLength(1);
    act(() => jest.advanceTimersByTime(2000));
    expect(projectiles()).toHaveLength(1);
    expect(projectiles()[0].props.physicsBody.type).toBe('Dynamic');
    tap();
    expect(projectiles()).toHaveLength(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'shotBlocked',
        data: { reason: 'limit' },
      }),
    );
    act(() => renderer.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  test('keeps the floor fixed on tracking loss and requires a fresh camera pose before resuming', async () => {
    await mountAR();
    detectFloor();
    const pose = floor()!.parent!.props.position;
    act(() => scene().props.onTrackingUpdated(2));
    tap();
    expect(projectiles()).toHaveLength(0);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reason: 'tracking' } }),
    );
    expect(floor()!.parent!.props.position).toEqual(pose);
    act(() => scene().props.onTrackingUpdated(3));
    tap();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reason: 'camera' } }),
    );
    act(() => scene().props.onCameraTransformUpdate(camera));
    tap(host('ViroNode').find(node => node.props.viroTag === '404')!);
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
    tap(host('ViroScene')[0]);
    expect(projectiles()).toHaveLength(1);
  });

  test.each([
    [0, 6],
    [1000, 9],
    [2000, 12],
    [6000, 12],
  ])(
    'fires once on release after %s ms with speed %s, even over a target',
    async (heldMs, speed) => {
      await mountAR();
      detectFloor();
      const targetNode = host('ViroNode').find(
        node => node.props.viroTag === '404',
      )!;
      act(() => targetNode.props.onClickState(1));
      act(() => scene().props.onClickState(1));
      act(() => jest.advanceTimersByTime(heldMs));
      expect(projectiles()).toHaveLength(0);
      act(() => targetNode.props.onClickState(2));
      act(() => scene().props.onClickState(2));
      act(() => targetNode.props.onClickState(3));
      expect(projectiles()).toHaveLength(1);
      expect(projectiles()[0].props.physicsBody.instantVelocity).toEqual([
        speed,
        0,
        0,
      ]);
      expect(
        onEvent.mock.calls.filter(([event]) => event.name === 'shot'),
      ).toHaveLength(1);
      expect(scene().props.physicsWorld.drawBounds).toBe(false);
    },
  );

  test('cancels a charged throw on tracking loss instead of releasing it after recovery', async () => {
    await mountAR();
    detectFloor();
    act(() => scene().props.onClickState(1));
    act(() => jest.advanceTimersByTime(1000));
    act(() => scene().props.onTrackingUpdated(2));
    act(() => scene().props.onTrackingUpdated(3));
    act(() => scene().props.onCameraTransformUpdate(camera));
    act(() => scene().props.onClickState(2));
    expect(projectiles()).toHaveLength(0);
    tap();
    expect(projectiles()).toHaveLength(1);
  });

  test('scores each projectile once across repeated contacts, while allowing multiple shots on the same target', async () => {
    const game = aiming.games[0];
    await mountAR({
      ...aiming,
      games: [
        {
          ...game,
          settings: {
            ...game.settings!,
            projectile: { ...game.settings!.projectile, maxActive: 2 },
          },
        },
      ],
    });
    detectFloor();
    tap();
    tap();
    const targetNode = host('ViroNode').find(
      node => node.props.viroTag === '404',
    )!;
    await act(async () => {
      targetNode.props.onCollision('-1', bottomPoint, [0, 1, 0]);
      targetNode.props.onCollision('-1', bottomPoint, [0, 1, 0]);
      targetNode.props.onCollision('-2', bottomPoint, [0, 1, 0]);
      targetNode.props.onCollision('aiming-floor', bottomPoint, [0, 1, 0]);
    });
    const scores = onEvent.mock.calls
      .map(([event]) => event)
      .filter(event => event.data?.scoringContact);
    expect(scores.map(event => event.data.projectileId)).toEqual([-1, -2]);
    expect(projectiles()).toHaveLength(2);
    expect(
      projectiles().every(node => node.props.physicsBody.type === 'Dynamic'),
    ).toBe(true);
  });

  test('reports a native transform failure instead of awarding a speculative point', async () => {
    await mountAR();
    detectFloor();
    tap();
    getBodyTransform.mockRejectedValueOnce(
      new Error('Native transform unavailable'),
    );
    const targetNode = host('ViroNode').find(
      node => node.props.viroTag === '404',
    )!;
    await act(async () =>
      targetNode.props.onCollision('-1', bottomPoint, [0, 1, 0]),
    );
    expect(onError).toHaveBeenCalledWith('Native transform unavailable');
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scoringContact: false }),
      }),
    );
  });

  test('keeps projectiles indefinitely despite a server lifetime of 1000 ms and ignores constant launch velocity', async () => {
    const game = aiming.games[0];
    await mountAR({
      ...aiming,
      games: [
        {
          ...game,
          objects: game.objects.map(object =>
            object.id === 403
              ? {
                  ...object,
                  properties: {
                    ...object.properties,
                    physics: {
                      type: 'Dynamic',
                      shape: { type: 'Sphere', params: [0.05] },
                      velocity: [0, 0, -20],
                    },
                  },
                }
              : object,
          ),
          settings: {
            ...game.settings!,
            projectile: { ...game.settings!.projectile, lifetimeMs: 1000 },
          },
        },
      ],
    });
    detectFloor();
    tap();
    expect(projectiles()[0].props.physicsBody.velocity).toBeUndefined();
    const shot = projectiles()[0];
    await act(async () => shot.props.onCollision('aiming-floor', [0, -1, 0], [0, 1, 0]));
    act(() => jest.advanceTimersByTime(999));
    expect(projectiles()).toHaveLength(1);
    act(() => jest.advanceTimersByTime(1));
    expect(projectiles()).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(projectiles()[0]).toBe(shot);
    expect(projectiles()[0].props.physicsBody.type).toBe('Dynamic');
    expect(diagnosticLog).toHaveBeenCalledWith(
      '[AimingPhysics]',
      expect.stringContaining('"expiresAt":null,"lifetimeMs":null,"configuredLifetimeMs":1000'),
    );
    tap();
    expect(projectiles()).toHaveLength(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'shotBlocked', data: { reason: 'limit' },
    }));
  });

  test('switching games discards the previous floor and projectile bodies', async () => {
    await mountAR();
    detectFloor();
    tap();
    expect(projectiles()).toHaveLength(1);
    act(() => scene().props.onClickState(1));
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
    act(() => scene().props.onClickState(2));
    expect(projectiles()).toHaveLength(0);
    expect(floor()).toBeUndefined();
    expect(host('ViroARPlane')).toHaveLength(1);
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
    tap();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 405,
        name: 'shotBlocked',
        data: { reason: 'plane' },
      }),
    );
  });
});
