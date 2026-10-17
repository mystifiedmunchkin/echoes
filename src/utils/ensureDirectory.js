import { FileSystem } from 'react-native-file-access';

// Concurrent asset downloads share creation work, but later calls recheck the filesystem.
const pendingDirectories = new Map();

export async function ensureDirectory(path) {
  const pending = pendingDirectories.get(path);
  if (pending) return pending;

  const creation = (async () => {
    if (await FileSystem.exists(path)) {
      if (!(await FileSystem.isDir(path))) {
        throw new Error(`Cache path is not a directory: ${path}`);
      }
      return;
    }
    try {
      await FileSystem.mkdir(path);
    } catch (error) {
      // Another caller/process may have created the directory after the existence check.
      if (error?.code !== 'EEXIST' || !(await FileSystem.isDir(path))) {
        throw error;
      }
    }
  })();
  pendingDirectories.set(path, creation);
  try {
    await creation;
  } finally {
    pendingDirectories.delete(path);
  }
}
