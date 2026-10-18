import { debugTheme } from './theme';
import type { Capture, Observation } from './model';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const tags = new Set('div span p label input textarea select option optgroup button form fieldset legend section article main header footer nav aside h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr td th caption colgroup col br hr strong b em i small sup sub pre code details summary output datalist'.split(' '));
const voidTags = new Set(['input', 'br', 'hr', 'col']);
const attributes = new Set('type name placeholder title role aria-label aria-labelledby aria-describedby aria-expanded aria-haspopup aria-required aria-invalid aria-checked aria-selected aria-controls autocomplete required multiple rows cols size min max step minlength maxlength pattern for colspan rowspan scope'.split(' '));
const cssNames = new Set('display visibility opacity color background-color font-family font-size font-weight font-style line-height text-align white-space padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left border-width border-style border-color border-radius width max-width min-width height min-height box-sizing flex-direction flex-wrap align-items justify-content gap grid-template-columns grid-column grid-row'.split(' '));
export function renderCapture(capture: Capture): string {
  function render(node: Observation): string {
    if (['script', 'style', 'noscript', 'head', 'link', 'meta', 'base'].includes(node.tag)) return '';
    const tag = tags.has(node.tag) ? node.tag : 'div';
    const attrs: Record<string, string> = { 'data-observation-id': node.id };
    // IDs and relation attributes belong to the static document; no navigation/resources/events are copied.
    if (node.attributes.id) attrs.id = node.attributes.id;
    for (const [key, value] of Object.entries(node.attributes)) if (attributes.has(key)) attrs[key] = value;
    if (tag === 'input' && ['password', 'file'].includes(attrs.type ?? '')) attrs.type = 'text';
    if (tag === 'button' || (tag === 'input' && ['submit', 'reset', 'image'].includes(attrs.type ?? ''))) attrs.type = 'button';
    if (node.attributes.hidden !== undefined) attrs.hidden = '';
    if (node.control?.disabled) attrs.disabled = '';
    if (node.control?.readOnly) attrs.readonly = '';
    if (tag === 'input' && node.control?.value !== undefined) attrs.value = node.control.value;
    if (node.control?.checked) attrs.checked = '';
    if (tag === 'option') {
      attrs.value = node.attributes.value ?? '';
      if (node.selected) attrs.selected = '';
    }
    const styles = Object.entries(node.styles).filter(([key, value]) => cssNames.has(key) && !/[<>;{}\\]|url\s*\(|expression|@/i.test(value));
    attrs.style = styles.map(([key, value]) => `${key}:${value}`).join(';');
    const attributesHtml = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('');
    const children = tag === 'textarea' ? escapeHtml(node.control?.value ?? '') : node.children.map(child => typeof child === 'string' ? escapeHtml(child) : render(child)).join('');
    const boundary = node.boundary ? `<p class="capture-boundary">${escapeHtml(node.boundary)}</p>` : '';
    return `<${tag}${attributesHtml}>${voidTags.has(tag) ? '' : `${boundary}${children}</${tag}>`}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(capture.name)}</title><style>${debugTheme}body{margin:16px;background:var(--debug-input);color:var(--debug-page-text);font-family:system-ui}*{box-sizing:border-box}.capture-boundary{padding:8px;border:1px dashed var(--debug-border);font:13px system-ui;color:var(--debug-text);background:var(--debug-surface)}img{display:none}form{pointer-events:none}input,textarea,select,button{pointer-events:auto}</style></head><body><p class="capture-boundary">Static capture: ${escapeHtml(capture.name)}. Site scripts and external resources are disabled. Open through CVlization Debug to annotate.</p>${render(capture.page.tree)}</body></html>`;
}
