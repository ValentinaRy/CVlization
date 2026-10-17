import { describe, expect, it, vi } from 'vitest';
import { newResume, parseResume } from './model';
import type { Resume } from './model';
import type { SavedResume } from './repository';
import { ResumeSession } from './session';
import { applySkillsLanguages, languagesToDraft, newLanguageDraft, newSkillDraft, skillsToDraft } from './skills-languages';
import { withTag } from './tags';

function saved(resume: Resume, filename = 'resume'): SavedResume {
  const text = JSON.stringify(resume);
  return { filename: `${filename}.json`, resume: parseResume(text), text, handle: {} as FileSystemFileHandle };
}

describe('keyword tags', () => {
  it('adds a trimmed phrase as one tag without splitting punctuation or adding markers', () => {
    const original = ['Java'];
    expect(withTag(original, '  Spring Boot  ')).toEqual(['Java', 'Spring Boot']);
    expect(withTag(original, 'C++, C#')).toEqual(['Java', 'C++, C#']);
    expect(withTag(original, 'test driven development')).toEqual(['Java', 'test driven development']);
    expect(original).toEqual(['Java']);
  });
  it('ignores blank input and prevents new duplicates regardless of case or edge whitespace', () => {
    const original = ['Java', 'Spring Boot'];
    expect(withTag(original, '\n  ')).toEqual(original);
    expect(withTag(original, ' JAVA ')).toEqual(original);
    expect(withTag(original, 'spring boot')).toEqual(original);
  });
  it('keeps existing arrays as supplied, including order, duplicates, and literal markup', () => {
    const original = [' C# ', 'C#', '<script>fictional</script>', 'Two\nlines'];
    expect(withTag(original, '')).toEqual(original);
    expect(withTag(original, 'New')).toEqual([...original, 'New']);
  });
});

describe('skills and languages model', () => {
  it('opens older resumes with empty lists and no automatic level selection', () => {
    const session = new ResumeSession('resume', saved(newResume('older')));
    expect(session.skills).toEqual([]);
    expect(session.languages).toEqual([]);
    expect(session.dirty).toBe(false);
    const skill = newSkillDraft();
    const language = newLanguageDraft();
    expect(skill.level).toBe('');
    expect(language.level).toBe('');
    const result = applySkillsLanguages(newResume(), [skill], [language]);
    expect(result.skills).toEqual([{ id: skill.id }]);
    expect(result.languages).toEqual([{ id: language.id }]);
  });
  it('uses JSON Resume keys for each section while supporting partial entries', () => {
    const skill = Object.assign(newSkillDraft(), { name: ' Backend development ', level: 'Advanced' });
    skill.keywords.values = ['Java', 'Spring Boot'];
    const language = Object.assign(newLanguageDraft(), { name: ' English ', level: 'Working proficiency' });
    const result = applySkillsLanguages(newResume(), [skill], [language]);
    expect(result.skills).toEqual([{ id: skill.id, name: 'Backend development', level: 'Advanced', keywords: ['Java', 'Spring Boot'] }]);
    expect(result.languages).toEqual([{ id: language.id, language: 'English', fluency: 'Working proficiency' }]);
    expect(result.languages![0]).not.toHaveProperty('name');
    expect(result.languages![0]).not.toHaveProperty('level');
  });
  it('preserves custom levels, keywords, unknown fields, and unrelated sections on a round trip', () => {
    const original = saved({
      ...newResume('existing'), basics: { firstName: 'Alex', name: 'Alex' },
      work: [{ id: 'job', name: 'Example', current: false }], education: [{ id: 'school', institution: 'Example University', current: false }],
      projects: [{ name: 'Later' }], documents: { diploma: 'documents/diploma.pdf' },
      skills: [{ id: 'skill', name: 'Development', level: 'Master', keywords: ['C#', 'C#', 'Two\nlines'], custom: { keep: true } }],
      languages: [{ id: 'language', language: 'English', fluency: 'Native speaker', custom: true }],
    });
    const skills = skillsToDraft(original.resume.skills);
    const languages = languagesToDraft(original.resume.languages);
    expect(skills[0]!.level).toBe('Master');
    expect(languages[0]!.level).toBe('Native speaker');
    expect(applySkillsLanguages(original.resume, skills, languages)).toEqual(original.resume);
    skills[0]!.name = 'Updated';
    expect(applySkillsLanguages(original.resume, skills, languages).skills![0]!.custom).toEqual({ keep: true });
    expect(original.resume.skills![0]!.name).toBe('Development');
  });
  it('gives legacy entries stable identities without mutating the source or creating a dirty initial form', () => {
    const original = saved({ ...newResume(), skills: [{ name: 'Java' }, { name: 'Java' }], languages: [{ language: 'English' }] });
    const session = new ResumeSession('resume', original);
    expect(session.dirty).toBe(false);
    expect(session.skills[0]!.id).not.toBe(session.skills[1]!.id);
    const updated = applySkillsLanguages(original.resume, session.skills, session.languages);
    expect(skillsToDraft(updated.skills).map(entry => entry.id)).toEqual(session.skills.map(entry => entry.id));
    expect(languagesToDraft(updated.languages)[0]!.id).toBe(session.languages[0]!.id);
    expect(original.resume.skills![0]).not.toHaveProperty('id');
  });
  it('includes pending tag text on Save without mutating or clearing the draft', () => {
    const skill = newSkillDraft();
    skill.keywords.values = ['Java'];
    skill.keywords.input = ' Spring Boot ';
    expect(applySkillsLanguages(newResume(), [skill], []).skills![0]!.keywords).toEqual(['Java', 'Spring Boot']);
    expect(skill.keywords).toEqual({ values: ['Java'], input: ' Spring Boot ' });
    skill.keywords.input = 'JAVA';
    expect(applySkillsLanguages(newResume(), [skill], []).skills![0]!.keywords).toEqual(['Java']);
  });
  it('removes one selected tag, clears optional fields, and persists removed entries', () => {
    const original = { ...newResume(), skills: [{ id: 'a', name: 'Java', level: 'Expert', keywords: ['Java', 'Spring Boot'] }, { id: 'b', name: 'Testing', custom: true }], languages: [{ id: 'l', language: 'English', fluency: 'Fluent' }] };
    const skills = skillsToDraft(original.skills);
    const languages = languagesToDraft(original.languages);
    skills[0]!.keywords.values.splice(0, 1);
    expect(applySkillsLanguages(original, skills, languages).skills![0]!.keywords).toEqual(['Spring Boot']);
    skills[0]!.keywords.values = [];
    skills[0]!.name = skills[0]!.level = '';
    languages[0]!.name = languages[0]!.level = '';
    const cleared = applySkillsLanguages(original, skills, languages);
    expect(cleared.skills![0]).toEqual({ id: 'a' });
    expect(cleared.languages![0]).toEqual({ id: 'l' });
    skills.splice(0, 1);
    const removed = applySkillsLanguages(original, skills, []);
    expect(removed.skills).toEqual([{ id: 'b', name: 'Testing', custom: true }]);
    expect(removed.languages).toEqual([]);
    expect(applySkillsLanguages(original, [], []).skills).toEqual([]);
  });
  it.each([
    ['skills', { name: 123 }], ['skills', { level: [] }], ['skills', { keywords: 'Java' }], ['skills', { keywords: [false] }], ['skills', { id: ' ' }],
    ['languages', { language: {} }], ['languages', { fluency: false }], ['languages', { id: 123 }],
  ])('rejects invalid %s structure %j', (section, entry) => {
    expect(() => parseResume(JSON.stringify({ ...newResume(), [section as string]: [entry] }))).toThrow();
  });
  it.each(['skills', 'languages'])('rejects duplicate IDs within %s', section => {
    expect(() => parseResume(JSON.stringify({ ...newResume(), [section]: [{ id: 'same' }, { id: 'same' }] }))).toThrow('unique');
  });
});

describe('skills and languages save lifecycle', () => {
  it('tracks skills, language, and pending tag edits; saves explicitly; reopens cleanly with no duplicate tags', async () => {
    const original = saved({ ...newResume(), basics: { firstName: 'Alex', name: 'Alex' }, work: [{ id: 'job', current: false, name: 'Example' }], education: [{ id: 'school', current: false, institution: 'Example' }], skills: [{ id: 's', name: 'Development', keywords: ['Java'] }], languages: [{ id: 'l', language: 'English', fluency: 'Conversational' }] });
    const session = new ResumeSession('resume', original);
    const persist = vi.fn(async (base: string, resume: Resume) => saved(resume, base));
    expect(session.dirty).toBe(false);
    session.languages[0]!.level = 'Fluent';
    expect(session.dirty).toBe(true);
    session.languages[0]!.level = 'Conversational';
    expect(session.dirty).toBe(false);
    session.skills[0]!.keywords.input = 'Spring Boot';
    expect(session.dirty).toBe(true);
    session.skills[0]!.keywords.input = '';
    expect(session.dirty).toBe(false);
    session.skills[0]!.keywords.input = 'Spring Boot';
    session.skills[0]!.level = 'Advanced';
    session.languages[0]!.level = 'Working proficiency';
    expect(persist).not.toHaveBeenCalled();
    await session.save(persist);
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.basics).toEqual(original.resume.basics);
    expect(session.original!.resume.work).toEqual(original.resume.work);
    expect(session.original!.resume.education).toEqual(original.resume.education);
    const reopened = new ResumeSession('resume', session.original!);
    expect(reopened.dirty).toBe(false);
    expect(reopened.skills[0]!.keywords).toEqual({ values: ['Java', 'Spring Boot'], input: '' });
    expect(reopened.languages[0]!.level).toBe('Working proficiency');
    await reopened.save(persist);
    expect(reopened.original!.resume).toEqual(session.original!.resume);
  });
  it('keeps pending tags and other edits after a write failure, then allows retry', async () => {
    const session = new ResumeSession('resume');
    session.skills.push(Object.assign(newSkillDraft(), { name: 'Development' }));
    session.skills[0]!.keywords.input = 'Spring Boot';
    session.languages.push(Object.assign(newLanguageDraft(), { name: 'English', level: 'Fluent' }));
    await expect(session.save(async () => { throw new Error('Disk unavailable'); })).rejects.toThrow('Disk unavailable');
    expect(session.dirty).toBe(true);
    expect(session.saving).toBe(false);
    expect(session.skills[0]!.keywords.input).toBe('Spring Boot');
    expect(session.languages[0]!.name).toBe('English');
    await session.save(async (base, resume) => saved(resume, base));
    expect(session.dirty).toBe(false);
    expect(session.original!.resume.skills![0]!.keywords).toEqual(['Spring Boot']);
  });
  it('does not mark edits made during a pending write as saved', async () => {
    const session = new ResumeSession('resume');
    session.skills.push(newSkillDraft());
    session.languages.push(newLanguageDraft());
    let finish!: () => void;
    const pending = session.save((base, resume) => new Promise(resolve => { finish = () => resolve(saved(resume, base)); }));
    session.skills[0]!.keywords.input = 'Java';
    session.languages[0]!.name = 'English';
    finish();
    await pending;
    expect(session.dirty).toBe(true);
    expect(session.original!.resume.skills![0]).not.toHaveProperty('keywords');
    expect(session.original!.resume.languages![0]).not.toHaveProperty('language');
  });
});
