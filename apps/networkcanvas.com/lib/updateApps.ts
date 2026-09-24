export const updateAppIds = ['architect', 'interviewer', 'fresco'] as const;
export type UpdateAppId = (typeof updateAppIds)[number];
