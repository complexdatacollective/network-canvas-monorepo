// Shared constants for Button and IconButton stories
// TODO: these can all be extracted from the actual variants.
export const BUTTON_VARIANTS = [
  'default',
  'outline',
  'text',
  'dashed',
] as const;

export const BUTTON_COLORS = [
  'default',
  'dynamic',
  'primary',
  'secondary',
  'warning',
  'info',
  'destructive',
  'success',
] as const;

export const ICON_BUTTON_COLORS = [
  'default',
  'primary',
  'secondary',
  'warning',
  'info',
  'destructive',
  'success',
  'accent',
  'dynamic',
] as const;

// Temporary: invalidates the fresco-ui test cache and every dependent suite for a CI wall-time measurement; reverted before merge.
