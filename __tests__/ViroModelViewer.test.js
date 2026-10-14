jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
}));

jest.mock('@reactvision/react-viro', () => {
  const React = require('react');
  return {
    ViroScene: class extends React.Component {
      render() {
        return React.createElement('ViroScene', this.props, this.props.children);
      }
    },
    Viro3DSceneNavigator: ({ initialScene, viroAppProps }) =>
      React.createElement(initialScene.scene, { sceneNavigator: { viroAppProps } }),
    Viro3DObject: 'Viro3DObject',
    ViroNode: 'ViroNode',
    ViroAmbientLight: 'ViroAmbientLight',
    ViroDirectionalLight: 'ViroDirectionalLight',
    ViroPinchStateTypes: { PINCH_START: 1, PINCH_MOVE: 2 },
    ViroRotateStateTypes: { ROTATE_START: 1, ROTATE_MOVE: 2 },
  };
});

jest.mock('react-native-file-access', () => ({
  FileSystem: { readFile: jest.fn().mockResolvedValue('v 0 0 0\nv 2 4 6\n') },
}));

jest.mock('../constants/i18n', () => ({
  translate: (key) => key,
  useI18n: () => ({ t: (key) => key }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import ViroModelViewer from '../src/components/ViroModelViewer';

const touch = (x, y, identifier = '1') => ({ identifier, pageX: x, pageY: y });
const event = (...touches) => ({ nativeEvent: { touches } });

describe('ViroModelViewer gestures', () => {
  const originalActEnvironment = global.IS_REACT_ACT_ENVIRONMENT;
  let renderer;
  let container;
  const node = () => renderer.root.findByType('ViroNode');
  const object = () => renderer.root.findByType('Viro3DObject');

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  beforeEach(async () => {
    await act(async () => {
      renderer = create(<ViroModelViewer modelUrl="file:///model.obj" />);
    });
    container = renderer.root.findByProps({ testID: 'model-gesture-surface' });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('rotates horizontally around Y and vertically around X without moving the center', () => {
    expect(container.props.onStartShouldSetResponder()).toBe(true);
    act(() => container.props.onResponderGrant(event(touch(100, 100))));
    act(() => container.props.onResponderMove(event(touch(150, 125))));
    expect(node().props.rotation).toEqual([10, 20, 0]);
    expect(node().props.position).toEqual([0, 0, -2.4]);
    expect(object().props.position[1]).toBeCloseTo(-2 * (1.4 / 6));

    act(() => container.props.onResponderRelease(event()));
    act(() => container.props.onResponderGrant(event(touch(300, 300))));
    act(() => container.props.onResponderMove(event(touch(325, 275))));
    expect(node().props.rotation).toEqual([0, 30, 0]);
  });

  it('does not rotate while pinching and resumes without jumping', () => {
    act(() => container.props.onResponderGrant(event(touch(0, 0))));
    act(() => container.props.onResponderMove(event(touch(100, 100), touch(200, 200, '2'))));
    expect(node().props.rotation).toEqual([0, 0, 0]);
    act(() => container.props.onResponderMove(event(touch(100, 100), touch(300, 300, '2'))));
    expect(node().props.scale).toEqual([2, 2, 2]);
    act(() => container.props.onResponderEnd(event(touch(300, 300))));
    expect(node().props.rotation).toEqual([0, 0, 0]);
    act(() => container.props.onResponderMove(event(touch(310, 320))));
    expect(node().props.rotation).toEqual([8, 4, 0]);
    expect(node().props.scale).toEqual([2, 2, 2]);
    expect(node().props.position).toEqual([0, 0, -2.4]);
    act(() => container.props.onResponderEnd(event()));
    act(() => container.props.onResponderRelease(event()));
    expect(node().props.scale).toEqual([2, 2, 2]);
  });

  it('preserves two-finger twist rotation alongside touch drag', () => {
    act(() => container.props.onResponderGrant(event(touch(0, 0))));
    act(() => container.props.onResponderMove(event(touch(50, 25))));
    act(() => container.props.onResponderStart(event(touch(0, 0), touch(100, 0, '2'))));
    act(() => container.props.onResponderMove(event(touch(0, 0), touch(0, 100, '2'))));
    expect(node().props.rotation).toEqual([10, 110, 0]);
  });

  it('clears a cancelled drag and resets rotation for a new model', async () => {
    act(() => container.props.onResponderGrant(event(touch(0, 0))));
    act(() => container.props.onResponderMove(event(touch(50, 25))));
    act(() => container.props.onResponderTerminate(event()));
    act(() => container.props.onResponderMove(event(touch(400, 400))));
    expect(node().props.rotation).toEqual([10, 20, 0]);
    act(() => container.props.onResponderStart(event(touch(0, 0), touch(100, 0, '2'))));
    act(() => container.props.onResponderMove(event(touch(0, 0), touch(200, 0, '2'))));
    expect(node().props.scale).toEqual([2, 2, 2]);

    await act(async () => {
      renderer.update(<ViroModelViewer modelUrl="file:///second.obj" />);
    });
    expect(node().props.rotation).toEqual([0, 0, 0]);
    expect(node().props.scale).toEqual([1, 1, 1]);
  });
});
