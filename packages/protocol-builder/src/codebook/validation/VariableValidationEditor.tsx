import { useId, useMemo, useState, type KeyboardEvent } from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
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
  'entity': 'node' | 'edge' | 'ego';
  'variableType': string;
  'currentVariableId': string;
  'allVariables': Readonly<Record<string, unknown>>;
  'value': Readonly<ValidationMap>;
  'onChange'(value: ValidationMap): void;
  'readOnly'?: boolean;
  'className'?: string;
  /**
   * Whether the field mounting this editor has refused what it holds.
   *
   * Carried on the editor's own root because the editor IS the field's
   * rendered control: a refusal the field raises — one about the rule map as a
   * whole, which this editor's per-rule verdicts do not cover — is otherwise
   * announced by the field's error region and invisible to everything that
   * finds a refused field by looking for `aria-invalid` (the stage outline's
   * observer, `focusFirstError`).
   *
   * It says only that: what the field is refusing, and whether it is stating a
   * sentence about it, is `fieldIssue`.
   */
  'aria-invalid'?: boolean;
  /**
   * The refusal the field mounting this editor is stating for this rule map,
   * when it is stating one.
   *
   * The editor's own `role="alert"` paragraph stands down for it: the field
   * announces its refusal in an `aria-live` error region beside the control,
   * that region's message is written in the reader's language, and a second
   * sentence at the rules about the same rule map would say it twice. A caller
   * with no error region of its own — the codebook dialog — passes nothing and
   * keeps the editor's alert.
   *
   * Keyed on the refusal rather than on `aria-invalid` because they are not
   * the same fact: a host may mark this control invalid — for the outline, for
   * `focusFirstError` — without stating anything, and the editor going silent
   * there would leave a researcher with no sentence at all.
   */
  'fieldIssue'?: string;
  /**
   * The description list the mounting field injects into its control, naming
   * the field's own hint and error region.
   *
   * Passed through to the editor's root — the element the field's
   * `aria-invalid` lands on — rather than dropped, so the refused control
   * still describes the sentence a researcher can read. The editor's own
   * message is added to it while the editor is stating one.
   */
  'aria-describedby'?: string;
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
  increase: {
    id: 'protocolBuilder.variableValidation.increaseRuleValue',
    defaultMessage: 'Increase {label}',
    description:
      'Accessible name of the button raising one validation rule’s number by one. label is that rule’s own name — "Minimum length", "Maximum value" — which is translated beside it.',
  },
  decrease: {
    id: 'protocolBuilder.variableValidation.decreaseRuleValue',
    defaultMessage: 'Decrease {label}',
    description:
      'Accessible name of the button lowering one validation rule’s number by one. label is that rule’s own name — "Minimum length", "Maximum value" — which is translated beside it.',
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
  'aria-invalid': ariaInvalid,
  fieldIssue,
  'aria-describedby': fieldDescribedBy,
}: VariableValidationEditorProps) {
  const intl = useAppIntl();
  const editorId = useId();
  /**
   * What is in each number box, while it differs from what the map holds.
   *
   * A number is held as typing rather than written on every keystroke: a
   * researcher raising a maximum from 5 to 40 passes through 4, which is below
   * the minimum, and a map written at every keypress refuses the intermediate
   * and can clear the box the moment it is emptied. The box commits when the
   * researcher is finished with it — on blur, on Enter, or on a stepper, which
   * always settles a complete value.
   */
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
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
  // Not while the field mounting this editor is stating a refusal of this same
  // rule map: see the `fieldIssue` prop.
  const announceIssue = issue !== undefined && fieldIssue === undefined;
  const issueId = announceIssue ? `${editorId}-issue` : undefined;
  // Whatever the field named, plus this editor's own message while it is
  // stating one — so the element the field's `aria-invalid` lands on always
  // describes the sentence on screen rather than nothing at all.
  const describedBy =
    [fieldDescribedBy, issueId].filter(Boolean).join(' ') || undefined;

  /**
   * Every number row's typed-but-uncommitted text, applied to the map.
   *
   * A row a researcher is typing in has not necessarily blurred when another
   * row commits: a stepper settles its own row on click, and Safari does not
   * move focus to a button at all. Any commit therefore carries the whole rule
   * list with it, so an edit cannot be left behind uncommitted while the map
   * moves on without it. A row that is no longer there — switched off, or
   * rolled back by the codebook moving — is skipped: its draft must not
   * resurrect it.
   */
  const applyDrafts = (base: ValidationMap): ValidationMap => {
    const next = { ...base };
    for (const [ruleKey, text] of Object.entries(drafts)) {
      if (!Object.hasOwn(next, ruleKey)) continue;
      next[ruleKey] = parseForRule(ruleKey, text);
    }
    return next;
  };

  /** Hands the whole map on, and clears the typing it now carries. */
  const commit = (change: (base: ValidationMap) => ValidationMap) => {
    if (readOnly) return;
    const next = change(applyDrafts(value));
    setDrafts((current) => (Object.keys(current).length > 0 ? {} : current));
    onChange(next);
  };

  /** What one number box shows: the typing in it, or the committed value. */
  const textFor = (ruleKey: string): string =>
    Object.hasOwn(drafts, ruleKey)
      ? (drafts[ruleKey] ?? '')
      : formatCommitted(value[ruleKey]);

  /**
   * Writes one number row's value into the map, keeping it even when it is
   * empty or contradictory: a value discarded because it failed a check takes
   * the researcher's typing off the screen and leaves a map that is trivially
   * consistent, so nothing downstream ever objects to it.
   */
  const commitValue = (ruleKey: string, text?: string) => {
    const settled = text ?? textFor(ruleKey);
    commit((base) =>
      Object.hasOwn(base, ruleKey)
        ? withRule(base, ruleKey, parseForRule(ruleKey, settled))
        : base,
    );
  };

  const toggleRule = (ruleKey: string, enabled: boolean) => {
    if (readOnly) return;
    if (!enabled) {
      commit((base) => withoutRule(base, ruleKey));
      return;
    }
    if (isValidationWithoutValue(ruleKey)) {
      commit((base) => withRule(base, ruleKey, true));
      return;
    }
    if (isValidationWithNumberValue(ruleKey)) {
      commit((base) =>
        withRule(base, ruleKey, initialNumericValue(base, ruleKey)),
      );
      return;
    }
    commit((base) => withRule(base, ruleKey, null));
  };

  return (
    <div
      className={className}
      aria-describedby={describedBy}
      aria-invalid={ariaInvalid}
    >
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
                  <UnconnectedField
                    name={`${ruleId}-value`}
                    // The checkbox beside it already says which rule this is,
                    // so the field is named for assistive technology only.
                    label={rule.label}
                    labelHidden
                    component={InputField}
                    type="number"
                    step={1}
                    stepperLabels={{
                      increase: intl.formatMessage(messages.increase, {
                        label: rule.label,
                      }),
                      decrease: intl.formatMessage(messages.decrease, {
                        label: rule.label,
                      }),
                    }}
                    value={textFor(rule.value)}
                    disabled={readOnly}
                    aria-invalid={
                      selected === null || selected === undefined
                        ? true
                        : undefined
                    }
                    onChange={(text: string | undefined) =>
                      setDrafts((current) => ({
                        ...current,
                        [rule.value]: text ?? '',
                      }))
                    }
                    onBlur={() => commitValue(rule.value)}
                    // A step always settles a complete number, and clicking a
                    // stepper button moves focus out of the box — so the blur
                    // that follows carries the value from BEFORE the step.
                    onStep={(stepped: string) =>
                      commitValue(rule.value, stepped)
                    }
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key !== 'Enter') return;
                      // Never the enclosing form's submit: this box is a rule
                      // about an attribute, and Enter in it means "I have
                      // finished typing this number".
                      event.preventDefault();
                      commitValue(rule.value);
                    }}
                  />
                )}
                {enabled && isValidationWithListValue(rule.value) && (
                  <select
                    aria-label={rule.label}
                    aria-invalid={selectedMissing || selected === null}
                    aria-describedby={describedBy}
                    value={typeof selected === 'string' ? selected : ''}
                    disabled={readOnly}
                    className="border-input bg-input text-input-contrast focusable w-full rounded border-2 px-3 py-2"
                    onChange={(event) => {
                      const chosen = event.currentTarget.value;
                      commit((base) =>
                        withRule(
                          base,
                          rule.value,
                          parseForRule(rule.value, chosen),
                        ),
                      );
                    }}
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
      {announceIssue && (
        <p id={issueId} role="alert" className="text-destructive mt-2 text-sm">
          {issue}
        </p>
      )}
    </div>
  );
}

export type { VariableValidationEditorProps };
