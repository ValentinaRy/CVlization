import { describe, expect, it, vi } from 'vitest';
import { applyOptionalSections, addOptionalSection, availableSections, optionalDateErrors, optionalEntryHasContent, optionalEntryToDraft, optionalSectionKeys, optionalSectionsToDraft, removeOptionalSection } from './optional-sections';
import type { OptionalSectionsDraft } from './optional-sections';
import { newResume, parseResume } from './model';
import type { Resume } from './model';
import { ResumeSession } from './session';
import type { SavedResume } from './repository';
import { applyEducation, newEducationDraft } from './education';

function saved(resume: Resume, base = 'resume'): SavedResume {
  const text = JSON.stringify(resume);
  return { filename: `${base}.json`, resume: parseResume(text), text, handle: {} as FileSystemFileHandle };
}
function completeResume(): Resume {
  return {
    ...newResume('existing'), basics: { firstName: 'Alex', name: 'Alex' },
    skills: [{ id: 's', name: 'Java', level: 'Advanced', keywords: ['Spring'] }], languages: [{ id: 'l', language: 'English', fluency: 'Fluent' }],
    work: [{ id: 'w', name: 'Example', current: false }], education: [{ id: 'e', institution: 'Example', current: false }],
    documents: { diploma: 'documents/diploma.pdf' }, custom: { note: 'keep' },
    volunteer: [{ id: 'v', organization: 'Community Club', position: 'Mentor', location: 'Berlin', url: 'https://example.com/club', startDate: '2020-05-15', endDate: '2021-06-01', current: false, summary: '  Mentoring\n\n- keep formatting  ', highlights: ['First\ncontinued', '- literal'], custom: { keep: true } }],
    awards: [{ id: 'a', title: 'Community Award', awarder: 'Example Board', date: '2021-06-01', summary: '  Award details\n', custom: true }],
    certificates: [{ id: 'c', name: 'Example Certificate', issuer: 'Example Academy', date: '2022-07-01', url: 'https://example.com/certificate' }],
    publications: [{ id: 'p', name: 'Example Paper', publisher: 'Example Journal', releaseDate: '2023-08-01', url: 'https://example.com/paper', summary: '  Paper details\n' }],
    interests: [{ id: 'i', name: 'Music', keywords: ['Piano', 'Live music'] }],
    references: [{ id: 'r', name: 'Taylor Example', reference: '  Great collaboration.\n\nThanks!  ' }],
    projects: [{ id: 'pr', name: 'Example Project', description: '  Project description\n', highlights: ['Delivered tools', 'Mentored peers'], keywords: ['C++', 'C#'], startDate: '2024-02-29', endDate: '2025-01-01', current: false, url: 'https://example.com/project', roles: ['Team Lead', 'Developer'], entity: 'Example Co', type: 'Open source', custom: true }],
  };
}

describe('optional section selection', () => {
  it('starts with all choices, prevents duplicates without resetting data, and restores removed choices', () => {
    const draft: OptionalSectionsDraft = {};
    expect(availableSections(draft)).toEqual(optionalSectionKeys);
    expect(addOptionalSection(draft, 'interests')).toBe(true);
    const entry = optionalEntryToDraft('interests');
    entry.text.name = 'Music';
    draft.interests!.push(entry);
    expect(addOptionalSection(draft, 'interests')).toBe(false);
    expect(draft.interests).toEqual([entry]);
    expect(availableSections(draft)).not.toContain('interests');
    for (const key of optionalSectionKeys) addOptionalSection(draft, key);
    expect(availableSections(draft)).toEqual([]);
    removeOptionalSection(draft, 'interests');
    expect(availableSections(draft)).toEqual(['interests']);
  });
  it('persists empty selected sections, omits absent sections, and deletes removed sections on save', () => {
    const original = completeResume();
    const draft = optionalSectionsToDraft(original);
    removeOptionalSection(draft, 'awards');
    draft.interests = [];
    const result = applyOptionalSections(original, draft);
    expect(result).not.toHaveProperty('awards');
    expect(result.interests).toEqual([]);
    const reopened = optionalSectionsToDraft(saved(result).resume);
    expect(availableSections(reopened)).toEqual(['awards']);
    expect(reopened.interests).toEqual([]);
    expect(original.awards).toHaveLength(1);
    expect(applyOptionalSections(newResume(), {})).not.toHaveProperty('projects');
  });
  it('distinguishes empty drafts from populated entries including pending tags and unknown file data', () => {
    const draft = optionalEntryToDraft('projects');
    expect(optionalEntryHasContent(draft)).toBe(false);
    draft.tags.roles!.input = 'Team Lead';
    expect(optionalEntryHasContent(draft)).toBe(true);
    draft.tags.roles!.input = '';
    draft.current = true;
    expect(optionalEntryHasContent(draft)).toBe(true);
    expect(optionalEntryHasContent(optionalEntryToDraft('awards', { custom: 'important' }))).toBe(true);
  });
});

describe('optional section persistence', () => {
  it('round-trips all standard fields, arrays, formatting, IDs, unknown data, and unrelated sections', () => {
    const original = saved(completeResume()).resume;
    const draft = optionalSectionsToDraft(original);
    expect(draft.volunteer![0]!.text.startDate).toBe('15/05/2020');
    expect(draft.publications![0]!.text.releaseDate).toBe('01/08/2023');
    expect(draft.projects![0]!.text.highlights).toBe('- Delivered tools\n- Mentored peers');
    expect(draft.interests![0]!.tags.keywords!.values).toEqual(['Piano', 'Live music']);
    expect(applyOptionalSections(original, draft)).toEqual(original);
  });
  it.each(optionalSectionKeys)('supports multiple partial %s entries, stable IDs, and removal', key => {
    const original = newResume();
    const first = optionalEntryToDraft(key);
    const second = optionalEntryToDraft(key);
    const draft: OptionalSectionsDraft = { [key]: [first, second] };
    expect(first.id).not.toBe(second.id);
    const result = applyOptionalSections(original, draft);
    const reopened = optionalSectionsToDraft(saved(result).resume);
    expect(reopened[key]!.map(entry => entry.id)).toEqual([first.id, second.id]);
    reopened[key]!.splice(0, 1);
    expect(applyOptionalSections(result, reopened)[key]!.map(entry => entry.id)).toEqual([second.id]);
  });
  it('preserves unedited multiline bullets but parses edited lines, and retains literal prose', () => {
    const original = completeResume();
    const drafts = optionalSectionsToDraft(original);
    expect(applyOptionalSections(original, drafts).volunteer![0]!.highlights).toEqual(original.volunteer![0]!.highlights);
    drafts.volunteer![0]!.text.highlights = '\n - One\r\n * Two\n+ Three\n > Four\n< Five\n# Six\n • Seven\n- \n';
    const updated = applyOptionalSections(original, drafts);
    expect(updated.volunteer![0]!.highlights).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']);
    expect(updated.volunteer![0]!.summary).toBe(original.volunteer![0]!.summary);
    expect(updated.projects![0]!.description).toBe(original.projects![0]!.description);
    expect(updated.references![0]!.reference).toBe(original.references![0]!.reference);
  });
  it('saves pending keyword and role tags and supports clearing all kinds of optional fields', () => {
    const original = completeResume();
    const drafts = optionalSectionsToDraft(original);
    drafts.projects![0]!.tags.roles!.input = ' Technical Writer ';
    drafts.projects![0]!.tags.keywords!.input = 'c++';
    drafts.interests![0]!.tags.keywords!.input = 'Chamber music';
    let result = applyOptionalSections(original, drafts);
    expect(result.projects![0]!.roles).toEqual(['Team Lead', 'Developer', 'Technical Writer']);
    expect(result.projects![0]!.keywords).toEqual(['C++', 'C#']);
    expect(result.interests![0]!.keywords).toEqual(['Piano', 'Live music', 'Chamber music']);
    drafts.projects![0]!.text.name = '';
    drafts.projects![0]!.text.description = '';
    drafts.projects![0]!.text.startDate = '';
    drafts.projects![0]!.text.highlights = '\n- \n';
    drafts.projects![0]!.tags.roles = { values: [], input: '' };
    result = applyOptionalSections(original, drafts);
    for (const key of ['name', 'description', 'startDate', 'highlights', 'roles']) expect(result.projects![0]).not.toHaveProperty(key);
    expect(result.projects![0]!.custom).toBe(true);
  });
  it('adds IDs to legacy entries and leaves original files untouched', () => {
    const original = saved({ ...newResume(), references: [{ name: 'Taylor' }, { name: 'Taylor' }] }).resume;
    const draft = optionalSectionsToDraft(original);
    const result = applyOptionalSections(original, draft);
    expect(result.references![0]!.id).not.toBe(result.references![1]!.id);
    expect(original.references![0]).not.toHaveProperty('id');
    expect(optionalSectionsToDraft(result).references![0]!.id).toBe(draft.references![0]!.id);
  });
});

describe('optional dates', () => {
  it.each(['volunteer', 'projects'] as const)('allows equal dates, future dates, and multiple current entries in %s', key => {
    const first = optionalEntryToDraft(key);
    first.text.startDate = first.text.endDate = '15/05/2050';
    expect(optionalDateErrors(key, first)).toEqual({});
    expect(applyOptionalSections(newResume(), { [key]: [first] })[key]![0]).toMatchObject({ startDate: '2050-05-15', endDate: '2050-05-15', current: false });
    const second = optionalEntryToDraft(key);
    first.current = second.current = true;
    first.text.endDate = '01/01/2000';
    second.text.endDate = 'bad date';
    const result = applyOptionalSections(newResume(), { [key]: [first, second] });
    expect(result[key]!.every(entry => entry.current === true && !Object.hasOwn(entry, 'endDate'))).toBe(true);
    expect(second.text.endDate).toBe('bad date');
    first.current = false;
    expect(optionalDateErrors(key, first).endDate).toBeDefined();
  });
  it('also allows a same-day education interval using the shared rule', () => {
    const draft = newEducationDraft();
    draft.startDate = draft.endDate = '15/05/2026';
    expect(applyEducation(newResume(), [draft]).education![0]).toMatchObject({ startDate: '2026-05-15', endDate: '2026-05-15' });
  });
  it.each(['volunteer', 'projects'] as const)('allows missing dates without inferring current, but rejects invalid or reversed dates in %s', key => {
    const draft = optionalEntryToDraft(key, { startDate: '2026-05' });
    expect(draft.current).toBe(false);
    expect(applyOptionalSections(newResume(), { [key]: [draft] })[key]![0]).toMatchObject({ startDate: '2026-05-01', current: false });
    draft.text.endDate = '30/04/2026';
    expect(() => applyOptionalSections(newResume(), { [key]: [draft] })).toThrow('on or after');
    draft.current = true;
    draft.text.startDate = '29/02/2026';
    expect(() => applyOptionalSections(newResume(), { [key]: [draft] })).toThrow('calendar');
  });
  it.each([['awards', 'date'], ['certificates', 'date'], ['publications', 'releaseDate']] as const)('validates and round-trips the single date in %s', (key, date) => {
    const draft = optionalEntryToDraft(key, { [date]: '2028-02-29' });
    expect(draft.text[date]).toBe('29/02/2028');
    draft.text[date] = '05/2030';
    expect(applyOptionalSections(newResume(), { [key]: [draft] })[key]![0]![date]).toBe('2030-05-01');
    draft.text[date] = '31/04/2030';
    expect(optionalDateErrors(key, draft)[date]).toBeDefined();
    expect(() => applyOptionalSections(newResume(), { [key]: [draft] })).toThrow('calendar');
    draft.text[date] = '';
    expect(applyOptionalSections(newResume(), { [key]: [draft] })[key]![0]).not.toHaveProperty(date);
  });
});

describe('optional section validation', () => {
  it.each([
    ['volunteer', { location: {} }], ['volunteer', { highlights: 'text' }], ['volunteer', { current: 'yes' }],
    ['awards', { date: 2026 }], ['certificates', { issuer: false }], ['publications', { releaseDate: null }],
    ['interests', { keywords: [123] }], ['references', { reference: [] }], ['projects', { roles: 'Developer' }],
    ['projects', { current: 1 }], ['projects', { description: {} }], ['awards', { id: '' }],
  ])('rejects malformed %s fields %j', (key, entry) => {
    expect(() => parseResume(JSON.stringify({ ...newResume(), [key as string]: [entry] }))).toThrow();
  });
  it.each(optionalSectionKeys)('rejects duplicate IDs in %s', key => {
    expect(() => parseResume(JSON.stringify({ ...newResume(), [key]: [{ id: 'same' }, { id: 'same' }] }))).toThrow('unique');
  });
  it('keeps malformed stored date text editable so it can be fixed without dropping the entry', () => {
    const original = saved({ ...newResume(), awards: [{ title: 'Example', date: 'bad date' }] }).resume;
    const drafts = optionalSectionsToDraft(original);
    expect(drafts.awards![0]!.text.date).toBe('bad date');
    drafts.awards![0]!.text.date = '15/05/2026';
    expect(applyOptionalSections(original, drafts).awards![0]).toMatchObject({ title: 'Example', date: '2026-05-15' });
  });
});

describe('optional sections save lifecycle', () => {
  it('opens formatted data as clean, tracks edits and reversions, and survives repeated whole-resume saves', async () => {
    const original = saved(completeResume());
    const session = new ResumeSession('resume', original);
    expect(session.dirty).toBe(false);
    session.optional.awards![0]!.text.date = '02/06/2021';
    expect(session.dirty).toBe(true);
    session.optional.awards![0]!.text.date = '01/06/2021';
    expect(session.dirty).toBe(false);
    const persist = vi.fn(async (base: string, resume: Resume) => saved(resume, base));
    session.optional.projects![0]!.tags.roles!.input = 'Writer';
    expect(session.dirty).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    await session.save(persist);
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.projects![0]!.roles).toEqual(['Team Lead', 'Developer', 'Writer']);
    for (const key of ['basics', 'work', 'education', 'skills', 'languages', 'documents']) expect(session.original!.resume[key]).toEqual(original.resume[key]);
    const reopened = new ResumeSession('resume', session.original!);
    expect(reopened.dirty).toBe(false);
    await reopened.save(persist);
    expect(reopened.original!.resume).toEqual(session.original!.resume);
  });
  it('tracks section selection/removal, persists empty choices, and restores the choices after reopening', async () => {
    const session = new ResumeSession('resume', saved(newResume()));
    expect(session.dirty).toBe(false);
    addOptionalSection(session.optional, 'awards');
    expect(session.dirty).toBe(true);
    removeOptionalSection(session.optional, 'awards');
    expect(session.dirty).toBe(false);
    addOptionalSection(session.optional, 'awards');
    await session.save(async (base, resume) => saved(resume, base));
    const reopened = new ResumeSession('resume', session.original!);
    expect(reopened.optional.awards).toEqual([]);
    expect(availableSections(reopened.optional)).not.toContain('awards');
    removeOptionalSection(reopened.optional, 'awards');
    await reopened.save(async (base, resume) => saved(resume, base));
    expect(reopened.original!.resume).not.toHaveProperty('awards');
  });
  it('blocks invalid dates before writing and keeps drafts, removals, and pending tags after a failed write', async () => {
    const session = new ResumeSession('resume', saved(completeResume()));
    session.optional.certificates![0]!.text.date = '31/02/2026';
    removeOptionalSection(session.optional, 'awards');
    session.optional.projects![0]!.tags.keywords!.input = 'TypeScript';
    const persist = vi.fn(async () => { throw new Error('Disk unavailable'); });
    await expect(session.save(persist)).rejects.toThrow('calendar');
    expect(persist).not.toHaveBeenCalled();
    session.optional.certificates![0]!.text.date = '28/02/2026';
    await expect(session.save(persist)).rejects.toThrow('Disk unavailable');
    expect(session.saving).toBe(false);
    expect(session.dirty).toBe(true);
    expect(session.optional.awards).toBeUndefined();
    expect(session.optional.projects![0]!.tags.keywords!.input).toBe('TypeScript');
    expect(session.original!.resume.awards).toHaveLength(1);
    await session.save(async (base, resume) => saved(resume, base));
    expect(session.original!.resume).not.toHaveProperty('awards');
    expect(session.original!.resume.projects![0]!.keywords).toEqual(['C++', 'C#', 'TypeScript']);
    expect(session.dirty).toBe(false);
  });
});
