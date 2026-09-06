import {
  type ComponentType,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
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
  ruleSetTargets,
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
import { useStageSubject } from './useStageSubject.ts';

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

/**
 * What a panel loses by leaving the interview's own network, in the words of
 * the rules it would lose. Shaped like every other capability's confirmation,
 * because it is the same kind of loss.
 */
const EDGE_RULES_CONFIRM = {
  title: 'This will delete this panel’s connection rules',
  description:
    'Rules about connections ask about the network the participant is building, and an imported file has none — so they would match nobody. Delete them and use the file, or cancel to keep the rules and go on listing the people named so far.',
  confirmLabel: 'Delete the rules',
  cancelLabel: 'Cancel',
  intent: 'warning' as const,
  onConfirm: () => undefined,
};

const INCOMPLETE_PANEL =
  'Every panel needs a title and a source of people. Open the unfinished panel and complete it.';

/**
 * The cap is the screen's, not the schema's: `panelSchema` accepts any number
 * of panels, so a protocol authored elsewhere can arrive holding more than fit
 * beside an interview. Hiding the add button said nothing about the ones
 * already there — the stage opened, rendered all of them, and saved them
 * straight back — so the researcher kept a stage this builder would not let
 * them rebuild, and Architect (which caps the same list at two and shows only
 * the first two) would not show them at all.
 *
 * Refused rather than trimmed: deleting a panel a researcher wrote is their
 * decision, and each one on screen has a delete beside it.
 */
const TOO_MANY_PANELS =
  'This stage has more side panels than a name generator can show. Delete panels until two are left.';

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
      rowsOf(value).length > MAX_PANELS ? TOO_MANY_PANELS : undefined,
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
  /** Said instead of `description` while the section is waiting on a subject. */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
  addButtonLabel: string;
  emptyStateMessage: string;
}>;

const DEFAULT_COPY: NodePanelsCopy = {
  sectionTitle: 'Side panels',
  description:
    'Show a list of people beside this stage, so the participant can nominate someone without typing their name again.',
  waitingDescription:
    'Choose what this stage works with before adding side panels.',
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
  const subject = useStageSubject('node');
  // A panel's filter asks about a node type, and its rules are chosen from
  // that type's attributes — so until the stage says what it works with there
  // is nothing for a panel to be about, and offering rules over an empty
  // codebook would be offering nothing at all.
  const waiting = subject === undefined;
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    PanelEditor,
    PanelPreview,
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
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
function PanelEditor({ item }: RowEditorProps) {
  const dataSource =
    asString(useRowValue('dataSource') ?? item.dataSource) ?? INTERVIEW_NETWORK;
  const usesInterviewNetwork = dataSource === INTERVIEW_NETWORK;
  const filterValidation = usePanelFilterValidation();
  const { hasRules, requestFilterOpenChange } = usePanelFilterCapability(
    item.filter,
  );
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
        // A filter is optional and most panels have none — an unfiltered panel
        // lists everyone, which is what its absence means — so it is a
        // capability like every other one in this builder rather than an empty
        // rule builder every panel opens on. Architect narrows it the same way
        // (`sections/fields/NetworkFilter.tsx`).
        toggleable
        defaultOpen={hasRules}
        onOpenChange={requestFilterOpenChange}
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
 * What switching a panel's filter off destroys, in its own words.
 *
 * The stage-level counterpart is `NetworkFilterSection`'s, and reads the same:
 * a researcher who has narrowed a stage meets the same question when they
 * narrow a panel.
 */
const FILTER_CONFIRM = {
  title: 'This will clear this panel’s filter',
  description:
    'This will clear the filter, and delete any rules you have created for it. Do you want to continue?',
  confirmLabel: 'Clear filter',
  cancelLabel: 'Cancel',
  intent: 'warning' as const,
  onConfirm: () => undefined,
};

/**
 * The panel filter's own switch: on when there is something to switch off, and
 * asking before it throws anything away.
 *
 * Cleared here rather than left to the collapsed panel's unmount, for the
 * reason `BuilderSection` states: a field parked behind a closed group is not
 * unmounted again, so its value would survive and be written back with the
 * row.
 */
function usePanelFilterCapability(committed: unknown) {
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();
  // The panel as it was opened, not as it stands: this decides whether the
  // switch STARTS on, and a live read would reopen the group under the
  // researcher the moment they cleared it.
  const hasRules = ruleSetRules(committed).length > 0;

  const requestFilterOpenChange = useCallback(
    async (open: boolean) => {
      if (open) return true;
      const state = storeApi?.getState();
      const filter = state?.hasValue('filter')
        ? state.getValue('filter')
        : undefined;
      if (ruleSetRules(filter).length > 0) {
        const confirmed = await confirm(FILTER_CONFIRM);
        if (confirmed !== true) return false;
      }
      // Absent rather than an empty rule set: the schema has no way to say
      // "filtered by nothing", and an empty one is refused.
      state?.setFieldValue('filter', undefined as never);
      return true;
    },
    [confirm, storeApi],
  );

  return { hasRules, requestFilterOpenChange };
}

/**
 * Asks about the rules an imported network cannot answer, the moment the panel
 * stops reading the interview.
 *
 * A rule about connections is a question about the network the participant is
 * building; a network file has none, so the rule can never match and the panel
 * silently shows nobody. The schema accepts it, the interview does not report
 * it, and the researcher finds out from an empty panel mid-study — so the
 * panel cannot be left in that state.
 *
 * Which leaves two answers, and the researcher picks: delete the rules, or
 * keep them and go on reading the interview. Confirmed rather than done —
 * rules a researcher authored are a real loss, the same reason switching this
 * whole section off asks first — and REVERSED rather than half-applied on
 * refusal, because "keep my rules" and "use this file" cannot both be true.
 *
 * Only on a CHANGE the researcher made. The value also "changes" from
 * unregistered to its committed value on the field's first render, and asking
 * there would interrogate a panel that was merely opened.
 */
function useEdgeRulesClearedWithSource(dataSource: string): void {
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();
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

    // Read afresh inside the answer: the dialog is open for as long as the
    // researcher takes, and the row's store is live behind it.
    let abandoned = false;
    void (async () => {
      const confirmed = await confirm(EDGE_RULES_CONFIRM);
      if (abandoned) return;
      if (confirmed === true) {
        storeApi.getState().setFieldValue('filter', remaining as never);
        return;
      }
      // The source goes back, and `previous` with it, so putting it back does
      // not read as a fresh change and ask again.
      previous.current = INTERVIEW_NETWORK;
      storeApi.getState().setFieldValue('dataSource', INTERVIEW_NETWORK);
    })();

    return () => {
      abandoned = true;
    };
  }, [confirm, dataSource, storeApi]);
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
 *
 * The targets are the `filter` set's, because `FilterRuleSetField` is what this
 * section mounts: an ego rule in a panel's filter either keeps every entity or
 * none, so it is reported here rather than saved and refused by the schema.
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
            : ruleSetValidationMessage(
                value,
                codebook.current,
                ruleSetTargets('filter'),
              ),
      ]),
    }),
    [],
  );
}

/** How one panel reads in the list when its dialog is closed. */
function PanelPreview({ item }: RowPreviewProps) {
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
