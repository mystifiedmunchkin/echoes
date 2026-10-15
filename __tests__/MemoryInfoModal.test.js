import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryInfoModal } from '../src/components/MemoryInfoModal';

jest.mock('react-native', () => ({
  Modal: 'Modal',
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles) => styles },
}));
jest.mock('../constants/i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));
jest.mock('../src/components/MemoryAudioControls', () => ({
  MemoryAudioControls: 'MemoryAudioControls',
}));

const memory = {
  id: 1, name: 'Title', description: 'Description',
  creatorName: 'Publisher', is_collectible: true,
  lat: 48, lng: 2,
  model_url: 'model.glb', image_url: 'image.jpg',
  audio_url: 'audio.mp3', video_url: 'video.mp4',
};

test('preview shows title and description without exposing media or metadata', () => {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      <MemoryInfoModal visible memory={memory} previewMessage="Come closer" />,
    );
  });
  const output = JSON.stringify(renderer.toJSON());
  expect(output).toContain('Title');
  expect(output).toContain('Description');
  expect(output).toContain('Come closer');
  expect(output).not.toContain('Publisher');
  expect(output).not.toContain('memoryId');
  expect(renderer.root.findAllByType('MemoryAudioControls')).toHaveLength(0);
  expect(renderer.root.findAllByType('TouchableOpacity')).toHaveLength(1);
  act(() => renderer.unmount());
});

test('authorized nearby viewer retains all media actions and audio controls', () => {
  const onViewModel = jest.fn();
  const onViewImage = jest.fn();
  const onViewVideo = jest.fn();
  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      <MemoryInfoModal
        visible memory={memory} canViewContent
        onViewModel={onViewModel} onViewImage={onViewImage} onViewVideo={onViewVideo}
      />,
    );
  });
  expect(renderer.root.findAllByType('MemoryAudioControls')).toHaveLength(1);
  const buttons = renderer.root.findAllByType('TouchableOpacity');
  expect(buttons).toHaveLength(4);
  act(() => buttons.slice(0, 3).forEach((button) => button.props.onPress()));
  [onViewModel, onViewImage, onViewVideo].forEach((callback) => {
    expect(callback).toHaveBeenCalledWith(memory);
  });
  act(() => renderer.unmount());
});
