import { FileSystem } from 'react-native-file-access';
import { ensureDirectory } from '../src/utils/ensureDirectory';

jest.mock('react-native-file-access', () => ({
  FileSystem: {
    exists: jest.fn(),
    isDir: jest.fn(),
    mkdir: jest.fn(),
  },
}));

beforeEach(() => {
  jest.resetAllMocks();
  FileSystem.exists.mockResolvedValue(false);
  FileSystem.isDir.mockResolvedValue(true);
  FileSystem.mkdir.mockResolvedValue();
});

test('shares one directory creation across concurrent first-start downloads', async () => {
  let complete;
  FileSystem.mkdir.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const first = ensureDirectory('cache/memory-assets');
  const second = ensureDirectory('cache/memory-assets');
  const third = ensureDirectory('cache/memory-assets');
  await Promise.resolve();
  expect(FileSystem.mkdir).toHaveBeenCalledTimes(1);
  complete();
  await Promise.all([first, second, third]);
});

test('does not recreate an existing directory', async () => {
  FileSystem.exists.mockResolvedValue(true);
  await ensureDirectory('cache/memory-assets');
  expect(FileSystem.mkdir).not.toHaveBeenCalled();
});

test('rechecks the filesystem on later calls instead of keeping stale success', async () => {
  await ensureDirectory('cache/memory-assets');
  await ensureDirectory('cache/memory-assets');
  expect(FileSystem.mkdir).toHaveBeenCalledTimes(2);
});

test('allows a directory created externally between existence check and mkdir', async () => {
  FileSystem.mkdir.mockRejectedValue({ code: 'EEXIST' });
  await expect(ensureDirectory('cache/memory-assets')).resolves.toBeUndefined();
  expect(FileSystem.isDir).toHaveBeenCalledWith('cache/memory-assets');
});

test('rejects a file occupying the cache path', async () => {
  FileSystem.exists.mockResolvedValue(true);
  FileSystem.isDir.mockResolvedValue(false);
  await expect(ensureDirectory('cache/memory-assets')).rejects.toThrow('not a directory');
  expect(FileSystem.mkdir).not.toHaveBeenCalled();
});

test('does not hide an EEXIST error when the existing path is not a directory', async () => {
  const error = { code: 'EEXIST' };
  FileSystem.mkdir.mockRejectedValue(error);
  FileSystem.isDir.mockResolvedValue(false);
  await expect(ensureDirectory('cache/memory-assets')).rejects.toBe(error);
});

test('propagates real creation errors to all callers and permits a subsequent retry', async () => {
  const error = Object.assign(new Error('Access denied'), { code: 'EPERM' });
  FileSystem.mkdir.mockRejectedValueOnce(error).mockResolvedValueOnce();
  const attempts = await Promise.allSettled([
    ensureDirectory('cache/memory-assets'),
    ensureDirectory('cache/memory-assets'),
  ]);
  expect(attempts).toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ]);
  expect(FileSystem.mkdir).toHaveBeenCalledTimes(1);
  await expect(ensureDirectory('cache/memory-assets')).resolves.toBeUndefined();
  expect(FileSystem.mkdir).toHaveBeenCalledTimes(2);
});
