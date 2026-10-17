import { describe, expect, it, vi } from 'vitest';
import { newResume, toDraft } from './model';
import type { Resume } from './model';
import type { SavedResume } from './repository';
import { ResumeSession } from './session';

function saved(filename: string, resume: Resume): SavedResume {
  return { filename: `${filename}.json`, resume, text: JSON.stringify(resume), handle: {} as FileSystemFileHandle };
}
describe('explicit save lifecycle', () => {
  it('does not write on edit and marks saved only after persistence finishes', async () => {
    const session = new ResumeSession('resume');
    let finish!: () => void;
    const persist = vi.fn((base: string, resume: Resume) => new Promise<SavedResume>(resolve => { finish = () => resolve(saved(base, resume)); }));
    session.draft.firstName = 'Alex';
    expect(session.dirty).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    const saving = session.save(persist);
    expect(session.original).toBeUndefined();
    expect(session.saving).toBe(true);
    expect(session.dirty).toBe(true);
    await expect(session.save(persist)).rejects.toThrow('in progress');
    finish();
    await saving;
    expect(session.saving).toBe(false);
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.basics.name).toBe('Alex');
  });
  it('retains the draft and previous saved snapshot on failure, then allows retry', async () => {
    const original = saved('resume', newResume('existing'));
    const session = new ResumeSession('resume', original);
    session.draft.email = 'alex@example.com';
    await expect(session.save(async () => { throw new Error('Disk unavailable'); })).rejects.toThrow('Disk unavailable');
    expect(session.dirty).toBe(true);
    expect(session.saving).toBe(false);
    expect(session.original).toBe(original);
    expect(session.draft.email).toBe('alex@example.com');
    await session.save(async (base, resume) => saved(base, resume));
    expect(toDraft(session.original!.resume).email).toBe('alex@example.com');
    expect(session.dirty).toBe(false);
  });
  it('saves a changed filename as a copy with a new identity', async () => {
    const original = saved('resume', newResume('original'));
    const session = new ResumeSession('resume', original);
    session.filename = 'another';
    expect(session.isCopy).toBe(true);
    await session.save(async (base, resume, previous) => {
      expect(previous).toBe(original);
      return saved(base, resume);
    });
    expect(session.original!.filename).toBe('another.json');
    expect(session.original!.resume.id).not.toBe('original');
    expect(original.resume.id).toBe('original');
    expect(session.isCopy).toBe(false);
  });
  it('does not turn whitespace-only filename changes into a new copy', async () => {
    const original = saved('resume', newResume('original'));
    const session = new ResumeSession('resume', original);
    session.filename = '  resume  ';
    expect(session.isCopy).toBe(false);
    await session.save(async (base, resume) => {
      expect(base).toBe('resume');
      expect(resume.id).toBe('original');
      return saved(base, resume);
    });
    expect(session.original!.filename).toBe('resume.json');
  });
  it('never marks edits made during a pending write as already saved', async () => {
    const session = new ResumeSession('resume');
    session.draft.firstName = 'Before';
    let finish!: () => void;
    const pending = session.save((base, resume) => new Promise(resolve => { finish = () => resolve(saved(base, resume)); }));
    session.draft.firstName = 'After';
    finish();
    await pending;
    expect(session.original!.resume.basics.firstName).toBe('Before');
    expect(session.dirty).toBe(true);
  });
});
