import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useScores } from '../src/hooks/useScores';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(),
}));

let scores;
let renderer;
function Probe() {
  scores = useScores();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.getItem.mockResolvedValue(null);
});

afterEach(() => act(() => renderer.unmount()));

test('counts simultaneous score updates and persists the complete total', async () => {
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  await act(async () => {
    scores.addScore({ id: 1, name: 'Basket' });
    scores.addScore({ id: 1, name: 'Basket' });
    scores.addScore({ id: 2, name: 'Other basket' });
  });
  expect(scores.scores).toEqual([
    { id: 1, name: 'Basket', points: 2 },
    { id: 2, name: 'Other basket', points: 1 },
  ]);
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    '@experience_scores',
    JSON.stringify(scores.scores),
  );
});

test('merges contacts received during storage loading instead of overwriting them', async () => {
  let finishLoading;
  AsyncStorage.getItem.mockReturnValue(
    new Promise(resolve => {
      finishLoading = resolve;
    }),
  );
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  await act(async () => {
    scores.addScore({ id: 1, name: 'Basket' });
  });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await act(async () => {
    finishLoading(JSON.stringify([{ id: 1, name: 'Basket', points: 4 }]));
  });
  expect(scores.scores).toEqual([{ id: 1, name: 'Basket', points: 5 }]);
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    '@experience_scores',
    JSON.stringify(scores.scores),
  );
});
