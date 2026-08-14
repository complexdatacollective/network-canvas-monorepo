import { isEqual, map, omit } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { Variable } from '@codaco/protocol-validation';

import ArchitectField from '../Form/ArchitectField';
import {
  findDraftContradictions,
  findLegalReferenceTargets,
  floorIssue,
} from './contradictions';
import {
  getGroupedValidationsForVariableType,
  isValidationWithListValue,
  isValidationWithoutValue,
  type ValidationGroup,
} from './options';
import {
  completeRuleValues,
  formatCommitted,
  incompleteRuleIssue,
  isRuleValueComplete,
  parseForRule,
  type ValidationMap,
} from './ruleValue';
import { ruleMapIssue, type RuleMapContext } from './validateRuleMap';
import ValidationRule, { type TargetOption } from './ValidationRule';

// `initialValue` is a register-effect dependency (`useField`'s registration
// effect): an absent committed value must fall back to a REFERENTIALLY STABLE
// empty object, not a fresh `{}` literal recreated every render — the latter
// re-registers the field on every render of a parent that also happens to
// re-render for an unrelated reason (e.g. a sibling `errors` update), which
// silently drops any error the store had just attached to this field name.
const EMPTY_VALIDATION: ValidationMap = {};

const EMPTY_KEYS: ReadonlySet<string> = new Set();

/**
 * The passphrase substitute codebook. Stable at module scope because
 * `findDraftContradictions` caches its draft-free baseline run in a WeakMap
 * keyed by this very object — a fresh `{}` per call would miss that cache on
 * every keystroke.
 */
const NO_VARIABLES: Record<string, unknown> = {};

const isRecord = (value: unknown): value is ValidationMap =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether `rules` holds `ruleKey` as an ON rule. A value-less rule's entry IS
 * its switch state: the schema types `required`/`unique` as
 * `z.boolean().optional()`, so an explicit `false` — which an imported or
 * hand-edited protocol may carry, and which the contradiction analyser reads
 * as off (it gates on `required === true`) — is an OFF rule, not an on one
 * whose value happens to be absent. Key presence alone would render it on and
 * then parse the displayed rule as `true`, inventing a contradiction the
 * saved protocol does not have.
 *
 * A VALUE-taking rule is on as soon as its key is present, `null` included:
 * that is how a switched-on-but-unanswered row is carried (see `handleToggle`).
 */
const holdsRule = (rules: ValidationMap, ruleKey: string) =>
  Object.hasOwn(rules, ruleKey) &&
  (!isValidationWithoutValue(ruleKey) || rules[ruleKey] === true);

type CheckDraft = (ruleKey: string, ruleValue: unknown) => string[];

type RuleListProps = {
  groups: ValidationGroup[];
  committed: ValidationMap;
  update: (value: ValidationMap) => void;
  checkDraft: CheckDraft;
  legalTargetsByRule: ReadonlyMap<string, Set<string>>;
  existingVariableOptions: TargetOption[];
  candidateCount: number;
  uniqueValueCount?: number;
  /**
   * The `validation` field's current form error, or `undefined` while it has
   * none. Each new reason marks the rows that are unanswered AT THAT MOMENT
   * as ones the researcher has been told about — see `revealedIncomplete`.
   */
  fieldErrorToken?: string;
  /**
   * Whether an unanswered rule should say so straight away, without waiting
   * for a save to object. True only on a surface that has no save to object
   * WITH — `CodebookVariableValidationSection` writes to the codebook on every
   * change, so a rule it is holding back has no later moment to be explained.
   */
  revealIncompleteImmediately?: boolean;
};

type FocusRequest = { ruleKey: string; token: number };

const RuleList = ({
  groups,
  committed,
  update,
  checkDraft,
  legalTargetsByRule,
  existingVariableOptions,
  candidateCount,
  uniqueValueCount,
  fieldErrorToken,
  revealIncompleteImmediately = false,
}: RuleListProps) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusToken = useRef(0);

  /**
   * Rules the researcher has already been TOLD are unanswered.
   *
   * Naming a rule as unanswered the instant it is switched on would scold
   * them for not yet having typed the value the toggle just moved focus to —
   * so a row only says so once a save has objected while that row was
   * unanswered. Membership is per rule, not a single form-wide flag: a rule
   * switched on AFTER a refusal has not been objected to yet, and must not
   * inherit the standing complaint about a different one.
   */
  const [revealedIncomplete, setRevealedIncomplete] =
    useState<ReadonlySet<string>>(EMPTY_KEYS);
  const committedRef = useRef(committed);
  committedRef.current = committed;

  useEffect(() => {
    if (fieldErrorToken === undefined) {
      setRevealedIncomplete((current) =>
        current.size === 0 ? current : EMPTY_KEYS,
      );
      return;
    }
    setRevealedIncomplete((current) => {
      const next = new Set(current);
      for (const [ruleKey, value] of Object.entries(committedRef.current)) {
        if (!isRuleValueComplete(ruleKey, value)) next.add(ruleKey);
      }
      return next.size === current.size ? current : next;
    });
  }, [fieldErrorToken]);

  const isOn = (ruleKey: string) => holdsRule(committed, ruleKey);

  const textFor = (ruleKey: string) =>
    Object.hasOwn(drafts, ruleKey)
      ? drafts[ruleKey]!
      : formatCommitted(committed[ruleKey]);

  const requestFocus = (ruleKey: string) => {
    focusToken.current += 1;
    setFocusRequest({ ruleKey, token: focusToken.current });
  };

  /**
   * Every row's typed-but-uncommitted text, applied to the map.
   *
   * A number row commits on blur, and the row a researcher is typing in has
   * not necessarily blurred when another row commits: a stepper settles its
   * own row on click, and Safari does not move focus to a button at all. Any
   * commit therefore carries the whole rule list with it, so an edit cannot be
   * left behind uncommitted while the map moves on without it. Rows that are
   * no longer present (switched off, or rolled back by an undo) are skipped —
   * their draft must not resurrect them.
   */
  const applyDrafts = (base: ValidationMap): ValidationMap => {
    const next = { ...base };
    for (const [ruleKey, text] of Object.entries(drafts)) {
      if (!Object.hasOwn(next, ruleKey)) continue;
      next[ruleKey] = parseForRule(ruleKey, text);
    }
    return next;
  };

  /**
   * Commits exactly what the researcher configured, contradictory or not. The
   * rule editor used to delete the rule instead whenever its value failed a
   * check, which destroyed the rule's previous value AND left a map that was
   * trivially consistent — so every later gate waved the save through. Holding
   * the value keeps it on screen for correction and gives the `validation`
   * field something to be invalid about.
   */
  const commit = (change: (base: ValidationMap) => ValidationMap) => {
    const next = change(applyDrafts(committed));
    setDrafts((current) => (Object.keys(current).length > 0 ? {} : current));
    if (!isEqual(next, committed)) {
      update(next);
    }
  };

  /**
   * Switching a rule on writes it into the committed map immediately —
   * `true` for a value-less rule, `null` for one still waiting on a value.
   * Carrying the ON state in the value rather than in local component state
   * is what lets the field validate itself: a half-configured rule is now
   * visible to `ruleMapIssue`, so the editor refuses to save instead of
   * quietly dropping the rule.
   */
  const handleToggle = (ruleKey: string, nextState: boolean) => {
    if (!nextState) {
      setFocusRequest((current) =>
        current?.ruleKey === ruleKey ? null : current,
      );
      // Switching a rule off answers the complaint about it, so switching it
      // back on later starts from silence again.
      setRevealedIncomplete((current) => {
        if (!current.has(ruleKey)) return current;
        const next = new Set(current);
        next.delete(ruleKey);
        return next;
      });
      commit((base) => omit(base, ruleKey));
      return;
    }

    if (isValidationWithoutValue(ruleKey)) {
      commit((base) => ({ ...base, [ruleKey]: parseForRule(ruleKey, '') }));
      return;
    }

    commit((base) => ({ ...base, [ruleKey]: null }));
    requestFocus(ruleKey);
  };

  const handleTextChange = (ruleKey: string, text: string) => {
    setDrafts((current) => ({ ...current, [ruleKey]: text }));
  };

  const handleCommit = (ruleKey: string, text: string) => {
    commit((base) => ({ ...base, [ruleKey]: parseForRule(ruleKey, text) }));
  };

  const issuesFor = (ruleKey: string): string[] => {
    if (!isOn(ruleKey)) {
      return [];
    }
    const parsed = parseForRule(ruleKey, textFor(ruleKey));
    if (!isRuleValueComplete(ruleKey, parsed)) {
      if (!revealIncompleteImmediately && !revealedIncomplete.has(ruleKey)) {
        return [];
      }
      const incomplete = incompleteRuleIssue({ [ruleKey]: parsed });
      return incomplete ? [incomplete] : [];
    }
    const floor = floorIssue(ruleKey, parsed);
    if (floor) return [floor];
    return checkDraft(ruleKey, parsed);
  };

  const hintFor = (ruleKey: string, isUnavailable: boolean) => {
    if (isUnavailable) {
      return candidateCount === 0
        ? 'No other variable of this type exists to compare against.'
        : 'Every comparable variable would make this rule impossible to satisfy.';
    }
    if (ruleKey === 'unique' && uniqueValueCount !== undefined) {
      return `This variable has only ${uniqueValueCount} possible values. Interview preview will refuse to generate synthetic data if more than ${uniqueValueCount} entities can hold a value while ‘Must be unique’ is enabled.`;
    }
    return undefined;
  };

  const targetOptionsFor = (ruleKey: string) => {
    const legal = legalTargetsByRule.get(ruleKey);
    if (!legal) {
      return existingVariableOptions;
    }
    const selected = textFor(ruleKey);
    return existingVariableOptions.filter(
      (option) => option.value === selected || legal.has(option.value),
    );
  };

  return (
    <div className="flex w-full flex-col gap-8">
      {groups.map((group) => (
        <fieldset key={group.id} className="flex min-w-0 flex-col gap-1">
          <legend className="mb-2">
            <Heading level="h4">{group.heading}</Heading>
          </legend>
          {group.rules.map((rule) => {
            const on = isOn(rule.value);
            const isUnavailable =
              !on &&
              isValidationWithListValue(rule.value) &&
              (legalTargetsByRule.get(rule.value)?.size ?? 0) === 0;

            return (
              <ValidationRule
                key={rule.value}
                ruleKey={rule.value}
                label={rule.label}
                isOn={on}
                isUnavailable={isUnavailable}
                hint={hintFor(rule.value, isUnavailable)}
                text={textFor(rule.value)}
                issues={issuesFor(rule.value)}
                targetOptions={targetOptionsFor(rule.value)}
                onToggle={handleToggle}
                onTextChange={handleTextChange}
                onCommit={handleCommit}
                focusValueToken={
                  focusRequest?.ruleKey === rule.value
                    ? focusRequest.token
                    : undefined
                }
              />
            );
          })}
        </fieldset>
      ))}
    </div>
  );
};

type ValidationsFieldProps = {
  /** The field's resolved name, supplied by `Field` — see `getFieldErrors`. */
  name?: string;
  value?: ValidationMap;
  onChange?: (value: ValidationMap) => void;
  entity?: string;
  scopeId?: string;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
  variableType?: string;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  draftOptions?: unknown;
  draftComponent?: unknown;
  draftParameters?: unknown;
  draftVariableName?: unknown;
  revealIncompleteImmediately?: boolean;
};

type RuleMapContextInput = {
  variableType?: string;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  draftOptions?: unknown;
  draftComponent?: unknown;
  draftParameters?: unknown;
  draftVariableName?: unknown;
};

/**
 * The one place the analyser's inputs are assembled, shared by the row-level
 * check, the reference-target picker and the field-level validator so the
 * three can never judge different drafts. The Anonymisation passphrase is not
 * a codebook variable, so it is analysed as a lone text surrogate — which is
 * what keeps the local length-pair check working there.
 */
const ruleMapContextFor = ({
  variableType,
  allVariables,
  currentVariableId,
  draftOptions,
  draftComponent,
  draftParameters,
  draftVariableName,
}: RuleMapContextInput): RuleMapContext => {
  const isPassphrase = variableType === 'passphrase';
  return {
    allVariables: isPassphrase ? NO_VARIABLES : (allVariables ?? NO_VARIABLES),
    currentVariableId: currentVariableId ?? '',
    variableType: isPassphrase ? 'text' : (variableType ?? ''),
    options: draftOptions,
    component: draftComponent,
    parameters: draftParameters,
    draftVariableName,
  };
};

/**
 * The `withStoreState`/`withAddNew`/`withUpdateHandlers` HOC stack collapsed
 * into the field component itself: `value`/`onChange` (from `ArchitectField`)
 * replace the old `formValueSelector`/`change` reads and writes, and the rule
 * list's uncommitted row state — previously spread across `withState`
 * injections — is local state inside `RuleList`.
 */
const ValidationsField = ({
  name = 'validation',
  value,
  onChange,
  entity,
  scopeId,
  existingVariables,
  variableType,
  allVariables,
  currentVariableId,
  draftOptions,
  draftComponent,
  draftParameters,
  draftVariableName,
  revealIncompleteImmediately,
}: ValidationsFieldProps) => {
  const committed = isRecord(value) ? value : EMPTY_VALIDATION;

  const validationGroups = useMemo(
    () =>
      getGroupedValidationsForVariableType(variableType ?? '', entity ?? ''),
    [variableType, entity],
  );

  const context = useMemo(
    () =>
      ruleMapContextFor({
        variableType,
        allVariables,
        currentVariableId,
        draftOptions,
        draftComponent,
        draftParameters,
        draftVariableName,
      }),
    [
      variableType,
      allVariables,
      currentVariableId,
      draftOptions,
      draftComponent,
      draftParameters,
      draftVariableName,
    ],
  );

  // The reason the save was refused, as the form store holds it. Read here
  // rather than passed in: this field is nested in whichever form surrounds
  // it (a row-editor dialog, the stage form, or the codebook section's own
  // isolated form) and the error always lands on this field's own name.
  const fieldErrors = useFormStore((store) => store.getFieldErrors(name));
  const fieldErrorToken =
    fieldErrors && fieldErrors.length > 0 ? fieldErrors.join('|') : undefined;

  // A standing objection has to keep up with the map it is about. Editing a
  // rule row does not blur OUT of this field — every rule row is inside it —
  // so nothing else revalidates, and the message would go on naming a value
  // that is no longer on screen. Only ever while an error already stands: the
  // first one is the save's to raise, not this field's to volunteer.
  const validateField = useFormStore((store) => store.validateField);
  const revalidatedFor = useRef<ValidationMap | undefined>(undefined);
  useEffect(() => {
    if (fieldErrorToken === undefined) {
      revalidatedFor.current = undefined;
      return;
    }
    if (revalidatedFor.current === committed) return;
    revalidatedFor.current = committed;
    void validateField(name);
  }, [committed, fieldErrorToken, name, validateField]);

  const uniqueValueCount = useMemo(() => {
    if (variableType !== 'boolean' && variableType !== 'ordinal') {
      return undefined;
    }
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
    (): CheckDraft =>
      (ruleKey: string, ruleValue: unknown): string[] => {
        // Unanswered rules are stripped before the analyser sees the map: a
        // `null` is "switched on, not typed into yet", and the analyser would
        // read it as a bound.
        const prospective = completeRuleValues({
          ...committed,
          [ruleKey]: ruleValue,
        });
        return findDraftContradictions({
          ...context,
          validation: prospective,
        }).map((contradiction) => contradiction.message);
      },
    [committed, context],
  );

  const candidateIds = useMemo(
    () => Object.keys(existingVariables),
    [existingVariables],
  );

  const existingVariableOptions = useMemo(
    () =>
      map(existingVariables, (variableValue, variableKey) => ({
        label: variableValue.name,
        value: variableKey,
      })),
    [existingVariables],
  );

  const referenceRuleKeys = useMemo(
    () =>
      validationGroups
        .flatMap((group) => group.rules.map((rule) => rule.value))
        .filter(isValidationWithListValue),
    [validationGroups],
  );

  // Twenty-seventh-wave Finding 1: one shared, UnionFind-batched analysis pass
  // per reference RULE — never one per candidate, which made rendering this
  // section quadratic in codebook size. The same Set answers both questions
  // the list asks: "may this rule be switched on at all" (is it non-empty)
  // and "which targets may it offer" (the set itself).
  const legalTargetsByRule = useMemo(() => {
    // As in `checkDraft`: the picker's baseline is the map as it would be
    // saved, so an unanswered row contributes nothing to it.
    const validation = completeRuleValues(committed);
    const byRule = new Map<string, Set<string>>();
    for (const ruleKey of referenceRuleKeys) {
      byRule.set(
        ruleKey,
        findLegalReferenceTargets({
          ...context,
          validation,
          ruleKey,
          candidateIds,
        }),
      );
    }
    return byRule;
  }, [referenceRuleKeys, candidateIds, committed, context]);

  return (
    <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
      <RuleList
        key={`${scopeId ?? ''}|${currentVariableId ?? ''}|${variableType ?? ''}|${entity ?? ''}`}
        groups={validationGroups}
        committed={committed}
        update={(next) => onChange?.(next)}
        checkDraft={checkDraft}
        legalTargetsByRule={legalTargetsByRule}
        existingVariableOptions={existingVariableOptions}
        candidateCount={candidateIds.length}
        uniqueValueCount={uniqueValueCount}
        fieldErrorToken={fieldErrorToken}
        revealIncompleteImmediately={revealIncompleteImmediately}
      />
    </div>
  );
};

type ValidationsProps = {
  name: string;
  /** The committed validation record, for the field's `initialValue`. */
  initialValue?: ValidationMap;
  existingVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  variableType?: string;
  entity?: string;
  /**
   * Identity of whatever owns these rules when it is not a codebook variable —
   * the Anonymisation passphrase belongs to a stage. Scopes the rule list's
   * uncommitted row state, which `currentVariableId` cannot scope there.
   */
  scopeId?: string;
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
  /**
   * Set by a host that writes every change straight through rather than
   * collecting them for a save — `CodebookVariableValidationSection`. There
   * being no save to refuse, the field validates on every change instead, and
   * an unanswered rule says so at once: it is being held back from the
   * codebook, and there is no later moment to explain that.
   */
  commitsImmediately?: boolean;
};

/**
 * A validation-rule editor bound to one stage or codebook-variable form
 * field. Renders the whole `Record<ruleName, value>` as ONE opaque field
 * value (the same governing rule every array/record field follows in this
 * migration) — individual rows are rendered from that value locally, never
 * registered as their own form fields.
 *
 * The field validates its OWN value (`ruleMapIssue`): an unanswered rule, a
 * value the schema would reject, or a contradiction against the rest of the
 * codebook makes the field invalid, so every host — a row-editor dialog, the
 * stage form, the codebook section's isolated form — refuses the save through
 * the ordinary `validateForm` path, with `aria-invalid`, `aria-describedby`,
 * `FieldErrors` and `focusFirstError` all behaving as they do for any other
 * field.
 */
const Validations = ({
  name,
  initialValue,
  existingVariables = {},
  variableType,
  entity,
  scopeId,
  allVariables,
  currentVariableId,
  draftOptions,
  draftComponent,
  draftParameters,
  draftVariableName,
  commitsImmediately = false,
}: ValidationsProps): ReactNode => {
  const context = ruleMapContextFor({
    variableType,
    allVariables,
    currentVariableId,
    draftOptions,
    draftComponent,
    draftParameters,
    draftVariableName,
  });
  // Rebuilt every render, which is free: `useValidationProps` keeps ONE
  // `custom` entry for the field's lifetime and reads the current config
  // through a ref, so a fresh closure never re-registers the field.
  const validation = {
    ruleMap: (ruleMap: unknown) => ruleMapIssue(ruleMap, context),
  };

  return (
    <ArchitectField
      name={name}
      component={ValidationsField}
      label="Validation rules"
      labelHidden
      initialValue={initialValue ?? EMPTY_VALIDATION}
      validation={validation}
      validateOnChange={commitsImmediately}
      revealIncompleteImmediately={commitsImmediately}
      existingVariables={existingVariables}
      variableType={variableType}
      entity={entity}
      scopeId={scopeId}
      allVariables={allVariables}
      currentVariableId={currentVariableId}
      draftOptions={draftOptions}
      draftComponent={draftComponent}
      draftParameters={draftParameters}
      draftVariableName={draftVariableName}
    />
  );
};

export default Validations;
