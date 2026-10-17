export function formatBulletList(items: string[] = []): string {
  return items.map(item => `- ${item}`).join('\n');
}

export function parseBulletList(text: string): string[] {
  return text.split(/\r\n|\n|\r/)
    .map(line => line.trim().replace(/^[-*+><#•](?:[ \t]+|$)/u, '').trim())
    .filter(Boolean);
}
