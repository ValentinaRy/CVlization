export function filenameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}
export function filenameError(base: string): string | undefined {
  base = base.trim();
  if (!base) return 'Enter a filename.';
  if (/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(base)) {
    return 'Do not use < > : " / \\ | ? * or control characters in the filename.';
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) return 'This filename is reserved. Choose another name.';
  if (new TextEncoder().encode(`${base}.json`).length > 255) return 'Use a shorter filename (at most 250 UTF-8 bytes before .json).';
  return undefined;
}
export function suggestedFilename(entries: readonly string[]): string {
  const used = new Set(entries.map(filenameKey));
  let base = 'resume';
  for (let i = 2; used.has(filenameKey(`${base}.json`)); i++) base = `resume-${i}`;
  return base;
}
export function assertAvailable(base: string, entries: readonly string[], originalName?: string) {
  const error = filenameError(base);
  if (error) throw new Error(error);
  const target = `${base.trim()}.json`;
  if (target !== originalName && entries.some(name => filenameKey(name) === filenameKey(target))) {
    throw new Error('This filename already exists. Choose another name; existing files are never replaced by a new resume.');
  }
}
