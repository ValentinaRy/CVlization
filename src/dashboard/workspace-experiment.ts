import { inspectWorkspace, reconnectWorkspace, workspaceMessage } from '../workspace/access';
import type { WorkspaceState } from '../workspace/access';
import { loadWorkspace, saveWorkspace } from '../workspace/handle-store';

const folderPicker = window as Window & {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};

const testUser = {
  firstName: 'Alex',
  lastName: 'Taylor',
  email: 'alex.taylor@example.com',
  dateOfBirth: '1995-06-15',
};
const sourceJson = JSON.stringify(testUser, null, 2);
const chooseButton = document.querySelector<HTMLButtonElement>('#choose-test-folder')!;
const reconnectButton = document.querySelector<HTMLButtonElement>('#reconnect-workspace')!;
const workspaceName = document.querySelector<HTMLElement>('#workspace-name')!;
const workspaceBadge = document.querySelector<HTMLElement>('#workspace-state')!;
const workspaceStatus = document.querySelector<HTMLElement>('#workspace-status')!;
const workspaceWarning = document.querySelector<HTMLElement>('#workspace-warning')!;
const writeButton = document.querySelector<HTMLButtonElement>('#write-test-file')!;
const readButton = document.querySelector<HTMLButtonElement>('#read-test-file')!;
const source = document.querySelector<HTMLElement>('#test-source')!;
const result = document.querySelector<HTMLElement>('#test-result')!;
const fileLocation = document.querySelector<HTMLParagraphElement>('#test-location')!;
const experimentStatus = document.querySelector<HTMLParagraphElement>('#test-status')!;

let folder: FileSystemDirectoryHandle | undefined;
let writtenFile: FileSystemFileHandle | undefined;
let busy = true;
let connection: WorkspaceState | 'disconnected' | 'checking' | 'unsupported' = 'checking';

source.textContent = sourceJson;

function showStatus(message: string, error = false) {
  experimentStatus.textContent = message;
  experimentStatus.dataset.state = error ? 'error' : 'info';
}

function updateButtons() {
  const supported = typeof folderPicker.showDirectoryPicker === 'function';
  chooseButton.disabled = busy || !supported;
  reconnectButton.disabled = busy || !supported || !folder;
  reconnectButton.hidden = !folder;
  writeButton.disabled = busy || connection !== 'connected';
  readButton.disabled = busy || connection !== 'connected' || !writtenFile;
  workspaceName.textContent = folder ? folder.name : 'No folder selected';
  const labels = {
    connected: 'Connected',
    'permission-required': 'Permission required',
    unavailable: 'Folder unavailable',
    disconnected: 'Not connected',
    checking: 'Checking access…',
    unsupported: 'Folder access unavailable',
  };
  workspaceBadge.textContent = labels[connection];
  workspaceBadge.dataset.state = connection;
}

function setConnection(state: WorkspaceState) {
  connection = state;
  workspaceStatus.textContent = workspaceMessage(state);
  workspaceStatus.dataset.state = state === 'connected' ? 'info' : 'error';
}

async function checkConnection(): Promise<boolean> {
  if (!folder) return false;
  try {
    setConnection(await inspectWorkspace(folder));
  } catch {
    setConnection('unavailable');
    workspaceStatus.textContent = 'Could not check this folder. Click Reconnect to try again, or choose a folder.';
  }
  updateButtons();
  return connection === 'connected';
}

async function reportError(action: string, error: unknown) {
  // Distinguish a missing/invalid test file from a lost workspace connection.
  await checkConnection();
  const detail = error instanceof SyntaxError
    ? 'The test file is not valid JSON. Fix the file and read it again.'
    : error instanceof DOMException && error.name === 'NotFoundError'
      ? 'The test file or folder is unavailable. Restore it or write a new test file after reconnecting.'
      : error instanceof Error ? error.message : 'Please try again.';
  showStatus(`${action} failed. ${detail}`, true);
}

async function rememberSelection() {
  try {
    await saveWorkspace(folder!);
    workspaceWarning.textContent = '';
  } catch {
    workspaceWarning.textContent = 'This selection could not be remembered. It works for this tab, but reopening may restore an older selection. Check the folder name and choose it again if needed.';
  }
}

async function restoreSelection() {
  if (typeof folderPicker.showDirectoryPicker !== 'function') {
    connection = 'unsupported';
    workspaceStatus.textContent = 'Folder access is unavailable. In Brave, enable File System Access API at brave://flags/#file-system-access-api, restart the browser, and reopen this page.';
    workspaceStatus.dataset.state = 'error';
  } else {
    try {
      folder = await loadWorkspace();
      if (folder) await checkConnection();
      else {
        connection = 'disconnected';
        workspaceStatus.textContent = 'Choose a folder to get started.';
      }
    } catch {
      connection = 'disconnected';
      workspaceStatus.textContent = 'Could not restore your saved folder. Choose it again to reconnect.';
      workspaceStatus.dataset.state = 'error';
    }
  }
  busy = false;
  updateButtons();
}

updateButtons();
void restoreSelection();

chooseButton.addEventListener('click', async () => {
  if (!folderPicker.showDirectoryPicker || busy) return;
  busy = true;
  updateButtons();
  try {
    const selected = await folderPicker.showDirectoryPicker({ mode: 'readwrite' });
    // Validate the candidate before replacing the previous selection.
    const state = await inspectWorkspace(selected);
    if (state !== 'connected') {
      showStatus(`${workspaceMessage(state)} The previous selection is unchanged.`, true);
      return;
    }
    folder = selected;
    writtenFile = undefined;
    fileLocation.textContent = 'No test file written in this tab.';
    result.textContent = 'No file read yet.';
    setConnection('connected');
    await rememberSelection();
    showStatus('Folder selected. Write the fictional user to a new test file.');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      showStatus('Folder selection cancelled or not allowed. The previous selection is unchanged.');
    } else {
      await reportError('Folder selection', error);
    }
  } finally {
    busy = false;
    updateButtons();
  }
});

reconnectButton.addEventListener('click', async () => {
  if (!folder || busy) return;
  busy = true;
  updateButtons();
  try {
    setConnection(await reconnectWorkspace(folder));
    if (connection === 'connected') await rememberSelection();
  } catch {
    await checkConnection();
    if (connection !== 'connected') {
      workspaceStatus.textContent += ' If the browser does not show a permission prompt, choose the folder again.';
    }
  } finally {
    busy = false;
    updateButtons();
  }
});

// Recheck without prompting when returning from browser permission settings.
window.addEventListener('focus', async () => {
  if (busy || !folder) return;
  busy = true;
  updateButtons();
  await checkConnection();
  busy = false;
  updateButtons();
});

writeButton.addEventListener('click', async () => {
  if (!folder || busy || connection !== 'connected') return;
  busy = true;
  writtenFile = undefined;
  result.textContent = 'No file read yet.';
  fileLocation.textContent = 'No test file written in this tab.';
  updateButtons();
  showStatus('Writing test file…');
  try {
    if (!await checkConnection()) {
      showStatus('Writing paused. Reconnect your workspace first.', true);
      return;
    }
    const name = `cvlization-test-user-${crypto.randomUUID()}.json`;
    // Refuse an existing name, even in the unlikely event of a generated-name collision.
    let exists = false;
    try {
      await folder.getFileHandle(name);
      exists = true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    if (exists) throw new Error('The test filename already exists. Try again to use a new name.');

    const file = await folder.getFileHandle(name, { create: true });
    const writer = await file.createWritable();
    try {
      await writer.write(`${sourceJson}\n`);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => { /* The stream may already be closed. */ });
      throw error;
    }
    writtenFile = file;
    fileLocation.textContent = `Test file: ${file.name}`;
    showStatus('Test file saved. Read it back and compare the two panels.');
  } catch (error) {
    await reportError('Writing', error);
  } finally {
    busy = false;
    updateButtons();
  }
});

readButton.addEventListener('click', async () => {
  if (!writtenFile || busy || connection !== 'connected') return;
  busy = true;
  result.textContent = 'Reading file…';
  updateButtons();
  showStatus('Reading test file…');
  try {
    if (!await checkConnection()) {
      result.textContent = 'Reconnect your workspace to read the file.';
      showStatus('Reading paused. Reconnect your workspace first.', true);
      return;
    }
    // Get a fresh File each time: the result comes from disk, not from the source fixture.
    const file = await writtenFile.getFile();
    const data: unknown = JSON.parse(await file.text());
    result.textContent = JSON.stringify(data, null, 2);
    showStatus('File read. Compare all four values with the source on the left.');
  } catch (error) {
    result.textContent = 'Could not read JSON from the file.';
    await reportError('Reading', error);
  } finally {
    busy = false;
    updateButtons();
  }
});
