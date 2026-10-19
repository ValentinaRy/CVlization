import { captureName, parseAnnotations, parseCapture } from './model';
import type { Capture, Annotations } from './model';
import { listEntries } from '../resume/repository';
import { filenameKey } from '../resume/filenames';

async function write(folder: FileSystemDirectoryHandle, name: string, text: string) {
  const file = await folder.getFileHandle(name, { create: true });
  let stream: FileSystemWritableFileStream | undefined;
  try { stream = await file.createWritable(); await stream.write(text); await stream.close(); }
  catch (error) { await stream?.abort().catch(() => {}); throw error; }
}
export async function listCaptures(folder: FileSystemDirectoryHandle): Promise<string[]> {
  try { return (await listEntries(await folder.getDirectoryHandle('debug'))).filter(entry => entry.kind === 'directory').map(entry => entry.name); }
  catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return []; throw error; }
}
export async function saveCapture(folder: FileSystemDirectoryHandle, capture: Capture, html: string): Promise<string> {
  const name = captureName(capture.name);
  const root = await folder.getDirectoryHandle('debug', { create: true });
  if ((await listEntries(root)).some(entry => filenameKey(entry.name) === filenameKey(name))) throw new Error('A debug capture with this name already exists. Choose another name.');
  const directory = await root.getDirectoryHandle(name, { create: true });
  try {
    await write(directory, 'capture.json', JSON.stringify(capture, null, 2) + '\n');
    await write(directory, 'view.html', html);
    await write(directory, 'annotations.json', JSON.stringify({ schemaVersion: 1, captureId: capture.id, labels: {} }, null, 2) + '\n');
  } catch (error) {
    try { if (await (await root.getDirectoryHandle(name)).isSameEntry(directory)) await root.removeEntry(name, { recursive: true }); } catch { /* Preserve original error if cleanup loses access. */ }
    throw error;
  }
  return name;
}
export async function openCapture(folder: FileSystemDirectoryHandle, name: string) {
  const directory = await (await folder.getDirectoryHandle('debug')).getDirectoryHandle(captureName(name));
  const capture = parseCapture(await (await (await directory.getFileHandle('capture.json')).getFile()).text());
  const handle = await directory.getFileHandle('annotations.json');
  let baseline = await (await handle.getFile()).text();
  const annotations = parseAnnotations(baseline, capture);
  return {
    capture, annotations,
    async save(labels: Annotations['labels']) {
      const current = await directory.getFileHandle('annotations.json');
      if (!await current.isSameEntry(handle) || await (await current.getFile()).text() !== baseline) throw new Error('Annotations changed on disk. Reopen the capture to load them; your unsaved labels remain here.');
      const text = JSON.stringify({ schemaVersion: 1, captureId: capture.id, labels }, null, 2) + '\n';
      parseAnnotations(text, capture);
      await write(directory, 'annotations.json', text);
      baseline = text;
    },
  };
}
