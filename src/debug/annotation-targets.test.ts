import { describe, expect, it } from 'vitest';
import { showAnnotation } from './annotation-targets';
import { fixture, observation } from './test-fixtures';
import { parseAnnotations } from './model';

describe('annotation targets', () => {
  it.each([['ul', 'listbox'], ['li', 'option'], ['div', 'option']])('omits %s/%s options even when expanded', (tag, role) => {
    const node = { ...observation('e1', tag), attributes: { role } };
    expect(showAnnotation(node, false, false)).toBe(false);
    expect(showAnnotation(node, true, false)).toBe(false);
  });
  it.each(['input', 'textarea', 'select', 'button'])('keeps hidden native %s controls available', tag => {
    expect(showAnnotation(observation('e1', tag), false, false)).toBe(true);
  });
  it('keeps custom interactive controls but drops hidden focusable containers', () => {
    const container = { ...observation('e1', 'div'), attributes: { tabindex: '-1' } };
    expect(showAnnotation(container, false, false)).toBe(false);
    expect(showAnnotation({ ...container, attributes: { role: 'combobox' } }, false, false)).toBe(true);
    expect(showAnnotation({ ...container, tag: 'li', attributes: { role: 'button' } }, false, false)).toBe(true);
    expect(showAnnotation({ ...container, tag: 'select', attributes: { role: 'listbox' } }, false, false)).toBe(true);
  });
  it('keeps previously labeled options editable without removing them from observations', () => {
    const node = { ...observation('e1', 'li'), attributes: { role: 'option' } };
    const before = JSON.stringify(node);
    expect(showAnnotation(node, false, true)).toBe(true);
    expect(JSON.stringify(node)).toBe(before);
  });
  it.each(['basics.profiles.linkedin.url', 'basics.profiles.github.url'])('round-trips the network-specific label %s', meaning => {
    const capture = fixture();
    const data = { schemaVersion: 1, captureId: capture.id, labels: { e1: { meaning, kind: 'text' } } };
    expect(parseAnnotations(JSON.stringify(data), capture)).toEqual(data);
  });
});
