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
import { documentsSnapshot, documentsToDraft } from './documents';
import type { DocumentsDraft } from './documents';

type Persist = (base: string, resume: Resume, original: SavedResume | undefined, documents: DocumentsDraft) => Promise<SavedResume>;

export class ResumeSession {
  draft: BasicsDraft;
  work: WorkDraft[];
  education: EducationDraft[];
  skills: SkillDraft[];
  languages: LanguageDraft[];
  optional: OptionalSectionsDraft;
  documents: DocumentsDraft;
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
    this.documents = documentsToDraft(this.resume);
    this.filename = filename;
    this.baseline = this.snapshot();
  }
  private snapshot() { return JSON.stringify([this.filename, this.draft, this.work, this.education, this.skills, this.languages, this.optional, documentsSnapshot(this.documents)]); }
  get dirty() { return this.snapshot() !== this.baseline; }
  get isCopy() { return !!this.original && `${this.filename.trim()}.json` !== this.original.filename; }

  async save(persist: Persist): Promise<void> {
    if (this.saving) throw new Error('A save is already in progress.');
    this.saving = true;
    const snapshot = this.snapshot();
    const documentSnapshot = documentsSnapshot(this.documents);
    try {
      let resume = applyBasics(this.resume, this.draft);
      resume = applyWork(resume, this.work);
      resume = applyEducation(resume, this.education);
      resume = applySkillsLanguages(resume, this.skills, this.languages);
      resume = applyOptionalSections(resume, this.optional);
      if (this.isCopy) resume.id = crypto.randomUUID();
      const saved = await persist(this.filename.trim(), resume, this.original, structuredClone(this.documents));
      this.original = saved;
      this.resume = saved.resume;
      const savedDocuments = documentsToDraft(saved.resume);
      if (documentsSnapshot(this.documents) === documentSnapshot) this.documents = savedDocuments;
      // Normalize pending blobs to their saved references in the captured baseline,
      // while retaining any edits made during persistence as unsaved changes.
      const baseline = JSON.parse(snapshot) as unknown[];
      baseline[baseline.length - 1] = documentsSnapshot(savedDocuments);
      this.baseline = JSON.stringify(baseline);
    } finally { this.saving = false; }
  }
}
