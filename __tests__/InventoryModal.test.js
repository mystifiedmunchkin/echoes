import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import InventoryModal from '../src/components/InventoryModal';

jest.mock('react-native', () => ({
  Modal: 'Modal', View: 'View', Text: 'Text', SafeAreaView: 'SafeAreaView',
  TouchableOpacity: 'TouchableOpacity',
  FlatList: ({ data, renderItem }) => require('react').createElement(
    'List', null, data.map(item => require('react').createElement(
      'Row', { key: item.id }, renderItem({ item }),
    )),
  ),
  StyleSheet: { create: styles => styles },
}));
jest.mock('../constants/i18n', () => ({ useI18n: () => ({ t: key => key }) }));

let renderer;
afterEach(() => act(() => renderer.unmount()));
const demo = { id: 101, name: 'Demo basket', isBundled: true };

test('labels a local-only bundled game explicitly', () => {
  act(() => {
    renderer = TestRenderer.create(
      <InventoryModal visible items={[{ ...demo, localOnly: true }]} onReplace={jest.fn()} />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('bundledLocalGame');
});

test('keeps included games playable and hides clearing when they are the only entries', () => {
  const onReplace = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <InventoryModal visible items={[demo]} onReplace={onReplace} onClear={jest.fn()} />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('bundledGame');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('clearCollection');
  act(() => renderer.root.findByProps({ accessibilityLabel: 'playHere' }).props.onPress());
  expect(onReplace).toHaveBeenCalledWith(demo);
});

test('replays entire collected games but not individual game objects', () => {
  const onReplace = jest.fn();
  const onClear = jest.fn();
  const game = { id: 102, name: 'Game', interactive: { logic: { games: [] } } };
  act(() => {
    renderer = TestRenderer.create(
      <InventoryModal
        visible items={[demo, game, { id: '102:1', isGameObject: true }]}
        onReplace={onReplace} onClear={onClear}
      />,
    );
  });
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'replaceHere' })).toHaveLength(1);
  act(() => renderer.root.findByProps({ accessibilityLabel: 'replaceHere' }).props.onPress());
  expect(onReplace).toHaveBeenCalledWith(game);
  const clearLabel = renderer.root.findAllByType('Text').find(node =>
    node.props.children === 'clearCollection');
  act(() => clearLabel.parent.props.onPress());
  expect(onClear).toHaveBeenCalledTimes(1);
});
