import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  resolveVariableSynthetic,
  type EffectiveVariableRules,
  type ResolvedVariableSynthetic,
  type SyntheticOptionWeight,
  type VariableSynthetic,
} from '@codaco/protocol-validation';
import {
  OptionWeightsContext,
  type OptionWeightsController,
} from '~/components/Options/optionWeights';
import type { SyntheticWindow } from '~/components/Synthetic/summaries';

import {
  effectiveVariableRules,
  normaliseSynthetic,
  syntheticIsAdmissible,
  variableValueWindow,
  type SyntheticVariableDraft,
} from './draft';
import { NO_IMPLIED_RULES, type VariableImpliedRules } from './impliedRules';

/**
 * The scope one variable's synthetic authoring lives in.
 *
 * It exists because the disclosure and one of its controls are not in the same
 * place: the variable's "Synthetic data" section is the master switch, and
 * while it is expanded — or the variable already carries authored content —
 * the OPTIONS editor beside it grows a weight column (spec, "Option weights
 * reveal"). Holding the expansion here, above both, is what lets the section
 * disclose a control it does not render.
 *
 * Every write goes through `propose`, which normalises the block (authored =
 * key present) and offers it to the schema before committing it, so no surface
 * inside this scope can author something the schema would refuse.
 */

export type OptionWeightsHost = 'options-editor' | 'inline';

export type VariableSyntheticScope = {
  variable: SyntheticVariableDraft;
  /** The variable's own rules narrowed by whatever its interfaces imply. */
  rules: EffectiveVariableRules;
  implied: VariableImpliedRules;
  /** The window a VALUE of this variable falls in. */
  valueWindow: SyntheticWindow;
  /** What generation would do, with everything unstated resolved. */
  resolved: ResolvedVariableSynthetic | undefined;
  /** The authored block as it stands, or `undefined` while unauthored. */
  synthetic: Record<string, unknown> | undefined;
  /** Whether the variable carries a `synthetic` key at all (spec rule 4). */
  authored: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Normalise, check against the schema, and commit — or do nothing. */
  propose: (next: Record<string, unknown> | undefined) => void;
  /** Whether the schema would accept this proposal. */
  isAdmissible: (next: Record<string, unknown> | undefined) => boolean;
  /** Where this surface draws the option-weight column. */
  optionWeightsHost: OptionWeightsHost;
  /** Prefix for the field names inside this scope. */
  namePrefix: string;
};

const VariableSyntheticContext = createContext<VariableSyntheticScope | null>(
  null,
);

export const useVariableSynthetic = (): VariableSyntheticScope => {
  const scope = useContext(VariableSyntheticContext);
  if (!scope) {
    throw new Error(
      'Synthetic variable controls must be rendered inside a VariableSyntheticProvider.',
    );
  }
  return scope;
};

/** The variable types whose values are drawn from an option list. */
const OPTION_WEIGHTED_TYPES = new Set(['ordinal', 'categorical']);

/**
 * What the scope describes before there is an attribute to describe — while a
 * researcher is still choosing what kind of attribute they are creating.
 *
 * A variable with no synthetic surface at all rather than an absent scope,
 * because the alternative is a tree whose SHAPE changes the moment a type is
 * chosen: React would unmount and remount every field around it, losing focus
 * mid-edit.
 */
const NOTHING_TO_AUTHOR: SyntheticVariableDraft = { name: '', type: 'layout' };

export type VariableSyntheticProviderProps = {
  /**
   * The variable as the surrounding draft holds it, or `undefined` while there
   * is not one yet.
   */
  variable: SyntheticVariableDraft | undefined;
  /** What the protocol's interfaces impose on it. */
  implied?: VariableImpliedRules;
  /** Commits the next block, or `undefined` to remove the key entirely. */
  onChange: (next: VariableSynthetic | undefined) => void;
  /** Prefix for the field names inside this scope; unique per variable. */
  namePrefix: string;
  optionWeightsHost?: OptionWeightsHost;
  children: ReactNode;
};

export function VariableSyntheticProvider({
  variable: given,
  implied = NO_IMPLIED_RULES,
  onChange,
  namePrefix,
  optionWeightsHost = 'options-editor',
  children,
}: VariableSyntheticProviderProps) {
  const [open, setOpen] = useState(false);
  const variable = given ?? NOTHING_TO_AUTHOR;

  const rules = useMemo(
    () => effectiveVariableRules(variable, implied.rules, implied.binOnly),
    [variable, implied],
  );
  const valueWindow = useMemo(
    () => variableValueWindow(variable, rules),
    [variable, rules],
  );
  const resolved = useMemo(
    () =>
      resolveVariableSynthetic(
        { ...variable, name: variable.name ?? '' },
        rules,
      ),
    [variable, rules],
  );

  const synthetic = variable.synthetic as Record<string, unknown> | undefined;
  const authored = variable.synthetic !== undefined;

  const isAdmissible = useCallback(
    (next: Record<string, unknown> | undefined) =>
      syntheticIsAdmissible(variable, normaliseSynthetic(next), rules),
    [variable, rules],
  );

  const propose = useCallback(
    (next: Record<string, unknown> | undefined) => {
      const normalised = normaliseSynthetic(next);
      if (!syntheticIsAdmissible(variable, normalised, rules)) return;
      onChange(normalised);
    },
    [variable, rules, onChange],
  );

  const weightsController = useMemo<OptionWeightsController | null>(() => {
    if (!OPTION_WEIGHTED_TYPES.has(variable.type)) return null;
    const declared = Array.isArray(synthetic?.optionWeights)
      ? (synthetic.optionWeights as SyntheticOptionWeight[])
      : [];
    const key = (value: string | number | boolean) =>
      `${typeof value}:${String(value)}`;
    return {
      // Expanded OR authored: a variable that already carries weights keeps
      // showing them however the disclosure stands, so the column can never
      // hide content the protocol holds.
      revealed: open || authored,
      weightFor: (value) =>
        declared.find((entry) => key(entry.value) === key(value))?.weight,
      onWeightChange: (value, weight) => {
        // Option weights are keyed by the option's own value, which the schema
        // types as a string or an integer.
        if (typeof value === 'boolean') return;
        const without = declared.filter(
          (entry) => key(entry.value) !== key(value),
        );
        const nextWeights =
          weight === undefined ? without : [...without, { value, weight }];
        propose({ ...synthetic, optionWeights: nextWeights });
      },
    };
  }, [variable.type, synthetic, open, authored, propose]);

  const scope = useMemo<VariableSyntheticScope>(
    () => ({
      variable,
      rules,
      implied,
      valueWindow,
      resolved,
      synthetic,
      authored,
      open,
      setOpen,
      propose,
      isAdmissible,
      optionWeightsHost,
      namePrefix,
    }),
    [
      variable,
      rules,
      implied,
      valueWindow,
      resolved,
      synthetic,
      authored,
      open,
      propose,
      isAdmissible,
      optionWeightsHost,
      namePrefix,
    ],
  );

  return (
    <VariableSyntheticContext.Provider value={scope}>
      <OptionWeightsContext.Provider value={weightsController}>
        {children}
      </OptionWeightsContext.Provider>
    </VariableSyntheticContext.Provider>
  );
}
