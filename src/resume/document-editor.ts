import { documentKinds, validateSource } from './documents';
import type { DocumentKind } from './documents';
import { readDocument } from './document-repository';
import { preparePhoto } from './photo';
import type { ResumeSession } from './session';

export function documentEditor(
  container: HTMLElement, session: ResumeSession, folder: FileSystemDirectoryHandle,
  changed: () => void, setBusy: (busy: boolean) => void,
) {
  const urls = new Map<DocumentKind, string>();
  const release = (kind: DocumentKind) => {
    const url = urls.get(kind);
    if (url) URL.revokeObjectURL(url);
    urls.delete(kind);
  };
  window.addEventListener('pagehide', () => documentKinds.forEach(release));
  for (const kind of documentKinds) {
    const group = document.createElement('fieldset');
    group.className = 'document-entry';
    const legend = document.createElement('legend');
    legend.textContent = kind === 'resume' ? 'Resume PDF' : 'Photo';
    const label = document.createElement('label');
    label.htmlFor = `document-${kind}`;
    label.textContent = kind === 'resume' ? 'Choose or replace PDF' : 'Choose or replace photo (PNG / JPEG)';
    const input = document.createElement('input');
    input.type = 'file';
    input.id = label.htmlFor;
    input.accept = kind === 'resume' ? '.pdf,application/pdf' : '.png,.jpg,.jpeg,image/png,image/jpeg';
    const info = document.createElement('p');
    info.className = 'note document-path';
    info.setAttribute('role', 'status');
    const error = document.createElement('p');
    error.className = 'note';
    error.dataset.state = 'error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'secondary';
    preview.textContent = 'Preview';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary danger';
    remove.textContent = 'Remove attachment';
    const content = document.createElement('div');
    content.className = 'document-preview';
    const clearPreview = () => { content.replaceChildren(); release(kind); };
    const render = () => {
      const selection = session.documents[kind];
      const bytes = selection?.pending?.blob.size ?? selection?.reference?.size;
      info.textContent = selection?.pending
        ? `${selection.pending.sourceName} · ${(bytes! / 1_000_000).toFixed(2)} MB · ready to copy on Save`
        : selection?.reference ? `${selection.reference.path} · ${(bytes! / 1_000_000).toFixed(2)} MB` : 'No file attached.';
      preview.hidden = remove.hidden = !selection;
    };
    const showError = (value: unknown) => {
      error.hidden = false;
      error.textContent = value instanceof DOMException && value.name === 'NotFoundError'
        ? 'This attachment is missing. Restore it on disk, choose a replacement, or remove the attachment.'
        : value instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(value.name)
          ? 'Folder access is unavailable. Reconnect your workspace and try again.'
          : value instanceof Error ? value.message : 'Could not read this file. Please try again.';
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      error.hidden = true;
      info.textContent = kind === 'photo' ? 'Preparing JPEG photo…' : 'Checking PDF…';
      try {
        const blob = kind === 'photo' ? await preparePhoto(file) : (await validateSource(file, kind), file);
        session.documents[kind] = { pending: { id: crypto.randomUUID(), blob, sourceName: file.name } };
        clearPreview();
        changed();
      } catch (value) { showError(value); }
      finally { input.value = ''; render(); setBusy(false); }
    });
    preview.addEventListener('click', async () => {
      setBusy(true);
      error.hidden = true;
      try {
        const selection = session.documents[kind]!;
        const file = selection.pending?.blob ?? await readDocument(folder, selection.reference!.path);
        clearPreview();
        // Use the expected media type even when a filesystem implementation omits it.
        const url = URL.createObjectURL(new Blob([file], { type: kind === 'photo' ? 'image/jpeg' : 'application/pdf' }));
        urls.set(kind, url);
        if (kind === 'photo') {
          const image = document.createElement('img');
          image.src = url;
          image.alt = 'Resume photo preview';
          content.append(image);
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'Open PDF preview in a new tab';
          content.append(link);
        }
      } catch (value) { showError(value); }
      finally { setBusy(false); }
    });
    remove.addEventListener('click', () => {
      delete session.documents[kind];
      clearPreview();
      error.hidden = true;
      render();
      changed();
      input.focus();
    });
    actions.append(preview, remove);
    group.append(legend, label, input, info, error, actions, content);
    container.append(group);
    render();
  }
}
