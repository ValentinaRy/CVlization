import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectPage } from './collect';
import { elements } from './model';

// Small DOM-observation doubles for collector policy tests; no browser/UI harness.
function page() {
  const document = { URL: 'https://example.com/apply', title: 'Fixture', documentElement: undefined as unknown, defaultView: {
    scrollX: 0, scrollY: 0, getComputedStyle: () => ({ getPropertyValue: (name: string) => name === 'display' ? 'block' : '' }),
  } };
  function element(tag: string, attrs: Record<string, string> = {}, children: unknown[] = []) {
    return {
      nodeType: 1, localName: tag, namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: document,
      attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })), childNodes: children,
      getAttribute: (name: string) => attrs[name] ?? null, hasAttribute: (name: string) => Object.hasOwn(attrs, name),
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 200, height: 30 }), getClientRects: () => [{}],
      checkVisibility: () => true, matches: () => false,
      labels: [] as { textContent: string }[], value: '', checked: false, disabled: false, readOnly: false,
      options: [] as { text: string; value: string; selected: boolean }[], selected: false,
      shadowRoot: null as unknown, contentDocument: null as unknown,
    };
  }
  const root = element('html'); document.documentElement = root;
  vi.stubGlobal('document', document); vi.stubGlobal('location', { href: document.URL });
  for (const [key, value] of Object.entries({ innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0 })) vi.stubGlobal(key, value);
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: (node: { shadowRoot: unknown }) => node.shadowRoot } });
  return { root, element, document };
}
afterEach(() => vi.unstubAllGlobals());
describe('capture observations and omissions', () => {
  it('is self-contained when serialized for script injection and reads live values, labels and options', () => {
    const p = page(); const input = p.element('input', { name: 'first', value: 'default' });
    input.value = 'Current'; input.labels = [{ textContent: 'First name' }];
    const select = p.element('select'); select.options = [{ text: 'Bachelor', value: 'ba', selected: true }];
    p.root.childNodes = [input, select];
    const injected = new Function(`return (${collectPage.toString()})`)() as typeof collectPage;
    const result = injected(true);
    const controls = elements(result.tree).filter(node => node.control);
    expect(controls[0]?.attributes.value).toBe('default');
    expect(controls[0]?.control?.value).toBe('Current');
    expect(controls[0]?.control?.labels).toEqual(['First name']);
    expect(controls[1]?.control?.options).toEqual([{ text: 'Bachelor', value: 'ba', selected: true }]);
  });
  it('omits protected values, scripts and protected control internals', () => {
    const p = page(); const password = p.element('input', { type: 'password', value: 'private-password', 'data-token': 'private-token' });
    password.value = 'private-password'; password.shadowRoot = { mode: 'closed', childNodes: [{ nodeType: 3, textContent: 'private-shadow' }] };
    const hidden = p.element('input', { type: 'hidden', value: 'private-hidden' }); hidden.value = 'private-hidden';
    const file = p.element('input', { type: 'file', value: 'private-file' }); file.value = 'private-file';
    const script = p.element('script', {}, [{ nodeType: 3, textContent: 'private-script' }]);
    p.root.childNodes = [password, hidden, file, script];
    const result = collectPage(true);
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(result.omissions.join(' ')).toContain('password/hidden');
  });
  it('clears current choices and typed values when requested without dropping the option catalog', () => {
    const p = page(); const input = p.element('input', { value: 'entered', checked: '' }); input.value = 'entered'; input.checked = true;
    const text = p.element('textarea', {}, [{ nodeType: 3, textContent: 'entered' }]); text.value = 'entered';
    const select = p.element('select'); select.options = [{ text: 'Bachelor', value: 'ba', selected: true }];
    p.root.childNodes = [input, text, select];
    const result = collectPage(false);
    expect(JSON.stringify(result)).not.toContain('entered');
    expect(elements(result.tree).at(-1)?.control?.options).toEqual([{ text: 'Bachelor', value: 'ba' }]);
    expect(result.omissions.join(' ')).toContain('checked/selected');
  });
  it('records unavailable frames and reachable shadow content without changing the source tree', () => {
    const p = page(); const host = p.element('custom-picker'); const nested = p.element('input');
    host.shadowRoot = { mode: 'closed', childNodes: [nested] };
    const frame = p.element('iframe', { src: 'https://other.example/form' });
    p.root.childNodes = [host, frame];
    const result = collectPage(true);
    expect(elements(result.tree).find(node => node.tag === 'custom-picker')?.boundary).toContain('closed');
    expect(elements(result.tree).filter(node => node.control)).toHaveLength(1);
    expect(result.omissions.join(' ')).toContain('frame not collected');
    expect(p.root.childNodes).toEqual([host, frame]);
  });
});
