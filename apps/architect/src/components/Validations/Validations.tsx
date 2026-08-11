import { isEqual, map, omit } from 'es-toolkit/compat';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Field } from 'redux-form';

import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { Variable } from '@codaco/protocol-validation';

import {
  findDraftContradictions,
  findLegalReferenceTargets,
  floorIssue,
} from './contradictions';
import {
  isValidationWithListValue,
  isValidationWithoutValue,
  type ValidationGroup,
} from './options';
import { formatCommitted, isDraftComplete, parseForRule } from './ruleValue';
import ValidationRule, { type TargetOption } from './ValidationRule';

const EMPTY_KEYS: ReadonlySet<string> = new Set();
const EMPTY_RECORD: Record<string, unknown> = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
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
 */
const holdsRule = (rules: Record<string, unknown>, ruleKey: string) =>
  Object.hasOwn(rules, ruleKey) &&
  (!isValidationWithoutValue(ruleKey) || rules[ruleKey] === true);

type ValidationsFieldProps = {
  meta: {
    submitFailed: boolean;
    error?: string;
  };
  children?: ReactNode;
};

const ValidationsField = ({
  meta: { submitFailed, error },
  children = null,
}: ValidationsFieldProps) => {
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      {children}
      <FieldErrors
        id={errorId}
        errors={error ? [error] : []}
        show={!!(submitFailed && error)}
      />
    </div>
  );
};

type CheckDraft = (
  ruleKey: string,
  ruleValue: unknown,
  base?: Record<string, unknown>,
) => string[];

type SettleOutcome = {
  next: Record<string, unknown>;
  /** The keys this pass resolved — the only rows safe to clear. */
  settled: string[];
};

type RuleListProps = {
  groups: ValidationGroup[];
  committed: Record<string, unknown>;
  update: (value: Record<string, unknown>) => void;
  checkDraft: CheckDraft;
  legalTargetsByRule: ReadonlyMap<string, Set<string>>;
  existingVariableOptions: TargetOption[];
  candidateCount: number;
  uniqueValueCount?: number;
};

const RuleList = ({
  groups,
  committed,
  update,
  checkDraft,
  legalTargetsByRule,
  existingVariableOptions,
  candidateCount,
  uniqueValueCount,
}: RuleListProps) => {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusRequest, setFocusRequest] = useState<string | null>(null);

  const isOn = (ruleKey: string) =>
    holdsRule(committed, ruleKey) || openKeys.has(ruleKey);

  const textFor = (ruleKey: string) =>
    Object.hasOwn(drafts, ruleKey)
      ? drafts[ruleKey]!
      : formatCommitted(committed[ruleKey]);

  const settle = (
    base: Record<string, unknown>,
    skip?: string,
  ): SettleOutcome => {
    const next = { ...base };
    const settled: string[] = [];
    // A row that still holds a draft is pending even when `base` already
    // carries a committed value for it: that value is only the fallback the row
    // would show if the edit were abandoned, and `applyCommit` clears the draft
    // of every key it settles — so settling the fallback would discard the edit.
    // `skip` is the row whose own commit started this pass, whose value in
    // `base` is authoritative (a stepper commits a value its draft has not
    // caught up with). Settling each key at most once keeps the pass finite.
    const pending = new Set(
      [...openKeys].filter(
        (ruleKey) =>
          ruleKey !== skip &&
          (Object.hasOwn(drafts, ruleKey) || !holdsRule(next, ruleKey)),
      ),
    );
    let settledAny = true;

    while (settledAny) {
      settledAny = false;
      for (const ruleKey of pending) {
        const parsed = parseForRule(ruleKey, textFor(ruleKey));
        if (
          !isDraftComplete(ruleKey, parsed) ||
          checkDraft(ruleKey, parsed, next).length > 0
        ) {
          continue;
        }
        next[ruleKey] = parsed;
        pending.delete(ruleKey);
        settled.push(ruleKey);
        settledAny = true;
      }
    }

    // The row whose own commit started this pass is settled by that commit
    // whenever its value survived into `next`; a REJECTED commit removes it
    // instead, and must keep its draft displayed and flagged.
    if (skip !== undefined && Object.hasOwn(next, skip)) {
      settled.push(skip);
    }

    return { next, settled };
  };

  // Only rows this pass actually resolved lose their draft and open state. A
  // draft that still contradicts once another row commits stays exactly as
  // typed — displayed, and flagged by `issuesFor` — instead of reverting to
  // the committed fallback, which would discard typed input without a trace
  // and leave the researcher nothing to correct.
  const applyCommit = ({ next, settled }: SettleOutcome) => {
    setOpenKeys((current) => {
      const remaining = new Set(current);
      settled.forEach((ruleKey) => remaining.delete(ruleKey));
      return remaining.size === current.size ? current : remaining;
    });
    setDrafts((current) =>
      settled.some((ruleKey) => Object.hasOwn(current, ruleKey))
        ? omit(current, settled)
        : current,
    );

    if (!isEqual(next, committed)) {
      update(next);
    }
  };

  const handleToggle = (ruleKey: string, nextState: boolean) => {
    if (!nextState) {
      setOpenKeys((current) => {
        const next = new Set(current);
        next.delete(ruleKey);
        return next;
      });
      setDrafts((current) => omit(current, ruleKey));
      setFocusRequest((current) => (current === ruleKey ? null : current));
      applyCommit(settle(omit(committed, ruleKey), ruleKey));
      return;
    }

    setOpenKeys((current) => new Set(current).add(ruleKey));

    if (isValidationWithoutValue(ruleKey)) {
      const parsed = parseForRule(ruleKey, '');
      if (checkDraft(ruleKey, parsed).length === 0) {
        applyCommit(settle({ ...committed, [ruleKey]: parsed }, ruleKey));
      }
      return;
    }

    setFocusRequest(ruleKey);
  };

  const handleTextChange = (ruleKey: string, text: string) => {
    setOpenKeys((current) =>
      current.has(ruleKey) ? current : new Set(current).add(ruleKey),
    );
    setDrafts((current) => ({ ...current, [ruleKey]: text }));
  };

  const handleCommit = (ruleKey: string, text: string) => {
    const parsed = parseForRule(ruleKey, text);
    const rejected =
      !isDraftComplete(ruleKey, parsed) ||
      checkDraft(ruleKey, parsed).length > 0;

    applyCommit(
      rejected
        ? settle(omit(committed, ruleKey), ruleKey)
        : settle({ ...committed, [ruleKey]: parsed }, ruleKey),
    );
  };

  const issuesFor = (ruleKey: string): string[] => {
    if (!isOn(ruleKey)) {
      return [];
    }
    const parsed = parseForRule(ruleKey, textFor(ruleKey));
    if (!isDraftComplete(ruleKey, parsed)) {
      return [];
    }
    if (isEqual(committed[ruleKey], parsed)) {
      return [];
    }
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
                shouldFocusValue={focusRequest === rule.value}
              />
            );
          })}
        </fieldset>
      ))}
    </div>
  );
};

type ValidationsProps = {
  name: string;
  entity?: string;
  /**
   * Identity of whatever owns these rules when it is not a codebook variable —
   * the Anonymisation passphrase belongs to a stage. Scopes the rule list's
   * uncommitted row state, which `currentVariableId` cannot scope there.
   */
  scopeId?: string;
  validationGroups?: ValidationGroup[];
  value?: Record<string, unknown> | null;
  update: (value: Record<string, unknown>) => void;
  existingVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  variableType?: string;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  draftOptions?: unknown;
  draftComponent?: unknown;
  draftParameters?: unknown;
  draftVariableName?: unknown;
};

const Validations = ({
  name,
  entity,
  scopeId,
  validationGroups = [],
  existingVariables = {},
  value,
  update,
  variableType,
  allVariables,
  currentVariableId,
  draftOptions,
  draftComponent,
  draftParameters,
  draftVariableName,
}: ValidationsProps) => {
  const committed = isRecord(value) ? value : EMPTY_RECORD;

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
      (
        ruleKey: string,
        ruleValue: unknown,
        base?: Record<string, unknown>,
      ): string[] => {
        // R1 floor check runs ahead of the contradiction analyser: a
        // below-floor value is input the schema would reject outright, so
        // there is no point feeding it into findDraftContradictions.
        const floor = floorIssue(ruleKey, ruleValue);
        if (floor) return [floor];
        const prospective: Record<string, unknown> = { ...(base ?? committed) };
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
      committed,
      allVariables,
      currentVariableId,
      variableType,
      draftOptions,
      draftComponent,
      draftParameters,
      draftVariableName,
    ],
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
    const isPassphrase = variableType === 'passphrase';
    const byRule = new Map<string, Set<string>>();
    for (const ruleKey of referenceRuleKeys) {
      byRule.set(
        ruleKey,
        findLegalReferenceTargets({
          allVariables: isPassphrase ? {} : (allVariables ?? {}),
          currentVariableId: currentVariableId ?? '',
          variableType: isPassphrase ? 'text' : (variableType ?? ''),
          validation: committed,
          ruleKey,
          candidateIds,
          options: draftOptions,
          component: draftComponent,
          parameters: draftParameters,
          draftVariableName,
        }),
      );
    }
    return byRule;
  }, [
    referenceRuleKeys,
    candidateIds,
    committed,
    allVariables,
    currentVariableId,
    variableType,
    draftOptions,
    draftComponent,
    draftParameters,
    draftVariableName,
  ]);

  return (
    <div className="flex w-full flex-col gap-5 [--rule-bg:oklch(var(--slate-blue))] [&_button]:m-0">
      <Field name={name} component={ValidationsField}>
        <RuleList
          key={`${scopeId ?? ''}|${currentVariableId ?? ''}|${variableType ?? ''}|${entity ?? ''}`}
          groups={validationGroups}
          committed={committed}
          update={update}
          checkDraft={checkDraft}
          legalTargetsByRule={legalTargetsByRule}
          existingVariableOptions={existingVariableOptions}
          candidateCount={candidateIds.length}
          uniqueValueCount={uniqueValueCount}
        />
      </Field>
    </div>
  );
};

export default Validations;
