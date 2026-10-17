import { describe, expect, it, vi } from 'vitest';
import { newResume } from './model';
import { listEntries, readResume, writeResume } from './repository';

function memoryFolder() {
  const files = new Map<string, { text: string; handle: FileSystemFileHandle }>();
  const directories = new Set<string>();
  const fail = { open: false, write: false, close: false };
  const aborted = vi.fn(async () => {});
  const put = (name: string, text: string) => {
    const entry = { text, handle: undefined as unknown as FileSystemFileHandle };
    entry.handle = {
      name, kind: 'file',
      getFile: async () => new File([entry.text], name),
      isSameEntry: async (other: FileSystemHandle) => other === entry.handle,
      createWritable: async () => {
        if (fail.open) throw new Error('Write denied');
        let pending = '';
        return {
          write: async (value: string) => { if (fail.write) throw new Error('Disk full'); pending = value; },
          close: async () => { if (fail.close) throw new Error('Commit failed'); entry.text = pending; },
          abort: aborted,
        } as unknown as FileSystemWritableFileStream;
      },
    } as FileSystemFileHandle;
    files.set(name, entry);
    return entry;
  };
  const folder = {
    async *values() {
      for (const entry of files.values()) yield entry.handle;
      for (const name of directories) yield { kind: 'directory', name };
    },
    getFileHandle: vi.fn(async (name: string, options?: FileSystemGetFileOptions) => {
      if (directories.has(name)) throw new DOMException('Directory', 'TypeMismatchError');
      const entry = files.get(name);
      if (entry) return entry.handle;
      if (options?.create) return put(name, '').handle;
      throw new DOMException('Missing', 'NotFoundError');
    }),
    removeEntry: vi.fn(async (name: string) => { files.delete(name); }),
  } as unknown as FileSystemDirectoryHandle;
  return { folder, files, directories, fail, aborted, put };
}

describe('local resume persistence', () => {
  it('creates only on explicit write and reads fresh data from disk', async () => {
    const { folder, files, put } = memoryFolder();
    expect(await listEntries(folder)).toEqual([]);
    expect(files.size).toBe(0);
    const result = await writeResume(folder, 'resume', newResume('alex'));
    expect(result.filename).toBe('resume.json');
    expect((await readResume(folder, result.filename)).resume.id).toBe('alex');
    put('resume.json', JSON.stringify({ schemaVersion: 1, id: 'changed', basics: { firstName: 'Taylor' } }));
    expect((await readResume(folder, result.filename)).resume.id).toBe('changed');
  });
  it('refuses collisions with files or directories, including case aliases', async () => {
    const { folder, put, files, directories } = memoryFolder();
    put('Resume.json', 'unrelated file');
    directories.add('another.json');
    await expect(writeResume(folder, 'resume', newResume())).rejects.toThrow('already exists');
    await expect(writeResume(folder, 'another', newResume())).rejects.toThrow('already exists');
    expect(files.get('Resume.json')!.text).toBe('unrelated file');
  });
  it('detects external edits and replacement even when replacement content matches', async () => {
    const m = memoryFolder();
    const saved = await writeResume(m.folder, 'resume', newResume());
    m.files.get(saved.filename)!.text = 'external edit';
    await expect(writeResume(m.folder, 'resume', newResume(), saved)).rejects.toThrow('changed on disk');
    m.put(saved.filename, saved.text);
    await expect(writeResume(m.folder, 'resume', newResume(), saved)).rejects.toThrow('changed on disk');
    expect(m.files.get(saved.filename)!.text).toBe(saved.text);
  });
  it('does not silently recreate a missing original file', async () => {
    const m = memoryFolder();
    const saved = await writeResume(m.folder, 'resume', newResume());
    m.files.delete(saved.filename);
    await expect(writeResume(m.folder, 'resume', newResume(), saved)).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(m.files.size).toBe(0);
  });
  it.each(['open', 'write', 'close'] as const)('keeps the original file when %s fails', async failure => {
    const m = memoryFolder();
    const saved = await writeResume(m.folder, 'resume', newResume('before'));
    m.fail[failure] = true;
    await expect(writeResume(m.folder, 'resume', newResume('after'), saved)).rejects.toThrow();
    expect(m.files.get(saved.filename)!.text).toBe(saved.text);
    expect(m.folder.removeEntry).not.toHaveBeenCalled();
    if (failure !== 'open') expect(m.aborted).toHaveBeenCalled();
  });
  it.each(['open', 'write', 'close'] as const)('removes only the empty newly created file after %s fails, allowing retry', async failure => {
    const m = memoryFolder();
    m.fail[failure] = true;
    await expect(writeResume(m.folder, 'resume', newResume())).rejects.toThrow();
    expect(m.files.size).toBe(0);
    m.fail[failure] = false;
    await writeResume(m.folder, 'resume', newResume());
    expect(m.files.size).toBe(1);
  });
  it('fails on invalid JSON without creating or modifying any file', async () => {
    const m = memoryFolder();
    m.put('broken.json', '{broken');
    await expect(readResume(m.folder, 'broken.json')).rejects.toThrow('not valid JSON');
    expect(m.files.get('broken.json')!.text).toBe('{broken');
    expect(m.folder.removeEntry).not.toHaveBeenCalled();
  });
});
