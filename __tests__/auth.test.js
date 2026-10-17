import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteAccount, getAuthToken, getStoredUser, logout } from '../src/services/auth';

jest.mock('@react-native-async-storage/async-storage', () => (
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
));
jest.mock('../constants/i18n', () => ({ translate: (key) => key }));

const originalFetch = global.fetch;
const user = { id: 1, name: 'Player' };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    ['@echoes_auth_token', 'test-token'],
    ['@echoes_auth_user', JSON.stringify(user)],
    ['@collected_memories', '[{"id":10}]'],
    ['@visited_places', '[{"id":20}]'],
  ]);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('logs out and removes only the persisted authentication session', async () => {
  await logout();

  expect(global.fetch).toHaveBeenCalledWith(
    'https://echoes.sophiehorner.art/api/logout',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
    '@echoes_auth_token', '@echoes_auth_user',
  ]);
  expect(await getAuthToken()).toBeNull();
  expect(await getStoredUser()).toBeNull();
  expect(await AsyncStorage.getItem('@collected_memories')).toBe('[{"id":10}]');
  expect(await AsyncStorage.getItem('@visited_places')).toBe('[{"id":20}]');
});

test('clears the local session when the logout endpoint cannot be reached', async () => {
  global.fetch.mockRejectedValue(new Error('Offline'));

  await logout();

  expect(await getAuthToken()).toBeNull();
  expect(await getStoredUser()).toBeNull();
});

test('clears a remaining user without making a logout request when no token is stored', async () => {
  await AsyncStorage.removeItem('@echoes_auth_token');

  await logout();

  expect(global.fetch).not.toHaveBeenCalled();
  expect(await getStoredUser()).toBeNull();
});

test('propagates storage failures so the account modal can report them', async () => {
  AsyncStorage.multiRemove.mockRejectedValueOnce(new Error('Storage unavailable'));

  await expect(logout()).rejects.toThrow('Storage unavailable');
  expect(await getAuthToken()).toBe('test-token');
  expect(await getStoredUser()).toEqual(user);
});

test('deletes the remote account and clears only the authentication session', async () => {
  global.fetch.mockResolvedValue({
    ok: true, status: 204, json: jest.fn().mockResolvedValue(null),
  });

  await deleteAccount();

  expect(global.fetch).toHaveBeenCalledWith(
    'https://echoes.sophiehorner.art/api/user',
    expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }),
  );
  expect(await getAuthToken()).toBeNull();
  expect(await getStoredUser()).toBeNull();
  expect(await AsyncStorage.getItem('@collected_memories')).toBe('[{"id":10}]');
  expect(await AsyncStorage.getItem('@visited_places')).toBe('[{"id":20}]');
});

test('keeps the local session when account deletion fails', async () => {
  global.fetch.mockResolvedValue({
    ok: false, status: 500, json: jest.fn().mockResolvedValue({ message: 'Failed' }),
  });

  await expect(deleteAccount()).rejects.toThrow('Failed');
  expect(await getAuthToken()).toBe('test-token');
  expect(await getStoredUser()).toEqual(user);
});
