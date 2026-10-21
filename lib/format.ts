// Client-side display helpers (ru-RU). Only call these with data fetched in the browser,
// so server prerendering never formats dates in a different time zone than the user's.

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

function parse(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string): string {
  const d = parse(iso);
  return d ? dateFmt.format(d) : '—';
}

export function formatDateTime(iso: string): string {
  const d = parse(iso);
  return d ? dateTimeFmt.format(d) : '—';
}

export function formatTime(iso: string): string {
  const d = parse(iso);
  return d ? timeFmt.format(d) : '—';
}

/** Russian plural: plural(5, ['ответ', 'ответа', 'ответов']) → 'ответов'. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export const countLabel = (n: number, forms: readonly [string, string, string]) => `${n} ${plural(n, forms)}`;

/** Ratio (0..1) → '42%' / '42,5%'; null → '—'. */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

/** Share of part in total as a percent string, '—' when total is 0. */
export const shareOf = (part: number, total: number) => (total > 0 ? formatPercent(part / total) : '—');

export function truncate(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
