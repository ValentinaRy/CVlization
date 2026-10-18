import { describe, expect, it } from 'vitest';
import { listCaptures, openCapture, saveCapture } from './repository';
import { fixture } from './test-fixtures';

function filesystem() {
  interface Entry { handle: FileSystemHandle; children?: Map<string, Entry>; text?: string }
  let shouldFail = (_path: string, _stage: string) => false;
  const missing = () => new DOMException('Missing', 'NotFoundError');
  function directory(name: string, path: string): Entry {
    const children = new Map<string, Entry>();
    const handle = {
      kind: 'directory', name,
      async *values() { for (const child of children.values()) yield child.handle; },
      isSameEntry: async (other: FileSystemHandle) => other === handle,
      getDirectoryHandle: async (child: string, options?: FileSystemGetDirectoryOptions) => {
        let entry = children.get(child);
        if (!entry && options?.create) { entry = directory(child, `${path}${child}/`); children.set(child, entry); }
        if (!entry) throw missing();
        if (!entry.children) throw new DOMException('File', 'TypeMismatchError');
        return entry.handle;
      },
      getFileHandle: async (child: string, options?: FileSystemGetFileOptions) => {
        let entry = children.get(child);
        if (!entry && options?.create) { entry = file(child, `${path}${child}`); children.set(child, entry); }
        if (!entry) throw missing();
        if (entry.children) throw new DOMException('Directory', 'TypeMismatchError');
        return entry.handle;
      },
      removeEntry: async (child: string) => { children.delete(child); },
    } as unknown as FileSystemDirectoryHandle;
    return { handle, children };
  }
  function file(name: string, path: string): Entry {
    const entry: Entry = { handle: undefined!, text: '' };
    const handle = {
      kind: 'file', name, isSameEntry: async (other: FileSystemHandle) => other === handle,
      getFile: async () => new File([entry.text!], name),
      createWritable: async () => {
        if (shouldFail(path, 'open')) throw new Error('Access denied');
        let pending = '';
        return {
          write: async (text: string) => { if (shouldFail(path, 'write')) throw new Error('Disk full'); pending = text; },
          close: async () => { if (shouldFail(path, 'close')) throw new Error('Commit failed'); entry.text = pending; },
          abort: async () => {},
        };
      },
    } as unknown as FileSystemFileHandle;
    entry.handle = handle; return entry;
  }
  const root = directory('workspace', '');
  return {
    folder: root.handle as FileSystemDirectoryHandle,
    entry: (path: string) => path.split('/').reduce((node, name) => node.children!.get(name)!, root),
    fail: (predicate: typeof shouldFail) => { shouldFail = predicate; },
  };
}
describe('debug capture and annotation files', () => {
  it('lists an empty workspace without creating directories', async () => {
    const fs = filesystem(); expect(await listCaptures(fs.folder)).toEqual([]); expect(fs.entry('debug')).toBeUndefined();
  });
  it('round trips the named bundle and changes only annotations when labeling', async () => {
    const fs = filesystem(); const capture = fixture();
    const name = await saveCapture(fs.folder, capture, '<html>inert example</html>');
    expect(await listCaptures(fs.folder)).toEqual([capture.name]);
    const sourceBefore = fs.entry(`debug/${name}/capture.json`).text;
    const viewBefore = fs.entry(`debug/${name}/view.html`).text;
    const opened = await openCapture(fs.folder, name);
    expect(opened.capture).toEqual(capture); expect(opened.annotations.labels).toEqual({});
    await opened.save({ e1: { meaning: 'work.startDate', kind: 'date', record: 3 } });
    expect((await openCapture(fs.folder, name)).annotations.labels.e1).toEqual({ meaning: 'work.startDate', kind: 'date', record: 3 });
    expect(fs.entry(`debug/${name}/capture.json`).text).toBe(sourceBefore);
    expect(fs.entry(`debug/${name}/view.html`).text).toBe(viewBefore);
  });
  it('rejects case-insensitive collisions without touching the existing capture', async () => {
    const fs = filesystem(); const capture = fixture();
    await saveCapture(fs.folder, capture, 'original');
    await expect(saveCapture(fs.folder, { ...capture, name: capture.name.toUpperCase() }, 'replacement')).rejects.toThrow('already exists');
    expect(fs.entry(`debug/${capture.name}/view.html`).text).toBe('original');
  });
  it.each(['open', 'write', 'close'])('rolls back only the new bundle after %s failure and allows retry', async stage => {
    const fs = filesystem(); const capture = fixture();
    await saveCapture(fs.folder, { ...capture, name: 'Old page' }, 'old');
    fs.fail((path, step) => path.endsWith('annotations.json') && step === stage);
    await expect(saveCapture(fs.folder, capture, 'new')).rejects.toThrow();
    expect(await listCaptures(fs.folder)).toEqual(['Old page']);
    fs.fail(() => false); await saveCapture(fs.folder, capture, 'new');
    expect((await listCaptures(fs.folder)).length).toBe(2);
  });
  it('keeps previous labels after a failed commit and retries against the same baseline', async () => {
    const fs = filesystem(); const capture = fixture(); await saveCapture(fs.folder, capture, 'view');
    const opened = await openCapture(fs.folder, capture.name);
    const before = fs.entry(`debug/${capture.name}/annotations.json`).text;
    fs.fail((path, stage) => path.endsWith('annotations.json') && stage === 'close');
    await expect(opened.save({ e1: { meaning: 'basics.email', kind: 'text' } })).rejects.toThrow('Commit failed');
    expect(fs.entry(`debug/${capture.name}/annotations.json`).text).toBe(before);
    fs.fail(() => false); await opened.save({ e1: { meaning: 'basics.email', kind: 'text' } });
    expect((await openCapture(fs.folder, capture.name)).annotations.labels.e1?.meaning).toBe('basics.email');
  });
  it('detects an external annotation change and keeps the newer disk content', async () => {
    const fs = filesystem(); const capture = fixture(); await saveCapture(fs.folder, capture, 'view');
    const first = await openCapture(fs.folder, capture.name); const second = await openCapture(fs.folder, capture.name);
    await first.save({ e1: { meaning: 'basics.firstName', kind: 'text' } });
    await expect(second.save({ e1: { meaning: 'basics.email', kind: 'text' } })).rejects.toThrow('changed on disk');
    expect((await openCapture(fs.folder, capture.name)).annotations.labels.e1?.meaning).toBe('basics.firstName');
  });
  it('refuses invalid paths and corrupt captures without overwriting them', async () => {
    const fs = filesystem(); const capture = fixture(); await saveCapture(fs.folder, capture, 'view');
    await expect(openCapture(fs.folder, '../secret')).rejects.toThrow();
    fs.entry(`debug/${capture.name}/capture.json`).text = '{broken';
    await expect(openCapture(fs.folder, capture.name)).rejects.toThrow();
    expect(fs.entry(`debug/${capture.name}/capture.json`).text).toBe('{broken');
  });
});
