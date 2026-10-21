// Display formatting shared by the screens.

export const formatClock = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatSeconds = (ms: number | null): string =>
  ms === null ? '–' : `${Math.max(1, Math.round(ms / 1000))} s`;

export const formatCost = (usd: number | null | undefined): string => {
  if (usd === null || usd === undefined) return '–';
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
};

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const capitalise = (text: string) =>
  text.length > 0 ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;

export const listOf = (items: string[]): string =>
  capitalise(
    new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
      items,
    ),
  );

export const excerpt = (text: string, max = 180): string => {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:]$/, '')}…`;
};
