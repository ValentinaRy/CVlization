import '../shared/styles.css';
import './styles.css';
import { annotationCss, mountAnnotations } from './annotate';
import { Autosave } from './autosave';
import { collectPage } from './collect';
import { captureName } from './model';
import type { Capture, Annotations, PageObservation } from './model';
import { listCaptures, openCapture, saveCapture } from './repository';
import { renderCapture } from './render';
import { loadWorkspace } from '../workspace/handle-store';
import { inspectWorkspace, reconnectWorkspace, workspaceMessage } from '../workspace/access';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = get<HTMLSelectElement>('debug-list');
const errorBox = get('debug-error');
const frame = get<HTMLIFrameElement>('debug-preview');
const hidden = get('debug-hidden-list');
const reconnect = get<HTMLButtonElement>('debug-reconnect');
const retryCapture = get<HTMLButtonElement>('debug-retry-capture');
const params = new URLSearchParams(location.search);
const pendingName = get<HTMLInputElement>('debug-pending-name');
pendingName.value = params.get('name') ?? '';
get('debug-pending').hidden = !params.has('tab');
let folder: FileSystemDirectoryHandle | undefined;
let saver: Autosave<Annotations['labels']> | undefined;
let activeCapture = '';
let capturing = false;
let opening = false;
let draftCapture: Capture | undefined;
const localStyle = document.createElement('style'); localStyle.textContent = annotationCss; document.head.append(localStyle);
function error(value: unknown) {
  errorBox.hidden = false;
  errorBox.textContent = value instanceof Error ? value.message : 'This operation failed. Please try again.';
}
async function checkAccess() {
  if (!folder) { get('debug-access').textContent = 'Choose a workspace from the dashboard first, then reopen Debug.'; return false; }
  const state = await inspectWorkspace(folder);
  get('debug-access').textContent = workspaceMessage(state);
  reconnect.hidden = state === 'connected';
  return state === 'connected';
}
async function refresh() {
  if (!await checkAccess() || !folder) return;
  list.replaceChildren(new Option('Choose a capture', ''));
  for (const name of await listCaptures(folder)) list.append(new Option(name, name));
  list.value = activeCapture;
}
function renderSaveState() {
  get('debug-save-state').textContent = saver?.state === 'saving' ? 'Saving labels…' : saver?.state === 'error' ? 'Save failed · labels kept in this tab' : 'All labels saved';
  get('debug-retry-save').hidden = saver?.state !== 'error';
  if (saver?.state === 'error') { error(saver.error); void checkAccess().catch(error); }
}
async function open(name: string) {
  if (!folder || !name || opening) return;
  if (saver?.dirty && !window.confirm('Discard unsaved labels and open this capture?')) return;
  if (saver?.state === 'saving') throw new Error('Wait for the current label write to finish before opening another capture.');
  opening = true;
  get('debug-detail').inert = true;
  try {
    const saved = await openCapture(folder, name);
    const html = renderCapture(saved.capture);
    activeCapture = name; list.value = name;
    saver = new Autosave(labels => navigator.locks.request(`cvlization-debug-labels-${saved.capture.id}`, () => saved.save(labels)), renderSaveState);
    const captureSaver = saver;
    get('debug-name').textContent = saved.capture.name;
    get('debug-source').textContent = `${saved.capture.page.url} · ${saved.capture.page.capturedAt} · ${saved.capture.page.viewport.width} × ${saved.capture.page.viewport.height}`;
    get('debug-omissions').replaceChildren();
    for (const omission of saved.capture.page.omissions) { const item = document.createElement('li'); item.textContent = omission; get('debug-omissions').append(item); }
    get('debug-detail').hidden = false;
    frame.onload = () => {
      opening = false;
      get('debug-detail').inert = false;
      const doc = frame.contentDocument;
      if (!doc) { error(new Error('The local snapshot could not be opened.')); return; }
      mountAnnotations(saved.capture, saved.annotations.labels, doc, hidden, () => { errorBox.hidden = true; captureSaver.update(saved.annotations.labels); resize(); });
      get('debug-hidden').hidden = !hidden.children.length;
      resize();
    };
    frame.style.width = `${Math.max(320, Math.min(saved.capture.page.viewport.width, 3000))}px`;
    frame.srcdoc = html;
    renderSaveState();
  } catch (value) {
    opening = false;
    get('debug-detail').inert = false;
    throw value;
  }
}
function resize() { if (frame.contentDocument) frame.style.height = `${Math.min(100_000, Math.max(600, frame.contentDocument.documentElement.scrollHeight + 40))}px`; }
async function capture() {
  if (capturing || !folder) return;
  capturing = true; retryCapture.hidden = true; errorBox.hidden = true;
  try {
    if (!await checkAccess()) throw new Error('Reconnect your workspace, then retry capture.');
    const name = captureName(pendingName.value);
    if (!draftCapture) {
      const tabId = Number(params.get('tab'));
      if (!params.has('tab') || !Number.isSafeInteger(tabId) || tabId < 0) throw new Error('Open Debug from the popup on the page you want to capture.');
      get('debug-access').textContent = 'Reading the page…';
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: collectPage, args: [params.get('values') !== 'false'], world: 'ISOLATED' });
      const page = results[0]?.result as PageObservation | undefined;
      if (!page?.tree) throw new Error('The page did not return a capture. Open the popup on that page and try again.');
      draftCapture = { schemaVersion: 1, id: crypto.randomUUID(), name, extensionVersion: chrome.runtime.getManifest().version, page };
    }
    draftCapture.name = name;
    get('debug-access').textContent = 'Saving the snapshot…';
    const html = renderCapture(draftCapture);
    const savedName = await navigator.locks.request('cvlization-debug-capture-write', () => saveCapture(folder!, draftCapture!, html));
    params.delete('tab'); params.delete('name'); history.replaceState(null, '', 'debug.html');
    draftCapture = undefined;
    get('debug-pending').hidden = true;
    await refresh(); await open(savedName);
    get('debug-access').textContent = `Saved in debug/${savedName}/. Label the fields below.`;
  } catch (value) { error(value); retryCapture.hidden = false; try { await checkAccess(); } catch { /* Retain capture error. */ } }
  finally { capturing = false; }
}
get('debug-open').addEventListener('click', () => { errorBox.hidden = true; void open(list.value).catch(error); });
get('debug-refresh').addEventListener('click', () => { void refresh().catch(error); });
retryCapture.addEventListener('click', () => { void capture(); });
get('debug-retry-save').addEventListener('click', () => { errorBox.hidden = true; void saver?.flush(); });
reconnect.addEventListener('click', async () => {
  try { if (folder) { await reconnectWorkspace(folder); await refresh(); } } catch (value) { error(value); }
});
window.addEventListener('beforeunload', event => {
  if (saver?.dirty || capturing || draftCapture) { event.preventDefault(); event.returnValue = ''; }
});
async function start() {
  try { folder = await loadWorkspace(); await refresh(); if (params.has('tab')) await capture(); }
  catch (value) { error(value); }
}
void start();
