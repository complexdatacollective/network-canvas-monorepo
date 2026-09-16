import { useCallback, useEffect, useMemo, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { BASE_FIELD_ELEMENTS } from '@codaco/fresco-ui/form/Field/fieldElements';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import type { Item, StageSubject } from '@codaco/protocol-validation';

import { REQUIRED } from '../form/requiredField.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { computeAutoNameUpdate } from './computeAutoNameUpdate.ts';
import { MAX_LABEL_LENGTH } from './generateStageLabel.ts';
import {
  proposeStageLabel,
  type StageLabelPanel,
} from './proposeStageLabel.ts';

/** Where the stage's own name lives in the stage document. */
const LABEL = 'label';

/**
 * The source a panel has until the researcher chooses another one. It is what
 * `NodePanelsSection`'s own row template writes, so a panel created and left
 * alone qualifies the name exactly as it will once the stage is saved.
 */
const INTERVIEW_NETWORK = 'existing';

const messages = defineMessages({
  stageName: {
    id: 'protocolBuilder.stageName.name',
    defaultMessage: 'Stage name',
    description:
      'Section heading and accessible field label for the researcher-authored stage name.',
  },
  placeholder: {
    id: 'protocolBuilder.stageName.placeholder',
    defaultMessage: 'Enter stage name...',
    description: 'Placeholder for the researcher-authored stage name field.',
  },
});

/** Put on the element that wraps the control and the refusal beneath it. */
export type StageNameContainerProps = ReturnType<
  typeof useField
>['containerProps'];

/**
 * Everything a single-line text control needs to BE the stage's name.
 *
 * Shaped for `fields/StageNameInput`, which is the control this package
 * publishes for the job, and satisfied by any control that takes the same
 * props. `autoFocus` is deliberately absent — see `StageName.isNewStage`.
 */
export type StageNameFieldProps = Readonly<{
  'id': string;
  'name': string;
  'value': string;
  'onChange': (value: string) => void;
  /** Re-proposes a name the researcher cleared and then walked away from. */
  'onFieldBlur': () => void;
  'placeholder': string;
  'characterLimit': number;
  'disabled': boolean;
  'readOnly': boolean;
  'aria-required': boolean;
  'aria-invalid': boolean;
  'aria-labelledby': string | undefined;
  'aria-describedby': string | undefined;
}>;

export type StageName = Readonly<{
  /** The name as the form holds it right now. */
  value: string;
  /** Write it, exactly as typing into the control would. */
  setValue: (value: string) => void;
  /**
   * What the editor refuses about the name, once it is worth saying, as an
   * encoded descriptor a host decodes with `formatMessageError`.
   *
   * One sentence rather than a list: the only rule this package puts on a
   * stage name is that there has to be one. A host that adds a rule of its own
   * brings its own words for it.
   */
  error: string | undefined;
  /** What a control naming the field calls it, in the reader's language. */
  label: string;
  /** What the control says while the name is empty. */
  placeholder: string;
  /**
   * The most characters the control may hold.
   *
   * The cap a PROPOSAL is fitted to, so the control can always hold what this
   * package would propose for the stage. It is not a validation rule — a name
   * is refused for being absent, never for being long.
   */
  characterLimit: number;
  /**
   * Whether this stage is being created rather than opened.
   *
   * Reported rather than acted on. Naming the stage is the first thing there
   * is to do in a stage that does not exist yet, and an existing stage was
   * opened to be looked at rather than renamed — but whether that means the
   * name takes focus is a question about the whole page the editor is on, and
   * only the host can answer it. Architect's route focus deliberately leaves a
   * destination that has already claimed focus alone, which is the other half
   * of that arrangement.
   */
  isNewStage: boolean;
  /**
   * What this stage would be called if nobody had named it, recomputed as the
   * stage is configured.
   *
   * Offered for every stage, named or not, so a host can put "suggest a name"
   * in front of a researcher whenever it wants to. Whether it is written
   * WITHOUT being asked is the policy below, and that answers only for a stage
   * being created.
   */
  proposal: string;
  /** Write the proposal as the name, and count it as this editor's doing. */
  acceptProposal: () => void;
  /**
   * The field's own DOM id, which everything drawn around the control is named
   * from — `fresco-ui/form/Field/BaseField` takes it and derives the ids of the
   * label, the required marker and the refusal region from it, and
   * `fieldProps` already points the control at those. A host that draws that
   * markup itself gets the same ids out of `fieldElementIds`.
   */
  id: string;
  containerProps: StageNameContainerProps;
  fieldProps: StageNameFieldProps;
}>;

/**
 * The stage's name: what it is, how to change it, and what this editor would
 * call the stage if nobody had.
 *
 * The whole of the name's API, and deliberately not a component: what a stage
 * title LOOKS like is host chrome — Architect draws a picture of the interface
 * with the name written across it, and a host with a stage list may want a
 * rename dialog and no title at all — while what the name IS, when a proposal
 * is offered and whose name is on the stage, is protocol semantics and belongs
 * here.
 *
 * Takes nothing. Everything it needs is already in the editor it is called
 * inside: the stage form holds the draft a name is derived from, the open edit
 * says whether the stage is being created, and `protocolContext` carries the
 * codebook, the asset manifest and the stage order. A host that had to assemble
 * any of that could assemble it differently from the editor beside it.
 *
 * The field is REGISTERED here rather than by whatever renders the control, so
 * `setValue` writes the name whether or not anything is drawn: a submit keeps
 * only the paths the form has fields at, so a rename made from a menu by a host
 * that renders no input would otherwise be dropped on save.
 *
 * Ownership — did a person name this stage, or did we? — is tracked in refs
 * rather than in form state, because it is not part of the stage: it is this
 * edit's memory of who last wrote the name. The classifier reads a non-empty
 * name it did not itself generate as the researcher's, which is the safe
 * direction: a proposal is never written over a name a person might have
 * chosen.
 */
export function useStageName(): StageName {
  const { storeApi, identity, creation, readOnly } = useStageEditorForm();
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const draft = useStageNameSources();
  const liveLabel = draft.label;
  const isNewStage = creation !== undefined;

  const proposal = useMemo(
    () =>
      proposeStageLabel(
        {
          id: identity.id,
          type: identity.type,
          subject: draft.subject,
          items: draft.items,
          nominationPrompts: draft.nominationPrompts,
          panels: draft.panels,
        },
        protocolContext,
      ),
    [draft, identity, protocolContext],
  );

  // Disabled from the EDIT rather than from `FieldsDisabled`: the shell wraps
  // the sections in that, and a host draws the title in its own chrome outside
  // it, so a read-only stage's name would otherwise be the one control in the
  // editor a spectator could still type into.
  const { id, containerProps, fieldProps, meta } = useField({
    name: LABEL,
    required: REQUIRED,
    disabled: readOnly,
    // Everything `BaseField` draws, because that is what a host puts around
    // this control — the visible label, the visually hidden "Required" marker,
    // and the refusal region. The marker is not decoration: the editor's own
    // outline reads whether a field must be answered off it.
    renderedElements: BASE_FIELD_ELEMENTS,
  });

  const isCustomRef = useRef(false);
  const lastGeneratedRef = useRef<string | undefined>(undefined);

  // Kept current each render so the stable blur handler reads the latest
  // values rather than the ones it closed over.
  const liveLabelRef = useRef(liveLabel);
  liveLabelRef.current = liveLabel;
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;

  const applyLabel = useCallback(
    (nextLabel: string) => {
      lastGeneratedRef.current = nextLabel;
      storeApi.getState().setFieldValue(LABEL, nextLabel);
    },
    [storeApi],
  );

  useEffect(() => {
    const update = computeAutoNameUpdate({
      isNewStage,
      isCustom: isCustomRef.current,
      liveLabel,
      lastGenerated: lastGeneratedRef.current,
      generatedLabel: proposal,
    });
    isCustomRef.current = update.nextIsCustom;
    if (update.label !== undefined) {
      applyLabel(update.label);
    }
  }, [applyLabel, isNewStage, liveLabel, proposal]);

  // Re-engage on blur: if the researcher cleared the name and tabs away while
  // it is still empty, fill the proposal back in — rather than fighting their
  // keystrokes the instant the field goes empty.
  const onFieldBlur = useCallback(() => {
    if (!isNewStage) {
      return;
    }
    if (liveLabelRef.current.trim() === '' && proposalRef.current) {
      isCustomRef.current = false;
      applyLabel(proposalRef.current);
    }
  }, [applyLabel, isNewStage]);

  const acceptProposal = useCallback(() => {
    isCustomRef.current = false;
    applyLabel(proposalRef.current);
  }, [applyLabel]);

  const setValue = useCallback(
    (next: string) => {
      fieldProps.onChange(next);
    },
    [fieldProps],
  );

  const label = intl.formatMessage(messages.stageName);
  const placeholder = intl.formatMessage(messages.placeholder);
  // A refusal the field is not showing yet is not one a host should print:
  // `shouldShowError` is what keeps "you have not answered this" from
  // appearing before the researcher has had a chance to.
  const error = meta.shouldShowError ? meta.errors?.[0] : undefined;

  return {
    value: liveLabel,
    setValue,
    error,
    label,
    placeholder,
    characterLimit: MAX_LABEL_LENGTH,
    isNewStage,
    proposal,
    acceptProposal,
    id,
    containerProps,
    fieldProps: {
      'id': id,
      'name': LABEL,
      // Normalised for RENDERING, as every connected control must: the store
      // owns the value and hands back whatever is at the path, which is not a
      // string for the one render between a structural write and the effect
      // that repairs it.
      'value': typeof fieldProps.value === 'string' ? fieldProps.value : '',
      'onChange': setValue,
      onFieldBlur,
      placeholder,
      'characterLimit': MAX_LABEL_LENGTH,
      'disabled': fieldProps.disabled,
      'readOnly': fieldProps.readOnly,
      'aria-required': fieldProps['aria-required'],
      'aria-invalid': fieldProps['aria-invalid'],
      'aria-labelledby': fieldProps['aria-labelledby'],
      'aria-describedby': fieldProps['aria-describedby'],
    },
  };
}

/** Everything about the stage being edited that its proposed name reads. */
type StageNameSources = Readonly<{
  label: string;
  subject: StageSubject | undefined;
  items: Item[] | undefined;
  nominationPrompts: { variable: string }[] | undefined;
  panels: StageLabelPanel[] | undefined;
}>;

/**
 * The draft as it stands right now, for the five values a name is built from.
 *
 * Each is read through the package's one draft-value hook rather than through
 * a resolution of its own, so a proposed name sees exactly what every other
 * section sees — including a subject that only the committed draft holds
 * because the section owning it has not been opened yet, which would otherwise
 * cost the proposal its subject name.
 *
 * `panels` is read here like the rest, and a stage type that has no panels is
 * no reason not to: `resolveStageQualifier` asks about them for the two name
 * generators that offer them and about nothing else, so reading the path on a
 * Sociogram costs a value that is never consulted. The whole list is ONE
 * registered field value in this package — the list is a field component, and
 * never registers per-index leaves — so the container path IS the panels, and
 * switching the section off parks `undefined` at exactly the path this reads.
 *
 * Parsed inside one memo keyed on the RAW values. Each reader builds a fresh
 * object or array, and the proposal is derived from the result, so parsing on
 * every render would re-derive the name on every render.
 */
function useStageNameSources(): StageNameSources {
  const rawLabel = useStageValue(LABEL);
  const rawSubject = useStageValue('subject');
  const rawItems = useStageValue('items');
  const rawNominationPrompts = useStageValue('nominationPrompts');
  const rawPanels = useStageValue('panels');

  return useMemo(
    () => ({
      label: readLabel(rawLabel),
      subject: readSubject(rawSubject),
      items: readItems(rawItems),
      nominationPrompts: readNominationPrompts(rawNominationPrompts),
      panels: readPanels(rawPanels),
    }),
    [rawItems, rawLabel, rawNominationPrompts, rawPanels, rawSubject],
  );
}

function readLabel(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readSubject(value: unknown): StageSubject | undefined {
  if (typeof value !== 'object' || value === null || !('entity' in value)) {
    return undefined;
  }
  const { entity } = value;
  if (entity === 'ego') return { entity: 'ego' };
  if (entity !== 'node' && entity !== 'edge') return undefined;
  if (!('type' in value) || typeof value.type !== 'string') return undefined;
  return { entity, type: value.type };
}

function readItems(value: unknown): Item[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: Item[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('id' in entry) || typeof entry.id !== 'string') continue;
    if (!('content' in entry) || typeof entry.content !== 'string') continue;
    if (!('type' in entry)) continue;
    // Only an asset item can qualify a name, but a text item still has to be
    // counted: dropping one silently would be indistinguishable from a
    // malformed entry if the rules ever widen.
    if (entry.type === 'asset' || entry.type === 'text') {
      items.push({ id: entry.id, type: entry.type, content: entry.content });
    }
  }
  return items;
}

function readNominationPrompts(
  value: unknown,
): { variable: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const prompts: { variable: string }[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('variable' in entry) || typeof entry.variable !== 'string') continue;
    prompts.push({ variable: entry.variable });
  }
  return prompts;
}

/**
 * The panels the stage offers beside its question, as the qualifier reads
 * them.
 *
 * A panel with no source chosen counts as one drawing on the interview's own
 * network, because that is what the row template writes and what the stage
 * will hold once it is saved.
 */
function readPanels(value: unknown): StageLabelPanel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const panels: StageLabelPanel[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const dataSource =
      'dataSource' in entry &&
      typeof entry.dataSource === 'string' &&
      entry.dataSource !== ''
        ? entry.dataSource
        : INTERVIEW_NETWORK;
    panels.push({ dataSource });
  }
  return panels;
}
