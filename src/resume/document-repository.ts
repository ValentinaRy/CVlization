import { applyDocuments, documentKinds, documentPathParts } from './documents';
import type { DocumentsDraft, DocumentKind, LocalDocument } from './documents';
import { assertAvailable } from './filenames';
import type { Resume } from './model';
import { listEntries, writeResume } from './repository';
import type { SavedResume } from './repository';

export async function readDocument(folder: FileSystemDirectoryHandle, path: string): Promise<File> {
  const parts = documentPathParts(path);
  let directory = folder;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  return (await directory.getFileHandle(parts.at(-1)!)).getFile();
}

export async function writeResumeWithDocuments(
  folder: FileSystemDirectoryHandle, base: string, resume: Resume, original: SavedResume | undefined, draft: DocumentsDraft,
): Promise<SavedResume> {
  assertAvailable(base, (await listEntries(folder)).map(entry => entry.name), original?.filename);
  const copying = !!original && original.filename !== `${base.trim()}.json`;
  const references: Partial<Record<DocumentKind, LocalDocument>> = {};
  const pending: { kind: DocumentKind; blob: Blob; id: string; name: string }[] = [];
  for (const kind of documentKinds) {
    const selection = draft[kind];
    if (!selection) continue;
    if (selection.pending || (copying && selection.reference)) {
      const blob = selection.pending?.blob ?? await readDocument(folder, selection.reference!.path);
      pending.push({ kind, blob, id: crypto.randomUUID(), name: `${base.trim()}.${kind === 'resume' ? 'pdf' : 'jpg'}` });
    } else if (selection.reference) references[kind] = selection.reference;
  }
  if (!pending.length) return writeResume(folder, base, applyDocuments(resume, references), original);

  const batchId = crypto.randomUUID();
  for (const item of pending) {
    references[item.kind] = {
      id: item.id, path: `documents/${batchId}/${item.name}`,
      mediaType: item.kind === 'resume' ? 'application/pdf' : 'image/jpeg', size: item.blob.size,
    };
  }
  // Check metadata compatibility before creating files.
  const updated = applyDocuments(resume, references);
  const documents = await folder.getDirectoryHandle('documents', { create: true });
  // Never reuse an existing directory, even in the extremely unlikely event of an ID collision.
  if ((await listEntries(documents)).some(entry => entry.name === batchId)) throw new Error('Attachment folder already exists. Please save again.');
  const batch = await documents.getDirectoryHandle(batchId, { create: true });
  try {
    for (const item of pending) {
      const handle = await batch.getFileHandle(item.name, { create: true });
      let writer: FileSystemWritableFileStream | undefined;
      try {
        writer = await handle.createWritable();
        await writer.write(item.blob);
        await writer.close();
      } catch (error) {
        await writer?.abort().catch(() => {});
        throw error;
      }
    }
    // Publish references last. A failed save leaves the previous JSON and its files intact.
    return await writeResume(folder, base, updated, original);
  } catch (error) {
    // Only this save's new directory is eligible for rollback, never old attachments.
    try {
      const current = await documents.getDirectoryHandle(batchId);
      if (await current.isSameEntry(batch)) await documents.removeEntry(batchId, { recursive: true });
    } catch { /* Lost permission must not mask the original error. */ }
    throw error;
  }
}
