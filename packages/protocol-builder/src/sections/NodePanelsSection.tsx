import {
  type ComponentType,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.nodePanels.title',
    defaultMessage: 'Side panels',
    description:
      'Heading of the section adding lists of people beside a name generator, so the participant can nominate someone without typing their name again. A name generator is the step of an interview where a participant names the people they know.',
  },
  description: {
    id: 'protocolBuilder.nodePanels.description',
    defaultMessage:
      'Show a list of people beside this stage, so the participant can nominate someone without typing their name again.',
    description:
      'Description of the side-panels section. A stage is one step of an interview.',
  },
  waitingDescription: {
    id: 'protocolBuilder.nodePanels.waitingDescription',
    defaultMessage:
      'Choose what this stage works with before adding side panels.',
    description:
      'Shown in place of the side-panels section’s description while the researcher has not yet chosen which node type the stage is about, so a panel would have nothing to be about.',
  },
  fieldLabel: {
    id: 'protocolBuilder.nodePanels.fieldLabel',
    defaultMessage: 'Panels',
    description: 'Label of the list of side panels inside the section.',
  },
  fieldHint: {
    id: 'protocolBuilder.nodePanels.fieldHint',
    defaultMessage:
      'Up to two panels, shown in this order. Each draws from the interview so far or from a network you have imported.',
    description: 'Guidance under the list of side panels.',
  },
  addLabel: {
    id: 'protocolBuilder.nodePanels.addLabel',
    defaultMessage: 'Create new panel',
    description:
      'Button that opens the dialog for adding one more side panel. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  addTitle: {
    id: 'protocolBuilder.nodePanels.addTitle',
    defaultMessage: 'Create panel',
    description:
      'Title of the dialog a researcher fills in to add one more side panel.',
  },
  editTitle: {
    id: 'protocolBuilder.nodePanels.editTitle',
    defaultMessage: 'Edit panel',
    description:
      'Title of the dialog a researcher fills in to change a side panel they have already added.',
  },
  itemNoun: {
    id: 'protocolBuilder.nodePanels.itemNoun',
    defaultMessage: 'panel',
    description:
      'What one row of the side-panel list is called inside things said ABOUT it — "Edit panel", "Remove this panel?" — so it is lower case and singular. A side panel lists people beside a name generator for the participant to nominate from.',
  },
  emptyState: {
    id: 'protocolBuilder.nodePanels.emptyState',
    defaultMessage:
      'No panels yet. Create one to offer people the participant has already named.',
    description:
      'Shown in place of the side-panel list while the stage has none.',
  },
  incompletePanel: {
    id: 'protocolBuilder.nodePanels.incompletePanel',
    defaultMessage:
      'Every panel needs a title and a source of people. Open the unfinished panel and complete it.',
    description:
      'Refusal shown above the side-panel list when a panel is missing its title or the source of the people it lists.',
  },
  tooManyPanels: {
    id: 'protocolBuilder.nodePanels.tooManyPanels',
    defaultMessage:
      'This stage has more side panels than a name generator can show. Delete panels until two are left.',
    description:
      'Refusal shown above the side-panel list when the stage arrived holding more panels than fit beside an interview. Refused rather than trimmed, because deleting a panel a researcher wrote is their decision. A stage is one step of an interview.',
  },
  panelGroupTitle: {
    id: 'protocolBuilder.nodePanels.panelGroupTitle',
    defaultMessage: 'Panel',
    description:
      'Heading of the first half of the dialog for one side panel, holding what the panel is called and who it lists.',
  },
  panelGroupDescription: {
    id: 'protocolBuilder.nodePanels.panelGroupDescription',
    defaultMessage: 'Name the panel, and say where the people in it come from.',
    description:
      'Description of the first half of the dialog for one side panel.',
  },
  panelTitleLabel: {
    id: 'protocolBuilder.nodePanels.panelTitleLabel',
    defaultMessage: 'Panel title',
    description:
      'Label of the box holding the words the participant reads above one side panel.',
  },
  panelTitleHint: {
    id: 'protocolBuilder.nodePanels.panelTitleHint',
    defaultMessage:
      'Shown above the panel. Say what is in it, such as “People you named earlier”.',
    description:
      'Guidance under the panel-title box. The quoted phrase is an example title a researcher might write, and should read naturally rather than literally.',
  },
  panelTitlePlaceholder: {
    id: 'protocolBuilder.nodePanels.panelTitlePlaceholder',
    defaultMessage: 'People you named earlier',
    description:
      'Example shown in the empty panel-title box. Written as a participant would read it, because that is who reads the title.',
  },
  panelTitleRequired: {
    id: 'protocolBuilder.nodePanels.panelTitleRequired',
    defaultMessage: 'Give this panel a title.',
    description:
      'Refusal shown when a researcher saves a side panel with no title, which the participant would read as an unlabelled list.',
  },
  sourceLabel: {
    id: 'protocolBuilder.nodePanels.sourceLabel',
    defaultMessage: 'People in this panel',
    description:
      'Label of the control choosing where the people one side panel lists come from.',
  },
  sourceHint: {
    id: 'protocolBuilder.nodePanels.sourceHint',
    defaultMessage:
      "The interview's own network so far, or a network file you have imported.",
    description:
      'Guidance under the control choosing where one side panel’s people come from, naming the two kinds of source.',
  },
  sourceRequired: {
    id: 'protocolBuilder.nodePanels.sourceRequired',
    defaultMessage: 'Choose where the people in this panel come from.',
    description:
      'Refusal shown when a researcher saves a side panel without saying who it lists.',
  },
  filterGroupTitle: {
    id: 'protocolBuilder.nodePanels.filterGroupTitle',
    defaultMessage: 'Panel filter',
    description:
      'Heading of the second half of the dialog for one side panel, narrowing who appears in it.',
  },
  filterGroupDescription: {
    id: 'protocolBuilder.nodePanels.filterGroupDescription',
    defaultMessage: 'Narrow the panel to the people this stage is about.',
    description:
      'Description of the panel-filter half of the side-panel dialog. A stage is one step of an interview.',
  },
  filterRulesLabel: {
    id: 'protocolBuilder.nodePanels.filterRulesLabel',
    defaultMessage: 'Filter rules',
    description:
      'Label of the rule builder narrowing which people appear in one side panel.',
  },
  filterRulesHint: {
    id: 'protocolBuilder.nodePanels.filterRulesHint',
    defaultMessage:
      'Only people matching these rules appear in the panel. With no rules, everyone does.',
    description: 'Guidance under one side panel’s filter rules.',
  },
  filterClearTitle: {
    id: 'protocolBuilder.nodePanels.filterClearTitle',
    defaultMessage: 'This will clear this panel’s filter',
    description:
      'Title of the dialog asking a researcher to confirm switching off one side panel’s filter, which throws away every rule in it.',
  },
  filterClearDescription: {
    id: 'protocolBuilder.nodePanels.filterClearDescription',
    defaultMessage:
      'This will clear the filter, and delete any rules you have created for it. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching one side panel’s filter off throws away every rule in it.',
  },
  filterClearConfirm: {
    id: 'protocolBuilder.nodePanels.filterClearConfirm',
    defaultMessage: 'Clear filter',
    description:
      'Action that confirms switching one side panel’s filter off and discarding its rules.',
  },
  edgeRulesClearTitle: {
    id: 'protocolBuilder.nodePanels.edgeRulesClearTitle',
    defaultMessage: 'This will delete this panel’s connection rules',
    description:
      'Title of the dialog asked when a side panel stops listing the interview’s own network, because rules about connections between people cannot be answered by an imported file.',
  },
  edgeRulesClearDescription: {
    id: 'protocolBuilder.nodePanels.edgeRulesClearDescription',
    defaultMessage:
      'Rules about connections ask about the network the participant is building, and an imported file has none — so they would match nobody. Delete them and use the file, or cancel to keep the rules and go on listing the people named so far.',
    description:
      'Body of the dialog asked when a side panel stops listing the interview’s own network, naming both answers: delete the connection rules, or cancel and keep reading the interview.',
  },
  edgeRulesClearConfirm: {
    id: 'protocolBuilder.nodePanels.edgeRulesClearConfirm',
    defaultMessage: 'Delete the rules',
    description:
      'Action that confirms deleting a side panel’s connection rules so the panel can list an imported file instead.',
  },
  clearTitle: {
    id: 'protocolBuilder.nodePanels.clearTitle',
    defaultMessage: 'This will delete your side panels',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that adds panels of people beside a name generator for the participant to nominate from.',
  },
  clearDescription: {
    id: 'protocolBuilder.nodePanels.clearDescription',
    defaultMessage:
      'This will remove every side panel on this stage, and delete any filter rules you have created for them. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching off the side panels discards the panels and the filter rules written for them. A stage is one step of an interview.',
  },
  clearConfirm: {
    id: 'protocolBuilder.nodePanels.clearConfirm',
    defaultMessage: 'Remove panels',
    description:
      'Action that confirms switching the side panels off and deleting them.',
  },
  interviewSource: {
    id: 'protocolBuilder.nodePanels.interviewSource',
    defaultMessage: 'the people named so far',
    description:
      'How a side panel’s source reads inside the sentence summarising the panel in the list — "Lists the people named so far." — when the panel draws on the interview’s own network. Lower case and mid-sentence.',
  },
  missingSource: {
    id: 'protocolBuilder.nodePanels.missingSource',
    defaultMessage: 'a network that is no longer in this protocol',
    description:
      'How a side panel’s source reads inside the sentence summarising the panel in the list when it names an imported file the protocol no longer holds. Lower case and mid-sentence.',
  },
  untitledPanel: {
    id: 'protocolBuilder.nodePanels.untitledPanel',
    defaultMessage: 'Untitled panel',
    description:
      'Stands in for the name of a side panel in the list while the researcher has not given it one.',
  },
  panelSummary: {
    id: 'protocolBuilder.nodePanels.panelSummary',
    defaultMessage:
      '{rules, plural, =0 {Lists {source}.} one {Lists {source}, narrowed by # rule.} other {Lists {source}, narrowed by # rules.}}',
    description:
      'One line summarising a side panel in the list beneath its title. source is the phrase naming where its people come from, already lower case and written to sit mid-sentence; rules is how many filter rules narrow it.',
  },
});

const PANELS_CAPABILITY: SectionCapability = {
  fields: [PANELS],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

/**
 * What a panel loses by leaving the interview's own network, in the words of
 * the rules it would lose. Shaped like every other capability's confirmation,
 * because it is the same kind of loss.
 *
 * Built from a formatter rather than kept as a module constant, because
 * `confirm` takes the words themselves: a dialog is opened from an event
 * handler, and there is no descriptor seam between here and the screen.
 */
const edgeRulesConfirm = (intl: IntlShape) => ({
  title: intl.formatMessage(messages.edgeRulesClearTitle),
  description: intl.formatMessage(messages.edgeRulesClearDescription),
  confirmLabel: intl.formatMessage(messages.edgeRulesClearConfirm),
  cancelLabel: intl.formatMessage(commonMessages.cancel),
  intent: 'warning' as const,
  onConfirm: () => undefined,
});

const INCOMPLETE_PANEL = createMessageError(messages.incompletePanel);

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
const TOO_MANY_PANELS = createMessageError(messages.tooManyPanels);

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
export default function NodePanelsSection() {
  const intl = useAppIntl();
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
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(
        waiting ? messages.waitingDescription : messages.description,
      )}
      disabled={waiting}
      capability={PANELS_CAPABILITY}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PANELS}
        label={intl.formatMessage(messages.fieldLabel)}
        hint={intl.formatMessage(messages.fieldHint)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(messages.addLabel)}
        addTitle={intl.formatMessage(messages.addTitle)}
        editorTitle={intl.formatMessage(messages.editTitle)}
        itemLabel={messages.itemNoun}
        emptyStateMessage={intl.formatMessage(messages.emptyState)}
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
  const intl = useAppIntl();
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
        title={intl.formatMessage(messages.panelGroupTitle)}
        description={intl.formatMessage(messages.panelGroupDescription)}
      >
        <Field<typeof InputField>
          name="title"
          component={InputField}
          label={intl.formatMessage(messages.panelTitleLabel)}
          hint={intl.formatMessage(messages.panelTitleHint)}
          placeholder={intl.formatMessage(messages.panelTitlePlaceholder)}
          initialValue={asString(item.title) ?? ''}
          required={PANEL_TITLE_REQUIRED}
        />
        <Field<typeof ResourcePicker>
          name="dataSource"
          component={ResourcePicker}
          label={intl.formatMessage(messages.sourceLabel)}
          hint={intl.formatMessage(messages.sourceHint)}
          kind="network"
          canUseExisting
          initialValue={dataSource}
          required={PANEL_SOURCE_REQUIRED}
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.filterGroupTitle)}
        description={intl.formatMessage(messages.filterGroupDescription)}
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
          label={intl.formatMessage(messages.filterRulesLabel)}
          hint={intl.formatMessage(messages.filterRulesHint)}
          allowEdgeRules={usesInterviewNetwork}
          initialValue={item.filter as RuleSetValue | undefined}
          {...filterValidation}
        />
      </Section>
    </>
  );
}

/**
 * The two refusals a panel's own controls can earn, encoded rather than
 * formatted: `required` crosses `Field`'s string-only contract, and
 * `FieldErrors` decodes it in the reader's own language where it is shown.
 */
const PANEL_TITLE_REQUIRED = createMessageError(messages.panelTitleRequired);
const PANEL_SOURCE_REQUIRED = createMessageError(messages.sourceRequired);

/**
 * What switching a panel's filter off destroys, in its own words.
 *
 * The stage-level counterpart is `NetworkFilterSection`'s, and reads the same:
 * a researcher who has narrowed a stage meets the same question when they
 * narrow a panel.
 */
const filterConfirm = (intl: IntlShape) => ({
  title: intl.formatMessage(messages.filterClearTitle),
  description: intl.formatMessage(messages.filterClearDescription),
  confirmLabel: intl.formatMessage(messages.filterClearConfirm),
  cancelLabel: intl.formatMessage(commonMessages.cancel),
  intent: 'warning' as const,
  onConfirm: () => undefined,
});

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
  const intl = useAppIntl();
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
        const confirmed = await confirm(filterConfirm(intl));
        if (confirmed !== true) return false;
      }
      // Absent rather than an empty rule set: the schema has no way to say
      // "filtered by nothing", and an empty one is refused.
      state?.setFieldValue('filter', undefined as never);
      return true;
    },
    [confirm, intl, storeApi],
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
  const intl = useAppIntl();
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
      const confirmed = await confirm(edgeRulesConfirm(intl));
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
  }, [confirm, dataSource, intl, storeApi]);
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
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const dataSource = asString(item.dataSource) ?? INTERVIEW_NETWORK;
  const rules = ruleSetRules(item.filter).length;
  // The imported file's own name, which the researcher gave it, or one of two
  // phrases about it. All three are the same argument of one sentence, so the
  // sentence is a single message with a plural rather than three fragments
  // joined in English word order.
  const source =
    dataSource === INTERVIEW_NETWORK
      ? intl.formatMessage(messages.interviewSource)
      : (protocolContext.assets[dataSource]?.name ??
        intl.formatMessage(messages.missingSource));

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 font-bold">
        {asString(item.title) ?? intl.formatMessage(messages.untitledPanel)}
      </p>
      <p className="m-0 text-sm text-current/70">
        {intl.formatMessage(messages.panelSummary, { rules, source })}
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
