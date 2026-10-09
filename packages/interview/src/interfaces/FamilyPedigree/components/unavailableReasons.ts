import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import type { PedigreeSexAssignedAtBirth } from '@codaco/protocol-validation';

import type { Family, GeneticParentBlock, SexRuledOut } from '../model';
import type { PedigreeWords } from '../pedigreeWords';

/**
 * What the sentences explaining an unavailable answer need: the stage's
 * words for them, the people's names as shown, the codebook's labels for
 * sex at birth, as text, and how lists are joined in the words' language.
 */
export type ReasonContext = {
  words: PedigreeWords;
  family: Family;
  displayName: (personId: string) => string;
  sexLabels: Readonly<Record<PedigreeSexAssignedAtBirth, string>>;
  /** Joins items as the language of the stage's words joins a list. */
  formatList: (items: readonly string[]) => string;
};

/** An answer a reason makes unavailable: its value, and its label as
 * shown. */
export type UnavailableAnswer = { value: string; label: string };

/**
 * Why answers are unavailable, and which: each reason names the answers it
 * disables, so a hint holding several says which goes with which, and each
 * option can be described by its own (`reasonsFor`).
 */
export type Reason = { answers: readonly UnavailableAnswer[] } & (
  | { rule: 'geneticParent'; block: GeneticParentBlock }
  | {
      /** The person the panel describes, a genetic parent of `childId`
       * beside `coParentId`, cannot be given the sex at birth they have. */
      rule: 'sameSexAsCoParent';
      personId: string;
      childId: string;
      coParentId: string;
      sex: string;
    }
  | { rule: 'carrierRecorded'; childId: string; carrierId: string }
  | {
      /** `personId` cannot have carried a pregnancy: the person the panel
       * describes when undefined. */
      rule: 'cannotCarry';
      personId: string | undefined;
      sex: string;
    }
  | {
      /** The person the panel describes carried `childId`, so cannot be
       * given a sex at birth that rules it out. */
      rule: 'carried';
      personId: string;
      childId: string;
      sex: string;
    }
  | { rule: 'bothSameSex'; firstId: string; secondId: string; sex: string }
);

const isYou = (context: ReasonContext, personId: string) =>
  context.family.byId.get(personId)?.isEgo === true;

const sexLabel = (context: ReasonContext, sex: string) =>
  getMarkdownLabelText(
    context.sexLabels[sex as PedigreeSexAssignedAtBirth] ?? sex,
  );

/** People or answers named together in a sentence, joined as the language
 * of the stage's words joins a list. */
const listed = (context: ReasonContext, items: readonly string[]) =>
  context.formatList(items);

/** The answers a reason disables, as its sentence names them. */
const answersArgs = (context: ReasonContext, reason: Reason) => ({
  answers: listed(
    context,
    reason.answers.map((answer) => answer.label),
  ),
  count: reason.answers.length,
});

/** The answer that is a sex at birth. */
const sexAnswer = (context: ReasonContext, sex: string): UnavailableAnswer => ({
  value: sex,
  label: sexLabel(context, sex),
});

/** Why a genetic parent recorded in the way makes answers unavailable. */
export const geneticParentReason = (
  block: GeneticParentBlock,
  answers: readonly UnavailableAnswer[],
): Reason => ({ rule: 'geneticParent', block, answers });

/** Why someone else having carried the child makes answers unavailable. */
export const carrierRecordedReason = (
  childId: string,
  carrierId: string,
  answers: readonly UnavailableAnswer[],
): Reason => ({ rule: 'carrierRecorded', childId, carrierId, answers });

/** Why someone recorded as male at birth cannot have carried a pregnancy:
 * the person the panel describes when `personId` is undefined. */
export const cannotCarryReason = (
  personId: string | undefined,
  sex: string,
  answers: readonly UnavailableAnswer[],
): Reason => ({ rule: 'cannotCarry', personId, sex, answers });

/** Why two people cannot both be a new child's genetic parents. */
export const bothSameSexReason = (
  firstId: string,
  secondId: string,
  sex: string,
  answers: readonly UnavailableAnswer[],
): Reason => ({ rule: 'bothSameSex', firstId, secondId, sex, answers });

/** Why the person the panel describes cannot be given a sex at birth,
 * phrased from their own point of view. */
export const sexRuledOutReason = (
  context: ReasonContext,
  personId: string,
  reason: SexRuledOut,
): Reason => {
  const answers = [sexAnswer(context, reason.sex)];
  return reason.rule === 'sameSexGeneticParent'
    ? {
        rule: 'sameSexAsCoParent',
        personId,
        childId: reason.childId,
        coParentId: reason.coParentId,
        sex: reason.sex,
        answers,
      }
    : {
        rule: 'carried',
        personId,
        childId: reason.childId,
        sex: reason.sex,
        answers,
      };
};

/** Why a genetic parent recorded in the way makes answers unavailable, as
 * a sentence. */
function formatGeneticParent(
  context: ReasonContext,
  reason: Reason,
  block: GeneticParentBlock,
): string {
  const { words, displayName } = context;
  const child = displayName(block.childId);
  if (block.rule === 'sameSexGeneticParent') {
    return words.text(words.wording.unavailableSameSexGeneticParent, {
      ...answersArgs(context, reason),
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
    ...answersArgs(context, reason),
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

/**
 * One reason as a sentence, about `childIds` where it can be about several
 * children (`joinReasons` merges reasons that differ only in the child).
 */
function formatReason(
  context: ReasonContext,
  reason: Reason,
  childIds: readonly string[],
): string {
  const { words, displayName } = context;
  const children = listed(context, childIds.map(displayName));
  const aboutYou = childIds.some((id) => isYou(context, id));
  switch (reason.rule) {
    case 'geneticParent':
      return formatGeneticParent(context, reason, reason.block);
    case 'sameSexAsCoParent':
      return words.text(words.wording.unavailableSameSexAsCoParent, {
        who: isYou(context, reason.personId)
          ? 'personIsYou'
          : aboutYou
            ? 'childIsYou'
            : isYou(context, reason.coParentId)
              ? 'coParentIsYou'
              : 'other',
        children,
        coParent: displayName(reason.coParentId),
        sex: sexLabel(context, reason.sex),
      });
    case 'carrierRecorded':
      return words.text(words.wording.unavailableCarrierRecorded, {
        ...answersArgs(context, reason),
        who: isYou(context, reason.carrierId)
          ? 'carrierIsYou'
          : isYou(context, reason.childId)
            ? 'childIsYou'
            : 'other',
        carrier: displayName(reason.carrierId),
        child: displayName(reason.childId),
      });
    case 'cannotCarry':
      return words.text(words.wording.unavailableCannotCarry, {
        ...answersArgs(context, reason),
        who:
          reason.personId === undefined
            ? 'this'
            : isYou(context, reason.personId)
              ? 'you'
              : 'other',
        name: reason.personId === undefined ? '' : displayName(reason.personId),
        sex: sexLabel(context, reason.sex),
      });
    case 'carried':
      return words.text(words.wording.unavailableCarried, {
        who: isYou(context, reason.personId)
          ? 'personIsYou'
          : aboutYou
            ? 'childIsYou'
            : 'other',
        children,
        sex: sexLabel(context, reason.sex),
      });
    case 'bothSameSex': {
      const [first, second] = isYou(context, reason.secondId)
        ? [reason.secondId, reason.firstId]
        : [reason.firstId, reason.secondId];
      return words.text(words.wording.unavailableBothSameSex, {
        ...answersArgs(context, reason),
        firstIsYou: isYou(context, first) ? 'true' : 'false',
        first: displayName(first),
        second: displayName(second),
        sex: sexLabel(context, reason.sex),
      });
    }
  }
}

/** What a reason says apart from the child it is about, for the reasons
 * that can be about several children at once. */
const mergeKey = (reason: Reason) => {
  if (reason.rule === 'carried') {
    return JSON.stringify([reason.rule, reason.personId, reason.sex]);
  }
  if (reason.rule === 'sameSexAsCoParent') {
    return JSON.stringify([
      reason.rule,
      reason.personId,
      reason.coParentId,
      reason.sex,
    ]);
  }
  return undefined;
};

/**
 * The reasons as one hint. Each names the answers it disables, so no
 * lead-in is repeated; reasons that differ only in the child they are about
 * are said once, naming the children together ("you are recorded as having
 * carried “Ava” and “Ben”"), except that the participant, when one of them,
 * is spoken of in a sentence of their own. Each sentence is said once.
 * Undefined with none.
 */
export function joinReasons(
  context: ReasonContext,
  reasons: readonly (Reason | undefined | false)[],
): string | undefined {
  const groups: { reason: Reason; childIds: string[] }[] = [];
  for (const reason of reasons) {
    if (!reason) continue;
    const key = mergeKey(reason);
    const childId =
      reason.rule === 'carried' || reason.rule === 'sameSexAsCoParent'
        ? reason.childId
        : undefined;
    const merged =
      key !== undefined &&
      childId !== undefined &&
      !isYou(context, childId) &&
      groups.find(
        (group) =>
          mergeKey(group.reason) === key &&
          !group.childIds.some((id) => isYou(context, id)),
      );
    if (merged) {
      if (!merged.childIds.includes(childId)) merged.childIds.push(childId);
      continue;
    }
    groups.push({ reason, childIds: childId === undefined ? [] : [childId] });
  }
  const sentences = [
    ...new Set(
      groups.map(({ reason, childIds }) =>
        formatReason(context, reason, childIds),
      ),
    ),
  ];
  return sentences.length > 0 ? sentences.join(' ') : undefined;
}

/** Why an answer is unavailable, as its own description: the reasons that
 * name it. Undefined when none does. */
export const reasonsFor = (
  context: ReasonContext,
  reasons: readonly (Reason | undefined | false)[],
  value: string,
) =>
  joinReasons(
    context,
    reasons.filter(
      (reason) =>
        reason && reason.answers.some((answer) => answer.value === value),
    ),
  );
