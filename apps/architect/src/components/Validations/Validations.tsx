import { isNull, keys as getKeys, omit, toPairs } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { Variable } from '@codaco/protocol-validation';

import ArchitectField from '../Form/ArchitectField';
import {
  findDraftContradictions,
  findLegalReferenceTargets,
  floorIssue,
} from './contradictions';
import { getValidationOptionsForVariableType, isValidationWithListValue } from './options';
import Validation from './Validation';

type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

// `initialValue` is a register-effect dependency (`useField`'s registration
// effect): an absent committed value must fall back to a REFERENTIALLY STABLE
// empty object, not a fresh `{}` literal recreated every render — the latter
// re-registers the field on every render of a parent that also happens to
// re-render for an unrelated reason (e.g. a sibling `errors` update), which
// silently drops any error the store had just attached to this field name.
const EMPTY_VALIDATION: ValidationMap = {};

/**
 * Guards against a corrupted `null`-valued rule making it into the saved
 * protocol (a value-bearing rule type whose value was never actually
 * chosen). Runs through `ArchitectField`'s `custom` validation, so it now
 * shows through the same `BaseField` error slot every other field uses —
 * previously a hand-rolled `meta.submitFailed`-gated message, shown only
 * after a whole-form submit attempt; this shows after the field is blurred,
 * which is fresco-ui's normal timing.
 */
const validateNoNullValues = (value: unknown): string | undefined => {
  // Custom validators receive the field's value as `unknown`; this field's
  // own component always writes a `ValidationMap`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const pairs = toPairs((value ?? {}) as ValidationMap);
  const nullKeys = pairs
    .filter(([, itemValue]) => isNull(itemValue))
    .map(([key]) => key);

  if (nullKeys.length === 0) return undefined;

  return `Validations (${nullKeys.join(', ')}) must have values`;
};

/**
 * Applies a committed (key, value) pair to the validation map, renaming the
 * row from `oldKey` if given. `Validation.tsx` owns deciding whether a value
 * survives a rule-type change (and forces `true` for value-less rule types)
 * before this is ever called, via its own draft state and `isDraftComplete`
 * gate — so the value handed in here is already final and is stored as-is,
 * with no further "does this look stale" heuristic re-applied.
 */
export const getUpdatedValue = (
  previousValue: ValidationMap,
  key: string,
  value: ValidationValue,
  oldKey: string | null = null,
): ValidationMap => {
  // A disabled option should make this unreachable in the UI, but keep the
  // update lossless if a stale/programmatic event still requests a key that
  // belongs to another row. The old behavior overwrote the existing rule and
  // then removed the edited one.
  if (oldKey && key !== oldKey && Object.hasOwn(previousValue, key)) {
    return previousValue;
  }

  if (!oldKey) {
    return { ...previousValue, [key]: value };
  }

  return {
    ...omit(previousValue, oldKey),
    [key]: value,
  };
};

const getOptionsWithUsedDisabled = (
  options: ValidationOption[],
  used: string[],
) =>
  options.map((option) => {
    if (!used.includes(option.value)) {
      return option;
    }
    return { ...option, disabled: true };
  });

const AddItem = (props: ComponentProps<typeof Button>) => (
  <Button
    color="primary"
    icon={<Plus />}
    className="self-start"
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  >
    Add new
  </Button>
);

type ValidationOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type ValidationsFieldProps = {
  value?: ValidationMap;
  onChange?: (value: ValidationMap) => void;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
  variableType?: string;
  entity?: string;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  draftOptions?: unknown;
  draftComponent?: unknown;
  draftParameters?: unknown;
  draftVariableName?: unknown;
};

/**
 * The `withStoreState`/`withAddNew`/`withUpdateHandlers` HOC stack collapsed
 * into the field component itself: `value`/`onChange` (from `ArchitectField`)
 * replace the old `formValueSelector`/`change` reads and writes, and
 * `editingKey`/`addNew` — previously `useState` injected by `withState` —
 * are now local state here directly.
 */
const ValidationsField = ({
  value = {},
  onChange,
  existingVariables,
  variableType,
  entity,
  allVariables,
  currentVariableId,
  draftOptions,
  draftComponent,
  draftParameters,
  draftVariableName,
}: ValidationsFieldProps) => {
  const validationOptions = useMemo(
    () => getValidationOptionsForVariableType(variableType ?? '', entity ?? ''),
    [variableType, entity],
  );

  // Only one row (existing or the "add new" draft) is ever open for editing
  // at a time.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addNew, setAddNew] = useState(false);
  const usedOptions = getKeys(value);

  const uniqueValueCount = useMemo(() => {
    if (variableType !== 'boolean' && variableType !== 'ordinal') {
      return undefined;
    }
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);
    const current = allVariables?.[currentVariableId ?? ''];
    const storedOptions =
      isRecord(current) && 'options' in current ? current.options : undefined;
    const options = Array.isArray(draftOptions)
      ? draftOptions
      : Array.isArray(storedOptions)
        ? storedOptions
        : undefined;
    // Fifteenth-wave Finding 2: `booleanOptionsSchema` accepts a single-option
    // array, so a Boolean can genuinely offer one value — with `unique` set,
    // the second entity to answer then has nothing left to pick. Only an
    // ABSENT options array means the unrestricted Yes/No default of two; an
    // ordinal with no options configured yet has no domain to report at all.
    if (options === undefined)
      return variableType === 'boolean' ? 2 : undefined;
    // Sixteenth-wave Finding 2: count DISTINCT option values, for ordinals as
    // well as Booleans. Two options may carry the same `value`, and the
    // runtime stores one value per distinct value — counting option entries
    // would overstate how many entities can hold a unique answer.
    return new Set(
      options
        .map((option) => (isRecord(option) ? option.value : undefined))
        .filter((optionValue) => optionValue !== undefined),
    ).size;
  }, [variableType, draftOptions, allVariables, currentVariableId]);

  const checkDraft = useMemo(
    () =>
      (
        ruleKey: string,
        ruleValue: unknown,
        replacingKey?: string,
      ): string[] => {
        // R1 floor check runs ahead of the contradiction analyser: a
        // below-floor value is input the schema would reject outright, so
        // there is no point feeding it into findDraftContradictions.
        const floor = floorIssue(ruleKey, ruleValue);
        if (floor) return [floor];
        const prospective: Record<string, unknown> = { ...value };
        if (replacingKey && replacingKey !== ruleKey) {
          delete prospective[replacingKey];
        }
        prospective[ruleKey] = ruleValue;
        // The Anonymisation passphrase is not a codebook variable; a text
        // surrogate lets the local length-pair check still apply.
        const isPassphrase = variableType === 'passphrase';
        return findDraftContradictions({
          allVariables: isPassphrase ? {} : (allVariables ?? {}),
          currentVariableId: currentVariableId ?? '',
          variableType: isPassphrase ? 'text' : (variableType ?? ''),
          validation: prospective,
          options: draftOptions,
          // Nineteenth-wave Finding 4: without these the row check analysed
          // the COMMITTED variable, so a parameters edit and a new reference
          // rule made in the same dialog session disagreed with the
          // form-level validator — the row rejected an edit that saves
          // perfectly well once the dialog is closed and reopened.
          component: draftComponent,
          parameters: draftParameters,
          draftVariableName,
        }).map((contradiction) => contradiction.message);
      },
    [
      value,
      allVariables,
      currentVariableId,
      variableType,
      draftOptions,
      draftComponent,
      draftParameters,
      draftVariableName,
    ],
  );

  // Twenty-third-wave Finding 3: the reference-target dropdown needs the
  // legal candidates for one rule, not just one candidate at a time — see
  // findLegalReferenceTargets for why that can be answered in one shared
  // analysis pass instead of one `checkDraft` call per candidate.
  const findLegalTargets = useMemo(
    () =>
      (
        ruleKey: string,
        candidateIds: string[],
        replacingKey?: string,
      ): Set<string> => {
        const isPassphrase = variableType === 'passphrase';
        return findLegalReferenceTargets({
          allVariables: isPassphrase ? {} : (allVariables ?? {}),
          currentVariableId: currentVariableId ?? '',
          variableType: isPassphrase ? 'text' : (variableType ?? ''),
          validation: value,
          ruleKey,
          replacingKey,
          candidateIds,
          options: draftOptions,
          component: draftComponent,
          parameters: draftParameters,
          draftVariableName,
        });
      },
    [
      value,
      allVariables,
      currentVariableId,
      variableType,
      draftOptions,
      draftComponent,
      draftParameters,
      draftVariableName,
    ],
  );

  // A reference rule (e.g. "Same as") is disabled in the dropdown once no
  // existing variable could legally serve as its target.
  //
  // Twenty-seventh-wave Finding 1: this used to call `checkDraft` once per
  // candidate variable per unused reference rule, and each call re-ran
  // `findDraftContradictions` over the WHOLE record — O(rule types ×
  // variable count) analyser passes, each itself O(variable count), so
  // rendering this section was quadratic in codebook size and could freeze
  // Architect on large protocols. `findLegalTargets` answers "does this rule
  // have any legal target at all" for every candidate in one shared,
  // UnionFind-batched analysis pass (see findLegalReferenceTargets) — the
  // same path the target dropdown itself already uses — so a rule is enabled
  // exactly when that set is non-empty.
  const candidateIds = Object.keys(existingVariables);
  const availableOptions = getOptionsWithUsedDisabled(
    validationOptions,
    usedOptions,
  ).map((option) => {
    if (option.disabled || !isValidationWithListValue(option.value)) {
      return option;
    }
    const hasLegalTarget =
      findLegalTargets(option.value, candidateIds, editingKey ?? undefined)
        .size > 0;
    return hasLegalTarget ? option : { ...option, disabled: true };
  });
  // Twenty-first-wave Finding 5: when all unused validation rules are
  // reference rules with no legal target, the options map disables every
  // remaining option, but isFull below still compared only the number of used
  // rules with the total option count. Treat disabled unused options as
  // unavailable when deciding whether another rule can be added.
  const enabledUnusedOptions = availableOptions.filter(
    (option) => !option.disabled && !usedOptions.includes(option.value),
  );
  const isFull = enabledUnusedOptions.length === 0;
  const isEditingSomething = addNew || editingKey !== null;

  const handleSaveExisting = (
    key: string,
    itemValue: ValidationValue,
    itemKey: string,
  ) => {
    onChange?.(getUpdatedValue(value, key, itemValue, itemKey));
    setEditingKey(null);
  };

  const handleDeleteExisting = (itemKey: string) => {
    onChange?.(omit(value, itemKey));
    setEditingKey((current) => (current === itemKey ? null : current));
  };

  const handleStartAddNew = () => {
    setEditingKey(null);
    setAddNew(true);
  };

  const handleAddNew = (key: string, itemValue: ValidationValue) => {
    onChange?.(getUpdatedValue(value, key, itemValue));
    setAddNew(false);
  };

  return (
    <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
      <div className="flex flex-col gap-5">
        {toPairs(value).map(([key, itemValue]) => (
          <Validation
            key={key}
            itemKey={key}
            itemValue={itemValue}
            options={availableOptions}
            existingVariables={existingVariables}
            isBeingEdited={key === editingKey}
            onEdit={() => setEditingKey(key)}
            onCancel={() => setEditingKey(null)}
            onUpdate={handleSaveExisting}
            onDelete={handleDeleteExisting}
            checkDraft={checkDraft}
            findLegalTargets={findLegalTargets}
            uniqueValueCount={uniqueValueCount}
          />
        ))}
        {addNew && (
          <Validation
            isBeingEdited
            onUpdate={handleAddNew}
            onCancel={() => setAddNew(false)}
            options={availableOptions}
            existingVariables={existingVariables}
            checkDraft={checkDraft}
            findLegalTargets={findLegalTargets}
            uniqueValueCount={uniqueValueCount}
          />
        )}
      </div>

      {!isFull && (
        <AddItem onClick={handleStartAddNew} disabled={isEditingSomething} />
      )}
    </div>
  );
};

export type ValidationsProps = {
  name: string;
  /** The committed validation record, for the field's `initialValue`. */
  initialValue?: ValidationMap;
  existingVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  variableType?: string;
  entity?: string;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  /**
   * Sibling draft values from whatever form surrounds this field — read (and
   * kept reactive) by the caller, since this component may be nested inside
   * the field-editor dialog (where they are live sibling fields) or inside
   * `CodebookVariableValidationSection`'s isolated form (where they are not
   * fields at all, just the committed variable's own values).
   */
  draftOptions?: unknown;
  draftComponent?: unknown;
  draftParameters?: unknown;
  draftVariableName?: unknown;
};

/**
 * A validation-rule editor bound to one stage or codebook-variable form
 * field. Renders the whole `Record<ruleName, value>` as ONE opaque field
 * value (the same governing rule every array/record field follows in this
 * migration) — individual rows are rendered from that value locally, never
 * registered as their own form fields.
 */
const Validations = ({
  name,
  initialValue,
  existingVariables = {},
  variableType,
  entity,
  allVariables,
  currentVariableId,
  draftOptions,
  draftComponent,
  draftParameters,
  draftVariableName,
}: ValidationsProps): ReactNode => (
  <ArchitectField
    name={name}
    component={ValidationsField}
    label="Validation rules"
    labelHidden
    initialValue={initialValue ?? EMPTY_VALIDATION}
    validation={{ noNullValues: validateNoNullValues }}
    existingVariables={existingVariables}
    variableType={variableType}
    entity={entity}
    allVariables={allVariables}
    currentVariableId={currentVariableId}
    draftOptions={draftOptions}
    draftComponent={draftComponent}
    draftParameters={draftParameters}
    draftVariableName={draftVariableName}
  />
);

export default Validations;
