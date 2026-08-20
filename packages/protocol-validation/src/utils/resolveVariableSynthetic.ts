import {
  type DatetimeSynthetic,
  DEFAULT_OPTION_WEIGHT,
  type NumberSynthetic,
  type ScalarSynthetic,
  type SyntheticOptionWeight,
  type SyntheticSelectionCount,
  type SyntheticTextGenerator,
  type VariableSynthetic,
} from '../schemas/8/synthetic/index.ts';
import type {
  ComponentType,
  VariableType,
} from '../schemas/8/variables/types.ts';
import { optionValueKey } from '../shared/synthetic/helpers.ts';
import { collectVariableRoleHits } from './findVariableRoleConflicts.ts';

/**
 * The single definition of every VARIABLE-level synthetic default.
 *
 * Read at generation time rather than written at parse time, and that is the
 * whole design. A variable's default depends on its EFFECTIVE validation — its
 * own rules plus the rules imposed by the interfaces that collect it — which is
 * cross-document knowledge a Zod schema hanging off one variable cannot see,
 * and which changes as the protocol is edited. Writing a derived value into the
 * file is therefore what would make it go stale, and would leave Architect with
 * the question "did I write this, or did the researcher?". Nothing here is ever
 * persisted: every `synthetic` block in a protocol was authored by a human.
 *
 * See docs/superpowers/specs/2026-08-19-synthetic-parameters-in-schema-design.md
 */

// ---------------------------------------------------------------------------
// The numbers this module owns
// ---------------------------------------------------------------------------

/**
 * The window a `number` that declares no bounds at all is drawn between, as a
 * realistic span of ages — the commonest unbounded number in a personal-network
 * protocol by a wide margin.
 *
 * A floor rather than a rule: a variable whose validation puts its ceiling
 * below this floor slides the whole span down rather than inverting it, because
 * a value above a declared maximum is one the participant's own form rejects.
 */
const DEFAULT_NUMBER_WINDOW = { floor: 18, span: 62 };

/**
 * How many options a categorical selects where nothing — neither its own
 * validation nor the interfaces that collect it — states a ceiling.
 *
 * Small deliberately: a checkbox group left to itself is answered with one or
 * two ticks far more often than with every box on the list, so a wider default
 * would make every generated network look like a survey nobody read.
 */
const DEFAULT_MAX_SELECTED = 2;

/**
 * How far back a `datetime` reaches when the field it is collected in leaves
 * its floor open, in days before the session.
 *
 * Roughly a decade, which is what the draw has always reached — replacing the
 * `faker.date.past()` window generation used before descriptors existed. Only a
 * full-resolution DatePicker declaring no `min` can reach it: a month or year
 * picker renders a closed dropdown whose earliest option the control itself
 * fixes, and a RelativeDatePicker carries a session-relative window through its
 * own `anchor`/`before`/`after`.
 */
const DEFAULT_DATE_REACH_DAYS = 3650;

/**
 * How often a boolean that declares nothing answers true. Even, because nothing
 * in a bare `boolean` says which way a participant leans; a variable whose
 * answers really do skew is one an author can describe.
 */
const DEFAULT_PROBABILITY_TRUE = 0.5;

/**
 * The normalised scale a `scalar` response is recorded on, written as the
 * bounds a scalar is drawn between.
 *
 * A type intrinsic rather than a parameter: the schema accepts no
 * `minValue`/`maxValue` on a scalar and `scalarUniformSchema` already bounds
 * both ends by `probabilitySchema`, so this states in one place what those
 * schemas encode separately. Read INTO a resolved descriptor; never authorable.
 */
export const SCALAR_DOMAIN = { minValue: 0, maxValue: 1 };

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * What a resolved descriptor is derived FROM: the rules a generated value has
 * to satisfy, whether the variable declared them or an interface imposes them.
 *
 * Structurally a subset of a parsed variable's `validation`, so a caller that
 * already holds one — generation's own `VariableConstraints`, for instance —
 * passes it directly. `undefined` on a field means the rules leave that side
 * open, which is exactly what a default is for.
 */
export type EffectiveVariableRules = {
  required?: boolean;
  unique?: boolean;
  minValue?: number;
  maxValue?: number;
  minSelected?: number;
  maxSelected?: number;
};

/**
 * The parts of a variable a descriptor is derived from.
 *
 * Written structurally rather than as the parsed `Variable` union so that
 * generation's own working shape satisfies it too. Both describe the same
 * thing; neither should have to be converted into the other to ask this
 * question.
 */
export type SyntheticResolvableVariable = {
  name: string;
  type: VariableType;
  component?: ComponentType | undefined;
  options?:
    | readonly { readonly value: string | number | boolean }[]
    | undefined;
  /**
   * Read defensively: `parameters` differs per component, and a hand-built or
   * imported codebook can carry something else entirely.
   */
  parameters?: unknown;
  synthetic?: VariableSynthetic | undefined;
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * A descriptor with every field generation reads present.
 *
 * Discriminated by the variable type it describes, because the authorable
 * shapes are not distinguishable from one another by structure alone — a
 * number, a scalar and a datetime all say `distribution` — and a reader that
 * had to guess would be one more place the two halves could disagree.
 *
 * `missingProbability` is resolved rather than left absent, so no reader has to
 * decide what an absent one means.
 */
/**
 * One authorable distribution shape, tagged with the variable type it
 * describes and with its missingness resolved.
 *
 * Distributive on purpose: `(A | B) & C` narrows on a discriminant only once
 * TypeScript has pushed the intersection inside the union, and the draw
 * switches on `distribution` after switching on `type`.
 */
type Resolved<
  K extends ResolvedVariableSynthetic['type'],
  T,
> = T extends unknown ? T & { type: K; missingProbability: number } : never;

export type ResolvedTextSynthetic = {
  type: 'text';
  generator: SyntheticTextGenerator;
  missingProbability: number;
};

export type ResolvedNumberSynthetic = Resolved<
  'number',
  Extract<NumberSynthetic, { distribution: string }>
>;

export type ResolvedScalarSynthetic = Resolved<
  'scalar',
  Extract<ScalarSynthetic, { distribution: string }>
>;

export type ResolvedBooleanSynthetic = {
  type: 'boolean';
  probabilityTrue: number;
  missingProbability: number;
};

export type ResolvedOrdinalSynthetic = {
  type: 'ordinal';
  optionWeights: SyntheticOptionWeight[];
  missingProbability: number;
};

export type ResolvedCategoricalSynthetic = {
  type: 'categorical';
  selectionCount: SyntheticSelectionCount;
  optionWeights: SyntheticOptionWeight[];
  missingProbability: number;
};

export type ResolvedDatetimeSynthetic = Resolved<
  'datetime',
  Extract<DatetimeSynthetic, { distribution: string }>
>;

export type ResolvedVariableSynthetic =
  | ResolvedTextSynthetic
  | ResolvedNumberSynthetic
  | ResolvedScalarSynthetic
  | ResolvedBooleanSynthetic
  | ResolvedOrdinalSynthetic
  | ResolvedCategoricalSynthetic
  | ResolvedDatetimeSynthetic;

// ---------------------------------------------------------------------------
// Reading what an author declared
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * How often this question goes unanswered.
 *
 * Zero rather than absent: a resolved descriptor states every value generation
 * reads, and "never unanswered" is what an undeclared variable means.
 *
 * An effective `required` zeroes it, which is the missingness half of the
 * effective-validation rule. Declared `validation.required` cannot reach here
 * carrying a positive probability — `rejectMissingOnRequired` refuses that pair
 * outright — but an INTERFACE-implied one can, because the schema cannot see
 * from a variable which stages write it. A quick-add name generator will not
 * create a node from an empty field, so a `missingProbability` authored on its
 * `quickAdd` variable describes a node no participant could produce.
 */
const resolvedMissingProbability = (
  synthetic: VariableSynthetic | undefined,
  rules: EffectiveVariableRules,
): number => {
  if (rules.required === true) return 0;
  if (synthetic === undefined) return 0;
  if (!('missingProbability' in synthetic)) return 0;
  const declared = synthetic.missingProbability;
  return typeof declared === 'number' ? declared : 0;
};

/**
 * The value distribution the author declared, where they declared one.
 *
 * A `missingProbability`-only descriptor carries no `distribution` key, which
 * is what separates "the author shaped these values" from "the author only said
 * how often the question goes unanswered".
 */
const declaredDistribution = <T extends { distribution: string }>(
  synthetic: VariableSynthetic | undefined,
): T | undefined => {
  if (synthetic === undefined || !('distribution' in synthetic))
    return undefined;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return synthetic as T;
};

/** The option-weight table the author declared, where they declared one. */
const declaredOptionWeights = (
  synthetic: VariableSynthetic | undefined,
): SyntheticOptionWeight[] | undefined => {
  if (synthetic === undefined || !('optionWeights' in synthetic))
    return undefined;
  return synthetic.optionWeights;
};

/**
 * Whether the author named a text generator for this variable.
 *
 * Asked separately from the resolved generator because a caller's hint that a
 * field IS the entity's person label overrules the naming convention this
 * module infers from — but must never overrule a declaration, which is the
 * entire reason `neutralWords` is authorable.
 */
export const declaresTextGenerator = (
  variable: SyntheticResolvableVariable,
): boolean => {
  const synthetic = variable.synthetic;
  return (
    synthetic !== undefined &&
    'generator' in synthetic &&
    synthetic.generator !== undefined
  );
};

// ---------------------------------------------------------------------------
// Per-type derivations
// ---------------------------------------------------------------------------

/**
 * The generator a text variable that declares none is read as having.
 *
 * A text variable called `name` overwhelmingly holds a person's name in a
 * Network Canvas protocol — it is what a name generator writes and what a node
 * renders as its label — so neutral words there would make every generated
 * network read as nonsense. Anything else falls back to `neutralWords`, which
 * reads as filler without implying a meaning the variable may not have.
 *
 * An author who wants neutral words on a name-like variable declares
 * `neutralWords` explicitly; that is why the schema lists it as an authorable
 * generator rather than treating it as the absent case.
 */
export const inferTextGenerator = (
  variableName: string,
): SyntheticTextGenerator =>
  /name/i.test(variableName) ? 'personName' : 'neutralWords';

/**
 * The window a number is drawn between, derived from the rules it is actually
 * held to and falling back to {@link DEFAULT_NUMBER_WINDOW} only where those
 * leave a side open.
 *
 * Exported because generation counts the values a number can take as well as
 * drawing one, and a count taken against a different window than the draw walks
 * is a feasibility pass that refuses protocols generation handles fine.
 */
export function resolveNumberWindow(rules: EffectiveVariableRules): {
  min: number;
  max: number;
} {
  const { minValue, maxValue } = rules;
  const { floor, span } = DEFAULT_NUMBER_WINDOW;

  // A declared bound narrows the default window where it can, and MOVES it
  // where it cannot. Both ends of the default are meaningful — a floor of 18
  // and a ceiling of 80 describe a realistic span of ages — so a declared floor
  // of 30 keeps the ceiling and draws across [30, 80].
  //
  // What the window must never do is collapse. A ceiling below the default
  // floor drags the span down (a 0-10 count draws across [-52, 10]); a floor
  // ABOVE the default ceiling has to push it up the same way, or the two ends
  // meet: a "height in cm, minimum 150" variable resolved to [150, 150] and
  // returned 150 for ever. That asymmetry was a wart carried over from
  // `numberDrawBounds`, harmless while it was a private generation default and
  // not harmless now this is the schema's definition of the window.
  const min =
    minValue ??
    (maxValue !== undefined && maxValue < floor ? maxValue - span : floor);
  const max = maxValue ?? (min > floor + span ? min + span : floor + span);

  return { min, max };
}

/** The distinct values an option list offers, in first-occurrence order. */
const distinctOptionValues = (
  variable: SyntheticResolvableVariable,
): (string | number)[] => {
  const seen = new Set<string>();
  const values: (string | number)[] = [];
  for (const option of variable.options ?? []) {
    // Booleans are not selectable option values on an ordinal or a categorical
    // — a migration coerces legacy ones to strings — and a boolean variable's
    // own list is read as a domain rather than as weights.
    if (typeof option.value === 'boolean') continue;
    const key = optionValueKey(option.value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(option.value);
  }
  return values;
};

/**
 * A uniform weight for every distinct value the option list offers.
 *
 * Stated rather than left absent: weights are relative, so a table naming every
 * option once says exactly what no table says — and saying it lets every reader
 * take one path instead of two.
 */
const uniformOptionWeights = (
  variable: SyntheticResolvableVariable,
): SyntheticOptionWeight[] =>
  distinctOptionValues(variable).map((value) => ({
    value,
    weight: DEFAULT_OPTION_WEIGHT,
  }));

/**
 * How many options a categorical selects, as a table over the sizes its
 * effective rules leave reachable.
 *
 * Uniform across that range, because nothing in the protocol prefers one size
 * over another; an author who knows their data does can say so. The range is
 * the one the rules describe:
 *
 * - `minSelected: 0` does not lower the floor. The interview's own
 *   `minSelected` validator ignores an empty array — `required` owns emptiness
 *   — and a draw that answered nothing would be a poorer sample.
 * - `maxSelected: 0` is the other way round: the validator accepts the empty
 *   array and rejects every non-empty one, so nothing else is drawable and the
 *   floor gives way to the ceiling rather than inverting against it.
 * A value weighted zero is deliberately NOT excluded from the reachable sizes.
 * A table that leaves the draw nothing its author allowed is an authoring
 * contradiction generation raises on, and narrowing the size instead would
 * answer with fewer options than `minSelected` accepts — swapping a legible
 * refusal for data the protocol says cannot occur.
 */
const resolveSelectionCount = (
  variable: SyntheticResolvableVariable,
  rules: EffectiveVariableRules,
): SyntheticSelectionCount => {
  const distinctCount = distinctOptionValues(variable).length;

  const max = Math.min(
    rules.maxSelected ?? DEFAULT_MAX_SELECTED,
    distinctCount,
  );
  const min =
    max === 0
      ? 0
      : Math.min(Math.max(1, rules.minSelected ?? 1), distinctCount);

  // A floor above the ceiling is a contradiction feasibility reports; the
  // floor wins, because a selection short of `minSelected` fails the form it
  // was generated for while one above `maxSelected` is at least an answer the
  // participant could have given.
  const sizes =
    min > max
      ? [min]
      : Array.from({ length: max - min + 1 }, (_, at) => min + at);
  const probability = 1 / sizes.length;

  return {
    probabilities: sizes.map((count) => ({ count, probability })),
  };
};

/**
 * How often a boolean answers true.
 *
 * A `Boolean` control offering exactly one option has no second answer to give,
 * so the variable's own domain decides and the even split cannot apply. Scoped
 * to that control because it is the only one that reads the option list: a
 * `Toggle` ignores it and is unconditionally two-valued, which is the same test
 * generation's own `booleanDomainValues` makes.
 */
const resolveProbabilityTrue = (
  variable: SyntheticResolvableVariable,
): number => {
  if (variable.component !== 'Boolean' || variable.options === undefined) {
    return DEFAULT_PROBABILITY_TRUE;
  }
  const offered = new Set(
    variable.options
      .map((option) => option.value)
      .filter((value): value is boolean => typeof value === 'boolean'),
  );
  if (offered.size !== 1) return DEFAULT_PROBABILITY_TRUE;
  return offered.has(true) ? 1 : 0;
};

/**
 * Whether the field collecting this datetime leaves its earliest date open.
 *
 * Only then does a descriptor need a floor of its own. A month or year picker
 * renders a closed `<select>` whose earliest option the control fixes; a
 * RelativeDatePicker derives both ends from its own `anchor`/`before`/`after`;
 * and a declared `min` is the author closing it themselves. The ceiling is
 * never open — every date field stops at the session date unless the protocol
 * moved it — which is why nothing here resolves one.
 */
const datetimeFloorIsOpen = (
  variable: SyntheticResolvableVariable,
): boolean => {
  if (variable.component === 'RelativeDatePicker') return false;
  const parameters = isRecord(variable.parameters)
    ? variable.parameters
    : undefined;
  const resolution = parameters?.type;
  if (resolution === 'month' || resolution === 'year') return false;
  return typeof parameters?.min !== 'string';
};

/**
 * A datetime descriptor whose window moves with the session.
 *
 * RELATIVE rather than absolute, and that is forced: the default window is a
 * reach back from the date the interview runs on, which neither a parse nor
 * Architect knows. An absolute window written at authoring time freezes — a
 * protocol authored in 2026 and run in 2028 would generate two-year-stale
 * dates — so the descriptor names the offset and generation resolves it against
 * the session date it already holds.
 *
 * Added only where the field leaves its floor open, and only where the author
 * named no floor of their own: a relative window laid over a declared `min`
 * would be exactly the silent re-clamping this design exists to remove.
 */
const resolveDatetimeWindow = (
  variable: SyntheticResolvableVariable,
  declared: Extract<DatetimeSynthetic, { distribution: string }> | undefined,
): Extract<DatetimeSynthetic, { distribution: string }> => {
  const base: Extract<DatetimeSynthetic, { distribution: string }> =
    declared ?? {
      distribution: 'uniform',
    };
  if (base.min !== undefined || base.relative !== undefined) return base;
  if (!datetimeFloorIsOpen(variable)) return base;
  return { ...base, relative: { before: DEFAULT_DATE_REACH_DAYS, after: 0 } };
};

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/**
 * The complete descriptor for one variable: what the author declared, with
 * every field they left out derived from the rules the variable is actually
 * held to.
 *
 * Pure in both arguments and total over them. Totality matters because
 * `findVariableRoleConflicts` is an authoring-time ALERT rather than a
 * parse-time refusal — `CurrentProtocolSchema.parse()` accepts a protocol whose
 * variable is written from two incompatible contexts — so a conflicted variable
 * reaches here and has to resolve to the most restrictive window its writers
 * describe rather than to undefined behaviour.
 *
 * `undefined` for `layout` and `location`, which have no descriptor to resolve:
 * generation produces deterministic positions for both.
 */
export function resolveVariableSynthetic(
  variable: SyntheticResolvableVariable,
  rules: EffectiveVariableRules,
): ResolvedVariableSynthetic | undefined {
  const synthetic = variable.synthetic;
  const missingProbability = resolvedMissingProbability(synthetic, rules);

  switch (variable.type) {
    case 'text': {
      const generator =
        synthetic !== undefined && 'generator' in synthetic
          ? synthetic.generator
          : undefined;
      return {
        type: 'text',
        generator: generator ?? inferTextGenerator(variable.name),
        missingProbability,
      };
    }

    case 'number': {
      const declared =
        declaredDistribution<
          Extract<NumberSynthetic, { distribution: string }>
        >(synthetic);
      return {
        ...(declared ?? {
          distribution: 'uniform' as const,
          ...resolveNumberWindow(rules),
        }),
        type: 'number',
        // Last, so that a parsed descriptor carrying the key with no value
        // cannot spread an `undefined` over the resolved one.
        missingProbability,
      };
    }

    case 'scalar': {
      const declared =
        declaredDistribution<
          Extract<ScalarSynthetic, { distribution: string }>
        >(synthetic);
      return {
        ...(declared ?? {
          distribution: 'uniform' as const,
          // Narrowed by whatever rule reached this variable, but never wider
          // than the scale a scalar is recorded on.
          min: Math.max(
            rules.minValue ?? SCALAR_DOMAIN.minValue,
            SCALAR_DOMAIN.minValue,
          ),
          max: Math.min(
            rules.maxValue ?? SCALAR_DOMAIN.maxValue,
            SCALAR_DOMAIN.maxValue,
          ),
        }),
        type: 'scalar',
        missingProbability,
      };
    }

    case 'boolean': {
      const declared =
        synthetic !== undefined && 'probabilityTrue' in synthetic
          ? synthetic.probabilityTrue
          : undefined;
      return {
        type: 'boolean',
        probabilityTrue: declared ?? resolveProbabilityTrue(variable),
        missingProbability,
      };
    }

    case 'ordinal':
      return {
        type: 'ordinal',
        optionWeights:
          declaredOptionWeights(synthetic) ?? uniformOptionWeights(variable),
        missingProbability,
      };

    case 'categorical': {
      const optionWeights =
        declaredOptionWeights(synthetic) ?? uniformOptionWeights(variable);
      const declaredCount =
        synthetic !== undefined && 'selectionCount' in synthetic
          ? synthetic.selectionCount
          : undefined;
      return {
        type: 'categorical',
        optionWeights,
        selectionCount: declaredCount ?? resolveSelectionCount(variable, rules),
        missingProbability,
      };
    }

    case 'datetime': {
      const declared =
        declaredDistribution<
          Extract<DatetimeSynthetic, { distribution: string }>
        >(synthetic);
      return {
        ...resolveDatetimeWindow(variable, declared),
        type: 'datetime',
        missingProbability,
      };
    }

    case 'layout':
    case 'location':
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// The rules the interfaces impose
// ---------------------------------------------------------------------------

/**
 * The rules a variable is held to that it does not declare, because the
 * interfaces collecting it impose them structurally.
 *
 * Keyed by subject and then by variable id, since the same variable id on two
 * node types is two variables.
 */
export type SubjectInterfaceRules = ReadonlyMap<string, EffectiveVariableRules>;

/**
 * The variables a protocol assigns ONLY through a binning stage's prompt,
 * keyed by subject exactly as the rules above are.
 *
 * Not a rule but its opposite — the interview enforces NO form rules on these,
 * because validation is a form-field mechanism and neither binning interface
 * builds a field for its prompt variable. Carried alongside the implied rules
 * rather than as a second walk of the same tags, so the two readings cannot
 * disagree about who writes a variable.
 */
export type BinOnlyVariables = ReadonlyMap<string, ReadonlySet<string>>;

export type InterfaceImpliedRules = ReadonlyMap<
  string,
  SubjectInterfaceRules
> & {
  readonly binOnlyVariables: BinOnlyVariables;
};

/** How {@link collectInterfaceImpliedRules} files one subject. */
export const syntheticSubjectKey = (subject: {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
}): string =>
  subject.entity === 'ego' ? 'ego' : `${subject.entity}:${subject.type ?? ''}`;

/**
 * The tighter of two readings of the same rule, field by field.
 *
 * An INTERSECTION, which is what makes the derivation total. Each writer of a
 * variable allows a set of values; a writer imposing nothing allows everything,
 * so it narrows nothing, and a variable written from two incompatible contexts
 * resolves to the window both would accept rather than to whichever writer the
 * walk happened to reach first.
 */
export const narrowVariableRules = (
  rules: EffectiveVariableRules,
  narrower: EffectiveVariableRules,
): EffectiveVariableRules => {
  const tightest = (
    a: number | undefined,
    b: number | undefined,
    pick: (x: number, y: number) => number,
  ): number | undefined => {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return pick(a, b);
  };

  const narrowed: EffectiveVariableRules = { ...rules };
  if (rules.required === true || narrower.required === true) {
    narrowed.required = true;
  }
  if (rules.unique === true || narrower.unique === true) narrowed.unique = true;

  const bounds = {
    minValue: tightest(rules.minValue, narrower.minValue, Math.max),
    maxValue: tightest(rules.maxValue, narrower.maxValue, Math.min),
    minSelected: tightest(rules.minSelected, narrower.minSelected, Math.max),
    maxSelected: tightest(rules.maxSelected, narrower.maxSelected, Math.min),
  };
  for (const [rule, bound] of Object.entries(bounds)) {
    if (bound !== undefined) narrowed[rule as keyof typeof bounds] = bound;
  }

  return narrowed;
};

/**
 * The stage type behind a writer that is a prompt's own variable —
 * `stages[i].prompts[j].variable` — or `undefined` where the path is anything
 * else the stage carries. A CategoricalBin prompt's `otherVariable` is a
 * sibling key, and is a form field with a prompt of its own, so it is not one
 * of these.
 *
 * One derivation for both readings below, so "the bin writes this variable"
 * means the same thing to each.
 */
const promptVariableStageType = (
  path: readonly (string | number)[],
  stages: readonly unknown[],
): string | undefined => {
  if (path.length !== 5) return undefined;
  const [root, stageIndex, prompts, , key] = path;
  if (root !== 'stages' || typeof stageIndex !== 'number') return undefined;
  if (prompts !== 'prompts' || key !== 'variable') return undefined;
  const stage = stages[stageIndex];
  return isRecord(stage) && typeof stage.type === 'string'
    ? stage.type
    : undefined;
};

/** Whether a writer's path is a CategoricalBin prompt's own binned variable. */
const isCategoricalBinAssignment = (
  path: readonly (string | number)[],
  stages: readonly unknown[],
): boolean => promptVariableStageType(path, stages) === 'CategoricalBin';

/** The two interfaces that write a value by where an alter is dropped. */
const BIN_STAGE_TYPES: ReadonlySet<string> = new Set([
  'OrdinalBin',
  'CategoricalBin',
]);

/** Whether a writer's path is either binning stage's own prompt variable. */
const isBinPromptAssignment = (
  path: readonly (string | number)[],
  stages: readonly unknown[],
): boolean => {
  const stageType = promptVariableStageType(path, stages);
  return stageType !== undefined && BIN_STAGE_TYPES.has(stageType);
};

/**
 * Whether a writer's path is a stage's own `quickAdd` field — a
 * NameGeneratorQuickAdd's, or a NetworkComposer's palette input.
 *
 * Both interfaces collect one thing and will not create a node from an empty
 * one (`AddNodeInput` refuses a blank name in each), so the variable behind
 * the field is answered whenever the stage produces anybody at all — a
 * `missingProbability` on it would describe nodes neither interface can make.
 */
const QUICK_ADD_STAGE_TYPES = new Set([
  'NameGeneratorQuickAdd',
  'NetworkComposer',
]);

const isQuickAddField = (
  path: readonly (string | number)[],
  stages: readonly unknown[],
): boolean => {
  if (path.length !== 3) return false;
  const [root, stageIndex, key] = path;
  if (root !== 'stages' || typeof stageIndex !== 'number') return false;
  if (key !== 'quickAdd') return false;
  const stage = stages[stageIndex];
  return (
    isRecord(stage) &&
    typeof stage.type === 'string' &&
    QUICK_ADD_STAGE_TYPES.has(stage.type)
  );
};

/**
 * Every rule a protocol's interfaces impose on a variable without the variable
 * declaring it.
 *
 * A CategoricalBin is not a special case here — it is an interface contributing
 * `maxSelected: 1` to a variable that declared no such rule, because a bin drop
 * places an alter in exactly one bin (see CategoricalBin.tsx, which writes
 * `[bin.value]`). The same variable collected only by a form, with no
 * `maxSelected` declared, keeps the wider window and takes a wider default.
 *
 * Walked through `collectVariableRoleHits`, which already visits every
 * attribute-writing field the schema tags and reports, per (subject, variable),
 * each writer with its `usage` and its `path`. The stage behind a writer comes
 * from that path, which carries the stage index. Walking the protocol again
 * here would be a second reading of the same tags, free to drift from the
 * first.
 *
 * The same walk answers which variables the interfaces impose NOTHING on —
 * see {@link BinOnlyVariables}. "Only" is the whole of that claim, and it is
 * deliberately strict about other writers: a variable with any other writer
 * keeps its rules, because that site may be a form field where the participant
 * is shown a validation error.
 *
 * Walk the whole protocol ONCE per generation run: this visits every stage.
 */
export function collectInterfaceImpliedRules(
  protocol: unknown,
): InterfaceImpliedRules {
  const stages =
    isRecord(protocol) && Array.isArray(protocol.stages) ? protocol.stages : [];

  const bySubject = new Map<string, Map<string, EffectiveVariableRules>>();
  const binOnlyVariables = new Map<string, Set<string>>();

  for (const group of collectVariableRoleHits(protocol)) {
    // Read across EVERY writer rather than the first: the intersection is what
    // makes a conflicted variable resolve to the window all of its writers
    // accept. A writer that imposes nothing narrows nothing, so a variable a
    // form and a bin both write still resolves to the bin's single selection.
    const writers = [...group.validated, ...group.unvalidated];
    const key = syntheticSubjectKey(group.subject);

    // Every writer, not merely one: a variable a form also writes is shown to
    // the participant somewhere, and keeps its rules. `collectVariableRoleHits`
    // has already dropped read-only references, which do not decide who writes
    // a value. The subject needs no filtering — both binning stages take a node
    // subject, so nothing else can reach this path.
    if (
      writers.length > 0 &&
      writers.every((hit) => isBinPromptAssignment(hit.path, stages))
    ) {
      const forSubject = binOnlyVariables.get(key) ?? new Set<string>();
      forSubject.add(group.variableId);
      binOnlyVariables.set(key, forSubject);
    }

    const implied: EffectiveVariableRules = {};
    if (writers.some((hit) => isCategoricalBinAssignment(hit.path, stages))) {
      implied.maxSelected = 1;
    }
    if (writers.some((hit) => isQuickAddField(hit.path, stages))) {
      implied.required = true;
    }
    if (Object.keys(implied).length === 0) continue;

    const forSubject =
      bySubject.get(key) ?? new Map<string, EffectiveVariableRules>();
    forSubject.set(
      group.variableId,
      narrowVariableRules(forSubject.get(group.variableId) ?? {}, implied),
    );
    bySubject.set(key, forSubject);
  }

  // Carried ON the map rather than beside it, so every existing reader keeps
  // asking `.get(subjectKey)` for the rules it came for.
  return Object.assign(bySubject, { binOnlyVariables });
}
