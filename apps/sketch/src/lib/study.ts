// The researcher's study as the start page collects it, and the text the
// server receives. The server and the models read one plain-text block; the
// headings tell the models which part is a research question.

import { MAX_DESCRIPTION_LENGTH } from '../shared/api.ts';

export const MAX_QUESTIONS = 6;
export const MAX_QUESTION_LENGTH = 350;
export const MIN_QUESTION_LENGTH = 10;
// Six full questions, the synopsis and the headings stay under the limit.
export const MAX_SYNOPSIS_LENGTH = 3500;

const QUESTIONS_HEADING = 'Research questions';
const SYNOPSIS_HEADING = 'Study synopsis';

export type StudyInput = { questions: string[]; synopsis: string };

export const filledQuestions = (questions: string[]) =>
  questions.map((q) => q.trim().replace(/\s+/g, ' ')).filter(Boolean);

/** At least one question long enough to design from, and nothing too long. */
export const studyIsComplete = ({ questions, synopsis }: StudyInput) => {
  const filled = filledQuestions(questions);
  return (
    filled.length > 0 &&
    filled.every((q) => q.length >= MIN_QUESTION_LENGTH) &&
    filled.length <= MAX_QUESTIONS &&
    filled.every((q) => q.length <= MAX_QUESTION_LENGTH) &&
    synopsis.trim().length <= MAX_SYNOPSIS_LENGTH &&
    composeStudyText({ questions, synopsis }).length <= MAX_DESCRIPTION_LENGTH
  );
};

export const composeStudyText = ({ questions, synopsis }: StudyInput) => {
  const filled = filledQuestions(questions);
  const parts = [
    `${QUESTIONS_HEADING}\n${filled.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
  ];
  if (synopsis.trim()) parts.push(`${SYNOPSIS_HEADING}\n${synopsis.trim()}`);
  return parts.join('\n\n');
};

/** The first research question, for the one-line reminders on later screens. */
export const firstQuestion = (text: string) => {
  const match = new RegExp(`^${QUESTIONS_HEADING}\\n1\\. (.*)$`, 'm').exec(
    text,
  );
  return match?.[1] ?? text;
};
