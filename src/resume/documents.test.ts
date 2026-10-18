import { describe, expect, it } from 'vitest';
import { applyDocuments, documentPathParts, documentsToDraft, validateSource } from './documents';
import { newResume } from './model';
import { ResumeSession } from './session';
import type { SavedResume } from './repository';

const reference = { id: 'photo-id', path: 'documents/batch/resume.jpg', mediaType: 'image/jpeg' as const, size: 123 };
const saved = (): SavedResume => {
  const resume = { ...newResume(), documents: { photo: reference, diploma: 'documents/diploma.pdf' } };
  return { filename: 'resume.json', resume, text: JSON.stringify(resume), handle: {} as FileSystemFileHandle };
};
describe('local attachment data', () => {
  it('preserves unrelated metadata and legacy image values', () => {
    const resume = saved().resume;
    resume.basics.image = 'https://example.com/previous.jpg';
    const updated = applyDocuments(resume, { photo: { ...reference, size: 456 } });
    expect(updated.documents).toEqual({ photo: { ...reference, size: 456 }, diploma: 'documents/diploma.pdf' });
    expect(updated.basics.image).toBe(resume.basics.image);
    expect(resume.documents).toEqual(saved().resume.documents);
    expect(applyDocuments(updated, {}).documents).toEqual({ diploma: 'documents/diploma.pdf' });
  });
  it('preserves custom registries without silently replacing them when attaching a file', () => {
    const resume = { ...newResume(), documents: [{ path: 'documents/legacy.pdf' }] };
    expect(documentsToDraft(resume)).toEqual({});
    expect(applyDocuments(resume, {})).toBe(resume);
    expect(() => applyDocuments(resume, { photo: reference })).toThrow('custom documents format');
  });
  it.each(['../private.jpg', '/documents/file.jpg', 'documents/../secret', 'documents//file.jpg', 'documents/a\\b', 'https://example.com/a', 'documents/./a', 'documents/a\u0000b'])('rejects unsafe reference %s', path => {
    expect(() => documentPathParts(path)).toThrow('inside');
  });
  it('rejects malformed known document fields', () => {
    expect(() => documentsToDraft({ ...newResume(), documents: { photo: { path: reference.path } } })).toThrow('reference is invalid');
    expect(() => documentsToDraft({ ...newResume(), documents: { photo: { ...reference, size: -1 } } })).toThrow('reference is invalid');
  });
  it('accepts PDF and photo signatures even when OS media type is absent', async () => {
    await expect(validateSource(new File(['%PDF-1.7\n'], 'CV.PDF'), 'resume')).resolves.toBeUndefined();
    await expect(validateSource(new File([new Uint8Array([255, 216, 255, 224])], 'photo.JPEG'), 'photo')).resolves.toBeUndefined();
    await expect(validateSource(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'photo.png'), 'photo')).resolves.toBeUndefined();
  });
  it('rejects empty, renamed, or unsupported input files', async () => {
    await expect(validateSource(new File([], 'empty.pdf'), 'resume')).rejects.toThrow('PDF');
    await expect(validateSource(new File(['<html>'], 'fake.pdf', { type: 'application/pdf' }), 'resume')).rejects.toThrow('PDF');
    await expect(validateSource(new File(['<svg/>'], 'photo.jpg', { type: 'image/jpeg' }), 'photo')).rejects.toThrow('PNG or JPEG');
    await expect(validateSource(new File(['GIF89a'], 'photo.gif'), 'photo')).rejects.toThrow('PNG or JPEG');
  });
});

describe('attachment draft lifecycle', () => {
  it('opens without a false dirty state; removal changes only the draft', () => {
    const original = saved();
    const session = new ResumeSession('resume', original);
    expect(session.dirty).toBe(false);
    delete session.documents.photo;
    expect(session.dirty).toBe(true);
    expect(original.resume.documents).toHaveProperty('photo', reference);
  });
  it('tracks replacements with identical sizes and names, keeps failures, and resets after save', async () => {
    const session = new ResumeSession('resume', saved());
    session.documents.photo = { pending: { id: 'first', blob: new Blob(['abc']), sourceName: 'photo.jpg' } };
    await expect(session.save(async () => { throw new Error('Disk full'); })).rejects.toThrow('Disk full');
    expect(session.documents.photo.pending?.id).toBe('first');
    expect(session.dirty).toBe(true);
    await session.save(async (base, resume, original, documents) => {
      expect(documents.photo?.pending?.blob.size).toBe(3);
      expect(base).toBe('resume');
      return { ...original!, resume: applyDocuments(resume, { photo: reference }) };
    });
    expect(session.dirty).toBe(false);
    expect(session.documents.photo?.pending).toBeUndefined();
    session.documents.photo = { pending: { id: 'second', blob: new Blob(['def']), sourceName: 'photo.jpg' } };
    expect(session.dirty).toBe(true);
  });
  it('compares later edits with the normalized saved baseline', async () => {
    const session = new ResumeSession('resume', saved());
    session.documents.photo = { pending: { id: 'new', blob: new Blob(['abc']), sourceName: 'photo.jpg' } };
    let finish!: () => void;
    const pending = session.save((_base, resume, original) => new Promise(resolve => {
      finish = () => resolve({ ...original!, resume: applyDocuments(resume, { photo: reference }) });
    }));
    session.draft.firstName = 'Later edit';
    finish();
    await pending;
    expect(session.dirty).toBe(true);
    session.draft.firstName = '';
    expect(session.dirty).toBe(false);
  });
});
