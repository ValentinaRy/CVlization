import { describe, expect, it } from 'vitest';
import { assertAvailable, filenameError, suggestedFilename } from './filenames';

describe('workspace filenames', () => {
  it.each(['', ' ', '../resume', 'folder/resume', 'folder\\resume', 'my:cv', 'cv*', 'cv?', 'cv"', 'cv<', 'cv>', 'cv|', 'cv\nname', 'CON', 'con.txt', 'LPT1', 'a'.repeat(251)])('rejects unsafe filename %j', name => {
    expect(filenameError(name)).toBeDefined();
  });
  it.each(['resume', 'Java Developer', 'CV-EN_2', 'Резюме', 'développeuse', 'v1.2', 'resume.', 'resume..', ' resume ', '.hidden', 'CV, Java (EN)', 'resume.json', 'CV & QA', 'Résumé 🦄'])('accepts safe filename %s', name => {
    expect(filenameError(name)).toBeUndefined();
  });
  it('suggests a free name, including case-insensitive matches and directory names', () => {
    expect(suggestedFilename([])).toBe('resume');
    expect(suggestedFilename(['RESUME.JSON', 'resume-2.json', 'resume-4.json'])).toBe('resume-3');
  });
  it('prevents replacement of another file, including Unicode/case aliases', () => {
    expect(() => assertAvailable('Résumé', ['Résumé.json'])).toThrow('already exists');
    expect(() => assertAvailable('resume', ['Resume.json'])).toThrow('already exists');
    expect(() => assertAvailable(' resume ', ['resume.json'])).toThrow('already exists');
    expect(() => assertAvailable(' resume ', ['resume.json'], 'resume.json')).not.toThrow();
    expect(() => assertAvailable('resume', ['resume.json'], 'resume.json')).not.toThrow();
    expect(() => assertAvailable('resume', ['resume.json'], 'other.json')).toThrow('already exists');
  });
});
