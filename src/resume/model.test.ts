import { describe, expect, it } from 'vitest';
import { applyBasics, draftWarnings, newResume, parseResume, toDraft } from './model';

describe('resume data', () => {
  it('saves an empty resume without inventing required content', () => {
    const resume = newResume('fictional-id');
    expect(parseResume(JSON.stringify(applyBasics(resume, toDraft(resume))))).toEqual(resume);
  });
  it('round-trips names, phone strings, address, and multiple partial profiles', () => {
    const resume = newResume();
    const draft = toDraft(resume);
    Object.assign(draft, { firstName: ' Alex ', lastName: 'Taylor', phoneCountryCode: '+49', phoneNumber: '00123 4567', email: 'unfinished' });
    draft.location = { address: 'First line\nSecond line', postalCode: '00123', city: 'Berlin', countryCode: 'DE', region: '' };
    draft.profiles = [{ network: 'GitHub', username: 'alex' }, { url: 'https://example.com' }, {}];
    const saved = parseResume(JSON.stringify(applyBasics(resume, draft)));
    expect(saved.basics).toMatchObject({ firstName: 'Alex', lastName: 'Taylor', name: 'Alex Taylor', phoneCountryCode: '+49', phoneNumber: '00123 4567', phone: '+4900123 4567', email: 'unfinished' });
    expect(saved.basics.location).toEqual({ address: 'First line\nSecond line', postalCode: '00123', city: 'Berlin', countryCode: 'DE' });
    expect(saved.basics.profiles).toEqual([{ network: 'GitHub', username: 'alex' }, { url: 'https://example.com' }]);
    expect(toDraft(saved).phoneNumber).toBe('00123 4567');
    expect(draftWarnings(draft)).toContain('Check the email address. You can still save this draft.');
  });
  it('keeps unedited content and extensions without mutating the source', () => {
    const source = parseResume(JSON.stringify({ schemaVersion: 1, id: 'x', basics: { firstName: 'Alex', custom: { note: 'keep' }, location: { district: 'Mitte' }, profiles: [{ network: 'GitHub', custom: true }] }, work: [{ name: 'Example', location: 'Remote' }], documents: [{ path: 'documents/cv.pdf' }] }));
    const draft = toDraft(source);
    draft.firstName = 'Taylor';
    draft.profiles[0]!.username = 'example';
    const result = applyBasics(source, draft);
    expect(result.work).toEqual(source.work);
    expect(result.documents).toEqual(source.documents);
    expect(result.basics.custom).toEqual({ note: 'keep' });
    expect(result.basics.location).toEqual({ district: 'Mitte' });
    expect(result.basics.profiles?.[0]).toEqual({ network: 'GitHub', custom: true, username: 'example' });
    expect(source.basics.firstName).toBe('Alex');
    expect(source.basics.profiles?.[0]?.username).toBeUndefined();
  });
  it('clears removed content and its derived values, without resurrecting it', () => {
    const resume = parseResume(JSON.stringify({ schemaVersion: 1, id: 'x', basics: { firstName: 'Alex', name: 'Alex', phoneNumber: '123', phone: '123', location: { city: 'Berlin' }, profiles: [{ network: 'GitHub' }] } }));
    const draft = toDraft(resume);
    draft.firstName = '';
    draft.phoneNumber = '';
    draft.location.city = '';
    draft.profiles = [];
    const saved = applyBasics(resume, draft);
    expect(saved.basics).toEqual({});
    expect(applyBasics(saved, toDraft(saved)).basics).toEqual({});
  });
  it('preserves full names and phones with no components instead of guessing splits', () => {
    const resume = parseResume(JSON.stringify({ schemaVersion: 1, id: 'x', basics: { name: 'A name with several parts', phone: '+1 234' } }));
    expect(applyBasics(resume, toDraft(resume))).toEqual(resume);
  });
  it.each([
    ['{', 'not valid JSON'], ['[]', 'JSON object'],
    [JSON.stringify({ basics: { name: 'External' } }), 'Importing external'],
    [JSON.stringify({ schemaVersion: 2, id: 'x', basics: {} }), 'version'],
    [JSON.stringify({ schemaVersion: 1, basics: {} }), 'id'],
    [JSON.stringify({ schemaVersion: 1, id: 'x', basics: null }), 'basics'],
    [JSON.stringify({ schemaVersion: 1, id: 'x', basics: { email: 123 } }), 'basics.email'],
    [JSON.stringify({ schemaVersion: 1, id: 'x', basics: { location: [] } }), 'location'],
    [JSON.stringify({ schemaVersion: 1, id: 'x', basics: { profiles: [null] } }), 'profiles'],
    [JSON.stringify({ schemaVersion: 1, id: 'x', basics: {}, work: 'not a list' }), 'work'],
  ])('rejects damaged or unsupported data: %s', (text, message) => {
    expect(() => parseResume(text)).toThrow(message);
  });
  it('reports URL and phone concerns without blocking draft serialization', () => {
    const resume = newResume();
    const draft = toDraft(resume);
    Object.assign(draft, { url: 'javascript:alert(1)', phoneCountryCode: '49' });
    expect(draftWarnings(draft)).toHaveLength(3);
    expect(() => applyBasics(resume, draft)).not.toThrow();
  });
});
