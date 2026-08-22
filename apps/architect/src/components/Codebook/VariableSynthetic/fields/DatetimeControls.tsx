import { useEffect, useRef, useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { DatetimeSyntheticSchema } from '@codaco/protocol-validation';
import DatePicker from '~/components/Form/Fields/DatePicker';
import { describeNestedWindow } from '~/components/Synthetic/schemaIntrospection';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import {
  seedParameterValue,
  type NumericWindow,
} from '~/components/Synthetic/useNumericDraft';

import { useVariableSynthetic } from '../VariableSyntheticProvider';

/**
 * Every parameter `DatetimeSyntheticSchema` admits, in one editor.
 *
 * The schema describes a generated date four ways, and this offers all four
 * because a surface that offers three is a surface an imported descriptor can
 * only be reset out of: the FAMILY the dates are drawn from (evenly across a
 * window, or clustered around one date), the CLUSTER those dates gather around
 * (`mean` and `sdDays`), the SESSION-RELATIVE window (`relative`, whose absent
 * anchor is the day the interview runs), and the FIXED window (`min`/`max`).
 *
 * Two things keep it honest without restating a rule. Every date control is the
 * app's own `DatePicker`: a bound of the generated window is given the
 * variable's own resolution and accepted range, so a date the field could
 * never collect is not enterable (spec rule 2), while a cluster's centre and a
 * window's anchor — neither of which names a date the field collects — are
 * given the resolution alone. And every combination the schema refuses —
 * a floor stated twice over, a relative window on a control that already has
 * one, a zero-spread cluster outside the window — is refused BY the schema
 * through `propose`, with its own words rendered beside the control that
 * proposed it (spec rule 3). Nothing here decides which pairs are legal.
 */

const FALLBACK_WINDOW: NumericWindow = {
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

const RELATIVE_BEFORE_WINDOW: NumericWindow =
  describeNestedWindow(DatetimeSyntheticSchema, 'uniform', [
    'relative',
    'before',
  ]) ?? FALLBACK_WINDOW;

const RELATIVE_AFTER_WINDOW: NumericWindow =
  describeNestedWindow(DatetimeSyntheticSchema, 'uniform', [
    'relative',
    'after',
  ]) ?? FALLBACK_WINDOW;

/** How far a clustered draw typically falls from its own centre, in days. */
const SD_DAYS_WINDOW: NumericWindow =
  describeNestedWindow(DatetimeSyntheticSchema, 'normal', ['sdDays']) ??
  FALLBACK_WINDOW;

/**
 * The spread a cluster starts at when the author has named its date but not
 * yet its width — seeded from the window the schema states for it, by the same
 * helper a topology's parameters are seeded with, so no number is chosen here.
 * A `normal` declaration cannot omit `sdDays`, so a seed is what makes choosing
 * a date enough to state one.
 */
const SEED_SD_DAYS = seedParameterValue(SD_DAYS_WINDOW);

const FAMILY_OPTIONS = [
  { value: 'uniform', label: 'Spread evenly across the window' },
  { value: 'normal', label: 'Clustered around one date' },
] as const;

type Family = (typeof FAMILY_OPTIONS)[number]['value'];

const isFamily = (value: unknown): value is Family =>
  FAMILY_OPTIONS.some((option) => option.value === value);

const readString = (
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRecord = (
  source: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined => {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
};

/**
 * The resolution this variable's dates are written at, and the window its own
 * field accepts.
 *
 * `parameters.type` exists only on a plain DatePicker — a RelativeDatePicker's
 * parameters are a strict object without it — so reading it and falling back to
 * a full date is the same answer the schema's own refinement reaches, without
 * naming either component here.
 */
const datePickerParameters = (
  parameters: unknown,
): { type: string; min?: string; max?: string } => {
  const record = isRecord(parameters) ? parameters : undefined;
  const type = readString(record, 'type') ?? 'full';
  const min = readString(record, 'min');
  const max = readString(record, 'max');
  return {
    type,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
};

/** A date control at the variable's own resolution, inside its own window. */
function SyntheticDateField({
  name,
  label,
  hint,
  value,
  parameters,
  errors,
  disabled = false,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string | undefined;
  parameters: { type: string; min?: string; max?: string };
  errors?: readonly string[];
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <UnconnectedField
      name={name}
      label={label}
      {...(hint === undefined ? {} : { hint })}
      component={DatePicker}
      parameters={parameters}
      value={value ?? ''}
      disabled={disabled}
      onChange={(next: string | undefined) => onChange(next)}
      {...(errors && errors.length > 0
        ? { errors: [...errors], showErrors: true }
        : {})}
    />
  );
}

export function DatetimeControls() {
  const {
    namePrefix,
    variable,
    synthetic,
    authored,
    isAdmissible,
    resolveWith,
    propose,
  } = useVariableSynthetic();
  /**
   * What the schema said about the last proposal it would not accept, and
   * WHICH control made it — a datetime block is refused as a whole (a floor
   * stated twice over, a cluster outside its own window), so without the
   * second half the one refusal would be printed under every box on screen.
   */
  const [refusal, setRefusal] = useState<
    { field: string; messages: string[] } | undefined
  >(undefined);
  const errorsFor = (field: string): string[] =>
    refusal?.field === field ? refusal.messages : [];

  const declaredFamily = isFamily(synthetic?.distribution)
    ? synthetic.distribution
    : undefined;
  /**
   * Which family the CONTROLS are offering, which is not always the one the
   * block declares: a cluster cannot be stated without the date it gathers
   * around, so choosing "clustered" waits here until that date is chosen
   * rather than writing a declaration the researcher has not finished.
   */
  const [family, setFamily] = useState<Family>(declaredFamily ?? 'uniform');
  const hadBlock = useRef(authored);
  useEffect(() => {
    if (declaredFamily !== undefined) {
      setFamily(declaredFamily);
      hadBlock.current = authored;
      return;
    }
    // The block was REMOVED from under the controls — a reset, or an undo — so
    // the family goes back to what an unstated descriptor resolves to. A
    // family chosen but not yet stated (no date typed for a cluster) is not a
    // block, and nothing here disturbs that choice: only a block that existed
    // and then went away resets it.
    if (hadBlock.current && !authored) setFamily('uniform');
    hadBlock.current = authored;
  }, [declaredFamily, authored]);

  const relative = readRecord(synthetic, 'relative');
  const parameters = datePickerParameters(variable.parameters);
  /**
   * A cluster's centre and a window's anchor are held to a full ISO date and
   * to nothing else.
   *
   * Deliberately WITHOUT the field's own min/max. Neither names a date the
   * variable will collect: an anchor is the point a session-relative window is
   * measured from, and a mean with a spread that can still reach the window is
   * a declaration the schema accepts. Carrying the field's bounds into these
   * two pickers made both unwritable — a field capped at 2020 could not anchor
   * a window in 2021 however far back the window reached — while the pair the
   * schema really does refuse (a zero spread outside the window) is refused by
   * the schema, beside the control.
   */
  const fullDateParameters = { type: 'full' };

  /**
   * Writes a block, and drops the family discriminant where the schema does
   * not need it — the discriminant is only there to make a stated window
   * parse, and a block that says nothing else says less with it than without
   * (spec rule 4). Which of those it is remains the schema's question, asked
   * rather than answered here.
   */
  const commit = (field: string, next: Record<string, unknown>) => {
    const bare = { ...next, distribution: undefined };
    const messages = propose(isAdmissible(bare) ? bare : next);
    setRefusal(messages.length === 0 ? undefined : { field, messages });
  };

  /**
   * Whether this VARIABLE can carry a session-relative window at all — a
   * RelativeDatePicker cannot, because its own parameters already are one, and
   * the schema is what says so rather than a component name written here.
   *
   * Probed with a minimal block rather than with the authored one on purpose:
   * merging in what is already there answers a different question. A block
   * mid-way to a cluster has no `mean` yet and would fail for that; a block
   * with an authored `min` would fail because a floor cannot be stated twice —
   * and either would hide the control behind a sentence about the input
   * control, which is not why the schema refused.
   */
  const relativeIsAdmissible = isAdmissible({
    distribution: 'uniform',
    relative: { before: 1, after: 0 },
  });

  /**
   * The window an UNSTATED `relative` resolves to — asked of the resolver with
   * the window taken out of the block, so it is the schema's default rather
   * than whatever is in the boxes. It is what makes "cleared" different from
   * "zero": an empty box means the schema's reach back from the interview
   * date, and storing a zero there instead would pin every generated date to
   * the day the interview ran.
   */
  const unstated = resolveWith({
    ...synthetic,
    distribution: family,
    relative: undefined,
  });
  const defaults =
    unstated?.type === 'datetime' ? unstated.relative : undefined;

  const commitRelative = (
    key: 'before' | 'after' | 'anchor',
    value: number | string | undefined,
  ) => {
    const nextRelative = { ...relative, [key]: value };
    const before = readNumber(nextRelative, 'before');
    const after = readNumber(nextRelative, 'after');
    const anchor = readString(nextRelative, 'anchor');

    // The schema states both offsets together, so the one the author left
    // empty stands at what an unstated window resolves to rather than at a
    // zero nobody wrote.
    const filled = {
      before: before ?? defaults?.before ?? 0,
      after: after ?? defaults?.after ?? 0,
    };

    /**
     * Whether anything is left that the schema would not have said itself.
     *
     * Compared against the RESOLVED window rather than against emptiness,
     * because the first authoring necessarily writes both offsets: clearing
     * the one that was typed would otherwise leave the sibling standing —
     * a window of zero width, every generated date on the interview day —
     * with no way back to the default short of resetting the whole block. An
     * anchor is a statement of its own, and is never removed for the sake of
     * its offsets.
     */
    const statesNothing =
      anchor === undefined &&
      (defaults === undefined
        ? before === undefined && after === undefined
        : filled.before === defaults.before && filled.after === defaults.after);

    commit(`relative.${key}`, {
      ...synthetic,
      distribution: family,
      relative: statesNothing
        ? undefined
        : { ...(anchor === undefined ? {} : { anchor }), ...filled },
    });
  };

  return (
    <>
      <UnconnectedField
        name={`${namePrefix}.distribution`}
        label="How dates are chosen"
        hint="Evenly across the window below, or gathered around one date."
        component={NativeSelectField}
        options={FAMILY_OPTIONS.map((option) => ({ ...option }))}
        value={family}
        onChange={(next: string | number | undefined) => {
          if (!isFamily(next) || next === family) return;
          setFamily(next);
          // Leaving a cluster removes what only a cluster states; entering one
          // states nothing until its date is chosen below.
          if (next === 'uniform') {
            commit('distribution', {
              ...synthetic,
              distribution: 'uniform',
              mean: undefined,
              sdDays: undefined,
            });
          }
        }}
      />

      {family === 'normal' && (
        <>
          <SyntheticDateField
            name={`${namePrefix}.mean`}
            label="Date the answers gather around"
            hint="Generated dates fall near this date, most of them within the spread below."
            value={readString(synthetic, 'mean')}
            parameters={fullDateParameters}
            errors={errorsFor('mean')}
            onChange={(mean) =>
              commit('mean', {
                ...synthetic,
                distribution: mean === undefined ? 'uniform' : 'normal',
                mean,
                sdDays:
                  mean === undefined
                    ? undefined
                    : (readNumber(synthetic, 'sdDays') ?? SEED_SD_DAYS),
              })
            }
          />
          <SyntheticNumberField
            name={`${namePrefix}.sdDays`}
            label="How far from that date answers usually fall, in days"
            hint={
              readString(synthetic, 'mean') === undefined
                ? 'Choose the date the answers gather around first.'
                : 'About two thirds of generated dates fall within this many days of it.'
            }
            value={readNumber(synthetic, 'sdDays')}
            window={SD_DAYS_WINDOW}
            disabled={readString(synthetic, 'mean') === undefined}
            errors={errorsFor('sdDays')}
            onCommit={(sdDays) => {
              if (sdDays === undefined) return;
              commit('sdDays', {
                ...synthetic,
                distribution: 'normal',
                sdDays,
              });
            }}
          />
        </>
      )}

      {relativeIsAdmissible ? (
        <>
          <SyntheticNumberField
            name={`${namePrefix}.relative.before`}
            label="Days before the interview date"
            hint="How far back generated dates may reach from the day the interview runs."
            value={readNumber(relative, 'before')}
            window={RELATIVE_BEFORE_WINDOW}
            clearable
            errors={errorsFor('relative.before')}
            onCommit={(value) => commitRelative('before', value)}
          />
          <SyntheticNumberField
            name={`${namePrefix}.relative.after`}
            label="Days after the interview date"
            hint="How far forward generated dates may reach from the day the interview runs."
            value={readNumber(relative, 'after')}
            window={RELATIVE_AFTER_WINDOW}
            clearable
            errors={errorsFor('relative.after')}
            onCommit={(value) => commitRelative('after', value)}
          />
          <SyntheticDateField
            name={`${namePrefix}.relative.anchor`}
            label="Count those days from"
            hint="Leave this empty to count from the day the interview runs."
            value={readString(relative, 'anchor')}
            parameters={fullDateParameters}
            errors={errorsFor('relative.anchor')}
            onChange={(anchor) => commitRelative('anchor', anchor)}
          />
        </>
      ) : (
        <div className="mb-7">
          <p className="mb-1 font-semibold">How far back dates reach</p>
          <p className="text-text/70 text-sm">
            Not available — this attribute’s own input control already fixes the
            range its dates fall in.
          </p>
        </div>
      )}

      <SyntheticDateField
        name={`${namePrefix}.min`}
        label="Earliest date"
        hint="Leave this empty to reach as far back as the window above allows."
        value={readString(synthetic, 'min')}
        parameters={parameters}
        errors={errorsFor('min')}
        onChange={(min) =>
          commit('min', { ...synthetic, distribution: family, min })
        }
      />
      <SyntheticDateField
        name={`${namePrefix}.max`}
        label="Latest date"
        hint="Leave this empty to reach as far forward as the window above allows."
        value={readString(synthetic, 'max')}
        parameters={parameters}
        errors={errorsFor('max')}
        onChange={(max) =>
          commit('max', { ...synthetic, distribution: family, max })
        }
      />
    </>
  );
}
