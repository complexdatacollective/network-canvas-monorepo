import { useId, useMemo } from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { missingComparisonTargetMessage } from '../codebookMessages.ts';
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

const messages = defineMessages({
  noCompatibleTarget: {
    id: 'protocolBuilder.variableValidation.noCompatibleTarget',
    defaultMessage: 'No compatible attribute can satisfy this comparison.',
    description:
      'Shown beneath a comparison rule the researcher cannot switch on, because no other attribute of the same kind could satisfy it without contradicting the rules already set. "Attribute" is a codebook variable.',
  },
  selectTarget: {
    id: 'protocolBuilder.variableValidation.selectTarget',
    defaultMessage: 'Select an attribute',
    description:
      'The unchosen entry of the control naming which other attribute a comparison rule judges this one against.',
  },
  deletedTarget: {
    id: 'protocolBuilder.variableValidation.deletedTarget',
    defaultMessage: 'Deleted attribute ({id})',
    description:
      'Entry standing in for the attribute a comparison rule points at after it has been deleted from the codebook, so the researcher can see what the rule still refers to. id is that attribute’s stored record id.',
  },
});

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

const readIssue = (
  issue: string | undefined,
  intl: IntlShape,
): string | undefined =>
  issue === undefined ? undefined : (formatMessageError(issue, intl) ?? issue);

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
  const intl = useAppIntl();
  const editorId = useId();
  const groups = useMemo(
    () => getGroupedValidationsForVariableType(variableType, entity, intl),
    [entity, intl, variableType],
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
  // A rule map's verdict is a plain string carrying either this package's own
  // encoded descriptor or a wording the contradiction analyser wrote, and the
  // paragraph below is our own markup rather than a field's error region, so
  // it is decoded here and passed through untouched when it is not one of ours.
  const issue =
    missingTargetRule === undefined
      ? readIssue(
          ruleMapIssue(value, {
            allVariables: { ...allVariables },
            currentVariableId,
            variableType,
          }),
          intl,
        )
      : intl.formatMessage(missingComparisonTargetMessage);
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
                    {intl.formatMessage(messages.noCompatibleTarget)}
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
                    <option value="">
                      {intl.formatMessage(messages.selectTarget)}
                    </option>
                    {selectedMissing && (
                      <option value={selected}>
                        {intl.formatMessage(messages.deletedTarget, {
                          id: selected,
                        })}
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
          {issue}
        </p>
      )}
    </div>
  );
}

export type { VariableValidationEditorProps };
