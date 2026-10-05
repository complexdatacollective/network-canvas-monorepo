// The locale tags Studio accepts as a stored per-user UI-language preference
// (2026-09-04 Studio UI localization design, §5.2). This list is the
// contract-level source of truth for what the server stores: client and
// server ship together, so `account.updateLocale` validates against it and an
// unknown tag is a validation error, never a silent store. The client's own
// registry adds presentation (labels, direction, the dev-only pseudo-locale)
// but must offer no tag this list lacks.

export const SUPPORTED_STUDIO_LOCALES = ['en', 'en-GB'] as const;

export type SupportedStudioLocale = (typeof SUPPORTED_STUDIO_LOCALES)[number];
