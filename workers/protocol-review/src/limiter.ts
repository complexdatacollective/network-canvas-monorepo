import {
  type ProviderAvailability,
  REVIEW_LIMITS,
  REVIEW_PROVIDERS,
  type ReviewProvider,
  type ReviewQuota,
} from './contract.ts';
import { DAILY_CEILING_MICROS, MONTHLY_CEILING_MICROS } from './pricing.ts';

/**
 * The service's limits, as pure functions over a small store. The Durable
 * Object runs them against its SQLite storage; each call runs to completion
 * before the next starts (the object's methods hold no awaits), so the counts
 * are exact even when reviews arrive together.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * One key's hourly window. It starts at the first review counted against the
 * key and lasts an hour; a review after it ends starts a new one.
 */
export type HourlyWindow = {
  key: string;
  windowStart: number;
  windowEnd: number;
  count: number;
};

export type LimiterStore = {
  getWindow(key: string): HourlyWindow | null;
  putWindow(window: HourlyWindow): void;
  deleteWindow(key: string): void;
  /** Forgets every window that ended at or before `now`. */
  deleteExpiredWindows(now: number): void;
  /** Micro-dollars spent or reserved with `provider` on `day` (`YYYY-MM-DD`, UTC). */
  getCommitted(provider: ReviewProvider, day: string): number;
  setCommitted(provider: ReviewProvider, day: string, micros: number): void;
  /** Micro-dollars spent or reserved with `provider` on `day` and every day after it. */
  getCommittedSince(provider: ReviewProvider, day: string): number;
  /** Forgets every provider's spending of every day before `day`. */
  deleteDaysBefore(day: string): void;
};

/** Which window a review was counted in, so a refund finds the same one. */
type WindowReference = { key: string; windowStart: number };

/** What `settle` needs to undo or complete an admission. */
type Admission = {
  provider: ReviewProvider;
  day: string;
  reservationMicros: number;
  windows: WindowReference[];
};

export type AdmitRequest = {
  installationKey: string;
  addressKey: string;
  /** Whose budget the review is charged to. */
  provider: ReviewProvider;
  reservationMicros: number;
  now: number;
};

export type AdmitResult =
  | { ok: true; admission: Admission; quota: ReviewQuota }
  | {
      ok: false;
      error: 'hourly_limit' | 'daily_limit' | 'monthly_limit';
      retryAt: string;
    };

export type SettleRequest = {
  admission: Admission;
  /** What the review really cost. */
  actualMicros: number;
  /** Whether the review failed or was refused, so its hourly count is returned. */
  refundHourly: boolean;
};

export const utcDay = (time: number): string =>
  new Date(time).toISOString().slice(0, 10);

const nextUtcMidnight = (time: number): number =>
  Math.floor(time / DAY_MS) * DAY_MS + DAY_MS;

/** The first day of the UTC calendar month `time` falls in (`YYYY-MM-01`). */
const utcMonthStart = (time: number): string =>
  `${utcDay(time).slice(0, 7)}-01`;

const nextUtcMonth = (time: number): number => {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
};

const toIso = (time: number): string => new Date(time).toISOString();

/** The window that counts at `now`: a stored window that has not ended. */
const liveWindow = (
  store: LimiterStore,
  key: string,
  now: number,
): HourlyWindow | null => {
  const window = store.getWindow(key);
  return window && window.windowEnd > now ? window : null;
};

/**
 * Which of `provider`'s budgets has no room for `reservationMicros` at `now`,
 * and when it starts again; null when both have room. The month before the
 * day: when both are spent, the month is the one that decides when a review
 * can next run.
 */
const spentBudget = (
  store: LimiterStore,
  provider: ReviewProvider,
  reservationMicros: number,
  now: number,
): { error: 'daily_limit' | 'monthly_limit'; retryAt: string } | null => {
  if (
    store.getCommittedSince(provider, utcMonthStart(now)) + reservationMicros >
    MONTHLY_CEILING_MICROS
  ) {
    return { error: 'monthly_limit', retryAt: toIso(nextUtcMonth(now)) };
  }
  if (
    store.getCommitted(provider, utcDay(now)) + reservationMicros >
    DAILY_CEILING_MICROS
  ) {
    return { error: 'daily_limit', retryAt: toIso(nextUtcMidnight(now)) };
  }
  return null;
};

export type AvailabilityRequest = {
  /** The least a review by each provider reserves: one of an empty protocol. */
  smallestReservationMicros: Record<ReviewProvider, number>;
  now: number;
};

/**
 * Whether each provider's budget has room for the smallest review. Changes
 * nothing.
 */
export const availability = (
  store: LimiterStore,
  { smallestReservationMicros, now }: AvailabilityRequest,
): ProviderAvailability[] =>
  REVIEW_PROVIDERS.map((provider) => {
    const spent = spentBudget(
      store,
      provider,
      smallestReservationMicros[provider],
      now,
    );
    return spent === null
      ? { provider, available: true, reason: null, retryAt: null }
      : {
          provider,
          available: false,
          reason: spent.error,
          retryAt: spent.retryAt,
        };
  });

export const admit = (
  store: LimiterStore,
  {
    installationKey,
    addressKey,
    provider,
    reservationMicros,
    now,
  }: AdmitRequest,
): AdmitResult => {
  store.deleteExpiredWindows(now);
  // The month's total is the sum of its days, so every day of this month is
  // kept; and yesterday is kept even when it belongs to last month, because a
  // review admitted before midnight settles against the day it was admitted.
  const monthStart = utcMonthStart(now);
  const yesterday = utcDay(now - DAY_MS);
  store.deleteDaysBefore(yesterday < monthStart ? yesterday : monthStart);

  const limits = [
    { key: installationKey, limit: REVIEW_LIMITS.perInstallationPerHour },
    { key: addressKey, limit: REVIEW_LIMITS.perAddressPerHour },
  ];
  const current = limits.map(({ key, limit }) => ({
    key,
    limit,
    window: liveWindow(store, key, now),
  }));

  const blocking = current.filter(
    ({ window, limit }) => window !== null && window.count >= limit,
  );
  if (blocking.length > 0) {
    const retryAt = Math.max(
      ...blocking.map(({ window }) => window?.windowEnd ?? now),
    );
    return { ok: false, error: 'hourly_limit', retryAt: toIso(retryAt) };
  }

  const spent = spentBudget(store, provider, reservationMicros, now);
  if (spent !== null) return { ok: false, ...spent };

  const day = utcDay(now);
  const committed = store.getCommitted(provider, day);

  const counted = current.map(({ key, window }) => {
    const next: HourlyWindow = window
      ? { ...window, count: window.count + 1 }
      : { key, windowStart: now, windowEnd: now + HOUR_MS, count: 1 };
    store.putWindow(next);
    return next;
  });
  store.setCommitted(provider, day, committed + reservationMicros);

  const installation = counted[0];
  if (!installation) throw new Error('The installation window is missing.');

  return {
    ok: true,
    admission: {
      provider,
      day,
      reservationMicros,
      windows: counted.map(({ key, windowStart }) => ({ key, windowStart })),
    },
    quota: {
      limit: REVIEW_LIMITS.perInstallationPerHour,
      remaining: Math.max(
        0,
        REVIEW_LIMITS.perInstallationPerHour - installation.count,
      ),
      resetsAt: toIso(installation.windowEnd),
    },
  };
};

export const settle = (
  store: LimiterStore,
  { admission, actualMicros, refundHourly }: SettleRequest,
): void => {
  const committed = store.getCommitted(admission.provider, admission.day);
  store.setCommitted(
    admission.provider,
    admission.day,
    Math.max(0, committed - admission.reservationMicros + actualMicros),
  );

  if (!refundHourly) return;
  for (const { key, windowStart } of admission.windows) {
    const window = store.getWindow(key);
    // A window that has since ended and been replaced is not the one this
    // review was counted in, so there is nothing to give back.
    if (!window || window.windowStart !== windowStart) continue;
    if (window.count <= 1) store.deleteWindow(key);
    else store.putWindow({ ...window, count: window.count - 1 });
  }
};
