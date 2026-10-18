import { describe, expect, it } from 'vitest';
import { readDocument, writeResumeWithDocuments } from './document-repository';
import { documentsToDraft } from './documents';
import type { DocumentsDraft } from './documents';
import { newResume } from './model';
import { readResume } from './repository';

// In-memory File System Access adapter: writes become visible only on close.
function filesystem() {
  interface Entry { handle: FileSystemHandle; children?: Map<string, Entry>; blob?: Blob }
  let fail: (path: string, stage: string) => boolean = () => false;
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
    const entry: Entry = { handle: undefined!, blob: new Blob() };
    const handle = {
      kind: 'file', name,
      isSameEntry: async (other: FileSystemHandle) => other === handle,
      getFile: async () => new File([entry.blob!], name),
      createWritable: async () => {
        if (fail(path, 'open')) throw new Error('Write denied');
        let pending: Blob;
        return {
          write: async (data: string | Blob) => { if (fail(path, 'write')) throw new Error('Disk full'); pending = new Blob([data]); },
          close: async () => { if (fail(path, 'close')) throw new Error('Commit failed'); entry.blob = pending; },
          abort: async () => {},
        };
      },
    } as unknown as FileSystemFileHandle;
    entry.handle = handle;
    return entry;
  }
  const root = directory('workspace', '');
  function entry(path: string) { return path.split('/').reduce((node, name) => node.children!.get(name)!, root); }
  function paths(node = root, prefix = ''): string[] {
    return [...node.children!].flatMap(([name, child]) => child.children ? paths(child, `${prefix}${name}/`) : [`${prefix}${name}`]);
  }
  return { folder: root.handle as FileSystemDirectoryHandle, entry, paths, fail: (predicate: typeof fail) => { fail = predicate; } };
}
function chosen(): DocumentsDraft {
  return {
    resume: { pending: { id: 'pdf', sourceName: 'original.pdf', blob: new Blob(['%PDF-1.7\nfictional fixture'], { type: 'application/pdf' }) } },
    photo: { pending: { id: 'photo', sourceName: 'original.png', blob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }) } },
  };
}

describe('attachment persistence', () => {
  it('copies exactly one PDF and optimized photo, names them after the trimmed resume, and restores relative references', async () => {
    const fs = filesystem();
    const draft = chosen();
    const result = await writeResumeWithDocuments(fs.folder, ' Resume, Java. ', newResume(), undefined, draft);
    const restored = documentsToDraft((await readResume(fs.folder, result.filename)).resume);
    expect(restored.resume?.reference?.path).toMatch(/^documents\/[^/]+\/Resume, Java\.\.pdf$/);
    expect(restored.photo?.reference?.path).toMatch(/^documents\/[^/]+\/Resume, Java\.\.jpg$/);
    const pdf = await readDocument(fs.folder, restored.resume!.reference!.path);
    expect(await pdf.text()).toBe(await draft.resume!.pending!.blob.text());
    const photo = await readDocument(fs.folder, restored.photo!.reference!.path);
    expect(await photo.arrayBuffer()).toEqual(await draft.photo!.pending!.blob.arrayBuffer());
    expect(restored.photo?.reference?.size).toBe(photo.size);
    expect(fs.paths()).toHaveLength(3);
    expect(fs.paths().some(path => /original|\.png$/.test(path))).toBe(false);
  });
  it('creates no documents folder for a resume without attachments', async () => {
    const fs = filesystem();
    await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, {});
    expect(fs.entry('documents')).toBeUndefined();
  });
  it('does not duplicate unchanged files and preserves unrelated document metadata', async () => {
    const fs = filesystem();
    const resume = { ...newResume(), documents: { diploma: 'documents/diploma.pdf' } };
    const original = await writeResumeWithDocuments(fs.folder, 'resume', resume, undefined, chosen());
    const before = fs.paths();
    const updated = await writeResumeWithDocuments(fs.folder, 'resume', original.resume, original, documentsToDraft(original.resume));
    expect(fs.paths()).toEqual(before);
    expect(updated.resume.documents).toEqual(original.resume.documents);
  });
  it('gives a copied resume its own files with the new basename', async () => {
    const fs = filesystem();
    const original = await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen());
    const copy = await writeResumeWithDocuments(fs.folder, 'second', { ...original.resume, id: 'second' }, original, documentsToDraft(original.resume));
    const refs = documentsToDraft(copy.resume);
    expect(refs.resume?.reference?.path).toMatch(/\/second.pdf$/);
    expect(refs.photo?.reference?.path).toMatch(/\/second.jpg$/);
    expect(refs.photo?.reference?.id).not.toBe(documentsToDraft(original.resume).photo?.reference?.id);
    expect((await readResume(fs.folder, 'resume.json')).text).toBe(original.text);
    expect(fs.paths()).toHaveLength(6);
  });
  it.each(['open', 'write', 'close'])('keeps the saved resume and files intact after attachment %s failure', async stage => {
    const fs = filesystem();
    const original = await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen());
    const before = fs.paths();
    fs.fail((path, step) => path.endsWith('.jpg') && step === stage);
    await expect(writeResumeWithDocuments(fs.folder, 'resume', original.resume, original, chosen())).rejects.toThrow();
    expect(fs.paths()).toEqual(before);
    expect((await readResume(fs.folder, 'resume.json')).text).toBe(original.text);
    fs.fail(() => false);
    await expect(writeResumeWithDocuments(fs.folder, 'resume', original.resume, original, chosen())).resolves.toBeDefined();
  });
  it('rolls back new attachments when committing JSON fails, and allows retry', async () => {
    const fs = filesystem();
    fs.fail((path, stage) => path.endsWith('.json') && stage === 'close');
    await expect(writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen())).rejects.toThrow('Commit failed');
    expect(fs.paths()).toEqual([]);
    fs.fail(() => false);
    await expect(writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen())).resolves.toBeDefined();
  });
  it('rolls back new attachments if JSON was externally changed', async () => {
    const fs = filesystem();
    const original = await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen());
    const before = fs.paths();
    fs.entry('resume.json').blob = new Blob(['external change']);
    await expect(writeResumeWithDocuments(fs.folder, 'resume', original.resume, original, chosen())).rejects.toThrow('changed on disk');
    expect(fs.paths()).toEqual(before);
    expect(await fs.entry('resume.json').blob!.text()).toBe('external change');
  });
  it('detaches only the reference; previously saved copies stay available on disk', async () => {
    const fs = filesystem();
    const original = await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen());
    const before = fs.paths();
    const detached = await writeResumeWithDocuments(fs.folder, 'resume', original.resume, original, {});
    expect(detached.resume.documents).toBeUndefined();
    expect(fs.paths()).toEqual(before);
  });
  it('reports missing attachments for preview and copying without discarding ordinary form edits', async () => {
    const fs = filesystem();
    const original = await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen());
    const path = documentsToDraft(original.resume).photo!.reference!.path;
    const parts = path.split('/');
    fs.entry(parts.slice(0, -1).join('/')).children!.delete(parts.at(-1)!);
    await expect(readDocument(fs.folder, path)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(writeResumeWithDocuments(fs.folder, 'copy', { ...original.resume }, original, documentsToDraft(original.resume))).rejects.toMatchObject({ name: 'NotFoundError' });
    const edited = { ...original.resume, basics: { firstName: 'Updated' } };
    await expect(writeResumeWithDocuments(fs.folder, 'resume', edited, original, documentsToDraft(original.resume))).resolves.toHaveProperty('resume.basics.firstName', 'Updated');
  });
  it('refuses filename collisions and unsafe paths without creating attachments', async () => {
    const fs = filesystem();
    await writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, {});
    await expect(writeResumeWithDocuments(fs.folder, 'resume', newResume(), undefined, chosen())).rejects.toThrow('already exists');
    await expect(readDocument(fs.folder, 'documents/../../secret')).rejects.toThrow('inside');
    expect(fs.entry('documents')).toBeUndefined();
  });
});
