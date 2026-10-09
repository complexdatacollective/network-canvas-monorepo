import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import type { PedigreeSexAssignedAtBirth } from '@codaco/protocol-validation';

import type { Family, GeneticParentBlock, SexRuledOut } from '../model';
import type { PedigreeWords } from '../pedigreeWords';

/**
 * What the sentences explaining an unavailable answer need: the stage's
 * words for them, the people's names as shown, and the codebook's labels for
 * sex at birth, as text.
 */
export type ReasonContext = {
  words: PedigreeWords;
  family: Family;
  displayName: (personId: string) => string;
  sexLabels: Readonly<Record<PedigreeSexAssignedAtBirth, string>>;
};

const isYou = (context: ReasonContext, personId: string) =>
  context.family.byId.get(personId)?.isEgo === true;

const sexLabel = (context: ReasonContext, sex: string) =>
  getMarkdownLabelText(
    context.sexLabels[sex as PedigreeSexAssignedAtBirth] ?? sex,
  );

/** Why someone cannot be another genetic parent of a child, naming the
 * genetic parent recorded in the way. */
export function geneticParentReason(
  context: ReasonContext,
  block: GeneticParentBlock,
): string {
  const { words, displayName } = context;
  const child = displayName(block.childId);
  if (block.rule === 'sameSexGeneticParent') {
    return words.text(words.wording.unavailableSameSexGeneticParent, {
      who: isYou(context, block.coParentId)
        ? 'coParentIsYou'
        : isYou(context, block.childId)
          ? 'childIsYou'
          : 'other',
      coParent: displayName(block.coParentId),
      child,
      sex: sexLabel(context, block.sex),
    });
  }
  const you = block.parentIds.find((id) => isYou(context, id));
  const [first = '', second = ''] = (
    you === undefined
      ? block.parentIds
      : [you, ...block.parentIds.filter((id) => id !== you)]
  ).map(displayName);
  return words.text(words.wording.unavailableGeneticParentsFull, {
    who: isYou(context, block.childId)
      ? 'childIsYou'
      : you !== undefined
        ? 'includesYou'
        : 'other',
    child,
    first,
    second,
  });
}

/** Why nobody else can have carried a child: someone already did. */
export function carrierRecordedReason(
  context: ReasonContext,
  childId: string,
  carrierId: string,
): string {
  return context.words.text(context.words.wording.unavailableCarrierRecorded, {
    who: isYou(context, carrierId)
      ? 'carrierIsYou'
      : isYou(context, childId)
        ? 'childIsYou'
        : 'other',
    carrier: context.displayName(carrierId),
    child: context.displayName(childId),
  });
}

/** Why someone recorded as male at birth cannot have carried a pregnancy:
 * the person the panel describes when `personId` is undefined. */
export function cannotCarryReason(
  context: ReasonContext,
  personId: string | undefined,
  sex: string,
): string {
  return context.words.text(context.words.wording.unavailableCannotCarry, {
    who:
      personId === undefined
        ? 'this'
        : isYou(context, personId)
          ? 'you'
          : 'other',
    name: personId === undefined ? '' : context.displayName(personId),
    sex: sexLabel(context, sex),
  });
}

/** Why the person the panel describes cannot be given a sex at birth. */
export function sexRuledOutReason(
  context: ReasonContext,
  personId: string,
  reason: SexRuledOut,
): string {
  if (reason.rule === 'sameSexGeneticParent') {
    return geneticParentReason(context, {
      rule: 'sameSexGeneticParent',
      childId: reason.childId,
      coParentId: reason.coParentId,
      sex: reason.sex === 'female' ? 'female' : 'male',
    });
  }
  return context.words.text(context.words.wording.unavailableCarried, {
    who: isYou(context, personId)
      ? 'personIsYou'
      : isYou(context, reason.childId)
        ? 'childIsYou'
        : 'other',
    child: context.displayName(reason.childId),
    sex: sexLabel(context, reason.sex),
  });
}

/** Why two people cannot both be a new child's genetic parents. */
export function bothSameSexReason(
  context: ReasonContext,
  firstId: string,
  secondId: string,
  sex: string,
): string {
  const [first, second] = isYou(context, secondId)
    ? [secondId, firstId]
    : [firstId, secondId];
  return context.words.text(context.words.wording.unavailableBothSameSex, {
    firstIsYou: isYou(context, first) ? 'true' : 'false',
    first: context.displayName(first),
    second: context.displayName(second),
    sex: sexLabel(context, sex),
  });
}

/** The reasons as one hint, each sentence once; undefined with none. */
export const joinReasons = (reasons: readonly (string | undefined)[]) => {
  const unique = [...new Set(reasons.filter((reason) => reason !== undefined))];
  return unique.length > 0 ? unique.join(' ') : undefined;
};
