import { describe, expect, it, vi } from 'vitest';
import { applyEducation, educationToDraft, newEducationDraft } from './education';
import { dateRangeErrors } from './dates';
import { newResume, parseResume } from './model';
import type { Resume } from './model';
import type { SavedResume } from './repository';
import { ResumeSession } from './session';

function saved(resume: Resume, name = 'resume'): SavedResume {
  const text = JSON.stringify(resume);
  return { filename: `${name}.json`, resume: parseResume(text), text, handle: {} as FileSystemFileHandle };
}

describe('education data', () => {
  it('opens older resumes with an empty education list and saves optional, partial entries', () => {
    const original = saved({ ...newResume('older'), basics: { firstName: 'Alex' }, work: [{ id: 'job', current: false, name: 'Example' }] });
    const session = new ResumeSession('resume', original);
    expect(session.education).toEqual([]);
    expect(session.dirty).toBe(false);
    const empty = newEducationDraft();
    const partial = newEducationDraft();
    partial.institution = ' Example University ';
    expect(empty.id).not.toBe(partial.id);
    const result = applyEducation(original.resume, [empty, partial]);
    expect(result.education).toEqual([{ id: empty.id, current: false }, { id: partial.id, current: false, institution: 'Example University' }]);
    expect(result.basics).toEqual(original.resume.basics);
    expect(result.work).toEqual(original.resume.work);
  });
  it('round-trips every supported field, stable IDs, unknown data, and other sections', () => {
    const original = saved({
      ...newResume('existing'), basics: { firstName: 'Alex' }, work: [{ id: 'job', current: true, name: 'Example' }],
      projects: [{ name: 'Something else' }], documents: { diploma: 'documents/diploma.pdf' },
      education: [{ id: 'degree', institution: 'Example University', area: 'Computer Science', studyType: 'Bachelor', location: 'Berlin', url: 'https://example.com', score: '3.8/4.0', startDate: '2020-09-15', endDate: '2024-06-30', current: false, courses: ['Algorithms', 'C++'], custom: { keep: true } }],
    });
    const drafts = educationToDraft(original.resume.education);
    expect(drafts[0]).toMatchObject({ id: 'degree', startDate: '15/09/2020', endDate: '30/06/2024', coursesText: '- Algorithms\n- C++', score: '3.8/4.0' });
    const result = applyEducation(original.resume, drafts);
    expect(result).toEqual(original.resume);
    drafts[0]!.institution = 'Updated University';
    const updated = applyEducation(original.resume, drafts);
    expect(updated.education![0]).toMatchObject({ id: 'degree', institution: 'Updated University', custom: { keep: true } });
    expect(original.resume.education![0]!.institution).toBe('Example University');
  });
  it('gives legacy entries IDs without changing the source or marking the loaded form dirty', () => {
    const original = saved({ ...newResume(), education: [{ institution: 'Example' }, { institution: 'Example' }] });
    const session = new ResumeSession('resume', original);
    expect(session.dirty).toBe(false);
    expect(session.education[0]!.id).not.toBe(session.education[1]!.id);
    const result = applyEducation(original.resume, session.education);
    expect(educationToDraft(result.education).map(entry => entry.id)).toEqual(session.education.map(entry => entry.id));
    expect(original.resume.education![0]).not.toHaveProperty('id');
  });
  it('allows multiple ongoing studies, omits stale end dates, and preserves toggle-back values in the draft', () => {
    const drafts = educationToDraft([{ current: true, startDate: '2040-05', endDate: '2020-01-01' }, { current: true, endDate: 'bad date' }]);
    const result = applyEducation(newResume(), drafts);
    expect(result.education![0]).toMatchObject({ current: true, startDate: '2040-05-01' });
    expect(result.education!.every(entry => !Object.hasOwn(entry, 'endDate'))).toBe(true);
    expect(drafts[0]!.endDate).toBe('01/01/2020');
    expect(drafts[1]!.endDate).toBe('bad date');
    drafts[0]!.current = false;
    expect(dateRangeErrors(drafts[0]!).endDate).toBe('To must be on or after From.');
    drafts[1]!.current = false;
    expect(dateRangeErrors(drafts[1]!).endDate).toBeDefined();
  });
  it('does not infer ongoing study from missing endDate and accepts future and partial date ranges', () => {
    const drafts = educationToDraft([{ startDate: '2050-09' }, { endDate: '2060-06-30' }]);
    expect(drafts.every(entry => !entry.current)).toBe(true);
    const result = applyEducation(newResume(), drafts);
    expect(result.education![0]).toMatchObject({ startDate: '2050-09-01', current: false });
    expect(result.education![0]).not.toHaveProperty('endDate');
    expect(result.education![1]).not.toHaveProperty('startDate');
  });
  it.each([
    ['29/02/2026', '01/03/2026'], ['01/09/2026', '31/08/2026'],
  ])('rejects invalid or unordered dates %s to %s', (startDate, endDate) => {
    const draft = Object.assign(newEducationDraft(), { startDate, endDate });
    expect(() => applyEducation(newResume(), [draft])).toThrow('Education 1');
  });
  it('accepts a leap date and normalizes a manually entered month to the first day', () => {
    const draft = Object.assign(newEducationDraft(), { startDate: '29/02/2028', endDate: '03/2028' });
    expect(applyEducation(newResume(), [draft]).education![0]).toMatchObject({ startDate: '2028-02-29', endDate: '2028-03-01' });
  });
  it('keeps malformed stored dates visible for correction without dropping other data', () => {
    const original = saved({ ...newResume(), education: [{ institution: 'Example', startDate: '2026-02-30' }] });
    const draft = educationToDraft(original.resume.education)[0]!;
    expect(draft.startDate).toBe('2026-02-30');
    expect(() => applyEducation(original.resume, [draft])).toThrow();
    draft.startDate = '28/02/2026';
    expect(applyEducation(original.resume, [draft]).education![0]).toMatchObject({ institution: 'Example', startDate: '2026-02-28' });
  });
  it('parses courses like highlights and does not add duplicate prefixes after reopening', () => {
    const draft = newEducationDraft();
    draft.coursesText = ' - Algorithms\r\n * Data structures\n+ C++\n > Databases\n< Systems\n# Networks\n • Statistics\n- \n\n#tag\n-5 degrees\n';
    const result = applyEducation(newResume(), [draft]);
    expect(result.education![0]!.courses).toEqual(['Algorithms', 'Data structures', 'C++', 'Databases', 'Systems', 'Networks', 'Statistics', '#tag', '-5 degrees']);
    const reopened = educationToDraft(result.education);
    expect(reopened[0]!.coursesText).toBe('- Algorithms\n- Data structures\n- C++\n- Databases\n- Systems\n- Networks\n- Statistics\n- #tag\n- -5 degrees');
    expect(applyEducation(result, reopened)).toEqual(result);
    reopened[0]!.coursesText += '\n- More courses';
    expect(applyEducation(result, reopened).education![0]!.courses).toEqual([...result.education![0]!.courses!, 'More courses']);
  });
  it('preserves untouched multiline course items and literal markers but allows clearing optional fields', () => {
    const original = { ...newResume(), education: [{ institution: 'Example', score: 'Pass', courses: ['First\ncontinued', '- literal'], custom: 'keep' }] };
    const drafts = educationToDraft(original.education);
    expect(applyEducation(original, drafts).education![0]!.courses).toEqual(original.education[0]!.courses);
    drafts[0]!.coursesText = ' \n- \n';
    drafts[0]!.institution = '';
    drafts[0]!.score = '';
    expect(applyEducation(original, drafts).education![0]).toEqual({ id: drafts[0]!.id, current: false, custom: 'keep' });
  });
  it('removes entries without changing remaining IDs and allows clearing the entire list', () => {
    const original = { ...newResume(), education: [{ id: 'a', institution: 'A' }, { id: 'b', institution: 'B' }] };
    const drafts = educationToDraft(original.education);
    drafts.splice(0, 1);
    expect(applyEducation(original, drafts).education!.map(entry => entry.id)).toEqual(['b']);
    expect(applyEducation(original, []).education).toEqual([]);
    expect(original.education).toHaveLength(2);
  });
  it.each([{ score: 3.8 }, { current: 'yes' }, { courses: 'Maths' }, { courses: [123] }, { startDate: 2026 }, { location: {} }, { id: '' }])('rejects malformed known fields %j', entry => {
    expect(() => parseResume(JSON.stringify({ ...newResume(), education: [entry] }))).toThrow();
  });
  it('rejects duplicate education IDs, but allows independent work and education IDs to match', () => {
    expect(() => saved({ ...newResume(), education: [{ id: 'same' }, { id: 'same' }] })).toThrow('unique');
    expect(() => saved({ ...newResume(), work: [{ id: 'same' }], education: [{ id: 'same' }] })).not.toThrow();
  });
});

describe('education save lifecycle', () => {
  it('tracks education-only changes and reversions without writing, and opens formatted data as clean', async () => {
    const original = saved({ ...newResume('existing'), basics: { firstName: 'Alex', name: 'Alex' }, work: [{ id: 'job', name: 'Example', current: false }], education: [{ id: 'degree', institution: 'Example University', startDate: '2020-09-15', endDate: '2024-06-30', current: false, courses: ['Algorithms'] }] });
    const session = new ResumeSession('resume', original);
    expect(session.dirty).toBe(false);
    const draft = session.education[0]!;
    expect(draft.startDate).toBe('15/09/2020');
    expect(draft.coursesText).toBe('- Algorithms');
    const persist = vi.fn(async (base: string, resume: Resume) => saved(resume, base));
    draft.startDate = '16/09/2020';
    expect(session.dirty).toBe(true);
    draft.startDate = '15/09/2020';
    expect(session.dirty).toBe(false);
    draft.coursesText += '\n- Databases';
    expect(session.dirty).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(original.resume.education![0]!.courses).toEqual(['Algorithms']);
    await session.save(persist);
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.basics).toEqual(original.resume.basics);
    expect(session.original!.resume.work).toEqual(original.resume.work);
    const reopened = new ResumeSession('resume', session.original!);
    expect(reopened.dirty).toBe(false);
    expect(reopened.education[0]!.coursesText).toBe('- Algorithms\n- Databases');
    await reopened.save(persist);
    expect(reopened.original!.resume).toEqual(session.original!.resume);
  });
  it('blocks invalid dates before writing, retains all drafts after failed writes, and allows retry', async () => {
    const session = new ResumeSession('resume');
    session.draft.firstName = 'Alex';
    const draft = Object.assign(newEducationDraft(), { institution: 'Example', startDate: '01/09/2026', endDate: '01/08/2026' });
    session.education.push(draft);
    const persist = vi.fn(async () => { throw new Error('Disk unavailable'); });
    await expect(session.save(persist)).rejects.toThrow('on or after');
    expect(persist).not.toHaveBeenCalled();
    draft.current = true;
    await expect(session.save(persist)).rejects.toThrow('Disk unavailable');
    expect(session.saving).toBe(false);
    expect(session.dirty).toBe(true);
    expect(session.draft.firstName).toBe('Alex');
    expect(session.education[0]).toBe(draft);
    await session.save(async (base, resume) => saved(resume, base));
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.education![0]).not.toHaveProperty('endDate');
    expect(new ResumeSession('resume', session.original!).education[0]).toMatchObject({ id: draft.id, current: true, endDate: '' });
  });
  it('saves work and education together and keeps education edits made during a pending write dirty', async () => {
    const session = new ResumeSession('resume', saved({ ...newResume(), work: [{ name: 'Example' }], education: [{ institution: 'Example University' }] }));
    session.work[0]!.position = 'Developer';
    session.education[0]!.studyType = 'Bachelor';
    let finish!: () => void;
    const pending = session.save((base, resume) => new Promise(resolve => { finish = () => resolve(saved(resume, base)); }));
    session.education[0]!.studyType = 'Master';
    finish();
    await pending;
    expect(session.original!.resume.work![0]!.position).toBe('Developer');
    expect(session.original!.resume.education![0]!.studyType).toBe('Bachelor');
    expect(session.dirty).toBe(true);
  });
});
