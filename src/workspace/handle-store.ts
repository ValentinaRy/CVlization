// Only the directory handle is stored here; profile data stays in the user's files.
const databaseName = 'cvlization-workspace';
const storeName = 'handles';
const workspaceKey = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Workspace storage is busy in another tab.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export async function loadWorkspace(): Promise<FileSystemDirectoryHandle | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(workspaceKey);
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not load the saved workspace.'));
      transaction.oncomplete = () => {
        const handle: unknown = request.result;
        if (handle === undefined) resolve(undefined);
        else if (handle instanceof FileSystemDirectoryHandle) resolve(handle);
        else reject(new Error('The saved workspace is invalid. Choose a folder again.'));
      };
    });
  } finally {
    database.close();
  }
}

export async function saveWorkspace(folder: FileSystemDirectoryHandle): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not remember the workspace.'));
      transaction.objectStore(storeName).put(folder, workspaceKey);
    });
  } finally {
    database.close();
  }
}
