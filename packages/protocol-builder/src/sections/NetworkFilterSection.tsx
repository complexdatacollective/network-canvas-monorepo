import { useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

import ProtocolField from '../form/ProtocolField.tsx';
import { useStageValue } from '../form/stageFormHooks.ts';
import { ruleDraftOptions } from '../rules/rule.ts';
import { ruleSetRules } from '../rules/ruleSet.ts';
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
      <ProtocolField<typeof FilterRuleSetField>
        name={FILTER_FIELD}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={FilterRuleSetField}
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
 * Whether these rules would keep any of these edge types off the stage.
 *
 * Four cases, and only two of them are a problem: an edge type the rules
 * require to exist is fine, and an edge type no "must not exist" rule names is
 * fine. An edge type left out of a set of "must exist" rules will not survive
 * them, and one a "must not exist" rule names is being excluded by name.
 *
 * Only edge rules are read. `options.type` is an entity type id whose codebook
 * is decided by the rule's own `type`, so a node rule folded into these sets
 * puts a NODE type id where an edge type id is compared: "this stage needs a
 * Person to exist" then made the configured Friend edge look like one no rule
 * lets through, and warned about a rule that excludes nothing.
 */
function filterHidesAnyEdgeType(
  filter: unknown,
  edgeTypes: readonly string[],
): boolean {
  const rules = ruleSetRules(filter)
    .filter((rule) => rule.type === 'edge')
    .map((rule) => ruleDraftOptions(rule));
  const requiredTypes = rules
    .filter((options) => options.operator === 'EXISTS')
    .map((options) => options.type);
  const excludedTypes = rules
    .filter((options) => options.operator === 'NOT_EXISTS')
    .map((options) => options.type);

  return edgeTypes.some((edgeType) => {
    if (requiredTypes.includes(edgeType)) return false;
    if (requiredTypes.length > 0) return true;
    return excludedTypes.includes(edgeType);
  });
}
