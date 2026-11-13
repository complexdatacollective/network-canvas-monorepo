import {
  REVIEW_PROVIDERS,
  type ReviewProvider,
  type ReviewQuota,
  ReviewQuotaSchema,
} from '@codaco/protocol-review-worker/contract';
import {
  PROTOCOL_REVIEW_INSTALLATION_ID_KEY,
  PROTOCOL_REVIEW_PROVIDER_KEY,
  PROTOCOL_REVIEW_QUOTA_KEY,
} from '~/utils/storageNames';

/**
 * What the protocol review keeps per browser rather than per protocol. A
 * browser that refuses localStorage gets a value for this session only.
 */

let sessionInstallationId: string | null = null;

/**
 * The random id this browser sends with every review so the service can count
 * its hourly limit. Its own id, minted for this service alone: it is never the
 * analytics installation id, and identifies nobody.
 */
export const getReviewInstallationId = (): string => {
  try {
    const existing = localStorage.getItem(PROTOCOL_REVIEW_INSTALLATION_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/iu.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(PROTOCOL_REVIEW_INSTALLATION_ID_KEY, id);
    return id;
  } catch {
    sessionInstallationId ??= crypto.randomUUID();
    return sessionInstallationId;
  }
};

/** The last quota the service reported, as stored; null when none is. */
export const readStoredQuota = (): ReviewQuota | null => {
  try {
    const raw = localStorage.getItem(PROTOCOL_REVIEW_QUOTA_KEY);
    if (raw === null) return null;
    const parsed = ReviewQuotaSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeStoredQuota = (quota: ReviewQuota): void => {
  try {
    localStorage.setItem(PROTOCOL_REVIEW_QUOTA_KEY, JSON.stringify(quota));
  } catch {
    // A quota that is not remembered only means the service says it next time.
  }
};

/**
 * The quota as it stands at `now`: one whose `resetsAt` has passed reads as
 * full, because the service has started counting again.
 */
export const effectiveQuota = (
  quota: ReviewQuota | null,
  now: number,
): ReviewQuota | null => {
  if (quota === null) return null;
  return Date.parse(quota.resetsAt) <= now
    ? { ...quota, remaining: quota.limit }
    : quota;
};

/** The provider chosen until the researcher chooses another. */
export const DEFAULT_REVIEW_PROVIDER: ReviewProvider = REVIEW_PROVIDERS[0];

/** The provider this browser last chose to write its reviews. */
export const readStoredProvider = (): ReviewProvider => {
  try {
    const raw = localStorage.getItem(PROTOCOL_REVIEW_PROVIDER_KEY);
    return (
      REVIEW_PROVIDERS.find((provider) => provider === raw) ??
      DEFAULT_REVIEW_PROVIDER
    );
  } catch {
    return DEFAULT_REVIEW_PROVIDER;
  }
};

export const writeStoredProvider = (provider: ReviewProvider): void => {
  try {
    localStorage.setItem(PROTOCOL_REVIEW_PROVIDER_KEY, provider);
  } catch {
    // A choice that is not remembered lasts for this session only.
  }
};
