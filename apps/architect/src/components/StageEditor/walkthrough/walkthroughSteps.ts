import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import type {
  StageWalkthroughCondition,
  StageWalkthroughContext,
  StageWalkthroughStep,
} from '@codaco/protocol-builder/interfaces/walkthroughs/walkthroughTypes';
import type { StageSection } from '@codaco/protocol-builder/stage-editor-contract';
import type { Stage } from '@codaco/protocol-validation';

export type VisibleStep = Readonly<{
  step: StageWalkthroughStep;
  sectionId: string | undefined;
}>;

/**
 * The steps for the sections this stage is showing, each with the section it
 * points at. Steps for sections the stage is not showing are left out, so the
 * count the researcher reads is the count they will step through.
 *
 * Matched in order, because two sections can share a title — a composer has
 * "Editable attributes" for its nodes and again for its connections — and
 * the steps follow the editor's order: each step's section is the first with
 * its title at or after the previous step's.
 */
export function visibleSteps(
  steps: readonly StageWalkthroughStep[],
  entries: readonly StageSection[],
  choices: Readonly<Record<string, string>>,
  format: (title: MessageDescriptor) => string,
): VisibleStep[] {
  const visible: VisibleStep[] = [];
  let cursor = 0;
  for (const step of steps) {
    if (!meets(step.when, choices)) continue;
    if (step.target === undefined) {
      visible.push({ step, sectionId: undefined });
      continue;
    }
    const title = format(step.target.section);
    const found = entries.findIndex(
      (entry, position) => position >= cursor && entry.title === title,
    );
    if (found === -1) continue;
    cursor = found;
    visible.push({ step, sectionId: entries[found]?.id });
  }
  return visible;
}

/**
 * Whether a step's conditions hold. A question left unanswered hides nothing:
 * skipping it shows every step that depended on it.
 */
function meets(
  when: StageWalkthroughCondition | undefined,
  choices: Readonly<Record<string, string>>,
) {
  if (when === undefined) return true;
  return Object.entries(when).every(
    ([choice, option]) =>
      choices[choice] === undefined || choices[choice] === option,
  );
}

export function isDone(
  step: StageWalkthroughStep,
  stage: Stage | undefined,
  context: StageWalkthroughContext | undefined,
) {
  return (
    stage !== undefined &&
    context !== undefined &&
    step.done?.(stage, context) === true
  );
}

/**
 * Where the walkthrough is, given the step it was last sent to.
 *
 * Steps are tracked by id, not by position, because the visible list changes
 * under the researcher: switching a Finish Screen to automatic removes its
 * closing-screen step, and a position held across that would now name a later
 * step — skipping one the stage still needs. When the step itself is no longer
 * shown, the walkthrough moves on to the next one that is, in walkthrough
 * order, so nothing before it is skipped and nothing after it repeats.
 */
export function resolveStepIndex(
  visible: readonly VisibleStep[],
  steps: readonly StageWalkthroughStep[],
  stepId: string | undefined,
): number {
  if (visible.length === 0) return -1;
  if (stepId === undefined) return 0;
  const shown = visible.findIndex(({ step }) => step.id === stepId);
  if (shown !== -1) return shown;
  const order = new Map(steps.map((step, position) => [step.id, position]));
  const from = order.get(stepId) ?? -1;
  const after = visible.findIndex(
    ({ step }) => (order.get(step.id) ?? -1) > from,
  );
  return after === -1 ? visible.length - 1 : after;
}
