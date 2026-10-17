import { describe, expect, it, vi } from 'vitest';
import { formatDateForInput, normalizeDate, parseDateInput } from './dates';
import { newResume, parseResume } from './model';
import { applyWork, formatHighlights, newWorkDraft, parseHighlights, workDateErrors, workToDraft } from './work';
import { ResumeSession } from './session';
import type { SavedResume } from './repository';

describe('calendar dates', () => {
  it.each([
    ['', undefined], ['  ', undefined], ['2026-05', '2026-05-01'], [' 2028-02-29 ', '2028-02-29'],
    ['2000-02-29', '2000-02-29'], ['2045-12-31', '2045-12-31'], ['2026-03-29', '2026-03-29'],
  ])('normalizes %j without timezone changes', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });
  it.each(['2026', '2026-5', '15/05/2026', '2026-00', '2026-13', '2026-02-29', '1900-02-29', '2026-04-31', '2026-01-00', '0000-01-01', '2026-05-15T12:00:00Z'])('rejects invalid or incomplete date %j', input => {
    expect(() => normalizeDate(input)).toThrow();
  });
});

describe('work highlights', () => {
  it('splits lines, trims whitespace, strips only the supported leading markers, and discards empty bullets', () => {
    const input = '\n - Built tools\r\n * Improved tests\n+ Led delivery\n > Mentored peers\n< Reviewed code\n# Wrote docs\n • Measured outcomes\n- \n\t\nPlain text\rLast line';
    expect(parseHighlights(input)).toEqual(['Built tools', 'Improved tests', 'Led delivery', 'Mentored peers', 'Reviewed code', 'Wrote docs', 'Measured outcomes', 'Plain text', 'Last line']);
  });
  it('preserves internal punctuation, unsupported markers, ordering and duplicate lines', () => {
    expect(parseHighlights('C++ and C#\n+49 phone\n-5 degrees\n*word\n#hashtag\n1. First\n– Another\n- Same\n- Same')).toEqual(['C++ and C#', '+49 phone', '-5 degrees', '*word', '#hashtag', '1. First', '– Another', 'Same', 'Same']);
  });
});

describe('work model', () => {
  it('starts empty for older basics-only files, and allows partial positions', () => {
    const session = new ResumeSession('resume');
    expect(session.work).toEqual([]);
    const draft = newWorkDraft();
    const entry = applyWork(newResume(), [draft]).work![0]!;
    expect(entry).toEqual({ id: draft.id, current: false });
    expect(workDateErrors(draft)).toEqual({});
  });
  it('round-trips entries and stable IDs while preserving basics, future sections, and unknown work data', () => {
    const original = parseResume(JSON.stringify({ schemaVersion: 1, id: 'resume', basics: { firstName: 'Alex' }, education: [{ institution: 'Example' }], work: [{ name: 'Example Co', summary: '  Lines\n\n- not highlights  ', custom: { keep: true }, highlights: ['First\ncontinued', '- literal original'] }] }));
    const drafts = workToDraft(original.work);
    const firstId = drafts[0]!.id;
    drafts[0]!.position = 'Developer';
    drafts[0]!.startDate = '05/2026';
    drafts[0]!.endDate = '15/06/2027';
    const saved = parseResume(JSON.stringify(applyWork(original, drafts)));
    expect(saved.basics).toEqual(original.basics);
    expect(saved.education).toEqual(original.education);
    expect(saved.work![0]).toMatchObject({ id: firstId, current: false, name: 'Example Co', position: 'Developer', startDate: '2026-05-01', endDate: '2027-06-15', custom: { keep: true } });
    expect(saved.work![0]!.summary).toBe(original.work![0]!.summary);
    expect(saved.work![0]!.highlights).toEqual(original.work![0]!.highlights);
    expect(workToDraft(saved.work)[0]!.id).toBe(firstId);
    expect(original.work![0]!.id).toBeUndefined();
  });
  it('allows multiple current positions and omits every endDate without mutating the draft', () => {
    const a = newWorkDraft();
    const b = newWorkDraft();
    Object.assign(a, { current: true, startDate: '05/2040', endDate: 'bad date' });
    Object.assign(b, { current: true, startDate: '01/01/2050', endDate: '01/01/2020' });
    const saved = applyWork(newResume(), [a, b]);
    expect(saved.work!.every(entry => entry.current && !Object.hasOwn(entry, 'endDate'))).toBe(true);
    expect(a.endDate).toBe('bad date');
    expect(workDateErrors(a)).toEqual({});
    a.current = false;
    expect(workDateErrors(a).endDate).toBeDefined();
  });
  it('does not infer current from missing endDate and explicitly removes stale endDate for current work', () => {
    const drafts = workToDraft([{ name: 'Unknown end' }, { name: 'Ongoing', current: true, endDate: '2025-01-01' }]);
    expect(drafts[0]!.current).toBe(false);
    const entries = applyWork(newResume(), drafts).work!;
    expect(entries[0]!.current).toBe(false);
    expect(entries[1]).not.toHaveProperty('endDate');
  });
  it('requires To strictly after From only when both dates are supplied and position is not current', () => {
    const draft = newWorkDraft();
    Object.assign(draft, { startDate: '06/2030', endDate: '01/06/2030' });
    expect(workDateErrors(draft).endDate).toBe('To must be later than From.');
    draft.endDate = '05/2030';
    expect(() => applyWork(newResume(), [draft])).toThrow('later');
    draft.endDate = '02/06/2030';
    expect(workDateErrors(draft)).toEqual({});
    draft.startDate = '';
    expect(workDateErrors(draft)).toEqual({});
    draft.endDate = '';
    draft.startDate = '01/2031';
    expect(workDateErrors(draft)).toEqual({});
  });
  it('leaves summary alone when highlights are absent and parses only edited highlights', () => {
    const draft = newWorkDraft();
    draft.summary = '  - My work\n\n* More work\n';
    expect(applyWork(newResume(), [draft]).work![0]).toMatchObject({ summary: draft.summary });
    expect(applyWork(newResume(), [draft]).work![0]).not.toHaveProperty('highlights');
    draft.highlightsText = '- One\n  * Two\n';
    expect(applyWork(newResume(), [draft]).work![0]!.highlights).toEqual(['One', 'Two']);
    expect(applyWork(newResume(), [draft]).work![0]!.summary).toBe(draft.summary);
  });
  it('removes entries without changing the remaining IDs', () => {
    const drafts = workToDraft([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    drafts.splice(0, 1);
    expect(applyWork(newResume(), drafts).work![0]!.id).toBe('b');
    expect(applyWork(newResume(), []).work).toEqual([]);
  });
  it.each([{ current: 'yes' }, { highlights: 'text' }, { highlights: [123] }, { startDate: 2026 }, { summary: [] }, { id: '' }])('rejects invalid structure %j', entry => {
    expect(() => parseResume(JSON.stringify({ schemaVersion: 1, id: 'resume', basics: {}, work: [entry] }))).toThrow();
  });
  it('rejects duplicate supplied IDs instead of silently combining positions', () => {
    expect(() => parseResume(JSON.stringify({ schemaVersion: 1, id: 'resume', basics: {}, work: [{ id: 'same' }, { id: 'same' }] }))).toThrow('unique');
  });
  it('keeps invalid date text editable on load so the user can fix it without discarding the entry', () => {
    const parsed = parseResume(JSON.stringify({ schemaVersion: 1, id: 'resume', basics: {}, work: [{ startDate: '2026-02-30' }] }));
    const draft = workToDraft(parsed.work)[0]!;
    expect(draft.startDate).toBe('2026-02-30');
    expect(workDateErrors(draft).startDate).toBeDefined();
  });
});

describe('work save lifecycle', () => {
  it('tracks work-only edits, refuses invalid date ordering before persistence, and keeps drafts after write failure', async () => {
    const session = new ResumeSession('resume');
    const entry = newWorkDraft();
    Object.assign(entry, { name: 'Example', startDate: '05/2026', endDate: '04/2026' });
    session.work.push(entry);
    expect(session.dirty).toBe(true);
    const persist = vi.fn(async () => { throw new Error('Disk unavailable'); });
    await expect(session.save(persist)).rejects.toThrow('later');
    expect(persist).not.toHaveBeenCalled();
    expect(session.saving).toBe(false);
    entry.current = true;
    await expect(session.save(persist)).rejects.toThrow('Disk unavailable');
    expect(session.work[0]!.name).toBe('Example');
    expect(session.dirty).toBe(true);
    await session.save(async (base, resume) => ({ filename: `${base}.json`, resume, text: JSON.stringify(resume), handle: {} as FileSystemFileHandle }));
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.work![0]).not.toHaveProperty('endDate');
    const reopened = new ResumeSession('resume', session.original as SavedResume);
    expect(reopened.work[0]!.id).toBe(entry.id);
    expect(reopened.work[0]!.current).toBe(true);
    expect(reopened.work[0]!.endDate).toBe('');
  });
});


describe('date presentation', () => {
  it.each([
    ['2026-05-15', '15/05/2026'], ['2028-02-29', '29/02/2028'],
    ['2026-03-29', '29/03/2026'], ['0001-01-01', '01/01/0001'],
  ])('round-trips %s through the displayed date without timezone conversion', (stored, displayed) => {
    expect(formatDateForInput(stored)).toBe(displayed);
    expect(parseDateInput(displayed)).toBe(stored);
  });
  it('uses the first day for month-only dates in either direction and allows blanks', () => {
    expect(formatDateForInput('2026-05')).toBe('01/05/2026');
    expect(parseDateInput(' 05/2026 ')).toBe('2026-05-01');
    expect(parseDateInput(' 15/05/2026 ')).toBe('2026-05-15');
    expect(formatDateForInput()).toBe('');
    expect(parseDateInput('  ')).toBeUndefined();
  });
  it.each(['29/02/2026', '29/02/1900', '31/04/2026', '00/01/2026', '15/13/2026', '15/05', '2026', '05/0000'])('rejects invalid displayed date %s', input => {
    expect(() => parseDateInput(input)).toThrow();
  });
  it('compares calendar dates rather than displayed strings', () => {
    const draft = newWorkDraft();
    Object.assign(draft, { startDate: '31/12/2026', endDate: '01/01/2027' });
    expect(workDateErrors(draft)).toEqual({});
    draft.endDate = '01/12/2026';
    expect(workDateErrors(draft).endDate).toBe('To must be later than From.');
  });
});

describe('formatted drafts and unsaved changes', () => {
  it('opens formatted dates and bullets as clean, detects edits and reversions, and round-trips repeated saves', async () => {
    const resume = newResume('existing');
    resume.work = [{ id: 'position', current: false, name: 'Example', startDate: '2026-05-15', endDate: '2027-01-02', highlights: ['Built tools', 'C++ and C#'] }];
    const original: SavedResume = { filename: 'resume.json', resume, text: JSON.stringify(resume), handle: {} as FileSystemFileHandle };
    const session = new ResumeSession('resume', original);
    const draft = session.work[0]!;
    expect(draft.startDate).toBe('15/05/2026');
    expect(draft.endDate).toBe('02/01/2027');
    expect(draft.highlightsText).toBe('- Built tools\n- C++ and C#');
    expect(session.dirty).toBe(false);
    draft.startDate = '16/05/2026';
    expect(session.dirty).toBe(true);
    draft.startDate = '15/05/2026';
    expect(session.dirty).toBe(false);
    draft.highlightsText += '\n- Mentored peers';
    expect(session.dirty).toBe(true);
    draft.highlightsText = '- Built tools\n- C++ and C#';
    expect(session.dirty).toBe(false);
    const persist = async (base: string, updated: typeof resume) => ({ filename: `${base}.json`, resume: parseResume(JSON.stringify(updated)), text: JSON.stringify(updated), handle: original.handle });
    await session.save(persist);
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.work).toEqual(resume.work);
    const reopened = new ResumeSession('resume', session.original!);
    expect(reopened.dirty).toBe(false);
    expect(reopened.work[0]!.highlightsText).toBe(draft.highlightsText);
    await reopened.save(persist);
    expect(reopened.original!.resume.work).toEqual(resume.work);
    expect(reopened.dirty).toBe(false);
    reopened.work[0]!.highlightsText += '\n- Mentored peers';
    await reopened.save(persist);
    expect(reopened.original!.resume.work![0]!.highlights).toEqual(['Built tools', 'C++ and C#', 'Mentored peers']);
  });
  it('adds one display marker per array item and preserves multiline items and literal markers when unchanged', () => {
    const highlights = ['First\ncontinued', '- literal original', '+49 phone'];
    const drafts = workToDraft([{ highlights }]);
    expect(formatHighlights()).toBe('');
    expect(drafts[0]!.highlightsText).toBe('- First\ncontinued\n- - literal original\n- +49 phone');
    expect(applyWork(newResume(), drafts).work![0]!.highlights).toEqual(highlights);
    expect(parseHighlights(formatHighlights(['- literal original', '+49 phone']))).toEqual(['- literal original', '+49 phone']);
  });
});
