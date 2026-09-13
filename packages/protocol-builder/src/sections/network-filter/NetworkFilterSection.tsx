import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import {
  collectEntityTypeReferencesFromSchema,
  stageSchema,
  type StageType,
} from '@codaco/protocol-validation';

import { FilterRuleSetField } from '../../fields/RuleSetField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { type RuleDraftOptions, ruleDraftOptions } from '../../rules/rule.ts';
import {
  asRuleSetValue,
  NO_RULES_MESSAGE,
  ruleSetRules,
} from '../../rules/ruleSet.ts';
import { useRuleSetValidation } from '../../rules/useRuleSetValidation.ts';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';

/** The stage's own filter. Every stage in the schema holds it here. */
const FILTER_FIELD = 'filter';

const messages = defineMessages({
  description: {
    id: 'protocolBuilder.networkFilter.description',
    defaultMessage:
      'Create rules that filter which nodes or edges are displayed on this stage.',
    description:
      'Description of the stage-filter section. One sentence for both subjects, because one filter is mounted from the node-type and the edge-type sections alike. A stage is one step of an interview.',
  },
  rulesHint: {
    id: 'protocolBuilder.networkFilter.rulesHint',
    defaultMessage:
      'Create one or more rules to filter what is shown on this stage.',
    description:
      'Guidance under the rule builder of the stage filter. A stage is one step of an interview.',
  },
  title: {
    id: 'protocolBuilder.networkFilter.title',
    defaultMessage: 'Stage filter',
    description:
      'Heading of the section where a researcher narrows which parts of the interview network one stage works on. A stage is one step of an interview.',
  },
  rulesLabel: {
    id: 'protocolBuilder.networkFilter.rulesLabel',
    defaultMessage: 'Filter rules',
    description:
      'Label of the rule builder inside the stage-filter section, where a researcher writes the rules that decide what reaches the stage.',
  },
  clearTitle: {
    id: 'protocolBuilder.networkFilter.clearTitle',
    defaultMessage: 'This will clear your filter',
    description:
      'Title of the confirmation asked before switching the stage filter off, which throws away every rule in it.',
  },
  clearDescription: {
    id: 'protocolBuilder.networkFilter.clearDescription',
    defaultMessage:
      'This will clear your filter, and delete any rules you have created. Do you want to continue?',
    description:
      'Body of the confirmation asked before switching the stage filter off, which throws away every rule in it.',
  },
  clearConfirm: {
    id: 'protocolBuilder.networkFilter.clearConfirm',
    defaultMessage: 'Clear filter',
    description:
      'Action that confirms switching the stage filter off and discarding its rules.',
  },
  hiddenEdgesTitle: {
    id: 'protocolBuilder.networkFilter.hiddenEdgesTitle',
    defaultMessage: 'Filter rules hide configured values',
    description:
      'Warning heading shown when a stage’s own filter would keep out the edges — the relationships between network members — that the same stage is configured to create or display.',
  },
  hiddenEdgesDescription: {
    id: 'protocolBuilder.networkFilter.hiddenEdgesDescription',
    defaultMessage:
      'This stage has edge creation or display values that will not be shown based on the current filter rules.',
    description:
      'Warning body shown when a stage’s own filter would keep out the edges — the relationships between network members — that the same stage is configured to create or display.',
  },
});

const FILTER_CAPABILITY: SectionCapability = {
  fields: [FILTER_FIELD],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

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
export default function NetworkFilterSection() {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  const filter = useStageValue(FILTER_FIELD);
  const prompts = useStageValue('prompts');
  const rulesValidation = useRuleSetValidation(FILTER_FIELD, 'filter');

  const configuredEdgeTypes = useMemo(
    () => promptEdgeTypes(identity.type, prompts),
    [identity.type, prompts],
  );
  const hidesConfiguredEdges =
    configuredEdgeTypes.length > 0 &&
    filterHidesAnyEdgeType(filter, configuredEdgeTypes);

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      capability={FILTER_CAPABILITY}
    >
      {hidesConfiguredEdges && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.hiddenEdgesTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.hiddenEdgesDescription)}
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
      <Field<typeof FilterRuleSetField>
        name={FILTER_FIELD}
        label={intl.formatMessage(messages.rulesLabel)}
        hint={intl.formatMessage(messages.rulesHint)}
        component={FilterRuleSetField}
        required={NO_RULES_MESSAGE}
        custom={rulesValidation}
      />
    </BuilderSection>
  );
}

/**
 * Every edge type this stage's prompts name.
 *
 * Asked of the SCHEMA rather than read from the two or three paths this
 * section happens to know. A Sociogram prompt names its edge types under
 * `edges.create`/`edges.display`; DyadCensus, TieStrengthCensus and
 * OneToManyDyadCensus each name theirs at a top-level `createEdge`, which is a
 * different field and not a synonym — so a hand-written pair of paths saw
 * nothing at all for those three interfaces, and the warning that a filter
 * hides the edge they create never fired. `entityTypeReference` is the
 * schema's own tag for a field holding a codebook type id, and
 * `collectEntityTypeReferencesFromSchema` finds every one of them, so an
 * interface that gains an edge-type field is covered the moment its schema is
 * tagged.
 *
 * Read tolerantly, from a fragment rather than a whole protocol: the prompts
 * belong to sections this one knows nothing about, and a stage part way
 * through being configured holds whatever the researcher has entered so far.
 * Restricted to the prompts, because the stage's own SUBJECT is an edge type
 * on some interfaces and is not something a rule "hides" — the filter is what
 * decides which of its entities reach the stage.
 */
function promptEdgeTypes(stageType: StageType, prompts: unknown): string[] {
  if (!Array.isArray(prompts)) return [];

  return collectEntityTypeReferencesFromSchema(stageSchema, {
    type: stageType,
    prompts,
  }).flatMap((hit) =>
    hit.entity === 'edge' && hit.path[0] === 'prompts' && hit.typeId !== ''
      ? [hit.typeId]
      : [],
  );
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
