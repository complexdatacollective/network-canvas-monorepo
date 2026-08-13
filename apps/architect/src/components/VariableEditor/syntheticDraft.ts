import type * as z from 'zod/mini';

import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { resolveVariableSynthetic } from '@codaco/protocol-utilities';
import {
  ComponentTypes,
  type CurrentProtocol,
  type DatetimeSynthetic,
  DEFAULT_OPTION_WEIGHT,
  isIsoDate,
  optionValueKey,
  rejectInvalidDatetimeSynthetic,
  type Variable,
  VariableSchema,
  type VariableSynthetic,
} from '@codaco/protocol-validation';
import {
  dateWithinPickerRange,
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

/**
 * Pure draft model for the variable editor's "Synthetic data" section.
 *
 * The section is optional: when it is off nothing is stored and runtime
 * defaults apply. When it is enabled, the form is initialised from the SAME
 * resolution the generator draws with (`resolveVariableSynthetic`), so the
 * UI's starting point is exactly what an undeclared protocol produces.
 * Submission assembles a schema-valid `synthetic` object from the flat field
 * values, normalising selection-count probabilities to sum to 1, and holds
 * the result to the codebook schema before it can be saved.
 */

/**
 * One NetworkComposer field's rendering of the variable being edited: the
 * control the stage puts in front of a participant, with the field's OWN
 * parameters where it declares any (`undefined` means the variable's apply,
 * mirroring the runtime's `fieldParameters ?? codebookParameters`).
 */
export type ComposerRendering = {
  component: string;
  parameters?: Record<string, unknown>;
};

export type SyntheticDraftContext = {
  variable: Variable;
  /**
   * The DRAFT option list (categorical/ordinal): weight and selection-count
   * rows must reconcile immediately when the draft's options change, so rows
   * derive from these rather than from the saved variable.
   */
  options: readonly { label: string; value: string | number }[];
  /** The draft's required flag; missingness is unavailable when set. */
  required: boolean;
  /**
   * How NetworkComposer stage fields render this variable. The record schema
   * superRefines these overlays (validateComposerFieldSyntheticWindows /
   * validateComposerFieldBooleanProbabilities in schema.ts): a stage field's
   * own component and parameters are authoritative for the values that stage
   * generates, so a descriptor the lone variable accepts can still be one the
   * protocol refuses. Without them the overlay is structurally invisible here
   * and a save the editor reported safe fails whole-protocol validation with
   * its error anchored at the stage, nowhere near this dialog.
   */
  composerRenderings?: readonly ComposerRendering[];
};

/**
 * The NetworkComposer renderings of one codebook variable, read from the
 * protocol's stages the way the record schema reads them: nodeForm fields
 * against the stage's node subject, each edge entry's form against its own
 * edge subject. Subject scoping matters — a field names its variable by key,
 * and keys are only meaningful within the entity type the form writes.
 */
export function collectComposerRenderings(
  stages: CurrentProtocol['stages'] | undefined,
  variableId: string,
  entity: 'node' | 'edge' | 'ego' | undefined,
  entityType: string | null | undefined,
): ComposerRendering[] {
  const renderings: ComposerRendering[] = [];
  if (!stages || !entity || entity === 'ego') return renderings;
  for (const stage of stages) {
    if (stage.type !== 'NetworkComposer') continue;
    if (entity === 'node') {
      if (stage.subject.type !== entityType) continue;
      for (const field of stage.nodeForm?.fields ?? []) {
        if (field.variable !== variableId) continue;
        renderings.push({
          component: field.component,
          parameters: field.parameters,
        });
      }
    } else {
      for (const edge of stage.edges ?? []) {
        if (edge.subject.type !== entityType) continue;
        for (const field of edge.form?.fields ?? []) {
          if (field.variable !== variableId) continue;
          renderings.push({
            component: field.component,
            parameters: field.parameters,
          });
        }
      }
    }
  }
  return renderings;
}

export type SyntheticFieldValues = Record<string, FieldValue>;

export const SYNTHETIC_ENABLED_FIELD = 'syntheticEnabled';

const PREFIX = 'synthetic';

// Underscore-joined FLAT names: the form store treats '.' in a field name as
// a nesting path, which would scatter these values across a nested object at
// submit time (and option values could themselves contain dots).
export const syntheticField = (...parts: (string | number)[]): string =>
  [PREFIX, ...parts].join('_');

const toNumber = (value: FieldValue | undefined): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toText = (value: FieldValue | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Distinct typed option values in first-occurrence order. */
function distinctDraftValues(
  options: SyntheticDraftContext['options'],
): { value: string | number; label: string }[] {
  const seen = new Set<string>();
  const values: { value: string | number; label: string }[] = [];
  for (const option of options) {
    const key = optionValueKey(option.value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({ value: option.value, label: option.label });
  }
  return values;
}

export type WeightRow = {
  fieldName: string;
  value: string | number;
  label: string;
  initial: number;
};

/** One weight row per distinct draft option value. */
export function weightRows(ctx: SyntheticDraftContext): WeightRow[] {
  const synthetic =
    'synthetic' in ctx.variable ? ctx.variable.synthetic : undefined;
  const declaredWeights =
    synthetic && 'optionWeights' in synthetic
      ? synthetic.optionWeights
      : undefined;
  const declared = declaredWeights
    ? new Map(
        declaredWeights.map((entry) => [
          optionValueKey(entry.value),
          entry.weight,
        ]),
      )
    : undefined;
  return distinctDraftValues(ctx.options).map(({ value, label }, index) => ({
    fieldName: syntheticField('weight', index),
    value,
    label,
    initial: declared?.get(optionValueKey(value)) ?? DEFAULT_OPTION_WEIGHT,
  }));
}

/**
 * The legal selection counts under the draft's options and validation.
 *
 * `positiveWeights` is the count of option values the author has given a
 * positive weight RIGHT NOW, where the caller can see the live fields. Read
 * from the saved weights instead, a zero-weight option the author has just
 * raised never adds its count to the table, and they have to save and reopen
 * before the distribution they are building can be configured.
 */
function legalCounts(
  ctx: SyntheticDraftContext,
  positiveWeights?: number,
): number[] {
  // Selection is without replacement over the positively weighted values, so
  // a count above how many of those there are cannot be drawn. Offering one
  // put a row in the table that `rejectIllegalSelectionCounts` refuses even at
  // probability zero — which blocked saving any edit to a variable that was
  // perfectly valid when the editor opened.
  const distinct =
    positiveWeights ?? weightRows(ctx).filter((row) => row.initial > 0).length;
  const validation =
    'validation' in ctx.variable ? (ctx.variable.validation ?? {}) : {};
  const minSelected =
    'minSelected' in validation
      ? (validation.minSelected as number)
      : undefined;
  const maxSelected =
    'maxSelected' in validation
      ? (validation.maxSelected as number)
      : undefined;
  const lowest = Math.max(1, minSelected ?? 1);
  const highest = Math.min(maxSelected ?? distinct, distinct);
  const counts: number[] = [];
  if (!ctx.required) counts.push(0);
  for (let count = lowest; count <= highest; count++) counts.push(count);
  return counts;
}

export type SelectionCountRow = {
  fieldName: string;
  count: number;
  /** Distinguishes an answered-empty selection from a missing value. */
  label: string;
  initial: number;
};

export function selectionCountRows(
  ctx: SyntheticDraftContext,
  /** See {@link legalCounts}; the editor passes its live weight fields. */
  positiveWeights?: number,
): SelectionCountRow[] {
  const counts = legalCounts(ctx, positiveWeights);
  const declaredTable =
    ctx.variable.type === 'categorical'
      ? ctx.variable.synthetic?.selectionCount
      : undefined;
  const declared = declaredTable
    ? new Map(
        declaredTable.probabilities.map((entry) => [
          entry.count,
          entry.probability,
        ]),
      )
    : undefined;
  const uniform = counts.length > 0 ? 1 / counts.length : 0;
  return counts.map((count) => ({
    fieldName: syntheticField('count', count),
    count,
    label:
      count === 0 ? 'No selection (answered, left empty)' : `${count} selected`,
    initial:
      declared?.get(count) ?? Number((declared ? 0 : uniform).toFixed(4)),
  }));
}

/**
 * Initial flat field values: the declared metadata where present, otherwise
 * the resolved runtime default for the variable's type.
 */
export function initialSyntheticValues(
  ctx: SyntheticDraftContext,
): SyntheticFieldValues {
  const resolved = resolveVariableSynthetic(ctx.variable);
  const declaredSynthetic =
    'synthetic' in ctx.variable ? ctx.variable.synthetic : undefined;
  const values: SyntheticFieldValues = {
    [SYNTHETIC_ENABLED_FIELD]: Boolean(declaredSynthetic),
  };
  const missing =
    declaredSynthetic && 'missingProbability' in declaredSynthetic
      ? declaredSynthetic.missingProbability
      : undefined;
  if (missing !== undefined) {
    values[syntheticField('missingProbability')] = missing;
  }

  switch (resolved.kind) {
    case 'number':
    case 'scalar': {
      const descriptor = resolved.descriptor;
      values[syntheticField('distribution')] = descriptor.distribution;
      if ('mean' in descriptor) {
        values[syntheticField('mean')] = descriptor.mean;
      }
      if ('sd' in descriptor) values[syntheticField('sd')] = descriptor.sd;
      if ('min' in descriptor && descriptor.min !== undefined) {
        values[syntheticField('min')] = descriptor.min;
      }
      if ('max' in descriptor && descriptor.max !== undefined) {
        values[syntheticField('max')] = descriptor.max;
      }
      if ('value' in descriptor) {
        values[syntheticField('value')] = descriptor.value;
      }
      break;
    }
    case 'boolean':
      values[syntheticField('probabilityTrue')] = resolved.probabilityTrue;
      break;
    case 'datetime': {
      const descriptor = resolved.descriptor;
      values[syntheticField('distribution')] = descriptor.distribution;
      if (descriptor.min !== undefined) {
        values[syntheticField('min')] = descriptor.min;
      }
      if (descriptor.max !== undefined) {
        values[syntheticField('max')] = descriptor.max;
      }
      if (descriptor.distribution === 'normal') {
        values[syntheticField('mean')] = descriptor.mean;
        values[syntheticField('sdDays')] = descriptor.sdDays;
      }
      break;
    }
    case 'text':
      values[syntheticField('generator')] = resolved.generator;
      break;
    case 'ordinal':
    case 'categorical': {
      for (const row of weightRows(ctx)) {
        values[row.fieldName] = row.initial;
      }
      if (resolved.kind === 'categorical') {
        for (const row of selectionCountRows(ctx)) {
          values[row.fieldName] = row.initial;
        }
      }
      break;
    }
    case 'stageOwned':
      break;
  }
  return values;
}

/**
 * Assembles the `synthetic` object the codebook stores from the flat draft
 * values. Returns undefined for stage-owned types (layout/location) or when
 * nothing meaningful was entered. Stale weight rows (values the draft's
 * options no longer offer) are never emitted: rows derive from the current
 * draft options by construction.
 */
export function assembleSynthetic(
  ctx: SyntheticDraftContext,
  values: SyntheticFieldValues,
): VariableSynthetic | undefined {
  const get = (name: string): FieldValue | undefined =>
    values[syntheticField(name)];
  const missingProbability = ctx.required
    ? undefined
    : toNumber(get('missingProbability'));
  // Zero is the documented default and stores nothing. Everything else is
  // carried into the candidate — including a value out of range, which the
  // schema is what rejects. The control's native `min`/`max` do not decide
  // this: the form submits with `noValidate`, so dropping an illegal number
  // here would save silently and show the default again on reopening.
  const carriesMissing =
    missingProbability !== undefined && missingProbability !== 0;
  const missing = carriesMissing ? { missingProbability } : {};

  switch (ctx.variable.type) {
    case 'layout':
    case 'location':
      return undefined;

    case 'number':
    case 'scalar': {
      const distribution = toText(get('distribution'));
      if (!distribution) {
        return carriesMissing ? { missingProbability } : undefined;
      }
      const mean = toNumber(get('mean'));
      const sd = toNumber(get('sd'));
      const min = toNumber(get('min'));
      const max = toNumber(get('max'));
      const value = toNumber(get('value'));
      if (distribution === 'constant') {
        return value === undefined
          ? undefined
          : ({ distribution, value, ...missing } as VariableSynthetic);
      }
      if (distribution === 'uniform') {
        return {
          distribution,
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
          ...missing,
        } as VariableSynthetic;
      }
      // normal / lognormal / beta share mean+sd with optional truncation.
      if (mean === undefined || sd === undefined) return undefined;
      return {
        distribution,
        mean,
        sd,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'boolean': {
      const probabilityTrue = toNumber(get('probabilityTrue'));
      if (probabilityTrue === undefined && missingProbability === undefined) {
        return undefined;
      }
      return {
        ...(probabilityTrue !== undefined ? { probabilityTrue } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'datetime': {
      const distribution = toText(get('distribution'));
      const min = toText(get('min'));
      const max = toText(get('max'));
      if (distribution === 'normal') {
        const mean = toText(get('mean'));
        const sdDays = toNumber(get('sdDays'));
        if (!mean || sdDays === undefined) return undefined;
        return {
          distribution: 'normal',
          mean,
          sdDays,
          ...(min ? { min } : {}),
          ...(max ? { max } : {}),
          ...missing,
        } as VariableSynthetic;
      }
      return {
        distribution: 'uniform',
        ...(min ? { min } : {}),
        ...(max ? { max } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'text': {
      const generator = toText(get('generator'));
      if (!generator && missingProbability === undefined) return undefined;
      return {
        ...(generator ? { generator } : {}),
        ...missing,
      } as VariableSynthetic;
    }

    case 'ordinal':
    case 'categorical': {
      // A negative weight is kept rather than dropped. The control carries a
      // native `min`, but the form submits with `noValidate`, so nothing has
      // refused it by the time it arrives here — and a dropped row saves as
      // no entry at all, which reopens showing the default weight of 1 with
      // nothing said about what was typed. Carried through, the schema's own
      // bound rejects it under the row that owns it.
      const optionWeights = weightRows(ctx).map((row) => ({
        value: row.value,
        weight: toNumber(values[row.fieldName]) ?? DEFAULT_OPTION_WEIGHT,
      }));
      const base: Record<string, unknown> = {};
      if (optionWeights.length > 0) base.optionWeights = optionWeights;

      if (ctx.variable.type === 'categorical') {
        // Against the weights being saved rather than the ones the editor
        // opened with, so zeroing a weight drops the counts it made
        // undrawable instead of assembling a table the schema then refuses.
        const selectable = optionWeights.filter(
          (entry) => entry.weight > 0,
        ).length;
        // The SAME live count, so the rows assembled are the rows the author
        // saw. Reading the saved weights here meant a probability entered in a
        // row the live table had just exposed was dropped, and the old rows
        // normalised and saved in its place.
        const rows = selectionCountRows(ctx, selectable)
          .filter((row) => row.count <= selectable)
          .map((row) => ({
            count: row.count,
            probability: toNumber(values[row.fieldName]) ?? 0,
          }));
        const total = rows.reduce((sum, row) => sum + row.probability, 0);
        // Normalised so the stored table always satisfies the schema's
        // sum-to-one rule whatever mixture the researcher typed — except a
        // table the schema has to see as typed to refuse. One of nothing but
        // zeros has no normalisation; one carrying a negative would be
        // normalised INTO range beside a positive row, saving a table the
        // author never entered and reopening with different numbers. Both are
        // assembled as typed so the schema rejects them and the editor says
        // so: dropping them instead saved a variable whose reopened editor
        // showed the runtime's uniform default in place of what was entered.
        // A value outside 0–1 is as much an error as a negative one: scaling
        // `2` and `1` down to roughly 0.66 and 0.33 saves a table the author
        // never entered and validates only the altered result. Normalisation
        // is for a mixture of legal weights, not a repair for illegal ones.
        const normalisable =
          total > 0 &&
          rows.every((row) => row.probability >= 0 && row.probability <= 1);
        base.selectionCount = {
          probabilities: rows.map((row) => ({
            count: row.count,
            probability: normalisable
              ? row.probability / total
              : row.probability,
          })),
        };
      }
      if (Object.keys(base).length === 0 && missingProbability === undefined) {
        return undefined;
      }
      return { ...base, ...missing } as VariableSynthetic;
    }
  }
}

// ---------------------------------------------------------------------------
// Submission-time validation
// ---------------------------------------------------------------------------

/** Draft errors in the shape the form store consumes. */
type SyntheticDraftErrors = {
  /** Keyed by flat field name; rendered under the control that owns it. */
  fieldErrors: Record<string, string[]>;
  /** Rendered as a list at the top of the form. */
  formErrors: string[];
};

type SchemaIssue = z.core.$ZodIssue;
type LocatedIssue = { path: PropertyKey[]; issue: SchemaIssue };

const issueKey = (located: LocatedIssue): string =>
  `${located.path.map(String).join('.')}|${located.issue.message}`;

/**
 * Whether a branch rejected the value's discriminant — the literal one level
 * below the union itself, `type` for a variable and `distribution` for a
 * distribution descriptor. Such a branch describes some other variable type,
 * and every one of its issues is about not being that type.
 */
const rejectsDiscriminant = (
  branch: readonly LocatedIssue[],
  depth: number,
): boolean =>
  branch.some(
    (located) =>
      located.issue.code === 'invalid_value' &&
      located.path.length === depth + 1,
  );

/**
 * The issues of a failed parse, taken from the union members that describe
 * this value. `VariableSchema` is a plain union, so one failure nests EVERY
 * member's issues — including the type mismatches of the ten variable types
 * this variable is not.
 *
 * Members are chosen by the discriminant, not by issue count. Counting looks
 * like the closeness Zod's own message reads by, but it inverts under load: a
 * member for another type bottoms out at two issues (the wrong `type`, plus
 * one `unrecognized_keys` swallowing every property it does not know), while
 * the member that actually fits reports one issue per real mistake. Past two
 * mistakes the fitting member is the furthest, its issues are dropped, and a
 * draft the schema rejects is reported as valid. Discarding the members that
 * rejected the discriminant removes exactly the members that cannot be this
 * value. Where that leaves nothing — no member accepted the discriminant —
 * every member is considered, since a bad guess beats no error at all.
 *
 * Two members can still both fit (a componentless boolean matches both of its
 * own); they then repeat each other, so identical issues collapse.
 */
const closestIssues = (
  issues: readonly SchemaIssue[],
  prefix: PropertyKey[] = [],
): LocatedIssue[] =>
  issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    // A discriminated union that matched no branch carries no nested issues:
    // its own message is the whole of what went wrong.
    if (issue.code !== 'invalid_union' || issue.errors.length === 0) {
      return [{ path, issue }];
    }
    const branches = issue.errors.map((branch) => closestIssues(branch, path));
    const fitting = branches.filter(
      (branch) => !rejectsDiscriminant(branch, path.length),
    );
    const considered = fitting.length > 0 ? fitting : branches;
    const closest = Math.min(...considered.map((branch) => branch.length));
    const seen = new Set<string>();
    return considered
      .filter((branch) => branch.length === closest)
      .flat()
      .filter((located) => {
        const key = issueKey(located);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  });

/** The scalar synthetic properties this editor renders a control for. */
const SYNTHETIC_LEAF_FIELDS = new Set([
  'distribution',
  'generator',
  'max',
  'mean',
  'min',
  'missingProbability',
  'probabilityTrue',
  'sd',
  'sdDays',
  'value',
]);

/**
 * The field an issue belongs under, or undefined where no control owns it —
 * a rule about a table as a whole, an entry naming an option value the draft
 * no longer offers, or a property this editor does not yet render. Those
 * become form errors instead, which is what makes them visible: the store
 * discards an error naming a field that is not registered.
 *
 * Table entries are matched on the value they carry rather than on their
 * position, so a row the draft has since dropped resolves to no control
 * instead of to whichever row inherited its index.
 */
const fieldForIssue = (
  ctx: SyntheticDraftContext,
  synthetic: VariableSynthetic | undefined,
  path: PropertyKey[],
): string | undefined => {
  const [, second, third, fourth] = path;
  if (second === 'optionWeights' && typeof third === 'number') {
    const entry =
      synthetic && 'optionWeights' in synthetic
        ? synthetic.optionWeights?.[third]
        : undefined;
    if (!entry) return undefined;
    const key = optionValueKey(entry.value);
    return weightRows(ctx).find((row) => optionValueKey(row.value) === key)
      ?.fieldName;
  }
  if (
    second === 'selectionCount' &&
    third === 'probabilities' &&
    typeof fourth === 'number'
  ) {
    const entry =
      synthetic && 'selectionCount' in synthetic
        ? synthetic.selectionCount?.probabilities[fourth]
        : undefined;
    if (!entry) return undefined;
    return selectionCountRows(ctx).find((row) => row.count === entry.count)
      ?.fieldName;
  }
  return typeof second === 'string' && SYNTHETIC_LEAF_FIELDS.has(second)
    ? syntheticField(second)
    : undefined;
};

/**
 * A message for the author. The schema's own refinements are already phrased
 * for one and pass through unchanged; Zod's structural wording ("Too big:
 * expected number to be <=1") names the constraint the parser applied rather
 * than the correction to make, and is restated against the bound it carries.
 */
const describeIssue = (issue: SchemaIssue): string => {
  const numeric =
    'origin' in issue && (issue.origin === 'number' || issue.origin === 'int');
  if (issue.code === 'too_small' && numeric) {
    return issue.inclusive
      ? `Enter ${issue.minimum} or more`
      : `Enter more than ${issue.minimum}`;
  }
  if (issue.code === 'too_big' && numeric) {
    return issue.inclusive
      ? `Enter ${issue.maximum} or less`
      : `Enter less than ${issue.maximum}`;
  }
  if (issue.code === 'invalid_type') return 'Enter a value';
  return issue.message;
};

type OverlayIssue = { path: PropertyKey[]; message: string };

/**
 * The record-level Composer overlay rejections, applied to the draft. The
 * variable schema can only judge the descriptor against the variable's OWN
 * component and parameters; the protocol record additionally superRefines
 * every NetworkComposer field's rendering of the variable
 * (validateComposerFieldSyntheticWindows /
 * validateComposerFieldBooleanProbabilities in schema.ts), because
 * `applyComposerRenderings` makes the field's control authoritative for the
 * values that stage generates. Run the same two checks here so a draft the
 * record will refuse is refused where the author can fix it, instead of
 * saving cleanly and surfacing later as a whole-protocol error anchored at
 * the stage.
 *
 * The datetime half reuses the schema's own `rejectInvalidDatetimeSynthetic`
 * with the same window resolution (the field's parameters where declared,
 * the variable's otherwise). The Boolean half mirrors
 * `validateComposerFieldBooleanProbabilities`, which is not exported: a
 * componentless boolean whose sole offered option a Composer `Boolean` field
 * renders leaves `probabilityTrue` at the opposite end undrawable.
 */
function composerOverlayIssues(
  ctx: SyntheticDraftContext,
  synthetic: VariableSynthetic | undefined,
): OverlayIssue[] {
  const issues: OverlayIssue[] = [];
  if (!synthetic || !ctx.composerRenderings?.length) return issues;
  const add = (issue: OverlayIssue) => {
    if (
      !issues.some(
        (existing) =>
          existing.message === issue.message &&
          existing.path.join('.') === issue.path.join('.'),
      )
    ) {
      issues.push(issue);
    }
  };

  for (const rendering of ctx.composerRenderings) {
    if (
      ctx.variable.type === 'datetime' &&
      (rendering.component === ComponentTypes.DatePicker ||
        rendering.component === ComponentTypes.RelativeDatePicker)
    ) {
      const parameters =
        rendering.parameters !== undefined
          ? rendering.parameters
          : 'parameters' in ctx.variable
            ? ctx.variable.parameters
            : undefined;
      let resolution: 'full' | 'month' | 'year' = 'full';
      let window:
        | { type?: 'full' | 'month' | 'year'; min?: string; max?: string }
        | undefined;
      if (rendering.component === ComponentTypes.RelativeDatePicker) {
        const relative = parameters as
          | { anchor?: string; before?: number; after?: number }
          | undefined;
        if (relative?.anchor === undefined || !isIsoDate(relative.anchor))
          continue;
        window = {
          min: dateWithinPickerRange(
            relative.anchor,
            -(relative.before ?? RELATIVE_DATE_PICKER_DEFAULT_BEFORE),
          ),
          max: dateWithinPickerRange(
            relative.anchor,
            relative.after ?? RELATIVE_DATE_PICKER_DEFAULT_AFTER,
          ),
        };
      } else {
        window = parameters as
          | { type?: 'full' | 'month' | 'year'; min?: string; max?: string }
          | undefined;
        resolution = window?.type ?? 'full';
      }
      rejectInvalidDatetimeSynthetic(
        synthetic as DatetimeSynthetic,
        resolution,
        window,
        {
          addIssue: (issue: { message?: string; path?: PropertyKey[] }) => {
            add({
              message: issue.message ?? 'Synthetic window is not valid here',
              // Kept at the descriptor path the helper writes (`synthetic`,
              // bound) — unlike the record, which re-anchors at the stage
              // field, this editor owns the control the bound came from.
              path: issue.path ?? ['synthetic'],
            });
          },
        } as unknown as Parameters<typeof rejectInvalidDatetimeSynthetic>[3],
      );
    }

    if (
      ctx.variable.type === 'boolean' &&
      rendering.component === ComponentTypes.Boolean &&
      // A variable that declares the control already carries the rule itself
      // (the variable schema rejects it), so only the componentless case is
      // the overlay's to judge.
      !('component' in ctx.variable && ctx.variable.component !== undefined)
    ) {
      const probabilityTrue = (synthetic as { probabilityTrue?: number })
        .probabilityTrue;
      const options =
        'options' in ctx.variable && Array.isArray(ctx.variable.options)
          ? (ctx.variable.options as { value: unknown }[])
          : undefined;
      if (probabilityTrue === undefined || !options) continue;
      const offered = new Set(options.map((option) => option.value));
      if (offered.size !== 1) continue;
      if (
        (offered.has(false) && probabilityTrue > 0) ||
        (offered.has(true) && probabilityTrue < 1)
      ) {
        add({
          message: `A stage renders this variable with the "Boolean" control, where the only option offered is ${String(offered.has(true))} — a probability of ${probabilityTrue} can never be drawn.`,
          path: ['synthetic', 'probabilityTrue'],
        });
      }
    }
  }
  return issues;
}

/**
 * The errors saving this draft would introduce, or undefined when it is safe
 * to save.
 *
 * Every synthetic control is a native input whose `min`/`max`/`step` nothing
 * enforces — the form renders `noValidate`, and the field validator speaks
 * `minValue`/`maxValue` — so the codebook schema is the only thing standing
 * between a typo (a probability of 2, a negative standard deviation,
 * inverted bounds, weights that are all zero) and a protocol that no longer
 * validates. The Composer overlay runs even when the variable parse
 * succeeds: it is a rule about the RECORD, and the lone variable passing is
 * exactly the case that used to save and fail downstream.
 *
 * Issues outside the `synthetic` subtree are deliberately left alone. They
 * describe a variable that was already invalid when the editor opened, and
 * this editor cannot reach them: refusing an unrelated rename over one would
 * strand the author with no way out of the dialog.
 */
export function validateAssembledVariable(
  ctx: SyntheticDraftContext,
  synthetic: VariableSynthetic | undefined,
): SyntheticDraftErrors | undefined {
  const candidate: Record<string, unknown> = { ...ctx.variable };
  if (synthetic) {
    candidate.synthetic = synthetic;
  } else {
    delete candidate.synthetic;
  }

  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  const report = (field: string | undefined, message: string) => {
    if (field === undefined) {
      if (!formErrors.includes(message)) formErrors.push(message);
      return;
    }
    const existing = (fieldErrors[field] ??= []);
    if (!existing.includes(message)) existing.push(message);
  };

  const result = VariableSchema.safeParse(candidate);
  if (!result.success) {
    for (const located of closestIssues(result.error.issues)) {
      if (located.path[0] !== 'synthetic') continue;
      report(
        fieldForIssue(ctx, synthetic, located.path),
        describeIssue(located.issue),
      );
    }
  }

  for (const issue of composerOverlayIssues(ctx, synthetic)) {
    report(fieldForIssue(ctx, synthetic, issue.path), issue.message);
  }

  return Object.keys(fieldErrors).length > 0 || formErrors.length > 0
    ? { fieldErrors, formErrors }
    : undefined;
}
