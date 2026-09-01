import { useId, useMemo } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  completeRuleValues,
  findLegalReferenceTargets,
  formatCommitted,
  getGroupedValidationsForVariableType,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
  parseForRule,
  ruleMapIssue,
  type ValidationMap,
  type ValidationValue,
} from '../variableValidation.ts';

type VariableValidationEditorProps = Readonly<{
  entity: 'node' | 'edge' | 'ego';
  variableType: string;
  currentVariableId: string;
  allVariables: Readonly<Record<string, unknown>>;
  value: Readonly<ValidationMap>;
  onChange(value: ValidationMap): void;
  readOnly?: boolean;
  className?: string;
}>;

type VariableMetadata = Readonly<{ name: string; type: string }>;

const NUMERIC_RULE_DEFAULTS: Readonly<Record<string, number>> = {
  minLength: 1,
  maxLength: 1,
  minValue: 0,
  maxValue: 0,
  minSelected: 1,
  maxSelected: 1,
};

const OPPOSITE_BOUND: Readonly<Record<string, string>> = {
  minLength: 'maxLength',
  maxLength: 'minLength',
  minValue: 'maxValue',
  maxValue: 'minValue',
  minSelected: 'maxSelected',
  maxSelected: 'minSelected',
};

const isVariableMetadata = (value: unknown): value is VariableMetadata =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof Reflect.get(value, 'name') === 'string' &&
  typeof Reflect.get(value, 'type') === 'string';

const holdsRule = (
  validation: Readonly<ValidationMap>,
  ruleKey: string,
): boolean =>
  Object.hasOwn(validation, ruleKey) &&
  (!isValidationWithoutValue(ruleKey) || validation[ruleKey] === true);

const withRule = (
  validation: Readonly<ValidationMap>,
  ruleKey: string,
  value: ValidationValue,
): ValidationMap => ({ ...validation, [ruleKey]: value });

const withoutRule = (
  validation: Readonly<ValidationMap>,
  ruleKey: string,
): ValidationMap => {
  const next = { ...validation };
  delete next[ruleKey];
  return next;
};

const initialNumericValue = (
  validation: Readonly<ValidationMap>,
  ruleKey: string,
): number => {
  const opposite = validation[OPPOSITE_BOUND[ruleKey] ?? ''];
  return typeof opposite === 'number'
    ? opposite
    : (NUMERIC_RULE_DEFAULTS[ruleKey] ?? 0);
};

/**
 * Host-neutral editor for one variable's validation map.
 *
 * The map is controlled as one value. A value-taking rule remains present as
 * `null` while incomplete, so a save gate can reject it and the researcher can
 * correct it instead of the rule being silently discarded.
 */
export default function VariableValidationEditor({
  entity,
  variableType,
  currentVariableId,
  allVariables,
  value,
  onChange,
  readOnly = false,
  className,
}: VariableValidationEditorProps) {
  const editorId = useId();
  const groups = useMemo(
    () => getGroupedValidationsForVariableType(variableType, entity),
    [entity, variableType],
  );
  const candidates = useMemo(
    () =>
      Object.entries(allVariables)
        .filter(
          (entry): entry is [string, VariableMetadata] =>
            entry[0] !== currentVariableId &&
            isVariableMetadata(entry[1]) &&
            entry[1].type === variableType,
        )
        .map(([id, variable]) => ({ id, name: variable.name }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    [allVariables, currentVariableId, variableType],
  );
  const candidateIds = useMemo(
    () => candidates.map(({ id }) => id),
    [candidates],
  );
  const legalTargets = useMemo(() => {
    const completeValidation = completeRuleValues(value);
    return new Map(
      groups
        .flatMap(({ rules }) => rules)
        .filter(({ value: ruleKey }) => isValidationWithListValue(ruleKey))
        .map(({ value: ruleKey }) => [
          ruleKey,
          findLegalReferenceTargets({
            allVariables: { ...allVariables },
            currentVariableId,
            variableType,
            validation: completeValidation,
            ruleKey,
            candidateIds,
          }),
        ]),
    );
  }, [
    allVariables,
    candidateIds,
    currentVariableId,
    groups,
    value,
    variableType,
  ]);

  const missingTargetRule = Object.entries(value).find(
    ([ruleKey, target]) =>
      isValidationWithListValue(ruleKey) &&
      typeof target === 'string' &&
      !Object.hasOwn(allVariables, target),
  )?.[0];
  const issue =
    missingTargetRule === undefined
      ? ruleMapIssue(value, {
          allVariables: { ...allVariables },
          currentVariableId,
          variableType,
        })
      : 'The selected comparison attribute no longer exists.';
  const issueId = issue === undefined ? undefined : `${editorId}-issue`;

  const toggleRule = (ruleKey: string, enabled: boolean) => {
    if (readOnly) return;
    if (!enabled) {
      onChange(withoutRule(value, ruleKey));
      return;
    }
    if (isValidationWithoutValue(ruleKey)) {
      onChange(withRule(value, ruleKey, true));
      return;
    }
    if (isValidationWithNumberValue(ruleKey)) {
      onChange(withRule(value, ruleKey, initialNumericValue(value, ruleKey)));
      return;
    }
    onChange(withRule(value, ruleKey, null));
  };

  return (
    <div className={className} aria-describedby={issueId}>
      {groups.map((group) => (
        <fieldset
          key={group.id}
          disabled={readOnly}
          className="border-border mb-4 flex min-w-0 flex-col gap-3 rounded border-2 p-4 last:mb-0"
        >
          <legend className="font-semibold text-current">
            {group.heading}
          </legend>
          {group.rules.map((rule) => {
            const enabled = holdsRule(value, rule.value);
            const ruleId = `${editorId}-${rule.value}`;
            const targetSet = legalTargets.get(rule.value);
            const unavailable =
              isValidationWithListValue(rule.value) &&
              !enabled &&
              (targetSet?.size ?? 0) === 0;
            const selected = value[rule.value];
            const selectedMissing =
              typeof selected === 'string' &&
              !Object.hasOwn(allVariables, selected);

            return (
              <div key={rule.value} className="flex flex-col gap-2">
                <label className="flex items-center gap-3" htmlFor={ruleId}>
                  <input
                    id={ruleId}
                    type="checkbox"
                    checked={enabled}
                    disabled={readOnly || unavailable}
                    onChange={(event) =>
                      toggleRule(rule.value, event.currentTarget.checked)
                    }
                  />
                  <span>{rule.label}</span>
                </label>
                {unavailable && (
                  <p className="text-sm text-current/70">
                    No compatible attribute can satisfy this comparison.
                  </p>
                )}
                {enabled && isValidationWithNumberValue(rule.value) && (
                  <InputField
                    type="number"
                    value={formatCommitted(selected)}
                    disabled={readOnly}
                    aria-label={rule.label}
                    aria-invalid={
                      selected === null || selected === undefined
                        ? true
                        : undefined
                    }
                    aria-describedby={issueId}
                    onChange={(text) =>
                      onChange(
                        withRule(
                          value,
                          rule.value,
                          parseForRule(rule.value, text ?? ''),
                        ),
                      )
                    }
                  />
                )}
                {enabled && isValidationWithListValue(rule.value) && (
                  <select
                    aria-label={rule.label}
                    aria-invalid={selectedMissing || selected === null}
                    aria-describedby={issueId}
                    value={typeof selected === 'string' ? selected : ''}
                    disabled={readOnly}
                    className="border-input bg-input text-input-contrast focusable w-full rounded border-2 px-3 py-2"
                    onChange={(event) =>
                      onChange(
                        withRule(
                          value,
                          rule.value,
                          parseForRule(rule.value, event.currentTarget.value),
                        ),
                      )
                    }
                  >
                    <option value="">Select an attribute</option>
                    {selectedMissing && (
                      <option value={selected}>
                        Deleted attribute ({selected})
                      </option>
                    )}
                    {candidates
                      .filter(
                        ({ id }) =>
                          id === selected || targetSet?.has(id) !== false,
                      )
                      .map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
      {issue !== undefined && (
        <p id={issueId} role="alert" className="text-destructive mt-2 text-sm">
          {missingTargetRule === undefined
            ? issue
            : 'The selected comparison attribute no longer exists.'}
        </p>
      )}
    </div>
  );
}

export type { VariableValidationEditorProps };
