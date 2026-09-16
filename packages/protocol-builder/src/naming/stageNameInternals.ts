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

/** What the three stage-name hooks share, and nothing a host calls. */

/** Where the stage's own name lives in the stage document. */
export const LABEL = 'label';

/** What `NodePanelsSection`'s row template writes for a panel left alone. */
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
 * This edit's memory of who last wrote the name — the one thing the document
 * cannot say. A non-empty name this editor did not generate reads as the
 * researcher's, which is the safe direction. Keyed on the FORM STORE because
 * the hooks that read it may be mounted apart, and the store's lifetime is
 * exactly this edit's.
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
 * How the name is written, whoever is writing it, so the read-only refusal and
 * the ownership record are decided once. A spectator is refused HERE rather
 * than by the control being disabled, because a host that renders no control
 * still has a rename to offer.
 *
 * `as` says whose the resulting name is: a `proposed` write may be replaced by
 * the next recomputation, a `chosen` one never is.
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
 * Called by BOTH name hooks: registration is what puts the name among the
 * paths a submit may write, and a host that draws no control still renames
 * from a menu. Fresco counts holders, so the two compose.
 */
export function useStageNameRegistration(): ReturnType<typeof useField> {
  const { readOnly } = useStageEditorForm();

  // Disabled from the EDIT, not from `FieldsDisabled`: the shell wraps only
  // the sections in that, and the title is drawn outside it.
  return useField({
    name: LABEL,
    required: REQUIRED,
    disabled: readOnly,
    // No requiredness marker: `StageNameField` renders none, because the
    // outline reads requiredness off fields inside a SECTION and the name is
    // drawn outside every one. `aria-required` says it instead.
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
 * Read through the package's one draft-value hook, so a proposed name sees
 * what every section sees — including a subject only the committed draft holds
 * because the section owning it has not been opened.
 *
 * Parsed inside one memo keyed on the RAW values: each reader builds a fresh
 * object, so parsing per render would re-derive the name per render.
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
    // A text item is counted as well as an asset one: only assets qualify a
    // name, but a dropped text item would be indistinguishable from a
    // malformed entry if the rules widen.
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
 * The panels the stage offers beside its question. One with no source chosen
 * counts as drawing on the interview's own network, which is what the stage
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
