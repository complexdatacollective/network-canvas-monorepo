export const APP_LABELS = {
  current: 'Architect',
  classic: 'Architect Classic',
} as const;

export type AppKey = keyof typeof APP_LABELS;

export const INTERVIEWER_LABELS = {
  current: 'Interviewer',
  classic: 'Interviewer Classic',
} as const;

export type InterviewerKey = keyof typeof INTERVIEWER_LABELS;
