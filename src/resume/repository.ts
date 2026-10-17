import { assertAvailable } from './filenames';
import { parseResume } from './model';
import type { Resume } from './model';

export interface SavedResume {
  filename: string;
  text: string;
  resume: Resume;
  handle: FileSystemFileHandle;
}
export interface WorkspaceEntry { name: string; kind: 'file' | 'directory' }
export async function listEntries(folder: FileSystemDirectoryHandle): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];
  for await (const handle of folder.values()) entries.push({ name: handle.name, kind: handle.kind });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
export async function readResume(folder: FileSystemDirectoryHandle, filename: string): Promise<SavedResume> {
  if (!filename || /[/\\]/.test(filename) || !filename.toLowerCase().endsWith('.json')) throw new Error('Choose a JSON file from your workspace.');
  const handle = await folder.getFileHandle(filename);
  const text = await (await handle.getFile()).text();
  return { filename, text, resume: parseResume(text), handle };
}

export async function writeResume(
  folder: FileSystemDirectoryHandle, base: string, resume: Resume, original?: SavedResume,
): Promise<SavedResume> {
  const entries = await listEntries(folder);
  assertAvailable(base, entries.map(entry => entry.name), original?.filename);
  const filename = `${base.trim()}.json`;
  const updating = original?.filename === filename;
  let handle: FileSystemFileHandle;
  if (updating) {
    handle = await folder.getFileHandle(filename);
    if (!await handle.isSameEntry(original.handle) || await (await handle.getFile()).text() !== original.text) {
      throw new Error('This file changed on disk since you opened it. Save under a different filename to keep your draft, or reopen the file.');
    }
  } else {
    handle = await folder.getFileHandle(filename, { create: true });
  }
  const text = `${JSON.stringify(resume, null, 2)}\n`;
  // File System Access commits its temporary write on close, not on each write call.
  let writer: FileSystemWritableFileStream | undefined;
  try {
    writer = await handle.createWritable();
    await writer.write(text);
    await writer.close();
  } catch (error) {
    await writer?.abort().catch(() => { /* Already closed or aborted. */ });
    // A failed first write can leave the newly created empty file behind. Remove
    // only that same empty entry, never an existing resume or externally filled file.
    if (!updating) {
      try {
        const current = await folder.getFileHandle(filename);
        if (await current.isSameEntry(handle) && (await current.getFile()).size === 0) {
          await folder.removeEntry(filename);
        }
      } catch { /* A missing file or lost permission must not mask the save failure. */ }
    }
    throw error;
  }
  return { filename, text, resume, handle };
}
