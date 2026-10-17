import { formatBulletList, parseBulletList } from './bullet-list';
import { dateRangeErrors, formatDateForInput, parseDateInput } from './dates';
import type { Resume } from './model';

export const educationTextFields = ['institution', 'area', 'studyType', 'location', 'url', 'score'] as const;
export type EducationEntry = Record<string, unknown> & Partial<Record<typeof educationTextFields[number] | 'id' | 'startDate' | 'endDate', string>> & {
  current?: boolean;
  courses?: string[];
};
export type EducationDraft = Record<typeof educationTextFields[number], string> & {
  id: string;
  startDate: string;
  endDate: string;
  current: boolean;
  coursesText: string;
  source: EducationEntry;
};

export function validateEducationEntries(entries: Record<string, unknown>[]): asserts entries is EducationEntry[] {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    for (const key of [...educationTextFields, 'id', 'startDate', 'endDate']) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') throw new Error(`education[${index}].${key} must be text.`);
    }
    if (entry.current !== undefined && typeof entry.current !== 'boolean') throw new Error(`education[${index}].current must be true or false.`);
    if (entry.courses !== undefined && (!Array.isArray(entry.courses) || !entry.courses.every(item => typeof item === 'string'))) {
      throw new Error(`education[${index}].courses must be a list of text values.`);
    }
    if (typeof entry.id === 'string') {
      if (!entry.id.trim() || ids.has(entry.id)) throw new Error('Education entry IDs must be non-empty and unique.');
      ids.add(entry.id);
    }
  });
}
export function educationToDraft(entries: EducationEntry[] = []): EducationDraft[] {
  return entries.map(entry => ({
    ...Object.fromEntries(educationTextFields.map(key => [key, entry[key] ?? ''])),
    id: entry.id ?? crypto.randomUUID(),
    startDate: formatDateForInput(entry.startDate), endDate: formatDateForInput(entry.endDate),
    // A missing end date can describe an incomplete draft, not necessarily ongoing study.
    current: entry.current ?? false,
    coursesText: formatBulletList(entry.courses),
    source: structuredClone(entry),
  } as EducationDraft));
}
export function newEducationDraft(): EducationDraft { return educationToDraft([{}])[0]!; }

export function applyEducation(resume: Resume, drafts: EducationDraft[]): Resume {
  const result = structuredClone(resume);
  result.education = drafts.map((draft, index) => {
    const errors = dateRangeErrors(draft);
    if (errors.startDate || errors.endDate) throw new Error(`Education ${index + 1}: ${errors.startDate ?? errors.endDate}`);
    const entry: EducationEntry = { ...structuredClone(draft.source), id: draft.id, current: draft.current };
    for (const key of educationTextFields) {
      const value = draft[key].trim();
      if (value) entry[key] = value;
      else delete entry[key];
    }
    const start = parseDateInput(draft.startDate);
    const end = draft.current ? undefined : parseDateInput(draft.endDate);
    if (start) entry.startDate = start;
    else delete entry.startDate;
    if (end) entry.endDate = end;
    else delete entry.endDate;
    // Preserve untouched arrays, whose individual items may contain line breaks.
    const courses = draft.coursesText === formatBulletList(draft.source.courses)
      ? structuredClone(draft.source.courses ?? []) : parseBulletList(draft.coursesText);
    if (courses.length) entry.courses = courses;
    else delete entry.courses;
    return entry;
  });
  return result;
}
