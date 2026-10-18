import { describe, expect, it } from 'vitest';
import { renderCapture } from './render';
import { fixture, observation } from './test-fixtures';

describe('inert local HTML', () => {
  it('escapes text and attributes and never carries scripts, events, navigation or resources into the viewer', () => {
    const capture = fixture(); const root = observation('e1', 'div'); delete root.control;
    root.children = [
      { ...observation('e2', 'script'), attributes: { src: 'https://example.com/evil.js' }, children: ['alert(1)'] },
      { ...observation('e3', 'img'), attributes: { src: 'https://example.com/tracker', onerror: 'alert(2)' } },
      { ...observation('e4', 'input'), attributes: { placeholder: '"><script>alert(3)</script>', autofocus: '', onfocus: 'alert(4)', formAction: 'https://example.com/submit' } },
      '<img src=x onerror=alert(5)>',
    ];
    capture.page.tree = root;
    const html = renderCapture(capture);
    expect(html).not.toMatch(/<script|<img|src="https|onerror="|onfocus="|formAction=|autofocus/);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("form-action 'none'");
  });
  it('restores current values/selection while keeping the observation unchanged', () => {
    const capture = fixture(); const before = JSON.stringify(capture);
    expect(renderCapture(capture)).toContain('value="Alex"');
    expect(JSON.stringify(capture)).toBe(before);
    capture.page.tree = { ...observation('e1', 'option'), selected: true };
    expect(renderCapture(capture)).toContain('selected=""');
  });
  it('excludes external CSS resources and forces submit/reset buttons to ordinary buttons', () => {
    const capture = fixture(); capture.page.tree = observation('e1', 'button');
    capture.page.tree.attributes.type = 'submit';
    capture.page.tree.styles = { color: 'red', 'background-image': 'url(https://example.com/track)', width: '1px; background:url(https://example.com/track)' };
    const html = renderCapture(capture);
    expect(html).toContain('type="button"');
    expect(html).toContain('color:red');
    expect(html).not.toContain('example.com/track');
  });
  it('exposes observation IDs and unavailable frame notes without including semantic labels', () => {
    const capture = fixture(); capture.page.tree = observation('e1', 'iframe'); capture.page.tree.boundary = 'Frame not accessible';
    const html = renderCapture(capture);
    expect(html).toContain('data-observation-id="e1"');
    expect(html).toContain('Frame not accessible');
    expect(html).not.toContain('basics.firstName');
  });
});
