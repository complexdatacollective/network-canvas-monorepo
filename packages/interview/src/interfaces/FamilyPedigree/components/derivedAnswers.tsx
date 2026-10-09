'use client';

import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import {
  type FieldNameMode,
  resolveFieldPath,
  useFieldNamespacePath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

/**
 * The rule every question of the person form keeps, in one place.
 *
 * An answer the form works out itself — a default, an answer implied by
 * another answer, or the answer the family records as the question's starting
 * point — is the form's, not the participant's. Until the participant answers
 * the question themselves, it follows what it was worked out from: when that
 * changes the question takes the new answer, and when it no longer gives one
 * the question is left unanswered. And an answer that names an option the
 * form shows unavailable (or no longer offers at all) is never shown chosen
 * nor saved, whoever gave it: that option is taken out of the answer, so the
 * question is asked again.
 *
 * The form store cannot keep this by itself: a field's `initialValue` only
 * seeds it, and the store keeps a registered field's value across changes to
 * `initialValue`, re-registration and unmounting (marking it touched as it
 * does so), so it cannot tell the participant's answer from one the form gave.
 * This keeps that distinction, per question, for as long as the form is open.
 */

type Tracked = {
  /** The answer the form last gave the question, by `answerKey`. */
  given: string;
  /** The participant has answered the question themselves. */
  answered: boolean;
};

const DerivedAnswersContext = createContext<Map<string, Tracked> | null>(null);

/** Keeps each question's record for as long as the form is open, so a
 * question hidden and shown again remembers whose answer it holds. */
export function DerivedAnswersScope({ children }: { children: ReactNode }) {
  const [tracked] = useState(() => new Map<string, Tracked>());
  return (
    <DerivedAnswersContext.Provider value={tracked}>
      {children}
    </DerivedAnswersContext.Provider>
  );
}

const isBlank = (value: FieldValue | undefined) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0);

/** Answers compared by content; no answer and an empty one are the same. */
const answerKey = (value: FieldValue | undefined) =>
  isBlank(value) ? '' : JSON.stringify(value);

/** Whether an event on a question's options was aimed at one that can be
 * chosen: the option itself, or its label. */
const choosesOption = (target: EventTarget) => {
  if (!(target instanceof Element)) return false;
  const selector = '[role="radio"], [role="checkbox"]';
  const option =
    target.closest(selector) ??
    target.closest('label')?.querySelector(selector);
  return (
    option !== null &&
    option !== undefined &&
    option.getAttribute('aria-disabled') !== 'true' &&
    !option.hasAttribute('data-disabled') &&
    !option.matches(':disabled')
  );
};

type Option = string | number | boolean;

const always = () => true;

const isOption = (value: unknown): value is Option =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/** The answer with every option that cannot be chosen taken out. */
const withoutUnavailable = (
  answer: FieldValue | undefined,
  isAvailable: (option: Option) => boolean,
): FieldValue | undefined => {
  if (Array.isArray(answer)) {
    return answer.filter((item) => isOption(item) && isAvailable(item));
  }
  if (isOption(answer)) return isAvailable(answer) ? answer : undefined;
  return answer ?? undefined;
};

/** The question's record, begun with the answer it starts with. */
function trackedFor(
  tracked: Map<string, Tracked>,
  name: string,
  startingAnswer: FieldValue | undefined,
): Tracked {
  const existing = tracked.get(name);
  if (existing) return existing;
  const record = { given: answerKey(startingAnswer), answered: false };
  tracked.set(name, record);
  return record;
}

/**
 * The answer the question should hold, given the one it holds: the
 * participant's, with any unavailable option taken out, once they have
 * answered; the form's own until then. Any change to an answer other than
 * the form's own is the participant's answer. Records the answer as the one
 * the form gave.
 */
function settledAnswer(
  record: Tracked,
  current: FieldValue | undefined,
  derived: FieldValue | undefined,
  isAvailable: (option: Option) => boolean,
): FieldValue | undefined {
  const currentKey = answerKey(current);
  if (
    !isBlank(current) &&
    currentKey !== record.given &&
    currentKey !== answerKey(withoutUnavailable(derived, isAvailable))
  ) {
    record.answered = true;
  }
  const next = withoutUnavailable(
    record.answered ? current : derived,
    isAvailable,
  );
  record.given = answerKey(next);
  return next;
}

/** The participant chose one of the question's options themselves. */
function markAnswered(tracked: Map<string, Tracked>, name: string) {
  const record = tracked.get(name);
  if (record) record.answered = true;
}

/**
 * Keeps one question to the rule above. Call it whether or not the question
 * is shown, wherever what it depends on is worked out: an answer to a hidden
 * question is still read by the drawing of the person being added, so it is
 * kept to the rule too.
 *
 * Returns the answer the question starts with, and the handler that notices
 * the participant choosing an option (even the one already chosen, with the
 * pointer or with Space), for the question's field.
 */
export function useDerivedAnswer<Answer extends FieldValue>({
  name,
  nameMode = 'legacy',
  derived,
  isAvailable = always,
}: {
  /** The question; nothing is kept while it is undefined. */
  name: string | undefined;
  nameMode?: FieldNameMode;
  /** The answer the form works out for the question, or undefined for none.
   * An answer the family records is passed here too: it is where the
   * question starts, and stays the question's own until answered. */
  derived: Answer | undefined;
  /** Whether an option can be chosen, as the answers stand. An option the
   * form shows disabled or does not offer is not; a question not asked has
   * no option that is. Each item of a several-answer question is one. */
  isAvailable?: (option: Option) => boolean;
}) {
  const scoped = useContext(DerivedAnswersContext);
  const [own] = useState(() => new Map<string, Tracked>());
  const tracked = scoped ?? own;
  const namespace = useFieldNamespacePath();
  const values = useFormValue(name === undefined ? [] : [name], nameMode);
  const value = name === undefined ? undefined : values[name];
  const pathOperations = useFormStore((store) => store.pathOperations);
  const readValue = useFormStore((store) => store.getValue);
  const writeValue = useFormStore((store) => store.setFieldValue);

  const startingAnswer = withoutUnavailable(derived, isAvailable);
  // The question starts with the form's answer while every option in it is
  // available; otherwise unanswered, until settled below.
  const [initialValue] = useState(() =>
    answerKey(startingAnswer) === answerKey(derived) ? derived : undefined,
  );
  if (name !== undefined) trackedFor(tracked, name, initialValue);

  const settle = useEffectEvent(() => {
    if (name === undefined) return;
    const path = resolveFieldPath(namespace, name, nameMode);
    const current = pathOperations
      ? pathOperations.getValue(path)
      : readValue(name);
    const next = settledAnswer(
      trackedFor(tracked, name, initialValue),
      current,
      derived,
      isAvailable,
    );
    if (answerKey(next) === answerKey(current)) return;
    if (pathOperations) {
      pathOperations.setFieldValue(path, next);
    } else {
      writeValue(name, next);
    }
  });
  // Settled whenever the answer, the form's own answer, or which options
  // are available changes.
  const valueKey = answerKey(value);
  const startingKey = answerKey(startingAnswer);
  const keptKey = answerKey(withoutUnavailable(value, isAvailable));
  useEffect(() => settle(), [name, valueKey, startingKey, keptKey]);

  return {
    initialValue,
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (name !== undefined && choosesOption(event.target)) {
        markAnswered(tracked, name);
      }
    },
  };
}
