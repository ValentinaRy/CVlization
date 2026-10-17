/** Calendar dates only: no timezone conversion and no limits relative to today. */
export function normalizeDate(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Use YYYY-MM-DD or YYYY-MM.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? '01');
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) {
    throw new Error('Enter a real calendar date.');
  }
  return `${match[1]}-${match[2]}-${match[3] ?? '01'}`;
}

/** Human-facing day/month/year input; storage always uses ISO calendar dates. */
export function parseDateInput(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const full = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const month = /^(\d{2})\/(\d{4})$/.exec(value);
  if (full) return normalizeDate(`${full[3]}-${full[2]}-${full[1]}`);
  if (month) return normalizeDate(`${month[2]}-${month[1]}`);
  throw new Error('Use DD/MM/YYYY (or MM/YYYY for day 01).');
}

export function formatDateForInput(stored: string = ''): string {
  try {
    const date = normalizeDate(stored);
    if (!date) return '';
    return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  } catch {
    // Keep malformed file contents visible so the user can correct them.
    return stored;
  }
}
