import { useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

import ProtocolField from '../form/ProtocolField.tsx';
import { useStageValue } from '../form/stageFormHooks.ts';
import { type RuleDraftOptions, ruleDraftOptions } from '../rules/rule.ts';
import {
  asRuleSetValue,
  NO_RULES_MESSAGE,
  ruleSetRules,
} from '../rules/ruleSet.ts';
import { FilterRuleSetField } from '../rules/RuleSetField.tsx';
import { useRuleSetValidation } from '../rules/useRuleSetValidation.ts';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';

/** The stage's own filter. Every stage in the schema holds it here. */
const FILTER_FIELD = 'filter';

/**
 * What this filter narrows.
 *
 * The control is identical either way — a filter is a question about the whole
 * network wherever it appears — so this changes only what the section says it
 * is for. Naming the wrong entity would tell a researcher configuring an edge
 * stage that they were filtering nodes.
 */
export type NetworkFilterSubject = 'node' | 'edge';

export type NetworkFilterCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
}>;

const DEFAULT_COPY: Readonly<Record<NetworkFilterSubject, NetworkFilterCopy>> =
  Object.freeze({
    node: Object.freeze({
      sectionTitle: 'Stage filter',
      description:
        'Create rules that limit which nodes are available on this stage.',
      fieldLabel: 'Filter rules',
      fieldHint:
        'Create one or more rules that must match in order for a node to be shown on this stage.',
    }),
    edge: Object.freeze({
      sectionTitle: 'Stage filter',
      description:
        'Create rules that limit which edges are available on this stage.',
      fieldLabel: 'Filter rules',
      fieldHint:
        'Create one or more rules that must match in order for an edge to be shown on this stage.',
    }),
  });

const FILTER_CAPABILITY: SectionCapability = {
  fields: [FILTER_FIELD],
  confirmClear: {
    title: 'This will clear your filter',
    description:
      'This will clear your filter, and delete any rules you have created. Do you want to continue?',
    confirmLabel: 'Clear filter',
  },
};

export type NetworkFilterSectionProps = Readonly<{
  subject: NetworkFilterSubject;
  copy?: Partial<NetworkFilterCopy>;
}>;

/**
 * Which part of the network this stage works on.
 *
 * One filter, authored the same way wherever it appears: the node-type and
 * edge-type sections of every stage editor mount this rather than each
 * building a rule set of its own, so a researcher who has filtered one stage
 * already knows how to filter the next.
 *
 * Optional, like every capability — an unfiltered stage sees the whole network
 * — and switching it off destroys the rules, which is why the switch asks
 * first.
 *
 * The rule targets come from the editor's protocol context, so a type or
 * attribute a collaborator adds or deletes while the editor is open changes
 * what the rules can ask about without this section doing anything.
 */
export default function NetworkFilterSection({
  subject,
  copy,
}: NetworkFilterSectionProps) {
  const words = { ...DEFAULT_COPY[subject], ...copy };
  const filter = useStageValue(FILTER_FIELD);
  const prompts = useStageValue('prompts');
  const rulesValidation = useRuleSetValidation(FILTER_FIELD);

  const configuredEdgeTypes = useMemo(
    () => promptEdgeTypes(prompts),
    [prompts],
  );
  const hidesConfiguredEdges =
    configuredEdgeTypes.length > 0 &&
    filterHidesAnyEdgeType(filter, configuredEdgeTypes);

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={words.description}
      capability={FILTER_CAPABILITY}
    >
      {hidesConfiguredEdges && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>Filter rules hide configured values</AlertTitle>
          <AlertDescription>
            This stage creates or displays edges that these rules will not let
            through, so participants will not see them.
          </AlertDescription>
        </Alert>
      )}
      {/*
        Required, because a filter switched ON is a filter the stage is
        waiting for: the capability holds no value until a rule is added, and
        without this the editor would close on a stage whose filter key was
        never written — leaving the section switched off again next time it
        was opened, with nothing having said so.
      */}
      <ProtocolField<typeof FilterRuleSetField>
        name={FILTER_FIELD}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={FilterRuleSetField}
        required={NO_RULES_MESSAGE}
        custom={rulesValidation}
      />
    </BuilderSection>
  );
}

/**
 * Every edge type this stage's prompts create or display.
 *
 * Read tolerantly from the draft rather than from a typed prompt list: the
 * prompts belong to sections this one knows nothing about, and a stage part
 * way through being configured holds whatever the researcher has entered so
 * far.
 */
function promptEdgeTypes(prompts: unknown): string[] {
  if (!Array.isArray(prompts)) return [];

  const types: string[] = [];
  for (const prompt of prompts) {
    if (typeof prompt !== 'object' || prompt === null) continue;
    const edges = Reflect.get(prompt, 'edges');
    if (typeof edges !== 'object' || edges === null) continue;

    const create = Reflect.get(edges, 'create');
    if (typeof create === 'string' && create !== '') types.push(create);

    const display = Reflect.get(edges, 'display');
    if (!Array.isArray(display)) continue;
    for (const entry of display) {
      if (typeof entry === 'string' && entry !== '') types.push(entry);
    }
  }
  return types;
}

/**
 * Whether one rule lets edges of this type through at all.
 *
 * Read off the interview's own edge rule (`@codaco/network-query`): a rule
 * with no attribute keeps the edges of its type, or — for "must not exist" —
 * every edge that is NOT of its type. A rule WITH an attribute keeps only
 * edges of its own type that also match the attribute, so at the level of
 * types it admits exactly its own and excludes every other.
 */
function ruleAdmitsEdgeType(
  options: RuleDraftOptions,
  edgeType: string,
): boolean {
  const isPresenceRule = !Object.hasOwn(options, 'attribute');
  if (isPresenceRule && options.operator === 'NOT_EXISTS') {
    return options.type !== edgeType;
  }
  return options.type === edgeType;
}

/**
 * Whether these rules would keep any of these edge types off the stage.
 *
 * How the rules COMBINE decides this, so the set's `join` is read rather than
 * the rules alone. `AND` feeds each rule's result into the next, so an edge
 * type survives only if every rule admits it — two rules each requiring a
 * different edge type to exist leave no edges at all, which a union of the
 * types they name cannot see. `OR` runs each rule on the whole network and
 * merges the results, so one rule admitting the type is enough. A set with a
 * single rule carries no join, and the runtime reads that as `OR`.
 *
 * Only edge rules are read. `options.type` is an entity type id whose codebook
 * is decided by the rule's own `type`, so a node rule folded into these sets
 * puts a NODE type id where an edge type id is compared: "this stage needs a
 * Person to exist" then made the configured Friend edge look like one no rule
 * lets through, and warned about a rule that excludes nothing. Under `OR` a
 * node rule is a reason to say nothing at all: the edges between the alters it
 * keeps are merged back in whatever type they are.
 */
function filterHidesAnyEdgeType(
  filter: unknown,
  edgeTypes: readonly string[],
): boolean {
  const rules = ruleSetRules(filter);
  const edgeRules = rules
    .filter((rule) => rule.type === 'edge')
    .map((rule) => ruleDraftOptions(rule));
  if (edgeRules.length === 0) return false;

  const joinsWithAll = asRuleSetValue(filter)?.join === 'AND';
  if (!joinsWithAll && rules.some((rule) => rule.type === 'node')) return false;

  return edgeTypes.some((edgeType) =>
    joinsWithAll
      ? !edgeRules.every((options) => ruleAdmitsEdgeType(options, edgeType))
      : !edgeRules.some((options) => ruleAdmitsEdgeType(options, edgeType)),
  );
}
