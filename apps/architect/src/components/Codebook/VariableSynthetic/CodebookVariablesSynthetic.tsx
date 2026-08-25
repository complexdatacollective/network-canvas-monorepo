import { useMemo } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type { VariableSynthetic } from '@codaco/protocol-validation';

import { asSyntheticVariableDraft } from './draft';
import { collectImpliedRules, impliedRulesIn } from './impliedRules';
import { VariableSyntheticProvider } from './VariableSyntheticProvider';
import { VariableSyntheticSection } from './VariableSyntheticSection';

/**
 * Every attribute of one entity type, each with its own "Synthetic data"
 * disclosure (spec, "Codebook TypeEditor section: per variable").
 *
 * ONE field value rather than one field per attribute: the type editor saves
 * by replacing the whole definition, and `getFormValues()` reports registered
 * fields only — so the record this control holds is the record the save
 * writes, with nothing but `synthetic` keys changed by it. A per-attribute
 * registration would let a deleted attribute's dormant value reappear in the
 * saved type, the same defect the options editor avoids the same way.
 *
 * The option-weight column has no options editor to live in here, so each
 * attribute's weights are drawn inside its own section instead — see
 * `InlineOptionWeights`.
 */

export type CodebookVariablesSyntheticProps = CreateFormFieldProps<
  Record<string, unknown>,
  'div',
  {
    entity: 'node' | 'edge' | 'ego';
    /** Undefined while the type is being created, and so has no stages yet. */
    type?: string | undefined;
    /** The protocol the implied rules are collected from. */
    protocol?: unknown;
  }
>;

const withSynthetic = (
  variable: Record<string, unknown>,
  synthetic: VariableSynthetic | undefined,
): Record<string, unknown> => {
  if (synthetic === undefined) {
    const { synthetic: _removed, ...withoutKey } = variable;
    return withoutKey;
  }
  return { ...variable, synthetic };
};

export function CodebookVariablesSynthetic({
  value,
  onChange,
  entity,
  type,
  protocol,
}: CodebookVariablesSyntheticProps) {
  const variables = useMemo(() => value ?? {}, [value]);

  const entries = useMemo(
    () =>
      Object.entries(variables)
        .flatMap(([id, raw]) => {
          const draft = asSyntheticVariableDraft(raw);
          return draft === undefined ? [] : [{ id, draft }];
        })
        // Alphabetical, because this list is a lookup: the researcher already
        // knows which attribute they came to change.
        .sort((a, b) => a.draft.name.localeCompare(b.draft.name)),
    [variables],
  );

  const subject = useMemo(
    () => ({ entity, ...(type === undefined ? {} : { type }) }),
    [entity, type],
  );

  // One walk of the protocol for the whole list. Asked per row, the collector
  // re-walked every stage and every reference in the document once per
  // attribute, on every render — and each synthetic edit replaces `variables`,
  // so editing got slower the more attributes the type had.
  const collected = useMemo(() => collectImpliedRules(protocol), [protocol]);

  if (entries.length === 0) {
    return (
      <p className="text-text/70">
        This type has no attributes yet. Generation settings appear here once
        you add one.
      </p>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {entries.map(({ id, draft }) => (
        <li key={id} className="min-w-0">
          <VariableSyntheticProvider
            variable={draft}
            implied={impliedRulesIn(collected, subject, id)}
            namePrefix={`variables.${id}.synthetic`}
            optionWeightsHost="inline"
            onChange={(next) => {
              const raw = variables[id];
              if (typeof raw !== 'object' || raw === null) return;
              onChange?.({
                ...variables,
                [id]: withSynthetic(raw as Record<string, unknown>, next),
              });
            }}
          >
            {/*
              Named by the attribute rather than by the feature: the section
              around this list is what carries the term "Synthetic data", and
              a stack of identically named disclosures would be one control to
              anyone navigating by a list of buttons.
            */}
            <VariableSyntheticSection title={draft.name} />
          </VariableSyntheticProvider>
        </li>
      ))}
    </ul>
  );
}
