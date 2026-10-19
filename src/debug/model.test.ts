import { describe, expect, it } from 'vitest';
import { captureName, meanings, parseAnnotations, parseCapture } from './model';
import { fixture, observation } from './test-fixtures';

describe('capture names and fixture identity', () => {
  it('keeps readable names and normalizes surrounding whitespace', () => {
    expect(captureName('  Greenhouse — page 2  ')).toBe('Greenhouse — page 2');
    expect(captureName('Форма, шаг 2')).toBe('Форма, шаг 2');
  });
  it.each(['', ' ', '.', '..', '../escape', 'a/b', 'a\\b', 'con', 'a\u0000b', 'x'.repeat(251)])('rejects unsafe name %j', name => {
    expect(() => captureName(name)).toThrow();
  });
  it('restores complete observations without adding expected labels', () => {
    const source = fixture();
    expect(parseCapture(JSON.stringify(source))).toEqual(source);
    expect(JSON.stringify(source)).not.toContain('meaning');
  });
  it('rejects duplicate element references, unsupported versions and malformed attributes', () => {
    const source = fixture(); source.page.tree.children.push(observation());
    expect(() => parseCapture(JSON.stringify(source))).toThrow('structure');
    expect(() => parseCapture(JSON.stringify({ ...fixture(), schemaVersion: 2 }))).toThrow('Invalid debug');
    const bad = fixture(); bad.page.tree.attributes = { id: 42 } as never;
    expect(() => parseCapture(JSON.stringify(bad))).toThrow('attributes');
  });
});
describe('annotation meaning and group membership', () => {
  it('distinguishes first, last and combined names', () => {
    expect([meanings['basics.firstName'], meanings['basics.lastName'], meanings['basics.name']]).toEqual(['Name', 'Surname', 'Name+Surname']);
  });
  it.each([1, 2, 3])('persists work/education record %i independently of control kind', record => {
    const source = fixture();
    for (const meaning of ['work.startDate', 'education.endDate']) {
      const data = { schemaVersion: 1, captureId: source.id, labels: { e1: { meaning, kind: 'select', datePart: 'month', record } } };
      expect(parseAnnotations(JSON.stringify(data), source)).toEqual(data);
    }
  });
  it('supports partial/unmarked captures without changing the source', () => {
    const source = fixture(); const before = JSON.stringify(source);
    expect(parseAnnotations(JSON.stringify({ schemaVersion: 1, captureId: source.id, labels: {} }), source).labels).toEqual({});
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([
    { meaning: 'fiction', kind: 'text' }, { meaning: 'work.name', kind: 'text', record: 4 },
    { meaning: 'basics.firstName', kind: 'text', record: 2 }, { meaning: 'work.startDate', kind: 'date', datePart: 'century' },
  ])('rejects invalid annotation %j', label => {
    expect(() => parseAnnotations(JSON.stringify({ schemaVersion: 1, captureId: fixture().id, labels: { e1: label } }), fixture())).toThrow('Invalid field');
  });
  it('rejects another capture and labels for non-existent elements', () => {
    expect(() => parseAnnotations(JSON.stringify({ schemaVersion: 1, captureId: 'other', labels: {} }), fixture())).toThrow('belong');
    expect(() => parseAnnotations(JSON.stringify({ schemaVersion: 1, captureId: fixture().id, labels: { e99: { meaning: 'ignore', kind: 'text' } } }), fixture())).toThrow('Invalid field');
  });
});
