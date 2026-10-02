import type { Tool } from '~/lib/content';

export const updateAppIds = [
  'architect',
  'interviewer',
  'fresco',
] as const satisfies readonly Tool['id'][];
export type UpdateAppId = (typeof updateAppIds)[number];

export const updateKinds = ['launch', 'feature', 'fix'] as const;
export type UpdateKind = (typeof updateKinds)[number];
