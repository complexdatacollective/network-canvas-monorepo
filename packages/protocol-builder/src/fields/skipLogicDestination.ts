import type { SkipLogicDestination } from '@codaco/protocol-validation';

/**
 * A stage as the destination control needs to read it: which one it is, and
 * what the researcher calls it.
 *
 * Narrower than `Stage` on purpose. Everything here is pure, so it can be
 * reasoned about and tested without assembling whole stage documents, and the
 * editor's protocol context satisfies it directly.
 */
export type DestinationStage = Readonly<{ id: string; label: string }>;

/**
 * Where the stage being edited sits, or will sit, in the interview.
 *
 * A stage being CREATED is not in the stage order yet, and it displaces the
 * stage currently at its index rather than sitting beside it — so the two
 * cases differ both in which stages count as later and in the numbers the
 * researcher will see against them once the stage exists.
 */
export type StagePlacement = Readonly<{ index: number; isNew: boolean }>;

export type SkipLogicDestinationOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

/**
 * The routes the select speaks.
 *
 * The stored value is a destination object; a native select's value is a
 * string. Keeping that translation here is what stops a UI-only route id from
 * ever reaching the saved stage.
 */
const NEXT_AVAILABLE_ROUTE = 'route:next';
const FINISH_ROUTE = 'route:finish';
const STAGE_ROUTE_PREFIX = 'route:stage:';

const UNTITLED_STAGE = 'Untitled stage';

export const MISSING_DESTINATION_PROBLEM =
  'The stage this skips to is no longer part of this interview. Choose where the interview should continue instead.';

export const EARLIER_DESTINATION_PROBLEM =
  'The stage this skips to no longer comes after this one. Choose a later stage, or end the interview.';

/**
 * A stored value read back as a destination, or `undefined` when it is not
 * one — which is also what the absence of a destination means: continue at
 * the next available stage.
 *
 * Tolerant rather than strict. The value arrives from a protocol someone else
 * may have edited, and a destination the schema would reject is a problem to
 * report, never a reason to throw inside a control the researcher needs in
 * order to fix it.
 */
export const asSkipLogicDestination = (
  value: unknown,
): SkipLogicDestination | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const type = Reflect.get(value, 'type');
  if (type === 'finish') return { type: 'finish' };
  if (type !== 'stage') return undefined;
  const stageId = Reflect.get(value, 'stageId');
  return typeof stageId === 'string' && stageId !== ''
    ? { type: 'stage', stageId }
    : undefined;
};

export const destinationRoute = (value: unknown): string => {
  const destination = asSkipLogicDestination(value);
  if (destination === undefined) return NEXT_AVAILABLE_ROUTE;
  return destination.type === 'finish'
    ? FINISH_ROUTE
    : `${STAGE_ROUTE_PREFIX}${destination.stageId}`;
};

export const routeDestination = (
  route: unknown,
): SkipLogicDestination | undefined => {
  if (route === FINISH_ROUTE) return { type: 'finish' };
  if (typeof route !== 'string' || !route.startsWith(STAGE_ROUTE_PREFIX)) {
    return undefined;
  }
  const stageId = route.slice(STAGE_ROUTE_PREFIX.length);
  return stageId === '' ? undefined : { type: 'stage', stageId };
};

/**
 * Where this stage sits, found in the stage order rather than handed down.
 *
 * `position` is consulted only for a stage the order does not contain yet —
 * one being created — because only its host knows where it is about to be
 * inserted. Left out, a new stage is treated as arriving at the end, which is
 * where a host that appends puts it.
 */
export function stagePlacement(
  stages: readonly DestinationStage[],
  stageId: string,
  position?: number,
): StagePlacement {
  const index = stages.findIndex((stage) => stage.id === stageId);
  if (index !== -1) return { index, isNew: false };
  const requested = position ?? stages.length;
  return {
    index: Math.min(Math.max(requested, 0), stages.length),
    isNew: true,
  };
}

/**
 * Whether the stage at `index` comes after the stage being edited.
 *
 * An existing stage is not later than itself; a stage being created displaces
 * the one at its own index, so that one is later.
 */
const isLaterStage = (index: number, placement: StagePlacement): boolean =>
  placement.isNew ? index >= placement.index : index > placement.index;

/**
 * The number the researcher will see against this stage once the stage being
 * edited exists — which is one higher than today's for every stage a new
 * stage is about to be inserted in front of.
 */
const stageNumber = (index: number, placement: StagePlacement): number =>
  index + 1 + (placement.isNew ? 1 : 0);

const stageOptionLabel = (
  stage: DestinationStage,
  index: number,
  placement: StagePlacement,
): string =>
  `Stage ${stageNumber(index, placement)} — ${stage.label === '' ? UNTITLED_STAGE : stage.label}`;

/**
 * Where the interview may continue from here.
 *
 * Only later stages are offered: the interview runs forwards, and a skip that
 * pointed backwards would be a loop rather than a route.
 *
 * A destination the stage currently holds that is NOT among them is added at
 * the end, disabled. Leaving it out would make the control fall back to its
 * placeholder and read as though nothing had been chosen — hiding, rather
 * than showing, the thing the researcher has to fix.
 */
export function skipLogicDestinationOptions(
  stages: readonly DestinationStage[],
  placement: StagePlacement,
  value?: unknown,
): SkipLogicDestinationOption[] {
  const options: SkipLogicDestinationOption[] = [
    { value: NEXT_AVAILABLE_ROUTE, label: 'Next available stage' },
  ];

  stages.forEach((stage, index) => {
    if (!isLaterStage(index, placement)) return;
    options.push({
      value: `${STAGE_ROUTE_PREFIX}${stage.id}`,
      label: stageOptionLabel(stage, index, placement),
    });
  });

  options.push({ value: FINISH_ROUTE, label: 'End the interview' });

  const route = destinationRoute(value);
  if (!options.some((option) => option.value === route)) {
    options.push({
      value: route,
      label: unavailableDestinationLabel(value, stages),
      disabled: true,
    });
  }

  return options;
}

/**
 * What to call a destination that cannot be chosen.
 *
 * A stage that still exists is named, so the researcher can see which one has
 * moved. A stage that has been deleted has no name left to give, so the option
 * says what happened to it instead of showing a raw id.
 */
function unavailableDestinationLabel(
  value: unknown,
  stages: readonly DestinationStage[],
): string {
  const destination = asSkipLogicDestination(value);
  if (destination === undefined || destination.type !== 'stage') {
    return 'A destination that is no longer available';
  }
  const index = stages.findIndex((stage) => stage.id === destination.stageId);
  const stage = stages[index];
  if (stage === undefined) return 'A stage that is no longer in this interview';
  return `${stage.label === '' ? UNTITLED_STAGE : stage.label} (earlier in the interview)`;
}

/**
 * What is wrong with this destination, if anything.
 *
 * Both answers describe something that happened OUTSIDE this editor — a stage
 * deleted, or the interview reordered — so both are reported rather than
 * thrown, and neither is corrected automatically: which stage the interview
 * should continue at is the researcher's decision, not a gap to be filled in
 * on their behalf.
 */
export function skipLogicDestinationProblem(
  value: unknown,
  stages: readonly DestinationStage[],
  placement: StagePlacement,
): string | undefined {
  const destination = asSkipLogicDestination(value);
  if (destination === undefined || destination.type === 'finish') {
    return undefined;
  }
  const index = stages.findIndex((stage) => stage.id === destination.stageId);
  if (index === -1) return MISSING_DESTINATION_PROBLEM;
  return isLaterStage(index, placement)
    ? undefined
    : EARLIER_DESTINATION_PROBLEM;
}
