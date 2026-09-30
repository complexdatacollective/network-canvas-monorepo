import { useId, useMemo, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  controlVariants,
  groupSpacingVariants,
  inputControlVariants,
} from '@codaco/fresco-ui/styles/controlVariants';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { compose, cx } from '@codaco/fresco-ui/utils/cva';

import { missingComparisonTargetMessage } from '../codebookMessages.ts';
import {
  completeRuleValues,
  findOfferableReferenceTargets,
  floorIssue,
  formatCommitted,
  getGroupedValidationsForVariableType,
  incompleteRuleIssue,
  isRuleValueComplete,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
  parseForRule,
  ruleMapIssueForWrite,
  type StageRendering,
  type ValidationMap,
  type ValidationValue,
} from '../variableValidation.ts';
import ValidationRule, { type TargetOption } from './ValidationRule.tsx';

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
   * It is also what a save's objection reads as: a rule switched on and left
   * unanswered says so on its own row from the moment the host refuses the
   * map, rather than waiting for the researcher to visit the box first — see
   * `revealedIncomplete`.
   */
  'aria-invalid'?: boolean;
  /**
   * The description list the mounting field injects into its control, naming
   * the field's own hint and error region.
   *
   * Passed through to the editor's root — the element the field's
   * `aria-invalid` lands on — rather than dropped, so the refused control
   * still describes the sentence a researcher can read.
   */
  'aria-describedby'?: string;
  /**
   * How the STAGE renders the attributes this rule map compares, where the
   * codebook does not decide it — see `StageRendering`.
   *
   * Judged against the codebook's renderings instead, a contradiction this one
   * surface is able to author went unreported, and a comparison the form's own
   * renderings make satisfiable was blocked. Omitted wherever the codebook's
   * own control is what the interview renders, which is most callers.
   */
  'stageRendering'?: StageRendering;
}>;

const messages = defineMessages({
  noOtherAttributeOfThisType: {
    id: 'protocolBuilder.variableValidation.noOtherAttributeOfThisType',
    defaultMessage:
      'No other attribute of this type exists to compare against.',
    description:
      'Shown beneath a comparison rule the researcher cannot switch on, because the type holds no other attribute of the same kind. "Attribute" is a codebook variable.',
  },
  everyComparableAttributeWouldMakeThis: {
    id: 'protocolBuilder.variableValidation.everyComparableAttributeWouldMakeThis',
    defaultMessage:
      'Every comparable attribute would make this rule impossible to satisfy.',
    description:
      'Shown beneath a comparison rule the researcher cannot switch on, because every attribute it could be judged against would contradict the rules already set.',
  },
  thisAttributeHasOnlyPossibleValues: {
    id: 'protocolBuilder.variableValidation.uniqueValueCount',
    defaultMessage:
      '{uniqueValueCount, plural, one {This attribute has only # possible value. Interview preview will refuse to generate synthetic data if more than # entity can hold a value while ‘Must be unique’ is enabled.} other {This attribute has only # possible values. Interview preview will refuse to generate synthetic data if more than # entities can hold a value while ‘Must be unique’ is enabled.}}',
    description:
      'Shown beneath the "must be unique" rule when the attribute offers few enough answers that not every participant could hold a different one. uniqueValueCount is how many distinct answers it offers.',
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

const EMPTY_KEYS: ReadonlySet<string> = new Set();

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
 * How many distinct answers the attribute offers, for the `unique` warning.
 *
 * Only for the two kinds whose domain is finite and small enough to run out:
 * an absent list on a boolean is the unrestricted yes/no pair, while an
 * ordinal with no options configured yet has no domain to report at all.
 * Distinct VALUES rather than entries, because two options may carry the same
 * stored value and the runtime keeps one answer per value.
 */
const uniqueValueCountFor = (
  variableType: string,
  variable: unknown,
): number | undefined => {
  if (variableType !== 'boolean' && variableType !== 'ordinal') {
    return undefined;
  }
  const options =
    typeof variable === 'object' && variable !== null
      ? Reflect.get(variable, 'options')
      : undefined;
  if (!Array.isArray(options)) {
    return variableType === 'boolean' ? 2 : undefined;
  }
  return new Set(
    options
      .map((option) =>
        typeof option === 'object' && option !== null
          ? Reflect.get(option, 'value')
          : undefined,
      )
      .filter((optionValue) => optionValue !== undefined),
  ).size;
};

/**
 * Host-neutral editor for one variable's validation map.
 *
 * The map is controlled as one value. A value-taking rule remains present as
 * `null` while incomplete, so a save gate can reject it and the researcher can
 * correct it instead of the rule being silently discarded.
 *
 * Architect's own rule editor (`components/Validations/Validations.tsx`) as it
 * stood: fieldset groups with a floating legend, one `ValidationRule` row per
 * rule, and each row saying what is wrong with itself rather than one verdict
 * over the whole editor.
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
  'aria-describedby': fieldDescribedBy,
  stageRendering,
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
  /**
   * Rules the researcher has already been TOLD are unanswered.
   *
   * Naming a rule as unanswered the instant it is switched on would scold them
   * before they have interacted with its value control. A row only says so
   * once that control has been left empty, or the host has refused the map
   * while the row was unanswered. Membership is per rule, not a single
   * editor-wide flag: a rule switched on AFTER a refusal has not been objected
   * to yet, and must not inherit the standing complaint about a different one.
   */
  const [revealedIncomplete, setRevealedIncomplete] =
    useState<ReadonlySet<string>>(EMPTY_KEYS);
  /**
   * The map these boxes are typing over.
   *
   * Every commit this editor makes clears the drafts before it hands the map
   * on, so a `value` that changes while a draft is still held is a value
   * somebody ELSE replaced — a collaborator's change to the same attribute, a
   * restore. The typing was about a number that is no longer there: left in
   * place it shows text the map does not hold, and the next commit writes it
   * over the replacement.
   *
   * Cleared during render rather than in an effect: a frame of the old text
   * over the new value is a frame of something untrue.
   */
  const seenValue = useRef(value);
  if (seenValue.current !== value) {
    seenValue.current = value;
    setDrafts((current) => (Object.keys(current).length > 0 ? {} : current));
  }
  /**
   * The host's refusal, as the one fact this editor can read about it.
   *
   * A host objects by marking the control invalid and withdraws the objection
   * by unmarking it, so it is the mark CHANGING that reveals whichever rules
   * are unanswered at that moment — compared during render, because a prop
   * change is not an external system to synchronise with and revealing from an
   * effect showed the row's silent state for a frame first. The seed is `null`
   * rather than the first value so that an editor mounted under a standing
   * objection still reveals.
   */
  const [seenInvalid, setSeenInvalid] = useState<{
    value: boolean | undefined;
  } | null>(null);
  if (seenInvalid === null || seenInvalid.value !== ariaInvalid) {
    setSeenInvalid({ value: ariaInvalid });
    if (ariaInvalid === true) {
      setRevealedIncomplete((current) => {
        const next = new Set(current);
        for (const [ruleKey, ruleValue] of Object.entries(value)) {
          if (!isRuleValueComplete(ruleKey, ruleValue)) next.add(ruleKey);
        }
        return next.size === current.size ? current : next;
      });
    } else {
      setRevealedIncomplete((current) =>
        current.size === 0 ? current : EMPTY_KEYS,
      );
    }
  }

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
  // Offered against the same readings the verdict below is given against: a
  // target the field's own rendering cannot satisfy is not a choice, and
  // neither is one the codebook record this rule is saved on cannot hold —
  // offering either made the researcher pick it to be told so.
  const legalTargets = useMemo(() => {
    const completeValidation = completeRuleValues(value);
    return new Map<string, ReadonlySet<string>>(
      groups
        .flatMap(({ rules }) => rules)
        .filter(({ value: ruleKey }) => isValidationWithListValue(ruleKey))
        .map(({ value: ruleKey }) => [
          ruleKey,
          findOfferableReferenceTargets(
            {
              allVariables: { ...allVariables },
              currentVariableId,
              variableType,
              validation: completeValidation,
              ruleKey,
              candidateIds,
            },
            stageRendering,
          ),
        ]),
    );
  }, [
    allVariables,
    candidateIds,
    currentVariableId,
    groups,
    stageRendering,
    value,
    variableType,
  ]);

  const uniqueValueCount = uniqueValueCountFor(
    variableType,
    allVariables[currentVariableId],
  );

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
   * Writes one row's value into the map, keeping it even when it is empty or
   * contradictory: a value discarded because it failed a check takes the
   * researcher's typing off the screen and leaves a map that is trivially
   * consistent, so nothing downstream ever objects to it.
   */
  const commitValue = (ruleKey: string, text: string) => {
    commit((base) =>
      Object.hasOwn(base, ruleKey)
        ? withRule(base, ruleKey, parseForRule(ruleKey, text))
        : base,
    );
  };

  const handleValueExit = (ruleKey: string, text: string) => {
    commitValue(ruleKey, text);
    if (isRuleValueComplete(ruleKey, parseForRule(ruleKey, text))) return;
    setRevealedIncomplete((current) =>
      current.has(ruleKey) ? current : new Set(current).add(ruleKey),
    );
  };

  const toggleRule = (ruleKey: string, enabled: boolean) => {
    if (readOnly) return;
    if (!enabled) {
      // Switching a rule off answers the complaint about it, so switching it
      // back on later starts from silence again.
      setRevealedIncomplete((current) => {
        if (!current.has(ruleKey)) return current;
        const next = new Set(current);
        next.delete(ruleKey);
        return next;
      });
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

  /**
   * What is wrong with one rule, in the order a researcher can act on it.
   *
   * An unanswered row first, and only once they have been told about it; then
   * a value the rule itself cannot take; then the comparison target that is no
   * longer there; and last the contradiction the whole map would carry with
   * this row's value in it — which is judged over the map's COMPLETE rules, so
   * a half-set row elsewhere does not make every row state its complaint.
   */
  const issuesFor = (ruleKey: string): readonly string[] => {
    if (!holdsRule(value, ruleKey)) return [];
    const parsed = parseForRule(ruleKey, textFor(ruleKey));
    if (!isRuleValueComplete(ruleKey, parsed)) {
      if (!revealedIncomplete.has(ruleKey)) return [];
      const incomplete = incompleteRuleIssue({ [ruleKey]: parsed });
      return incomplete === undefined ? [] : [incomplete];
    }
    const floor = floorIssue(ruleKey, parsed);
    if (floor !== undefined) return [floor];
    if (
      isValidationWithListValue(ruleKey) &&
      typeof parsed === 'string' &&
      !Object.hasOwn(allVariables, parsed)
    ) {
      return [intl.formatMessage(missingComparisonTargetMessage)];
    }
    const contradiction = ruleMapIssueForWrite(
      completeRuleValues({ ...value, [ruleKey]: parsed }),
      {
        allVariables: { ...allVariables },
        currentVariableId,
        variableType,
      },
      stageRendering,
    );
    return contradiction === undefined ? [] : [contradiction];
  };

  const hintFor = (
    ruleKey: string,
    isUnavailable: boolean,
  ): string | undefined => {
    if (isUnavailable) {
      return candidateIds.length === 0
        ? intl.formatMessage(messages.noOtherAttributeOfThisType)
        : intl.formatMessage(messages.everyComparableAttributeWouldMakeThis);
    }
    if (ruleKey === 'unique' && uniqueValueCount !== undefined) {
      return intl.formatMessage(messages.thisAttributeHasOnlyPossibleValues, {
        uniqueValueCount,
      });
    }
    return undefined;
  };

  const targetOptionsFor = (ruleKey: string): TargetOption[] => {
    const legal = legalTargets.get(ruleKey);
    const selected = textFor(ruleKey);
    const offered = candidates
      .filter(({ id }) => id === selected || legal?.has(id) !== false)
      .map(({ id, name }) => ({ value: id, label: name }));
    // The target a rule still points at after it was deleted from the
    // codebook: shown so the researcher can see what the rule refers to rather
    // than a control that has silently fallen back to its placeholder.
    return selected !== '' && !Object.hasOwn(allVariables, selected)
      ? [
          ...offered,
          {
            value: selected,
            label: intl.formatMessage(messages.deletedTarget, { id: selected }),
          },
        ]
      : offered;
  };

  const variants = compose(
    controlVariants,
    inputControlVariants,
    groupSpacingVariants,
  );

  return (
    <div
      className={cx(
        'flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0',
        className,
      )}
      aria-describedby={fieldDescribedBy}
      aria-invalid={ariaInvalid}
    >
      {groups.map((group) => (
        <fieldset
          key={group.id}
          disabled={readOnly}
          className={cx(
            variants(),
            'relative my-4 flex w-full min-w-0 flex-col overflow-visible whitespace-normal',
            // When last item, remove bottom margin to avoid double spacing
            // with whatever follows the editor.
            'last:mb-0',
          )}
        >
          <legend
            className={cx(
              'bg-input absolute -top-4 left-6 z-10 rounded px-4 py-1',
              "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:rounded-t before:border-x-2 before:border-t-2 before:content-['']",
            )}
          >
            <Heading level="label">{group.heading}</Heading>
          </legend>
          <div className="flex w-full flex-col gap-4 pt-4">
            {group.rules.map((rule) => {
              const isOn = holdsRule(value, rule.value);
              const isUnavailable =
                !isOn &&
                isValidationWithListValue(rule.value) &&
                (legalTargets.get(rule.value)?.size ?? 0) === 0;

              return (
                <ValidationRule
                  key={`${editorId}-${rule.value}`}
                  ruleKey={rule.value}
                  label={rule.label}
                  isOn={isOn}
                  isUnavailable={isUnavailable}
                  {...(() => {
                    const hint = hintFor(rule.value, isUnavailable);
                    return hint === undefined ? {} : { hint };
                  })()}
                  text={textFor(rule.value)}
                  issues={issuesFor(rule.value)}
                  targetOptions={targetOptionsFor(rule.value)}
                  onToggle={toggleRule}
                  onTextChange={(ruleKey, text) =>
                    setDrafts((current) => ({ ...current, [ruleKey]: text }))
                  }
                  onCommit={commitValue}
                  onValueExit={handleValueExit}
                />
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export type { VariableValidationEditorProps };
