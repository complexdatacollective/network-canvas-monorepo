export const APP_LABELS = {
  web: 'Architect Web',
  desktop: 'Architect Desktop',
} as const;

export type AppKey = keyof typeof APP_LABELS;

export const INTERVIEWER_LABELS = {
  v6: 'Interviewer 6.x',
  v8: 'Interviewer 8',
} as const;

export type InterviewerKey = keyof typeof INTERVIEWER_LABELS;
