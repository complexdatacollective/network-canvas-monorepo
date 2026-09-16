import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import type { Item, StageSubject } from '@codaco/protocol-validation';

import { READ_ONLY_MESSAGE } from '../form/readOnlyRefusal.ts';
import { REQUIRED } from '../form/requiredField.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import {
  proposeStageLabel,
  type StageLabelPanel,
} from './proposeStageLabel.ts';

/**
 * What the three stage-name hooks share, and nothing a host calls.
 *
 * The name is one field with three questions asked of it — what it is, what
 * binds a control to it, and whether this editor proposes one — and each is a
 * hook of its own so a host takes only what it needs. They still have to agree
 * about where the name lives, what it is called, who last wrote it and what
 * would be proposed for it, so those live here rather than in whichever hook
 * happened to need them first.
 */

/** Where the stage's own name lives in the stage document. */
export const LABEL = 'label';

/**
 * The source a panel has until the researcher chooses another one. It is what
 * `NodePanelsSection`'s own row template writes, so a panel created and left
 * alone qualifies the name exactly as it will once the stage is saved.
 */
const INTERVIEW_NETWORK = 'existing';

export const stageNameMessages = defineMessages({
  stageName: {
    id: 'protocolBuilder.stageName.name',
    defaultMessage: 'Stage name',
    description:
      'Accessible name of the field holding the researcher-authored name of the stage being edited. A stage is one step of an interview.',
  },
  placeholder: {
    id: 'protocolBuilder.stageName.placeholder',
    defaultMessage: 'Enter stage name...',
    description: 'Placeholder for the researcher-authored stage name field.',
  },
});

/**
 * This edit's memory of who last wrote the stage's name.
 *
 * Not part of the stage, so not in the form: it is the difference between a
 * name the researcher chose and one this editor proposed, which the document
 * itself cannot tell you. The classifier reads a non-empty name it did not
 * generate as the researcher's, which is the safe direction — a proposal is
 * never written over a name a person might have chosen.
 *
 * Held against the FORM STORE rather than in a ref, because the hooks that
 * read it are separate and may be mounted in separate places on the page: the
 * title drawing the control, and a rename dialog somewhere else. The store is
 * exactly the right lifetime — a new one is made for a different stage and for
 * a draft started again — and a weak key means the memory goes when it does.
 */
export type StageNameOwnership = {
  /** The name on the stage now is the researcher's, not this editor's. */
  isCustom: boolean;
  /** The last value this editor wrote as a proposal, if any. */
  lastGenerated: string | undefined;
};

const ownershipByForm = new WeakMap<StageFormStoreApi, StageNameOwnership>();

export function stageNameOwnership(
  storeApi: StageFormStoreApi,
): StageNameOwnership {
  const existing = ownershipByForm.get(storeApi);
  if (existing !== undefined) return existing;
  const fresh: StageNameOwnership = {
    isCustom: false,
    lastGenerated: undefined,
  };
  ownershipByForm.set(storeApi, fresh);
  return fresh;
}

/**
 * How the name is written, whoever is writing it.
 *
 * One writer for every route a name can change by — typing into the control,
 * a host's rename, accepting a proposal, the proposal this editor writes for
 * a stage being created — so the read-only refusal and the ownership record
 * are decided once. A spectator's write is refused HERE rather than by the
 * control being disabled, because a host that renders no control still has a
 * rename to offer and `disabled` says nothing about it.
 *
 * `as` says whose the resulting name is. A `proposed` write is this editor's
 * and is remembered as such, so the next recomputation may replace it; a
 * `chosen` write is a person's and is left alone by everything that proposes.
 */
export type StageNameWriter = (next: string, as: 'proposed' | 'chosen') => void;

export function useStageNameWriter(): StageNameWriter {
  const { storeApi, readOnly, reportRefusedWrite } = useStageEditorForm();

  return useCallback(
    (next, as) => {
      if (readOnly) {
        reportRefusedWrite(READ_ONLY_MESSAGE);
        return;
      }
      const ownership = stageNameOwnership(storeApi);
      if (as === 'proposed') {
        ownership.lastGenerated = next;
        ownership.isCustom = false;
      }
      storeApi.getState().setFieldValue(LABEL, next);
    },
    [readOnly, reportRefusedWrite, storeApi],
  );
}

/**
 * Registers the stage's name with the form, and answers with the binding.
 *
 * Called by BOTH name hooks, because registration is what puts the name among
 * the paths a submit is entitled to write — and a host that draws no control
 * at all still renames the stage from a menu. Fresco's registry counts
 * holders, so the two compose: whichever mounts first registers, a later one
 * joins it without resetting the live field's state, and the path survives
 * until the last of them goes.
 */
export function useStageNameRegistration(): ReturnType<typeof useField> {
  const { readOnly } = useStageEditorForm();

  // Disabled from the EDIT rather than from `FieldsDisabled`: the shell wraps
  // the sections in that, and a host draws the title in its own chrome outside
  // it, so a read-only stage's name would otherwise be the one control in the
  // editor a spectator could still type into.
  return useField({
    name: LABEL,
    required: REQUIRED,
    disabled: readOnly,
    // The label the control is named by, and the region its refusal is read
    // out of. Not the requiredness marker: `fields/StageNameField` renders no
    // such element, because the outline reads requiredness off the fields
    // INSIDE a section and the stage's name is drawn by the host outside every
    // one of them. `aria-required` on the control is what says it is required.
    renderedElements: { label: true, error: true },
  });
}

/** What this stage would be called if nobody had named it, right now. */
export function useProposedStageLabel(): string {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const draft = useStageNameSources();

  return useMemo(
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
}

/** The name as the form holds it right now. */
export function useLiveStageLabel(): string {
  return readLabel(useStageValue(LABEL));
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
