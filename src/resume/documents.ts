import type { Resume } from './model';

export const documentKinds = ['resume', 'photo'] as const;
export type DocumentKind = typeof documentKinds[number];
export interface LocalDocument {
  [key: string]: unknown;
  id: string;
  path: string;
  mediaType: 'application/pdf' | 'image/jpeg';
  size: number;
}
export interface PendingDocument { id: string; blob: Blob; sourceName: string }
export interface DocumentSelection { reference?: LocalDocument; pending?: PendingDocument }
export type DocumentsDraft = Partial<Record<DocumentKind, DocumentSelection>>;
export const PHOTO_MAX_BYTES = 2_000_000;

export function documentPathParts(path: string): string[] {
  const parts = path.split('/');
  if (parts.length < 2 || parts[0] !== 'documents' || parts.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f]/.test(part))) {
    throw new Error('The attachment path must stay inside the workspace documents folder.');
  }
  return parts;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function documentsToDraft(resume: Resume): DocumentsDraft {
  const draft: DocumentsDraft = {};
  // Preserve older/custom document registries until the user changes attachments.
  if (!isObject(resume.documents)) return draft;
  for (const kind of documentKinds) {
    const reference = resume.documents[kind];
    if (reference === undefined) continue;
    if (!isObject(reference) || typeof reference.id !== 'string' || typeof reference.path !== 'string' ||
      reference.mediaType !== (kind === 'resume' ? 'application/pdf' : 'image/jpeg') ||
      typeof reference.size !== 'number' || !Number.isFinite(reference.size) || reference.size < 0) {
      throw new Error(`The saved ${kind} attachment reference is invalid. Check the JSON file before editing.`);
    }
    documentPathParts(reference.path);
    draft[kind] = { reference: { ...reference } as LocalDocument };
  }
  return draft;
}
export function documentsSnapshot(draft: DocumentsDraft): string {
  return JSON.stringify(documentKinds.map(kind => [kind, draft[kind]?.reference, draft[kind]?.pending?.id]));
}
export function applyDocuments(resume: Resume, references: Partial<Record<DocumentKind, LocalDocument>>): Resume {
  if (resume.documents !== undefined && !isObject(resume.documents)) {
    if (Object.keys(references).length) throw new Error('This resume uses a custom documents format. Move that data to another field before adding attachments.');
    return resume;
  }
  const documents = { ...(resume.documents as Record<string, unknown> | undefined) };
  for (const kind of documentKinds) {
    if (references[kind]) documents[kind] = references[kind];
    else delete documents[kind];
  }
  const result = { ...resume };
  if (Object.keys(documents).length) result.documents = documents;
  else delete result.documents;
  return result;
}

export async function validateSource(file: File, kind: DocumentKind): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const pdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (kind === 'resume' ? !/\.pdf$/i.test(file.name) || !pdf : !/\.(png|jpe?g)$/i.test(file.name) || !(png || jpeg)) {
    throw new Error(kind === 'resume' ? 'Choose a PDF file.' : 'Choose a PNG or JPEG photo.');
  }
}
