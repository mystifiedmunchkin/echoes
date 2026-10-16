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
          id: 'poster-scene',
          assets: [
            { id: 'butterfly', type: 'GLB', url: 'file://butterfly.glb' },
          ],
          target: {
            id: 'poster',
            imageUrl: 'file://poster.jpg',
            physicalWidth: 0.6,
          },
          objects: [
            {
              id: 'animated-butterfly',
              properties: {
                asset: 'butterfly',
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
    const node = host('ViroNode').find(
      item => item.props.viroTag === 'animated-butterfly',
    )!;
    expect(node.props.physicsBody).toEqual(
      experience.games[0].objects[0].properties.physics,
    );
    expect(node.props.animation).toMatchObject({ run: true, loop: true });
    expect(ViroAnimations.registerAnimations).toHaveBeenCalled();
    act(() => node.props.onClick());
    expect(onEvent).toHaveBeenCalledWith({
      type,
      gameId: 'poster-scene',
      objectId: 'animated-butterfly',
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
