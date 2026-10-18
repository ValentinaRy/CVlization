import type { Observation, PageObservation } from './model';

/** Self-contained: Chrome serializes this function into the isolated content-script world. */
export function collectPage(preserveValues: boolean): PageObservation {
  let count = 0;
  let textBytes = 0;
  const omissions = new Set<string>([
    'Site scripts, stylesheet text, event handlers, comments, nonce/token attributes, password/hidden input values and file contents are omitted.',
    'No external images, fonts, CSS files or other resources are downloaded. Selected computed styles are recorded; pseudo-elements and canvas pixels are not captured.',
    'Only DOM present at capture time is observed. Virtualized options, later steps and backend state are not reconstructed.',
  ]);
  if (!preserveValues) omissions.add('Current values, checked/selected states and editable text are omitted by the capture policy; option catalogs remain available.');
  const styleNames = ['display', 'visibility', 'opacity', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'white-space', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'border-width', 'border-style', 'border-color', 'border-radius', 'width', 'max-width', 'min-width', 'height', 'min-height', 'box-sizing', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'gap', 'grid-template-columns', 'grid-column', 'grid-row'];
  function visit(element: Element, depth: number, clearText = false, scope = 'main'): Observation {
    if (depth > 200 || ++count > 50_000) throw new Error('This page is too large to capture completely (50,000 elements / depth 200). Choose a smaller form state.');
    const doc = element.ownerDocument;
    const win = doc.defaultView!;
    const tag = element.localName.toLowerCase();
    const id = `e${count}`;
    const type = (element.getAttribute('type') ?? '').toLowerCase();
    const protectedInput = tag === 'input' && ['password', 'hidden', 'file'].includes(type);
    const editable = element.getAttribute('contenteditable') === '' || element.getAttribute('contenteditable') === 'true';
    clearText ||= !preserveValues && (tag === 'textarea' || editable);
    const attributes: Record<string, string> = {};
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name) || /nonce|token|csrf/i.test(attribute.name) || attribute.name === 'srcdoc') continue;
      if (protectedInput && ['value', 'data-value', 'aria-valuenow', 'aria-valuetext'].includes(attribute.name)) continue;
      if (!preserveValues && (['checked', 'selected', 'aria-checked', 'aria-selected', 'aria-valuenow', 'aria-valuetext'].includes(attribute.name) || (attribute.name === 'value' && tag === 'input'))) continue;
      attributes[attribute.name] = attribute.value;
    }
    const computed = win.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const styles = Object.fromEntries(styleNames.map(name => [name, computed.getPropertyValue(name)]));
    const observation: Observation = {
      id, scope, tag, attributes, children: [], styles,
      rect: { x: rect.x + win.scrollX, y: rect.y + win.scrollY, width: rect.width, height: rect.height },
      visible: rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0 && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    };
    const role = element.getAttribute('role') ?? '';
    if (['input', 'textarea', 'select', 'button'].includes(tag) || editable || ['textbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'spinbutton', 'slider', 'button'].includes(role) || element.hasAttribute('aria-haspopup') || element.hasAttribute('tabindex')) {
      const control = element as HTMLInputElement;
      let kind = role || 'other';
      if (tag === 'input') kind = ['checkbox', 'radio', 'file', 'date', 'month', 'week', 'datetime-local'].includes(type) ? (['month', 'week', 'datetime-local'].includes(type) ? 'date' : type) : ['submit', 'reset', 'button'].includes(type) ? 'button' : 'text';
      else if (['textarea', 'select', 'button'].includes(tag)) kind = tag;
      else if (editable) kind = 'contenteditable';
      observation.control = {
        kind, disabled: element.matches(':disabled') || !!control.disabled || element.getAttribute('aria-disabled') === 'true', readOnly: !!control.readOnly || element.getAttribute('aria-readonly') === 'true',
        labels: Array.from(control.labels ?? []).map(label => label.textContent ?? ''),
      };
      if (!protectedInput && preserveValues && typeof control.value === 'string') observation.control.value = control.value;
      if (preserveValues && tag === 'input' && ['checkbox', 'radio'].includes(type)) observation.control.checked = control.checked;
      if (tag === 'select') observation.control.options = Array.from((element as HTMLSelectElement).options).map(option => ({ text: option.text, value: option.value, ...(preserveValues ? { selected: option.selected } : {}) }));
    }
    if (tag === 'option' && preserveValues) {
      // Selection is a live property, not necessarily reflected in the source attribute.
      observation.selected = (element as HTMLOptionElement).selected;
    }
    if (protectedInput || ['script', 'style', 'noscript'].includes(tag)) return observation;
    for (const child of element.childNodes) {
      if (child.nodeType === 1) observation.children.push(visit(child as Element, depth + 1, clearText, scope));
      else if (child.nodeType === 3 && !clearText) {
        const text = child.textContent ?? '';
        textBytes += text.length;
        if (textBytes > 8_000_000) throw new Error('This page contains too much text to capture completely.');
        observation.children.push(text);
      }
    }
    let shadow = element.shadowRoot;
    try {
      if (element.namespaceURI === 'http://www.w3.org/1999/xhtml') shadow = chrome.dom?.openOrClosedShadowRoot(element as HTMLElement) ?? shadow;
      if (!chrome.dom?.openOrClosedShadowRoot) omissions.add('Closed shadow-root inspection is unavailable in this browser; only open roots are observed.');
    } catch { omissions.add(`Shadow-root inspection unavailable at ${id}.`); }
    if (shadow) {
      observation.boundary = `Shadow root (${shadow.mode}); light DOM retained, shadow children appended for inspection.`;
      for (const child of shadow.childNodes) {
        if (child.nodeType === 1) observation.children.push(visit(child as Element, depth + 1, clearText, `${scope}/shadow:${id}`));
        else if (child.nodeType === 3 && !clearText) observation.children.push(child.textContent ?? '');
      }
    }
    if (tag === 'iframe' || tag === 'frame') {
      try {
        const frameDoc = (element as HTMLIFrameElement).contentDocument;
        if (!frameDoc?.documentElement) throw new Error('No document access');
        observation.boundary = `Frame captured: ${frameDoc.URL}`;
        observation.children.push(visit(frameDoc.documentElement, depth + 1, false, `${scope}/frame:${id}`));
      } catch (error) {
        observation.boundary = `Frame not collected: ${error instanceof Error ? error.message : 'Access unavailable'}.`;
        omissions.add(`${id}: frame not collected (${element.getAttribute('src') ?? 'no source URL'}).`);
      }
    }
    return observation;
  }
  const tree = visit(document.documentElement, 0);
  const result = {
    url: location.href, title: document.title, capturedAt: new Date().toISOString(),
    viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
    tree, omissions: [...omissions], preserveValues,
  };
  if (JSON.stringify(result).length > 32_000_000) throw new Error('This snapshot is too large to transfer completely. Choose a smaller form state.');
  return result;
}
