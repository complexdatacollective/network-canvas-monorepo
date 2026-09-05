import {
  type ComponentType,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import Section from '@codaco/fresco-ui/Section';

import { withoutAbsentValues } from '../form/absentValues.ts';
import DialogArrayField from '../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import ResourcePickerControl from '../resources/components/ResourcePickerControl.tsx';
import {
  ruleSetRules,
  ruleSetValidationMessage,
  type RuleSetValue,
} from '../rules/ruleSet.ts';
import { FilterRuleSetField } from '../rules/RuleSetField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import {
  type RowEditorProps,
  type RowPreviewProps,
  useRowRenderers,
} from './rowRenderers.tsx';

/** Where every name generator that offers side panels keeps them. */
const PANELS = 'panels';

/**
 * The value a panel holds when it lists the people the interview itself has
 * already named, rather than an imported file. Not an asset id, so no resource
 * is looked up for it.
 */
const INTERVIEW_NETWORK = 'existing';

/**
 * Two, because a name generator shows its panels beside the interview and a
 * third would leave nothing to nominate into. The schema does not cap them;
 * the screen does.
 */
const MAX_PANELS = 2;

const PANELS_CAPABILITY: SectionCapability = {
  fields: [PANELS],
  confirmClear: {
    title: 'This will delete your side panels',
    description:
      'This will remove every side panel on this stage, and delete any filter rules you have created for them. Do you want to continue?',
    confirmLabel: 'Remove panels',
  },
};

const INCOMPLETE_PANEL =
  'Every panel needs a title and a source of people. Open the unfinished panel and complete it.';

const ResourcePicker = ResourcePickerControl as ComponentType<
  Record<string, unknown>
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const rowsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/**
 * The rule that can actually refuse a save.
 *
 * A row cannot refuse anything (see `RowField`), and a panel missing its title
 * or its source reaches the schema as `stages.N.panels.0.title` — a path,
 * rather than the section the researcher is looking at. An EMPTY list passes:
 * a stage with no panels is the norm, and the capability switch is what says
 * so.
 */
const panelsValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      rowsOf(value).every(
        (panel) =>
          typeof panel.title === 'string' &&
          panel.title.trim() !== '' &&
          typeof panel.dataSource === 'string' &&
          panel.dataSource !== '',
      )
        ? undefined
        : INCOMPLETE_PANEL,
  ]),
};

export type NodePanelsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  addButtonLabel: string;
  emptyStateMessage: string;
}>;

const DEFAULT_COPY: NodePanelsCopy = {
  sectionTitle: 'Side panels',
  description:
    'Show a list of people beside this stage, so the participant can nominate someone without typing their name again.',
  fieldLabel: 'Panels',
  fieldHint:
    'Up to two panels, shown in this order. Each draws from the interview so far or from a network you have imported.',
  addButtonLabel: 'Create new panel',
  emptyStateMessage:
    'No panels yet. Create one to offer people the participant has already named.',
};

export type NodePanelsSectionProps = Readonly<{
  copy?: Partial<NodePanelsCopy>;
}>;

/**
 * The lists of people shown beside a name generator.
 *
 * Each panel names a source — the interview's own network so far, or a network
 * file the researcher imported — and may narrow it with the same filter rules
 * every other part of the builder uses, so a researcher who has filtered a
 * stage already knows how to filter a panel.
 *
 * Optional, like every capability: a stage with no panels asks the participant
 * to name people from memory, which is the norm. Switching the capability off
 * destroys the panels and their rules, which is why the switch asks first.
 */
export default function NodePanelsSection({
  copy,
}: NodePanelsSectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    PanelEditor,
    PanelPreview,
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={words.description}
      capability={PANELS_CAPABILITY}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PANELS}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={DialogArrayField}
        addButtonLabel={words.addButtonLabel}
        addTitle="Create panel"
        editorTitle="Edit panel"
        itemLabel="panel"
        emptyStateMessage={words.emptyStateMessage}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorDialogSize="editor"
        itemTemplate={newPanel}
        normalizeItem={withoutAbsentValues}
        maxItems={MAX_PANELS}
        sortable
        {...panelsValidation}
      />
    </BuilderSection>
  );
}

/**
 * A panel starts on the interview's own network, which is what all but a
 * handful of panels are for — and is the one source that is always there, so
 * a half-configured panel still describes something real.
 */
const newPanel = () => ({ dataSource: INTERVIEW_NETWORK });

/**
 * One panel: what it is called, who it lists, and which of them it shows.
 *
 * Rendered inside the shared list's row dialog, so its controls are ordinary
 * connected fields of THAT form — the panel is committed whole when the dialog
 * saves, and no part of it is ever registered on the stage.
 */
export function PanelEditor({ item }: RowEditorProps) {
  const dataSource =
    asString(useRowValue('dataSource') ?? item.dataSource) ?? INTERVIEW_NETWORK;
  const usesInterviewNetwork = dataSource === INTERVIEW_NETWORK;
  const filterValidation = usePanelFilterValidation();
  useEdgeRulesClearedWithSource(dataSource);

  return (
    <>
      <Section
        title="Panel"
        description="Name the panel, and say where the people in it come from."
      >
        <Field<typeof InputField>
          name="title"
          component={InputField}
          label="Panel title"
          hint="Shown above the panel. Say what is in it, such as “People you named earlier”."
          placeholder="People you named earlier"
          initialValue={asString(item.title) ?? ''}
          required="Give this panel a title."
        />
        <Field<typeof ResourcePicker>
          name="dataSource"
          component={ResourcePicker}
          label="People in this panel"
          hint="The interview's own network so far, or a network file you have imported."
          kind="network"
          canUseExisting
          initialValue={dataSource}
          required="Choose where the people in this panel come from."
        />
      </Section>
      <Section
        title="Panel filter"
        description="Narrow the panel to the people this stage is about."
      >
        <Field<typeof FilterRuleSetField>
          name="filter"
          component={FilterRuleSetField}
          label="Filter rules"
          hint="Only people matching these rules appear in the panel. With no rules, everyone does."
          allowEdgeRules={usesInterviewNetwork}
          initialValue={item.filter as RuleSetValue | undefined}
          {...filterValidation}
        />
      </Section>
    </>
  );
}

/**
 * Drops the rules an imported network cannot answer, the moment the panel
 * stops reading the interview.
 *
 * A rule about connections is a question about the network the participant is
 * building; a network file has none, so the rule can never match and the panel
 * silently shows nobody. The schema accepts it, the interview does not report
 * it, and the researcher finds out from an empty panel mid-study — so the
 * rules go when the source that could answer them does.
 *
 * Only on a CHANGE the researcher made. The value also "changes" from
 * unregistered to its committed value on the field's first render, and
 * stripping there would edit a panel that was merely opened.
 */
function useEdgeRulesClearedWithSource(dataSource: string): void {
  const storeApi = useContext(FormStoreContext);
  const previous = useRef(dataSource);

  useEffect(() => {
    const wasUsingInterview = previous.current === INTERVIEW_NETWORK;
    previous.current = dataSource;
    if (!wasUsingInterview || dataSource === INTERVIEW_NETWORK) return;
    if (storeApi === undefined) return;

    const state = storeApi.getState();
    const filter = state.hasValue('filter')
      ? state.getValue('filter')
      : undefined;
    const remaining = withoutEdgeRules(filter);
    if (remaining === filter) return;
    state.setFieldValue('filter', remaining as never);
  }, [dataSource, storeApi]);
}

/** The same rule set with every connection rule taken out of it. */
function withoutEdgeRules(filter: unknown): unknown {
  if (!isRecord(filter)) return filter;
  const rules = ruleSetRules(filter);
  const kept = rules.filter((rule) => rule.type !== 'edge');
  if (kept.length === rules.length) return filter;
  // An empty rule set is not a filter the schema accepts, so a panel left with
  // no rules has no filter at all.
  return kept.length === 0 ? undefined : { ...filter, rules: kept };
}

/**
 * The rule set's own verdict, as this field's validation.
 *
 * The stage-level counterpart (`useRuleSetValidation`) reads the value at a
 * stage path, which a panel's filter does not have: it lives inside a row of a
 * list that is itself one field value. The verdict is the same one, so a
 * researcher reads the same words whether the rules narrow a stage or a panel.
 *
 * The rule closure is built once and reads the codebook through a ref, because
 * a field's validation is memoised for the field's lifetime — a rule rebuilt
 * each render would be pinned to whichever codebook the first one closed over,
 * and a type a collaborator deleted would go on being legal.
 */
function usePanelFilterValidation() {
  const { protocolContext } = useStageEditorForm();
  const codebook = useRef(protocolContext.codebook);
  codebook.current = protocolContext.codebook;

  return useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          value === undefined
            ? undefined
            : ruleSetValidationMessage(value, codebook.current),
      ]),
    }),
    [],
  );
}

/** How one panel reads in the list when its dialog is closed. */
export function PanelPreview({ item }: RowPreviewProps) {
  const { protocolContext } = useStageEditorForm();
  const dataSource = asString(item.dataSource) ?? INTERVIEW_NETWORK;
  const rules = ruleSetRules(item.filter).length;
  const source =
    dataSource === INTERVIEW_NETWORK
      ? 'the people named so far'
      : (protocolContext.assets[dataSource]?.name ??
        'a network that is no longer in this protocol');

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 font-bold">
        {asString(item.title) ?? 'Untitled panel'}
      </p>
      <p className="m-0 text-sm text-current/70">
        {rules === 0
          ? `Lists ${source}.`
          : rules === 1
            ? `Lists ${source}, narrowed by 1 rule.`
            : `Lists ${source}, narrowed by ${rules} rules.`}
      </p>
    </div>
  );
}

/**
 * A value of the row dialog's OWN form, live.
 *
 * A row editor reading the stage behind it would never see the researcher
 * change anything: the panel's choices only exist in the dialog's store until
 * the row is saved.
 */
function useRowValue(name: string): unknown {
  const storeApi = useContext(FormStoreContext);

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      storeApi === undefined
        ? () => undefined
        : storeApi.subscribe(onStoreChange),
    [storeApi],
  );
  const getSnapshot = useCallback((): unknown => {
    if (storeApi === undefined) return undefined;
    const state = storeApi.getState();
    return state.hasValue(name) ? state.getValue(name) : undefined;
  }, [name, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
