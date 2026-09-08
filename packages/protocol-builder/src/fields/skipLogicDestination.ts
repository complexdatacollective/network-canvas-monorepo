import { createAppIntl, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import type { SkipLogicDestination } from '@codaco/protocol-validation';

/**
 * The formatter used when a caller has none of its own.
 *
 * `SkipLogicDestinationField` threads the researcher's own formatter in. This
 * is the fallback for a caller reading the destinations or the verdict without
 * one — this package's own module tests, and a host asking what is wrong with
 * a stored protocol.
 */
const englishIntl = createAppIntl({ locale: 'en' });

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

/**
 * The route a destination this editor cannot read is shown under.
 *
 * It matches no option the control offers, so `skipLogicDestinationOptions`
 * adds one for it and the select shows THAT rather than falling back to the
 * next-available route — which is what made an unreadable destination read as
 * a deliberate "continue at the next stage".
 */
const UNREADABLE_ROUTE = 'route:unreadable';

/**
 * What the control offers, and what it says is wrong with what it holds.
 *
 * A stage the researcher has not named is written out in full in each option
 * it can appear in, rather than substituted into the option as a noun: a
 * translator moves the whole phrase, and neither combination is assembled out
 * of parts that have to agree.
 */
const messages = defineMessages({
  nextAvailable: {
    id: 'protocolBuilder.skipLogicDestination.nextAvailable',
    defaultMessage: 'Next available stage',
    description:
      'The default destination offered when a researcher says where an interview continues after a stage is skipped: whichever stage comes next and is not itself skipped. A stage is one step of an interview.',
  },
  finish: {
    id: 'protocolBuilder.skipLogicDestination.finish',
    defaultMessage: 'End the interview',
    description:
      'Destination offered when a researcher says where an interview continues after a stage is skipped: it does not continue — the interview finishes there.',
  },
  stageOption: {
    id: 'protocolBuilder.skipLogicDestination.stageOption',
    defaultMessage: 'Stage {position, number} — {stageLabel}',
    description:
      'One stage offered as the destination an interview continues at. position is where that stage will sit in the finished interview, counting from one; stageLabel is the researcher’s own name for it and is not translated.',
  },
  untitledStageOption: {
    id: 'protocolBuilder.skipLogicDestination.untitledStageOption',
    defaultMessage: 'Stage {position, number} — Untitled stage',
    description:
      'The same offered destination as stageOption, for a stage the researcher has not named yet, so there is no name to show. position is where that stage will sit in the finished interview, counting from one.',
  },
  unreadableOption: {
    id: 'protocolBuilder.skipLogicDestination.unreadableOption',
    defaultMessage: 'A destination this editor cannot read',
    description:
      'Shown as the current, unselectable choice when the stage records a destination in a shape the protocol will not accept — a hand-edit or a merge left it there. Nothing is known about where it pointed, so it is named for what is wrong with it.',
  },
  unavailableOption: {
    id: 'protocolBuilder.skipLogicDestination.unavailableOption',
    defaultMessage: 'A destination that is no longer available',
    description:
      'Shown as the current, unselectable choice when the stage’s stored destination is one this control can no longer offer and cannot describe more precisely than this.',
  },
  deletedStageOption: {
    id: 'protocolBuilder.skipLogicDestination.deletedStageOption',
    defaultMessage: 'A stage that is no longer in this interview',
    description:
      'Shown as the current, unselectable choice when the stage a skip pointed at has been deleted, so there is no name left to show for it.',
  },
  earlierStageOption: {
    id: 'protocolBuilder.skipLogicDestination.earlierStageOption',
    defaultMessage: '{stageLabel} (earlier in the interview)',
    description:
      'Shown as the current, unselectable choice when the stage a skip pointed at still exists but has moved to before this one, so the interview can no longer reach it by skipping forward. stageLabel is the researcher’s own name for that stage and is not translated.',
  },
  earlierUntitledStageOption: {
    id: 'protocolBuilder.skipLogicDestination.earlierUntitledStageOption',
    defaultMessage: 'Untitled stage (earlier in the interview)',
    description:
      'The same unselectable choice as earlierStageOption, for a stage the researcher has not named yet, so there is no name to show.',
  },
  missingProblem: {
    id: 'protocolBuilder.skipLogicDestination.missingProblem',
    defaultMessage:
      'The stage this skips to is no longer part of this interview. Choose where the interview should continue instead.',
    description:
      'Shown beside the destination control when the stage a skip pointed at has been deleted from the interview. Addressed to the researcher authoring the protocol.',
  },
  earlierProblem: {
    id: 'protocolBuilder.skipLogicDestination.earlierProblem',
    defaultMessage:
      'The stage this skips to no longer comes after this one. Choose a later stage, or end the interview.',
    description:
      'Shown beside the destination control when the stage a skip pointed at has been moved to before this one, so the interview can no longer reach it by skipping forward.',
  },
  unreadableProblem: {
    id: 'protocolBuilder.skipLogicDestination.unreadableProblem',
    defaultMessage:
      'The stage this skips to cannot be read. Choose where the interview should continue instead.',
    description:
      'Shown beside the destination control when the stage records a destination in a shape the protocol will not accept, so nothing can be said about where it pointed.',
  },
});

/**
 * The keys each destination shape is allowed to carry.
 *
 * `SkipLogicDestinationSchema` builds both shapes with `strictObject`, so a
 * key beside these is not surplus detail to be dropped — it is what makes the
 * value one the protocol schema refuses.
 */
const DESTINATION_KEYS: Readonly<
  Record<SkipLogicDestination['type'], readonly string[]>
> = Object.freeze({
  finish: Object.freeze(['type']),
  stage: Object.freeze(['type', 'stageId']),
});

/**
 * Whether the stored object holds only the keys its own shape has.
 *
 * Read off the object's own enumerable keys, which is what the schema's
 * `strictObject` compares against, so this and the validator agree about what
 * counts as an extra key.
 */
const hasNoExtraKeys = (
  value: object,
  type: SkipLogicDestination['type'],
): boolean =>
  Object.keys(value).every((key) => DESTINATION_KEYS[type].includes(key));

/**
 * A stored value read back as a destination, or `undefined` when it is not one.
 *
 * Tolerant rather than strict about the SHAPE of the input — the value arrives
 * from a protocol someone else may have edited, and a destination the schema
 * would reject is a problem to report, never a reason to throw inside a
 * control the researcher needs in order to fix it — and exact about what
 * counts as a destination, because the schema is. A valid discriminator is not
 * enough: `{ type: 'finish', stageId: 'stale' }` read as a clean `finish`
 * showed "End the interview" with nothing wrong beside it, over a stored value
 * whose extra key refused the save with no control to point at.
 *
 * `readDestination` is what decides WHICH problem it is; this answers only
 * whether the value is a destination.
 */
export const asSkipLogicDestination = (
  value: unknown,
): SkipLogicDestination | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const type = Reflect.get(value, 'type');
  if (type === 'finish') {
    return hasNoExtraKeys(value, 'finish') ? { type: 'finish' } : undefined;
  }
  if (type !== 'stage') return undefined;
  const stageId = Reflect.get(value, 'stageId');
  return typeof stageId === 'string' &&
    stageId !== '' &&
    hasNoExtraKeys(value, 'stage')
    ? { type: 'stage', stageId }
    : undefined;
};

/**
 * The three things a stored destination can be, told apart.
 *
 * Absence is how "continue at the next available stage" is spelled, and it is
 * the one reading the protocol schema accepts — so a value that is PRESENT and
 * unreadable is a different thing entirely, and reading the two the same way
 * left the control saying the interview continued at the next stage while
 * `finish` refused the save over a destination the researcher never saw.
 *
 * Only `undefined` is absence: `null`, a half-written `{ type: 'stage' }`, an
 * unknown type and anything that is not an object at all are values the schema
 * refuses, and every one of them is reported rather than swallowed.
 */
type StoredDestination =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'destination'; destination: SkipLogicDestination }>;

const ABSENT: StoredDestination = Object.freeze({ kind: 'absent' as const });
const UNREADABLE: StoredDestination = Object.freeze({
  kind: 'unreadable' as const,
});

const readDestination = (value: unknown): StoredDestination => {
  if (value === undefined) return ABSENT;
  const destination = asSkipLogicDestination(value);
  return destination === undefined
    ? UNREADABLE
    : { kind: 'destination', destination };
};

export const destinationRoute = (value: unknown): string => {
  const stored = readDestination(value);
  if (stored.kind === 'absent') return NEXT_AVAILABLE_ROUTE;
  if (stored.kind === 'unreadable') return UNREADABLE_ROUTE;
  return stored.destination.type === 'finish'
    ? FINISH_ROUTE
    : `${STAGE_ROUTE_PREFIX}${stored.destination.stageId}`;
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
  intl: IntlShape,
): string => {
  const position = stageNumber(index, placement);
  return stage.label === ''
    ? intl.formatMessage(messages.untitledStageOption, { position })
    : intl.formatMessage(messages.stageOption, {
        position,
        stageLabel: stage.label,
      });
};

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
  intl: IntlShape = englishIntl,
): SkipLogicDestinationOption[] {
  const options: SkipLogicDestinationOption[] = [
    {
      value: NEXT_AVAILABLE_ROUTE,
      label: intl.formatMessage(messages.nextAvailable),
    },
  ];

  stages.forEach((stage, index) => {
    if (!isLaterStage(index, placement)) return;
    options.push({
      value: `${STAGE_ROUTE_PREFIX}${stage.id}`,
      label: stageOptionLabel(stage, index, placement, intl),
    });
  });

  options.push({
    value: FINISH_ROUTE,
    label: intl.formatMessage(messages.finish),
  });

  const route = destinationRoute(value);
  if (!options.some((option) => option.value === route)) {
    options.push({
      value: route,
      label: unavailableDestinationLabel(value, stages, intl),
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
 * says what happened to it instead of showing a raw id. A destination that is
 * not one at all says so, rather than borrowing either sentence: nothing is
 * known about where it pointed, and the researcher has to choose again.
 */
function unavailableDestinationLabel(
  value: unknown,
  stages: readonly DestinationStage[],
  intl: IntlShape,
): string {
  const stored = readDestination(value);
  if (stored.kind === 'unreadable') {
    return intl.formatMessage(messages.unreadableOption);
  }
  if (stored.kind === 'absent') {
    return intl.formatMessage(messages.unavailableOption);
  }
  const destination = stored.destination;
  if (destination.type !== 'stage') {
    return intl.formatMessage(messages.unavailableOption);
  }
  const index = stages.findIndex((stage) => stage.id === destination.stageId);
  const stage = stages[index];
  if (stage === undefined) {
    return intl.formatMessage(messages.deletedStageOption);
  }
  return stage.label === ''
    ? intl.formatMessage(messages.earlierUntitledStageOption)
    : intl.formatMessage(messages.earlierStageOption, {
        stageLabel: stage.label,
      });
}

/**
 * What is wrong with this destination, if anything.
 *
 * Every answer describes something that happened OUTSIDE this editor — a stage
 * deleted, the interview reordered, or a protocol hand-edited into a shape the
 * schema refuses — so all of them are reported rather than thrown, and none is
 * corrected automatically: which stage the interview should continue at is the
 * researcher's decision, not a gap to be filled in on their behalf.
 *
 * A destination that cannot be read is one of them. It is not the absence of a
 * destination, which is a perfectly good answer meaning "continue at the next
 * available stage" — the protocol schema accepts that and refuses this, so
 * reporting them the same way would leave the researcher with a control that
 * looks answered and a save that is refused with no control to point at.
 */
export function skipLogicDestinationProblem(
  value: unknown,
  stages: readonly DestinationStage[],
  placement: StagePlacement,
  intl: IntlShape = englishIntl,
): string | undefined {
  const stored = readDestination(value);
  if (stored.kind === 'unreadable') {
    return intl.formatMessage(messages.unreadableProblem);
  }
  if (stored.kind === 'absent') return undefined;
  const destination = stored.destination;
  if (destination.type === 'finish') return undefined;
  const index = stages.findIndex((stage) => stage.id === destination.stageId);
  if (index === -1) return intl.formatMessage(messages.missingProblem);
  return isLaterStage(index, placement)
    ? undefined
    : intl.formatMessage(messages.earlierProblem);
}
