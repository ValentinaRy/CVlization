import { optionalSectionsEditor } from './optional-sections-editor';
import { proficiencyEditor } from './proficiency-editor';
import { languageLevels, newLanguageDraft, newSkillDraft, skillLevels } from './skills-languages';
import { educationEditor } from './education-editor';
import { workEditor } from './work-editor';
import '../shared/styles.css';
import { inspectWorkspace, reconnectWorkspace, workspaceMessage } from '../workspace/access';
import { loadWorkspace } from '../workspace/handle-store';
import { assertAvailable, filenameError, suggestedFilename } from './filenames';
import { draftWarnings, locationFields, profileFields } from './model';
import type { BasicsDraft } from './model';
import { listEntries, readResume } from './repository';
import { writeResumeWithDocuments } from './document-repository';
import { documentEditor } from './document-editor';
import { ResumeSession } from './session';

const form = document.querySelector<HTMLFormElement>('#resume-form')!;
const fieldset = document.querySelector<HTMLFieldSetElement>('#editor-fields')!;
const filename = document.querySelector<HTMLInputElement>('#filename')!;
const fileError = document.querySelector<HTMLElement>('#filename-error')!;
const copyHint = document.querySelector<HTMLElement>('#copy-hint')!;
const status = document.querySelector<HTMLElement>('#save-state')!;
const access = document.querySelector<HTMLElement>('#editor-access')!;
const errorBox = document.querySelector<HTMLElement>('#editor-error')!;
const workspace = document.querySelector<HTMLElement>('#editor-workspace')!;
const reconnect = document.querySelector<HTMLButtonElement>('#editor-reconnect')!;
const save = document.querySelector<HTMLButtonElement>('#save-resume')!;
const warnings = document.querySelector<HTMLElement>('#draft-warnings')!;
const profileContainer = document.querySelector<HTMLElement>('#profile-inputs')!;
const addProfile = document.querySelector<HTMLButtonElement>('#add-profile')!;
let optionalForm: ReturnType<typeof optionalSectionsEditor> | undefined;
let educationForm: ReturnType<typeof educationEditor> | undefined;
let workForm: ReturnType<typeof workEditor> | undefined;
let folder: FileSystemDirectoryHandle | undefined;
let session: ResumeSession | undefined;
let entries: string[] = [];
let busy = true;
let connected = false;
let loadingFailed = false;
let saveFailed = false;

function showError(error: unknown) {
  let message = error instanceof Error ? error.message : 'Please try again.';
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') message = 'The file or folder is missing. Return to the workspace and check your files. Your draft has not been discarded.';
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) message = 'Folder access is not granted. Reconnect your folder, then try again. Your draft is still here.';
  }
  errorBox.hidden = false;
  errorBox.dataset.state = 'error';
  errorBox.textContent = message;
}
function filenameProblem(): string | undefined {
  if (!session) return undefined;
  try { assertAvailable(session.filename, entries, session.original?.filename); }
  catch (error) { return error instanceof Error ? error.message : 'Choose another filename.'; }
  return undefined;
}
function renderState() {
  fieldset.disabled = busy;
  reconnect.disabled = busy;
  reconnect.hidden = !folder || connected;
  save.disabled = busy || !connected;
  if (!session) return;
  const problem = filenameProblem();
  fileError.textContent = problem ?? '';
  fileError.dataset.state = problem ? 'error' : 'info';
  filename.setAttribute('aria-invalid', String(!!problem));
  copyHint.hidden = !session.isCopy;
  status.textContent = session.saving ? 'Saving…' : busy ? 'Checking…' : saveFailed ? 'Save failed · draft kept' : session.dirty ? 'Unsaved changes' : session.original ? 'Saved' : 'Not saved yet';
  warnings.replaceChildren();
  for (const warning of draftWarnings(session.draft)) {
    const item = document.createElement('li');
    item.textContent = warning;
    warnings.append(item);
  }
}

function inputField(container: HTMLElement, id: string, labelText: string, value: string, onInput: (value: string) => void, options: { type?: string; multiline?: boolean; autocomplete?: string; placeholder?: string } = {}) {
  const wrapper = document.createElement('div');
  if (options.multiline) wrapper.className = 'full-width';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = options.multiline ? document.createElement('textarea') : document.createElement('input');
  input.id = id;
  input.name = id;
  input.value = value;
  input.setAttribute('autocomplete', options.autocomplete ?? 'off');
  if (input instanceof HTMLInputElement) input.type = options.type ?? 'text';
  if (options.placeholder) input.placeholder = options.placeholder;
  if (input instanceof HTMLTextAreaElement) input.rows = 5;
  input.addEventListener('input', () => { onInput(input.value); renderState(); });
  wrapper.append(label, input);
  container.append(wrapper);
}
function renderProfiles() {
  profileContainer.replaceChildren();
  session!.draft.profiles.forEach((profile, index) => {
    const group = document.createElement('fieldset');
    group.className = 'profile-entry';
    const legend = document.createElement('legend');
    legend.textContent = `Profile ${index + 1}`;
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    for (const key of profileFields) {
      inputField(grid, `profile-${index}-${key}`, { network: 'Network', username: 'Username', url: 'Profile URL' }[key], profile[key] ?? '', value => { profile[key] = value; }, { type: key === 'url' ? 'url' : 'text' });
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = 'Remove profile';
    remove.setAttribute('aria-label', `Remove profile ${index + 1}`);
    remove.addEventListener('click', () => {
      if (Object.values(profile).some(value => typeof value === 'string' && value.trim()) && !window.confirm('Remove this profile from the draft? The file changes only when you save.')) return;
      session!.draft.profiles.splice(index, 1);
      renderProfiles();
      renderState();
      addProfile.focus();
    });
    group.append(legend, grid, remove);
    profileContainer.append(group);
  });
}
function renderForm() {
  const basics = document.querySelector<HTMLElement>('#basic-inputs')!;
  const location = document.querySelector<HTMLElement>('#location-inputs')!;
  basics.replaceChildren();
  location.replaceChildren();
  const fields: { key: Exclude<keyof BasicsDraft, 'location' | 'profiles'>; label: string; type?: string; autocomplete?: string; multiline?: boolean; placeholder?: string }[] = [
    { key: 'firstName', label: 'First name', autocomplete: 'given-name' },
    { key: 'lastName', label: 'Last name', autocomplete: 'family-name' },
    { key: 'label', label: 'Professional title', placeholder: 'e.g. Java Developer', autocomplete: 'organization-title' },
    { key: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
    { key: 'phoneCountryCode', label: 'Phone country code', type: 'tel', placeholder: 'e.g. +49', autocomplete: 'tel-country-code' },
    { key: 'phoneNumber', label: 'Phone number (without country code)', type: 'tel', autocomplete: 'tel-national' },
    { key: 'url', label: 'Website', type: 'url', autocomplete: 'url' },
    { key: 'summary', label: 'About you', multiline: true },
  ];
  for (const field of fields) {
    inputField(basics, field.key, field.label, session!.draft[field.key], value => { session!.draft[field.key] = value; }, field);
  }
  const labels = { address: 'Street address', postalCode: 'Postal code', city: 'City', country: 'Country', region: 'Region / state' };
  for (const key of locationFields) {
    inputField(location, key, labels[key], session!.draft.location[key], value => { session!.draft.location[key] = value; }, { multiline: key === 'address' });
  }
  filename.value = session!.filename;
  documentEditor(document.querySelector<HTMLElement>('#document-inputs')!, session!, folder!, renderState, value => { busy = value; renderState(); });
  renderProfiles();
  proficiencyEditor(document.querySelector<HTMLElement>('#skills-inputs')!, document.querySelector<HTMLButtonElement>('#add-skill')!, session!.skills, newSkillDraft, { singular: 'Skill', plural: 'Skills', levels: skillLevels }, renderState);
  proficiencyEditor(document.querySelector<HTMLElement>('#languages-inputs')!, document.querySelector<HTMLButtonElement>('#add-language')!, session!.languages, newLanguageDraft, { singular: 'Language', plural: 'Languages', levels: languageLevels }, renderState);
  workForm = workEditor(document.querySelector<HTMLElement>('#work-inputs')!, document.querySelector<HTMLButtonElement>('#add-work')!, session!.work, renderState);
  educationForm = educationEditor(document.querySelector<HTMLElement>('#education-inputs')!, document.querySelector<HTMLButtonElement>('#add-education')!, session!.education, renderState);
  optionalForm = optionalSectionsEditor(document.querySelector<HTMLElement>('#optional-sections')!, document.querySelector<HTMLElement>('#section-controls')!, document.querySelector<HTMLButtonElement>('#add-section')!, document.querySelector<HTMLElement>('#section-menu')!, session!.optional, renderState);
  form.hidden = false;
  renderState();
}
async function checkAccess() {
  if (!folder) return;
  const state = await inspectWorkspace(folder);
  connected = state === 'connected';
  access.textContent = workspaceMessage(state);
  access.dataset.state = connected ? 'info' : 'error';
}
async function openSession() {
  if (session || loadingFailed || !connected || !folder) return;
  try {
    entries = (await listEntries(folder)).map(entry => entry.name);
    const file = new URLSearchParams(window.location.search).get('file');
    session = file
      ? new ResumeSession(file.slice(0, -5), await readResume(folder, file))
      : new ResumeSession(suggestedFilename(entries));
    renderForm();
  } catch (error) { loadingFailed = true; showError(error); }
}
async function initialize() {
  try {
    folder = await loadWorkspace();
    if (!folder) {
      access.textContent = 'Choose a folder on the workspace page before creating a resume.';
      return;
    }
    workspace.textContent = `Workspace: ${folder.name}`;
    await checkAccess();
    await openSession();
  } catch (error) { showError(error); }
  finally { busy = false; renderState(); }
}
filename.addEventListener('input', () => { if (session) session.filename = filename.value; renderState(); });
addProfile.addEventListener('click', () => {
  session!.draft.profiles.push({});
  renderProfiles();
  renderState();
  profileContainer.querySelector<HTMLInputElement>(`#profile-${session!.draft.profiles.length - 1}-network`)?.focus();
});
reconnect.addEventListener('click', async () => {
  if (!folder || busy) return;
  busy = true;
  renderState();
  try {
    const state = await reconnectWorkspace(folder);
    connected = state === 'connected';
    access.textContent = workspaceMessage(state);
    access.dataset.state = connected ? 'info' : 'error';
    await openSession();
  } catch (error) { connected = false; showError(error); }
  finally { busy = false; renderState(); }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!folder || !session || busy) return;
  if (filenameError(session.filename)) { renderState(); filename.focus(); return; }
  if (workForm?.focusFirstError() || educationForm?.focusFirstError() || optionalForm?.focusFirstError()) return;
  busy = true;
  errorBox.hidden = true;
  renderState();
  try {
    // Serialize writes from extension pages; each write still checks the actual file on disk.
    await navigator.locks.request('cvlization-resume-write', async () => {
      await checkAccess();
      if (!connected) throw new Error('Reconnect your folder before saving. Your draft is still here.');
      await session!.save((base, resume, original, documents) => writeResumeWithDocuments(folder!, base, resume, original, documents));
    });
    saveFailed = false;
    const destination = new URL('dashboard.html', window.location.href);
    destination.searchParams.set('saved', session.original!.filename);
    leaving = true;
    window.location.assign(destination.href);
  } catch (error) {
    saveFailed = true;
    showError(error);
    try { await checkAccess(); } catch { connected = false; }
  } finally { busy = false; renderState(); }
});
window.addEventListener('focus', async () => {
  if (!folder || busy) return;
  try { await checkAccess(); } catch { connected = false; }
  renderState();
});
// Basic warnings complement explicit Save. Recovery after a crash/reload is a later task.
let leaving = false;
document.querySelectorAll<HTMLAnchorElement>('[data-leave]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (busy && session) { event.preventDefault(); return; }
    if (session?.dirty && !window.confirm('Leave this page and discard unsaved changes?')) { event.preventDefault(); return; }
    leaving = true;
  });
});
window.addEventListener('beforeunload', event => {
  if (!leaving && (session?.dirty || (busy && session))) {
    event.preventDefault();
    event.returnValue = '';
  }
});
void initialize();
