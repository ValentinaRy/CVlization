import { formatBulletList, parseBulletList } from './bullet-list';
import { dateRangeErrors, formatDateForInput, parseDateInput } from './dates';
import type { Resume } from './model';
import { withTag } from './tags';

export const optionalSectionKeys = ['volunteer', 'awards', 'certificates', 'publications', 'interests', 'references', 'projects'] as const;
export type OptionalSectionKey = typeof optionalSectionKeys[number];
type FieldKind = 'text' | 'url' | 'multiline' | 'date' | 'bullets' | 'tags';
type Field = { key: string; label: string; kind: FieldKind };
type Section = { title: string; entryLabel: string; fields: readonly Field[]; currentLabel?: string };
const field = (key: string, label: string, kind: FieldKind = 'text'): Field => ({ key, label, kind });
const dates = [field('startDate', 'From', 'date'), field('endDate', 'To', 'date')];

export const optionalSections: Record<OptionalSectionKey, Section> = {
  volunteer: {
    title: 'Volunteer', entryLabel: 'Volunteer position', currentLabel: 'Current position',
    fields: [field('organization', 'Organization'), field('position', 'Position'), field('location', 'Location'), field('url', 'Organization website', 'url'), ...dates, field('summary', 'Summary', 'multiline'), field('highlights', 'Highlights (bullet points)', 'bullets')],
  },
  awards: {
    title: 'Awards', entryLabel: 'Award',
    fields: [field('title', 'Title'), field('awarder', 'Awarded by'), field('date', 'Date', 'date'), field('summary', 'Summary', 'multiline')],
  },
  certificates: {
    title: 'Certificates', entryLabel: 'Certificate',
    fields: [field('name', 'Name'), field('issuer', 'Issuer'), field('date', 'Date', 'date'), field('url', 'Certificate URL', 'url')],
  },
  publications: {
    title: 'Publications', entryLabel: 'Publication',
    fields: [field('name', 'Name'), field('publisher', 'Publisher'), field('releaseDate', 'Release date', 'date'), field('url', 'Publication URL', 'url'), field('summary', 'Summary', 'multiline')],
  },
  interests: {
    title: 'Interests', entryLabel: 'Interest',
    fields: [field('name', 'Name'), field('keywords', 'Keywords', 'tags')],
  },
  references: {
    title: 'References', entryLabel: 'Reference',
    fields: [field('name', 'Name'), field('reference', 'Reference', 'multiline')],
  },
  projects: {
    title: 'Projects', entryLabel: 'Project', currentLabel: 'Current project',
    fields: [field('name', 'Name'), field('entity', 'Company / organization'), field('type', 'Type'), field('url', 'Project URL', 'url'), ...dates, field('description', 'Description', 'multiline'), field('highlights', 'Highlights (bullet points)', 'bullets'), field('keywords', 'Keywords', 'tags'), field('roles', 'Roles', 'tags')],
  },
};

export type OptionalEntry = Record<string, unknown> & { id?: string };
export type OptionalEntryDraft = {
  id: string;
  text: Record<string, string>;
  tags: Record<string, { values: string[]; input: string }>;
  current: boolean;
  source: OptionalEntry;
};
// Presence includes empty sections: [] keeps a chosen section visible after reopening.
export type OptionalSectionsDraft = Partial<Record<OptionalSectionKey, OptionalEntryDraft[]>>;

export function validateOptionalEntries(key: OptionalSectionKey, entries: Record<string, unknown>[]) {
  const ids = new Set<string>();
  const section = optionalSections[key];
  entries.forEach((entry, index) => {
    for (const { key: name, kind } of section.fields) {
      const value = entry[name];
      if (value === undefined) continue;
      if (kind === 'tags' || kind === 'bullets') {
        if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error(`${key}[${index}].${name} must be a list of text values.`);
      } else if (typeof value !== 'string') throw new Error(`${key}[${index}].${name} must be text.`);
    }
    if (section.currentLabel && entry.current !== undefined && typeof entry.current !== 'boolean') throw new Error(`${key}[${index}].current must be true or false.`);
    if (entry.id !== undefined) {
      if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id)) throw new Error(`${key} entry IDs must be non-empty and unique.`);
      ids.add(entry.id);
    }
  });
}
export function optionalEntryToDraft(key: OptionalSectionKey, entry: OptionalEntry = {}): OptionalEntryDraft {
  const draft: OptionalEntryDraft = { id: entry.id ?? crypto.randomUUID(), text: {}, tags: {}, current: optionalSections[key].currentLabel ? entry.current === true : false, source: structuredClone(entry) };
  for (const { key: name, kind } of optionalSections[key].fields) {
    if (kind === 'tags') draft.tags[name] = { values: [...((entry[name] as string[] | undefined) ?? [])], input: '' };
    else if (kind === 'bullets') draft.text[name] = formatBulletList(entry[name] as string[] | undefined);
    else if (kind === 'date') draft.text[name] = formatDateForInput(entry[name] as string | undefined);
    else draft.text[name] = (entry[name] as string | undefined) ?? '';
  }
  return draft;
}
export function optionalSectionsToDraft(resume: Resume): OptionalSectionsDraft {
  const result: OptionalSectionsDraft = {};
  for (const key of optionalSectionKeys) {
    if (resume[key] !== undefined) result[key] = resume[key]!.map(entry => optionalEntryToDraft(key, entry));
  }
  return result;
}
export function availableSections(draft: OptionalSectionsDraft): OptionalSectionKey[] {
  return optionalSectionKeys.filter(key => draft[key] === undefined);
}
export function addOptionalSection(draft: OptionalSectionsDraft, key: OptionalSectionKey): boolean {
  if (draft[key] !== undefined) return false;
  draft[key] = [];
  return true;
}
export function removeOptionalSection(draft: OptionalSectionsDraft, key: OptionalSectionKey) { delete draft[key]; }
export function optionalEntryHasContent(draft: OptionalEntryDraft): boolean {
  return draft.current || Object.values(draft.text).some(value => !!value.trim()) || Object.values(draft.tags).some(tag => tag.values.length > 0 || !!tag.input.trim()) || Object.keys(draft.source).some(key => !['id', 'current'].includes(key));
}
export function optionalDateErrors(key: OptionalSectionKey, draft: OptionalEntryDraft): Record<string, string | undefined> {
  const section = optionalSections[key];
  if (section.currentLabel) return dateRangeErrors({ startDate: draft.text.startDate ?? '', endDate: draft.text.endDate ?? '', current: draft.current });
  const errors: Record<string, string> = {};
  for (const field of section.fields.filter(field => field.kind === 'date')) {
    try { parseDateInput(draft.text[field.key] ?? ''); }
    catch (error) { errors[field.key] = (error as Error).message; }
  }
  return errors;
}
export function applyOptionalSections(resume: Resume, drafts: OptionalSectionsDraft): Resume {
  const result = structuredClone(resume);
  for (const key of optionalSectionKeys) {
    const entries = drafts[key];
    if (entries === undefined) { delete result[key]; continue; }
    const section = optionalSections[key];
    result[key] = entries.map((draft, index) => {
      const error = Object.values(optionalDateErrors(key, draft)).find(Boolean);
      if (error) throw new Error(`${section.entryLabel} ${index + 1}: ${error}`);
      const entry: OptionalEntry = { ...structuredClone(draft.source), id: draft.id };
      if (section.currentLabel) entry.current = draft.current;
      for (const { key: name, kind } of section.fields) {
        if (name === 'endDate' && section.currentLabel && draft.current) { delete entry.endDate; continue; }
        if (kind === 'tags' || kind === 'bullets') {
          const values = kind === 'tags'
            ? withTag(draft.tags[name]!.values, draft.tags[name]!.input)
            : draft.text[name] === formatBulletList(draft.source[name] as string[] | undefined)
              ? structuredClone((draft.source[name] as string[] | undefined) ?? []) : parseBulletList(draft.text[name] ?? '');
          if (values.length) entry[name] = values;
          else delete entry[name];
        } else {
          const text = draft.text[name] ?? '';
          const value = kind === 'date' ? parseDateInput(text) : kind === 'multiline' ? text : text.trim();
          if (value) entry[name] = value;
          else delete entry[name];
        }
      }
      return entry;
    });
  }
  return result;
}
