import { applyWork, workToDraft } from './work';
import type { WorkDraft } from './work';
import { applyBasics, newResume, toDraft } from './model';
import type { BasicsDraft, Resume } from './model';
import type { SavedResume } from './repository';

type Persist = (base: string, resume: Resume, original?: SavedResume) => Promise<SavedResume>;

export class ResumeSession {
  draft: BasicsDraft;
  work: WorkDraft[];
  filename: string;
  original?: SavedResume;
  private resume: Resume;
  private baseline: string;
  saving = false;

  constructor(filename: string, original?: SavedResume) {
    this.original = original;
    this.resume = original?.resume ?? newResume();
    this.draft = toDraft(this.resume);
    this.work = workToDraft(this.resume.work);
    this.filename = filename;
    this.baseline = this.snapshot();
  }
  private snapshot() { return JSON.stringify([this.filename, this.draft, this.work]); }
  get dirty() { return this.snapshot() !== this.baseline; }
  get isCopy() { return !!this.original && `${this.filename.trim()}.json` !== this.original.filename; }

  async save(persist: Persist): Promise<void> {
    if (this.saving) throw new Error('A save is already in progress.');
    this.saving = true;
    const snapshot = this.snapshot();
    try {
      const resume = applyWork(applyBasics(this.resume, this.draft), this.work);
      if (this.isCopy) resume.id = crypto.randomUUID();
      const saved = await persist(this.filename.trim(), resume, this.original);
      this.original = saved;
      this.resume = saved.resume;
      // The UI locks during save; retaining the captured snapshot also protects later edits.
      this.baseline = snapshot;
    } finally { this.saving = false; }
  }
}
