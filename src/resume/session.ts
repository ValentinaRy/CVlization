import { applyOptionalSections, optionalSectionsToDraft } from './optional-sections';
import type { OptionalSectionsDraft } from './optional-sections';
import { applySkillsLanguages, languagesToDraft, skillsToDraft } from './skills-languages';
import type { SkillDraft, LanguageDraft } from './skills-languages';
import { applyEducation, educationToDraft } from './education';
import type { EducationDraft } from './education';
import { applyWork, workToDraft } from './work';
import type { WorkDraft } from './work';
import { applyBasics, newResume, toDraft } from './model';
import type { BasicsDraft, Resume } from './model';
import type { SavedResume } from './repository';

type Persist = (base: string, resume: Resume, original?: SavedResume) => Promise<SavedResume>;

export class ResumeSession {
  draft: BasicsDraft;
  work: WorkDraft[];
  education: EducationDraft[];
  skills: SkillDraft[];
  languages: LanguageDraft[];
  optional: OptionalSectionsDraft;
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
    this.education = educationToDraft(this.resume.education);
    this.skills = skillsToDraft(this.resume.skills);
    this.languages = languagesToDraft(this.resume.languages);
    this.optional = optionalSectionsToDraft(this.resume);
    this.filename = filename;
    this.baseline = this.snapshot();
  }
  private snapshot() { return JSON.stringify([this.filename, this.draft, this.work, this.education, this.skills, this.languages, this.optional]); }
  get dirty() { return this.snapshot() !== this.baseline; }
  get isCopy() { return !!this.original && `${this.filename.trim()}.json` !== this.original.filename; }

  async save(persist: Persist): Promise<void> {
    if (this.saving) throw new Error('A save is already in progress.');
    this.saving = true;
    const snapshot = this.snapshot();
    try {
      let resume = applyBasics(this.resume, this.draft);
      resume = applyWork(resume, this.work);
      resume = applyEducation(resume, this.education);
      resume = applySkillsLanguages(resume, this.skills, this.languages);
      resume = applyOptionalSections(resume, this.optional);
      if (this.isCopy) resume.id = crypto.randomUUID();
      const saved = await persist(this.filename.trim(), resume, this.original);
      this.original = saved;
      this.resume = saved.resume;
      // The UI locks during save; retaining the captured snapshot also protects later edits.
      this.baseline = snapshot;
    } finally { this.saving = false; }
  }
}
