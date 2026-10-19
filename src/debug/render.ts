import { debugTheme } from './theme';
import type { Capture, Observation } from './model';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const tags = new Set('div span p label input textarea select option optgroup button form fieldset legend section article main header footer nav aside h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr td th caption colgroup col br hr strong b em i small sup sub pre code details summary output datalist'.split(' '));
const voidTags = new Set(['input', 'br', 'hr', 'col']);
const attributes = new Set('type name placeholder title role aria-label aria-labelledby aria-describedby aria-expanded aria-haspopup aria-required aria-invalid aria-checked aria-selected aria-controls autocomplete required multiple rows cols size min max step minlength maxlength pattern for colspan rowspan scope'.split(' '));
// Source CSS stays in capture.json. A single consistent flow avoids mixing
// fixed source dimensions with the additional annotation panels.
const viewCss = `
body{margin:16px;background:var(--debug-input);color:var(--debug-page-text);font:16px/1.5 system-ui}
*{box-sizing:border-box;overflow-wrap:anywhere}
[hidden]{display:none!important}
.capture-page{max-width:1000px;margin:auto}
.capture-page div,.capture-page section,.capture-page form,.capture-page fieldset{min-width:0}
p{margin:10px 0}label{display:block;margin:8px 0 4px;font-weight:600}
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:20px 0 10px}
fieldset{margin:16px 0;padding:12px;border:1px solid var(--debug-border)}
legend{padding:0 6px;font-weight:600}
input,textarea,select,button{font:inherit;color:var(--debug-page-text);background:var(--debug-input);border:1px solid var(--debug-border);border-radius:6px;padding:8px;min-width:0;max-width:100%;pointer-events:auto}
input,textarea,select{display:block;width:100%}
input[type=checkbox],input[type=radio]{width:auto;display:inline-block}
textarea{min-height:90px;resize:vertical}
button{display:block;margin:8px 0}
form{pointer-events:none}
table,thead,tbody,tfoot,tr,td,th{display:block;width:auto}
pre{white-space:pre-wrap}
.capture-boundary{padding:8px;border:1px dashed var(--debug-border);font:13px/1.5 system-ui;color:var(--debug-text);background:var(--debug-surface)}
`;
export function renderCapture(capture: Capture): string {
  function render(node: Observation): string {
    if (['script', 'style', 'noscript', 'head', 'link', 'meta', 'base'].includes(node.tag)) return '';
    const tag = node.tag === 'a' ? 'span' : tags.has(node.tag) ? node.tag : /^(inline|contents)/.test(node.styles.display ?? '') || ['svg', 'path'].includes(node.tag) ? 'span' : 'div';
    const attrs: Record<string, string> = { 'data-observation-id': node.id };
    // IDs and relation attributes belong to the static document; no navigation/resources/events are copied.
    if (node.attributes.id) attrs.id = node.attributes.id;
    for (const [key, value] of Object.entries(node.attributes)) if (attributes.has(key)) attrs[key] = value;
    if (tag === 'input' && ['password', 'file'].includes(attrs.type ?? '')) attrs.type = 'text';
    if (tag === 'button' || (tag === 'input' && ['submit', 'reset', 'image'].includes(attrs.type ?? ''))) attrs.type = 'button';
    if (node.attributes.hidden !== undefined || node.styles.display === 'none' || node.styles.visibility === 'hidden' || node.styles.visibility === 'collapse' || node.styles.opacity === '0') attrs.hidden = '';
    if (node.control?.disabled) attrs.disabled = '';
    if (node.control?.readOnly) attrs.readonly = '';
    if (tag === 'input' && node.control?.value !== undefined) attrs.value = node.control.value;
    if (node.control?.checked) attrs.checked = '';
    if (tag === 'option') {
      attrs.value = node.attributes.value ?? '';
      if (node.selected) attrs.selected = '';
    }
    const attributesHtml = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('');
    let children = tag === 'textarea' ? escapeHtml(node.control?.value ?? '') : node.children.map(child => typeof child === 'string' ? escapeHtml(child) : render(child)).join('');
    if (tag === 'button' && !node.children.some(child => typeof child === 'string' && child.trim()) && node.children.every(child => typeof child === 'string' || child.tag === 'svg')) children = escapeHtml(node.attributes['aria-label'] || node.attributes.title || 'Button');
    const boundary = node.boundary ? `<p class="capture-boundary">${escapeHtml(node.boundary)}</p>` : '';
    return `<${tag}${attributesHtml}>${voidTags.has(tag) ? '' : `${boundary}${children}</${tag}>`}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(capture.name)}</title><style>${debugTheme}${viewCss}</style></head><body><p class="capture-boundary">Static capture: ${escapeHtml(capture.name)}. Simplified layout for annotation; original styles and geometry remain in capture.json. Site scripts and external resources are disabled.</p><main class="capture-page">${render(capture.page.tree)}</main></body></html>`;
}
