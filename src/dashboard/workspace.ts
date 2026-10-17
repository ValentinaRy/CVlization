import { inspectWorkspace, reconnectWorkspace, workspaceMessage } from '../workspace/access';
import type { WorkspaceState } from '../workspace/access';
import { loadWorkspace, saveWorkspace } from '../workspace/handle-store';
import { listEntries } from '../resume/repository';

const picker = window as Window & {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};
const choose = document.querySelector<HTMLButtonElement>('#choose-folder')!;
const reconnect = document.querySelector<HTMLButtonElement>('#reconnect-workspace')!;
const name = document.querySelector<HTMLElement>('#workspace-name')!;
const badge = document.querySelector<HTMLElement>('#workspace-state')!;
const status = document.querySelector<HTMLElement>('#workspace-status')!;
const warning = document.querySelector<HTMLElement>('#workspace-warning')!;
const create = document.querySelector<HTMLButtonElement>('#create-resume')!;
const files = document.querySelector<HTMLElement>('#resume-list')!;
const filesStatus = document.querySelector<HTMLElement>('#resumes-status')!;
let folder: FileSystemDirectoryHandle | undefined;
let busy = true;
let remembered = false;
let connection: WorkspaceState | 'disconnected' | 'checking' | 'unsupported' = 'checking';

function controls() {
  choose.disabled = busy || !picker.showDirectoryPicker;
  reconnect.disabled = busy || !folder;
  reconnect.hidden = !folder;
  create.disabled = busy || !remembered || connection !== 'connected';
  files.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = create.disabled; });
  name.textContent = folder?.name ?? 'No folder selected';
  const labels = { connected: 'Connected', 'permission-required': 'Permission required', unavailable: 'Folder unavailable', disconnected: 'Not connected', checking: 'Checking access…', unsupported: 'Folder access unavailable' };
  badge.textContent = labels[connection];
  badge.dataset.state = connection;
}
function setConnection(state: WorkspaceState) {
  connection = state;
  status.textContent = workspaceMessage(state);
  status.dataset.state = state === 'connected' ? 'info' : 'error';
}
async function checkConnection() {
  if (!folder) return;
  try { setConnection(await inspectWorkspace(folder)); }
  catch {
    setConnection('unavailable');
    status.textContent = 'Could not check this folder. Click Reconnect or choose a folder again.';
  }
}
async function remember() {
  try {
    await saveWorkspace(folder!);
    remembered = true;
    warning.textContent = '';
  } catch {
    remembered = false;
    warning.textContent = 'Could not remember this folder. Reconnect to retry before opening the editor, so it cannot open an older workspace.';
  }
}
async function refreshFiles() {
  files.replaceChildren();
  if (!folder || connection !== 'connected' || !remembered) {
    filesStatus.textContent = 'Connect a folder to create or open a resume.';
    return;
  }
  try {
    const entries = (await listEntries(folder)).filter(entry => entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json'));
    filesStatus.textContent = entries.length
      ? 'JSON files in this folder. Open a CVlization resume to edit its basic details.'
      : 'Your next chapter starts here. Create your first resume.';
    filesStatus.dataset.state = 'info';
    for (const entry of entries) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-button';
      button.textContent = entry.name;
      button.addEventListener('click', () => { window.location.href = `resume.html?file=${encodeURIComponent(entry.name)}`; });
      item.append(button);
      files.append(item);
    }
  } catch {
    filesStatus.textContent = 'Could not list files. Reconnect your folder to try again.';
    filesStatus.dataset.state = 'error';
    await checkConnection();
  }
}
async function restore() {
  if (!picker.showDirectoryPicker) {
    connection = 'unsupported';
    status.textContent = 'Folder access is unavailable. In Brave, enable File System Access API at brave://flags/#file-system-access-api, restart the browser, and reopen this page.';
    status.dataset.state = 'error';
  } else {
    try {
      folder = await loadWorkspace();
      remembered = !!folder;
      if (folder) await checkConnection();
      else { connection = 'disconnected'; status.textContent = 'Choose a folder to get started.'; }
    } catch {
      connection = 'disconnected';
      status.textContent = 'Could not restore your folder. Choose it again.';
      status.dataset.state = 'error';
    }
  }
  await refreshFiles();
  busy = false;
  controls();
}
choose.addEventListener('click', async () => {
  if (busy || !picker.showDirectoryPicker) return;
  busy = true;
  controls();
  try {
    const selected = await picker.showDirectoryPicker({ mode: 'readwrite' });
    const state = await inspectWorkspace(selected);
    if (state !== 'connected') {
      warning.textContent = `${workspaceMessage(state)} The previous selection is unchanged.`;
      return;
    }
    folder = selected;
    setConnection(state);
    await remember();
    await refreshFiles();
  } catch (error) {
    warning.textContent = error instanceof DOMException && error.name === 'AbortError'
      ? 'Folder selection cancelled. The previous selection is unchanged.'
      : 'Could not select the folder. The previous selection is unchanged.';
  } finally { busy = false; controls(); }
});
reconnect.addEventListener('click', async () => {
  if (busy || !folder) return;
  busy = true;
  controls();
  try {
    setConnection(await reconnectWorkspace(folder));
    if (connection === 'connected') await remember();
    await refreshFiles();
  } catch { await checkConnection(); }
  finally { busy = false; controls(); }
});
window.addEventListener('focus', async () => {
  if (busy || !folder) return;
  busy = true;
  controls();
  try { await checkConnection(); await refreshFiles(); }
  finally { busy = false; controls(); }
});
create.addEventListener('click', () => { window.location.href = 'resume.html'; });
controls();
void restore();
