export const APP_LABELS = {
  web: 'Architect Web',
  desktop: 'Architect Desktop',
} as const;

export type AppKey = keyof typeof APP_LABELS;
