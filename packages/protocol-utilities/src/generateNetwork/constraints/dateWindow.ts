export type DateResolution = 'full' | 'month' | 'year';

/**
 * A closed date range at a single resolution. Bounds are strings at that
 * resolution: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.
 */
export type DateWindow = {
  min?: string;
  max?: string;
  resolution: DateResolution;
};

// Deliberately duplicated from fresco-ui's form/utils/ymd, which this package
// cannot depend on (protocol-utilities must stay free of UI dependencies).
// Arithmetic runs in UTC so bounds are stable regardless of runtime timezone;
// the runtime's min/max validators compare these strings lexically, so any
// drift would produce off-by-one-day failures near DST boundaries. The
// duplication is verified rather than trusted: @codaco/interview depends on
// both packages and holds the two implementations to the same results
// (src/forms/__tests__/ymdParity.test.ts). Constants shared with those fields
// are not duplicated at all — they live in @codaco/shared-consts, which this
// package already depends on.
function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return ymd;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function todayYmd(): string {
  const now = new Date();
  return formatYmd(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}

export function truncateToResolution(
  value: string,
  resolution: DateResolution,
): string {
  if (resolution === 'year') return value.slice(0, 4);
  if (resolution === 'month') return value.slice(0, 7);
  return value.slice(0, 10);
}

function parts(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function addSteps(
  value: string,
  steps: number,
  resolution: DateResolution,
): string {
  if (resolution === 'full') {
    return addDays(value, steps);
  }

  const { year, month } = parts(value);
  if (resolution === 'year') {
    return String(year + steps).padStart(4, '0');
  }

  const total = year * 12 + (month - 1) + steps;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

export function stepsBetween(
  from: string,
  to: string,
  resolution: DateResolution,
): number {
  const a = parts(from);
  const b = parts(to);

  if (resolution === 'year') {
    return b.year - a.year;
  }
  if (resolution === 'month') {
    return b.year * 12 + b.month - (a.year * 12 + a.month);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const fromMs = Date.UTC(a.year, a.month - 1, a.day);
  const toMs = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((toMs - fromMs) / msPerDay);
}
