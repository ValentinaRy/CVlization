import type { Resume } from './model';
import { withTag } from './tags';

export const skillLevels = ['Basic', 'Intermediate', 'Advanced', 'Expert'] as const;
export const languageLevels = ['Beginner', 'Conversational', 'Working proficiency', 'Fluent'] as const;

export type SkillEntry = Record<string, unknown> & { id?: string; name?: string; level?: string; keywords?: string[] };
export type LanguageEntry = Record<string, unknown> & { id?: string; language?: string; fluency?: string };
export type SkillDraft = {
  id: string; name: string; level: string;
  keywords: { values: string[]; input: string };
  source: SkillEntry;
};
export type LanguageDraft = { id: string; name: string; level: string; source: LanguageEntry };

export function validateSkillsLanguages(entries: Record<string, unknown>[], section: 'skills' | 'languages') {
  const ids = new Set<string>();
  const fields = section === 'skills' ? ['id', 'name', 'level'] : ['id', 'language', 'fluency'];
  entries.forEach((entry, index) => {
    for (const field of fields) {
      if (entry[field] !== undefined && typeof entry[field] !== 'string') throw new Error(`${section}[${index}].${field} must be text.`);
    }
    if (section === 'skills' && entry.keywords !== undefined && (!Array.isArray(entry.keywords) || !entry.keywords.every(item => typeof item === 'string'))) {
      throw new Error(`skills[${index}].keywords must be a list of text values.`);
    }
    if (typeof entry.id === 'string') {
      if (!entry.id.trim() || ids.has(entry.id)) throw new Error(`${section} entry IDs must be non-empty and unique.`);
      ids.add(entry.id);
    }
  });
}
export function skillsToDraft(entries: SkillEntry[] = []): SkillDraft[] {
  return entries.map(entry => ({ id: entry.id ?? crypto.randomUUID(), name: entry.name ?? '', level: entry.level ?? '', keywords: { values: [...(entry.keywords ?? [])], input: '' }, source: structuredClone(entry) }));
}
export function languagesToDraft(entries: LanguageEntry[] = []): LanguageDraft[] {
  return entries.map(entry => ({ id: entry.id ?? crypto.randomUUID(), name: entry.language ?? '', level: entry.fluency ?? '', source: structuredClone(entry) }));
}
export function newSkillDraft(): SkillDraft { return skillsToDraft([{}])[0]!; }
export function newLanguageDraft(): LanguageDraft { return languagesToDraft([{}])[0]!; }
function setText(entry: Record<string, unknown>, key: string, value: string) {
  if (value.trim()) entry[key] = value.trim();
  else delete entry[key];
}
export function applySkillsLanguages(resume: Resume, skills: SkillDraft[], languages: LanguageDraft[]): Resume {
  const result = structuredClone(resume);
  result.skills = skills.map(draft => {
    const entry: SkillEntry = { ...structuredClone(draft.source), id: draft.id };
    setText(entry, 'name', draft.name);
    setText(entry, 'level', draft.level);
    const keywords = withTag(draft.keywords.values, draft.keywords.input);
    if (keywords.length) entry.keywords = keywords;
    else delete entry.keywords;
    return entry;
  });
  result.languages = languages.map(draft => {
    const entry: LanguageEntry = { ...structuredClone(draft.source), id: draft.id };
    setText(entry, 'language', draft.name);
    setText(entry, 'fluency', draft.level);
    return entry;
  });
  return result;
}
