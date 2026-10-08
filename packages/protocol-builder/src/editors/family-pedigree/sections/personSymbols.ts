import type { NodeShape } from '@codaco/protocol-validation';

import {
  isNodeShape,
  mappingForVariable,
  shapeForValue,
  shapeMappingDraft,
  withDiscreteShape,
  type DiscreteShapeMapEntry,
  type ShapeMappingDraft,
  type ShapeMappingVariable,
} from '../../../codebook/shapeMapping.ts';
import { wordsFor } from './genderWords.ts';

/** An answer a discrete mapping can give a shape to. */
type OptionValue = DiscreteShapeMapEntry['value'];

/**
 * Standard pedigree symbols, set from one of the stage's attributes.
 *
 * In the interview a person's symbol is the person type's codebook shape,
 * resolved against their attributes (`resolveNodeShape`): a discrete mapping
 * gives the shape of the first entry their answer matches, and anyone whose
 * answer matches nothing — or who has no answer — gets the default shape. So
 * standard nomenclature is a mapping of every option, with a diamond default:
 * a circle for female or feminine, a square for male or masculine, a diamond
 * for everyone else.
 */

/** What the symbols of anyone not female or male, or feminine or masculine, are. */
const PEDIGREE_OTHER_SYMBOL: NodeShape = 'diamond';

/** The pedigree symbol for one answer to sex assigned at birth. */
export const sexAssignedAtBirthSymbol = (value: OptionValue): NodeShape => {
  if (value === 'female') return 'circle';
  if (value === 'male') return 'square';
  return PEDIGREE_OTHER_SYMBOL;
};

/**
 * The pedigree symbol for one gender identity option, from the kinship words
 * the stage gives it. An option the stage names no words for takes neutral
 * words (`wordsFor`), and so a diamond.
 */
export const genderIdentitySymbol = (
  terms: unknown,
  value: OptionValue,
): NodeShape => {
  // Gender identity options are categorical, so never a yes or no answer.
  if (typeof value === 'boolean') return PEDIGREE_OTHER_SYMBOL;
  const words = wordsFor(terms, value);
  if (words === 'feminine') return 'circle';
  if (words === 'masculine') return 'square';
  return PEDIGREE_OTHER_SYMBOL;
};

/**
 * The mapping that gives every option of one attribute its pedigree symbol.
 *
 * Built with the codebook editor's own helpers, so it is the mapping a
 * researcher would have built there by hand, every option listed.
 */
export const pedigreeSymbolMapping = (
  variableId: string,
  variable: ShapeMappingVariable,
  symbolFor: (value: OptionValue) => NodeShape,
): ShapeMappingDraft =>
  (variable.options ?? []).reduce<ShapeMappingDraft>(
    (mapping, option) =>
      withDiscreteShape(mapping, option.value, symbolFor(option.value)),
    mappingForVariable(variableId, variable),
  );

/**
 * The person type's `shape`, with the default made a diamond and `dynamic`
 * replaced by `mapping` — or, given none, with `dynamic` removed and the
 * default left as it is. Everything else the shape holds is kept.
 */
export const shapeWithPedigreeSymbols = (
  shape: unknown,
  mapping: ShapeMappingDraft | undefined,
): Record<string, unknown> => {
  const current =
    typeof shape === 'object' && shape !== null && !Array.isArray(shape)
      ? (structuredClone(shape) as Record<string, unknown>)
      : {};
  const { dynamic: _replaced, ...rest } = current;
  return mapping === undefined
    ? rest
    : { ...rest, default: PEDIGREE_OTHER_SYMBOL, dynamic: mapping };
};

/** Which of the stage's attributes the symbols can be set from. */
export type PedigreeSymbolSource = 'sexAssignedAtBirth' | 'genderIdentity';

/** What the person type's symbols follow, as far as this stage can tell. */
export type PersonSymbolState =
  /** No mapping: everyone is drawn with the default shape. */
  | Readonly<{ kind: 'notMapped'; defaultShape: NodeShape }>
  /** Sex assigned at birth, drawn the standard way. */
  | Readonly<{ kind: 'sexAssignedAtBirth' }>
  /** Gender identity, drawn the standard way for its options and words now. */
  | Readonly<{ kind: 'genderIdentity' }>
  /**
   * Gender identity, drawn the standard way for options or words it had
   * before: what one click set, and then the options or words changed.
   */
  | Readonly<{ kind: 'genderIdentityOutOfDate' }>
  /** One of those two attributes, drawn some other way. */
  | Readonly<{ kind: 'custom'; source: PedigreeSymbolSource }>
  /** An attribute this stage does not bind as either. */
  | Readonly<{ kind: 'other'; variableId: string }>;

export type PersonSymbolInputs = Readonly<{
  /** The person type's codebook `shape`, as the protocol holds it. */
  shape: unknown;
  /** The person type's attributes, read for their options. */
  variables: Readonly<Record<string, ShapeMappingVariable>>;
  /** The sex assigned at birth attribute the stage binds, if any. */
  sexAssignedAtBirthAttribute: string | undefined;
  /** The gender identity attribute the stage binds, if any. */
  genderIdentityAttribute: string | undefined;
  /** The kinship words the stage's draft gives each gender identity option. */
  genderTerms: unknown;
  /**
   * Earlier words the gender symbols may have been set from: the ones the
   * stage was saved with, and the ones last applied from this editor. A
   * mapping that is the standard one for any of them is out of date rather
   * than custom.
   */
  earlierGenderTerms: readonly unknown[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether the mapping draws every option as `symbolFor` says, and everyone
 * else as a diamond.
 *
 * Compared by what the interview draws rather than entry by entry: an option
 * with no entry of its own is drawn with the default, and an entry for a
 * value the attribute no longer has is never matched by anyone.
 */
const drawsAs = (
  mapping: ShapeMappingDraft,
  defaultShape: unknown,
  options: readonly Readonly<{ value: OptionValue }>[],
  symbolFor: (value: OptionValue) => NodeShape,
): boolean =>
  mapping.type === 'discrete' &&
  defaultShape === PEDIGREE_OTHER_SYMBOL &&
  options.every(
    ({ value }) =>
      (shapeForValue(mapping, value) ?? defaultShape) === symbolFor(value),
  );

/**
 * Whether the mapping is the standard one for words the options had earlier
 * or for options the attribute had earlier: every entry naming a current
 * option agrees with one set of words, while the options it covers or the
 * words they take are no longer the ones the stage has now.
 */
const drawsAsEarlier = (
  mapping: ShapeMappingDraft,
  defaultShape: unknown,
  options: readonly Readonly<{ value: OptionValue }>[],
  candidates: readonly unknown[],
): boolean => {
  if (mapping.type !== 'discrete' || defaultShape !== PEDIGREE_OTHER_SYMBOL) {
    return false;
  }
  const current = (mapping.map ?? []).filter((entry) =>
    options.some((option) => option.value === entry.value),
  );
  return candidates.some((terms) =>
    current.every(
      (entry) => entry.shape === genderIdentitySymbol(terms, entry.value),
    ),
  );
};

/**
 * What the person type's symbols follow.
 *
 * - No mapping: `notMapped`.
 * - The mapping follows the stage's sex assigned at birth attribute: `sexAssignedAtBirth`
 *   when it draws each option with its standard symbol and everyone else as a
 *   diamond, `custom` otherwise.
 * - It follows the stage's gender identity attribute: `genderIdentity` when it
 *   draws each option with the symbol of the words the stage's draft gives it
 *   and everyone else as a diamond; `genderIdentityOutOfDate` when it is
 *   instead the standard mapping for earlier words or earlier options;
 *   `custom` otherwise.
 * - It follows anything else: `other`.
 */
export const personSymbolState = ({
  shape,
  variables,
  sexAssignedAtBirthAttribute,
  genderIdentityAttribute,
  genderTerms,
  earlierGenderTerms,
}: PersonSymbolInputs): PersonSymbolState => {
  const stored = isRecord(shape) ? shape : {};
  const defaultShape = stored.default;
  if (!isRecord(stored.dynamic)) {
    return {
      kind: 'notMapped',
      defaultShape: isNodeShape(defaultShape) ? defaultShape : 'circle',
    };
  }
  const mapping = shapeMappingDraft(stored.dynamic);
  const variableId = mapping.variable ?? '';

  if (
    sexAssignedAtBirthAttribute !== undefined &&
    variableId === sexAssignedAtBirthAttribute
  ) {
    const options = variables[variableId]?.options ?? [];
    return drawsAs(mapping, defaultShape, options, sexAssignedAtBirthSymbol)
      ? { kind: 'sexAssignedAtBirth' }
      : { kind: 'custom', source: 'sexAssignedAtBirth' };
  }

  if (
    genderIdentityAttribute !== undefined &&
    variableId === genderIdentityAttribute
  ) {
    const options = variables[variableId]?.options ?? [];
    if (
      drawsAs(mapping, defaultShape, options, (value) =>
        genderIdentitySymbol(genderTerms, value),
      )
    ) {
      return { kind: 'genderIdentity' };
    }
    return drawsAsEarlier(mapping, defaultShape, options, [
      genderTerms,
      ...earlierGenderTerms,
    ])
      ? { kind: 'genderIdentityOutOfDate' }
      : { kind: 'custom', source: 'genderIdentity' };
  }

  return { kind: 'other', variableId };
};
