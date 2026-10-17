export type WorkspaceState = 'connected' | 'permission-required' | 'unavailable';

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};

export async function inspectWorkspace(folder: FileSystemDirectoryHandle): Promise<WorkspaceState> {
  try {
    const permission = await (folder as PermissionHandle).queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return 'permission-required';
    // Probe availability without creating files or reading their contents.
    const entries = folder.values();
    try {
      await entries.next();
    } finally {
      await entries.return?.();
    }
    return 'connected';
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'permission-required';
      if (error.name === 'NotFoundError') return 'unavailable';
    }
    throw error;
  }
}

export async function reconnectWorkspace(folder: FileSystemDirectoryHandle): Promise<WorkspaceState> {
  // Invoke directly from the Reconnect click, before any storage or permission query awaits.
  const permission = await (folder as PermissionHandle).requestPermission({ mode: 'readwrite' });
  return permission === 'granted' ? inspectWorkspace(folder) : 'permission-required';
}

export function workspaceMessage(state: WorkspaceState): string {
  switch (state) {
    case 'connected': return 'Your folder is ready.';
    case 'permission-required': return 'Folder access is not granted. Click Reconnect to allow access, or choose the folder again.';
    case 'unavailable': return 'This folder is unavailable. Restore it or reconnect its drive and click Reconnect, or choose another folder.';
  }
}
