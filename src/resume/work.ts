import { formatBulletList, parseBulletList } from './bullet-list';
import type { Resume } from './model';
import { dateRangeErrors, formatDateForInput, parseDateInput } from './dates';

export const workTextFields = ['name', 'position', 'location', 'description', 'url', 'summary'] as const;
export type WorkEntry = Record<string, unknown> & Partial<Record<typeof workTextFields[number] | 'id' | 'startDate' | 'endDate', string>> & {
  current?: boolean;
  highlights?: string[];
};
export type WorkDraft = Record<typeof workTextFields[number], string> & {
  id: string;
  startDate: string;
  endDate: string;
  current: boolean;
  highlightsText: string;
  source: WorkEntry;
};

export function validateWorkEntries(entries: Record<string, unknown>[]): asserts entries is WorkEntry[] {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    for (const key of [...workTextFields, 'id', 'startDate', 'endDate']) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') throw new Error(`work[${index}].${key} must be text.`);
    }
    if (entry.current !== undefined && typeof entry.current !== 'boolean') throw new Error(`work[${index}].current must be true or false.`);
    if (entry.highlights !== undefined && (!Array.isArray(entry.highlights) || !entry.highlights.every(item => typeof item === 'string'))) {
      throw new Error(`work[${index}].highlights must be a list of text values.`);
    }
    if (typeof entry.id === 'string') {
      if (!entry.id.trim() || ids.has(entry.id)) throw new Error('Work entry IDs must be non-empty and unique.');
      ids.add(entry.id);
    }
  });
}
export function workToDraft(entries: WorkEntry[] = []): WorkDraft[] {
  return entries.map(entry => ({
    ...Object.fromEntries(workTextFields.map(key => [key, entry[key] ?? ''])),
    id: entry.id ?? crypto.randomUUID(),
    startDate: formatDateForInput(entry.startDate), endDate: formatDateForInput(entry.endDate),
    // Missing dates can also mean an incomplete draft. Never infer current status.
    current: entry.current ?? false,
    highlightsText: formatBulletList(entry.highlights),
    source: structuredClone(entry),
  } as WorkDraft));
}
export function newWorkDraft(): WorkDraft { return workToDraft([{}])[0]!; }

export function applyWork(resume: Resume, drafts: WorkDraft[]): Resume {
  const result = structuredClone(resume);
  result.work = drafts.map((draft, index) => {
    const errors = dateRangeErrors(draft);
    if (errors.startDate || errors.endDate) throw new Error(`Position ${index + 1}: ${errors.startDate ?? errors.endDate}`);
    const entry: WorkEntry = { ...structuredClone(draft.source), id: draft.id, current: draft.current };
    for (const key of workTextFields) {
      // Summary belongs to the user: retain its formatting, including line breaks.
      const value = key === 'summary' ? draft[key] : draft[key].trim();
      if (value) entry[key] = value;
      else delete entry[key];
    }
    const start = parseDateInput(draft.startDate);
    const end = draft.current ? undefined : parseDateInput(draft.endDate);
    if (start) entry.startDate = start;
    else delete entry.startDate;
    if (end) entry.endDate = end;
    else delete entry.endDate;
    // Existing array items can themselves contain newlines. Preserve unchanged
    // arrays; only parse user-edited highlights text into new bullet points.
    const highlights = draft.highlightsText === formatBulletList(draft.source.highlights)
      ? structuredClone(draft.source.highlights ?? []) : parseBulletList(draft.highlightsText);
    if (highlights.length) entry.highlights = highlights;
    else delete entry.highlights;
    return entry;
  });
  return result;
}
