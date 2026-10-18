import { filenameError } from '../resume/filenames';

export interface Observation {
  id: string;
  scope: string;
  tag: string;
  attributes: Record<string, string>;
  children: (Observation | string)[];
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  selected?: boolean;
  control?: { kind: string; value?: string; checked?: boolean; selected?: boolean; disabled: boolean; readOnly: boolean; labels: string[]; options?: { text: string; value: string; selected?: boolean }[] };
  boundary?: string;
}
export interface PageObservation {
  url: string; title: string; capturedAt: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  tree: Observation;
  omissions: string[];
  preserveValues: boolean;
}
export interface Capture {
  schemaVersion: 1; id: string; name: string; extensionVersion: string;
  page: PageObservation;
}
export const meanings: Record<string, string> = {
  unknown: 'Unknown', ignore: 'Ignore',
  'basics.firstName': 'Name', 'basics.lastName': 'Surname', 'basics.name': 'Name+Surname',
  'basics.email': 'Email', 'basics.phone': 'Phone (combined)', 'basics.phoneCountryCode': 'Phone country code', 'basics.phoneNumber': 'Phone number',
  'basics.label': 'Professional title', 'basics.summary': 'About you', 'basics.url': 'Website',
  'basics.location.address': 'Street address', 'basics.location.postalCode': 'Postal code', 'basics.location.city': 'City', 'basics.location.region': 'Region', 'basics.location.country': 'Country',
  'basics.profiles.url': 'Profile URL', 'basics.profiles.network': 'Profile network', 'basics.profiles.username': 'Profile username',
  'documents.resume': 'Resume PDF', 'documents.photo': 'Photo', 'coverLetter': 'Cover letter',
  'work.name': 'Work · Company', 'work.position': 'Work · Position', 'work.location': 'Work · Location',
  'work.description': 'Work · Employer description', 'work.url': 'Work · URL', 'work.startDate': 'Work · From', 'work.endDate': 'Work · To',
  'work.current': 'Work · Current', 'work.summary': 'Work · Summary', 'work.highlights': 'Work · Highlights', 'work.summaryAndHighlights': 'Work · Summary + highlights',
  'education.institution': 'Education · Institution', 'education.area': 'Education · Field of study', 'education.studyType': 'Education · Qualification',
  'education.location': 'Education · Location', 'education.url': 'Education · URL', 'education.score': 'Education · Grade / score',
  'education.startDate': 'Education · From', 'education.endDate': 'Education · To', 'education.current': 'Education · Current', 'education.courses': 'Education · Courses',
  'skills.name': 'Skill', 'skills.level': 'Skill level', 'languages.language': 'Language', 'languages.fluency': 'Language level',
  'action.addWork': 'Add work position', 'action.addEducation': 'Add education', 'action.next': 'Next', 'action.submit': 'Submit',
};
export const controlKinds = ['text', 'textarea', 'select', 'combobox', 'date', 'checkbox', 'radio', 'file', 'button', 'contenteditable', 'other'] as const;
export const dateParts = ['whole', 'day', 'month', 'year'] as const;
export interface Label { meaning: string; record?: number; kind: typeof controlKinds[number]; datePart?: typeof dateParts[number] }
export interface Annotations { schemaVersion: 1; captureId: string; labels: Record<string, Label> }
export function repeatedMeaning(meaning: string) { return /^(work|education)\./.test(meaning); }
export function captureName(value: string): string {
  const name = value.trim().normalize('NFC');
  const error = filenameError(name);
  if (error) throw new Error(error);
  if (name === '.' || name === '..' || name.endsWith('.')) throw new Error('Use a capture name that does not end with a dot.');
  return name;
}
export function elements(root: Observation): Observation[] {
  const all: Observation[] = [];
  const walk = (node: Observation) => { all.push(node); for (const child of node.children) if (typeof child !== 'string') walk(child); };
  walk(root); return all;
}
export function parseCapture(text: string): Capture {
  const data = JSON.parse(text) as Capture;
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
  const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (data?.schemaVersion !== 1 || typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.extensionVersion !== 'string' || !data.page || typeof data.page.url !== 'string' || typeof data.page.title !== 'string' || typeof data.page.capturedAt !== 'string' || !Number.isFinite(Date.parse(data.page.capturedAt)) || typeof data.page.preserveValues !== 'boolean' || !strings(data.page.omissions) || !data.page.viewport || !['width', 'height', 'scrollX', 'scrollY'].every(key => Number.isFinite(data.page.viewport[key as keyof PageObservation['viewport']]))) throw new Error('Invalid debug capture.');
  const ids = new Set<string>();
  let count = 0;
  const walk = (node: Observation, depth: number) => {
    if (depth > 200 || ++count > 50_000 || !node || !/^e\d+$/.test(node.id) || ids.has(node.id) || typeof node.scope !== 'string' || typeof node.tag !== 'string' || !Array.isArray(node.children) || !record(node.attributes) || !record(node.styles) || typeof node.visible !== 'boolean' || !node.rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(node.rect[key as keyof Observation['rect']]))) throw new Error('Invalid capture structure.');
    ids.add(node.id);
    for (const map of [node.attributes, node.styles]) if (Object.values(map).some(value => typeof value !== 'string')) throw new Error('Invalid capture attributes.');
    if (node.boundary !== undefined && typeof node.boundary !== 'string') throw new Error('Invalid capture boundary.');
    if (node.control && (typeof node.control.kind !== 'string' || !strings(node.control.labels) || typeof node.control.disabled !== 'boolean' || typeof node.control.readOnly !== 'boolean' || (node.control.value !== undefined && typeof node.control.value !== 'string'))) throw new Error('Invalid control observation.');
    for (const child of node.children) if (typeof child !== 'string') walk(child, depth + 1);
  };
  walk(data.page.tree, 0); return data;
}
export function parseAnnotations(text: string, capture: Capture): Annotations {
  const data = JSON.parse(text) as Annotations;
  if (data?.schemaVersion !== 1 || data.captureId !== capture.id || !data.labels || typeof data.labels !== 'object' || Array.isArray(data.labels)) throw new Error('Annotations do not belong to this capture.');
  const ids = new Set(elements(capture.page.tree).filter(node => node.control).map(node => node.id));
  for (const [id, label] of Object.entries(data.labels)) {
    if (!ids.has(id) || !label || typeof label.meaning !== 'string' || !Object.hasOwn(meanings, label.meaning) || !controlKinds.includes(label.kind) ||
      (label.record !== undefined && (![1, 2, 3].includes(label.record) || !repeatedMeaning(label.meaning))) ||
      (label.datePart !== undefined && !dateParts.includes(label.datePart))) throw new Error('Invalid field annotation.');
  }
  return data;
}
