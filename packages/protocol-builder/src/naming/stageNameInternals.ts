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
import {
  asLocalizedString,
  resolveTranslation,
  translationText,
  withTranslation,
} from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
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
 * the hooks that read it may be mounted apart, and the store is this edit's.
 * It is forgotten when the editor is torn down, because the form empties its
 * values then and the store lives on.
 */
export type StageNameOwnership = {
  /** The name on the stage now is the researcher's, not this editor's. */
  isCustom: boolean;
  /**
   * The last value this editor wrote as a proposal, if any: default-language
   * text, the only translation a proposal writes.
   */
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

export function forgetStageNameOwnership(storeApi: StageFormStoreApi): void {
  ownershipByForm.delete(storeApi);
}

/**
 * How the name is written, whoever is writing it, so the read-only refusal and
 * the ownership record are decided once. A spectator is refused HERE rather
 * than by the control being disabled, because a host that renders no control
 * still has a rename to offer.
 *
 * `as` says whose the resulting name is: a `proposed` write may be replaced by
 * the next recomputation, a `chosen` one never is.
 *
 * Either way `next` is plain text and only one translation is written, so the
 * name's other translations survive. A chosen name is written in the editing
 * language. A proposal is written in the default language, the one every
 * other language falls back to, because it is the editor's English rather than
 * anybody's translation.
 */
export type StageNameWriter = (next: string, as: 'proposed' | 'chosen') => void;

export function useStageNameWriter(): StageNameWriter {
  const { storeApi, readOnly, reportRefusedWrite } = useStageEditorForm();
  const { localization, locale } = useEditingLanguage();

  return useCallback(
    (next, as) => {
      if (readOnly) {
        reportRefusedWrite(READ_ONLY_MESSAGE);
        return;
      }
      // No translation can be addressed before the protocol's languages are
      // known; the control is read-only until then and nothing is proposed.
      if (localization === undefined || locale === undefined) return;
      const ownership = stageNameOwnership(storeApi);
      if (as === 'proposed') {
        ownership.lastGenerated = next;
        ownership.isCustom = false;
      }
      const state = storeApi.getState();
      state.setFieldValue(
        LABEL,
        withTranslation(
          state.getValue(LABEL),
          as === 'proposed' ? localization.defaultLocale : locale,
          next,
        ),
      );
    },
    [locale, localization, readOnly, reportRefusedWrite, storeApi],
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
          panels: draft.panels,
        },
        protocolContext,
      ),
    [draft, identity, protocolContext],
  );
}

/**
 * The name as the form holds it right now, in the default language: the
 * translation a proposal is written into and compared with.
 */
export function useLiveStageLabel(): string {
  const { localization } = useEditingLanguage();
  return resolveTranslation(
    useStageValue(LABEL),
    localization,
    localization?.defaultLocale,
  ).text;
}

/** The name's translation in the editing language, as plain text. */
export function useEditingStageLabel(): string {
  const { localization, locale } = useEditingLanguage();
  const value = useStageValue(LABEL);
  return locale === undefined
    ? resolveTranslation(value, localization, locale).text
    : translationText(value, locale);
}

/** Everything about the stage being edited that its proposed name reads. */
type StageNameSources = Readonly<{
  subject: StageSubject | undefined;
  items: Item[] | undefined;
  panels: StageLabelPanel[] | undefined;
}>;

/**
 * The draft as it stands right now, for the three values a name is built from.
 *
 * Read through the package's one draft-value hook, so a proposed name sees
 * what every section sees — including a subject only the committed draft holds
 * because the section owning it has not been opened.
 *
 * Parsed inside one memo keyed on the RAW values: each reader builds a fresh
 * object, so parsing per render would re-derive the name per render.
 */
function useStageNameSources(): StageNameSources {
  const rawSubject = useStageValue('subject');
  const rawItems = useStageValue('items');
  const rawPanels = useStageValue('panels');

  return useMemo(
    () => ({
      subject: readSubject(rawSubject),
      items: readItems(rawItems),
      panels: readPanels(rawPanels),
    }),
    [rawItems, rawPanels, rawSubject],
  );
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
    if (!('content' in entry) || !('type' in entry)) continue;
    // A text item is counted as well as an asset one: only assets qualify a
    // name, but a dropped text item would be indistinguishable from a
    // malformed entry if the rules widen.
    if (entry.type === 'asset' && typeof entry.content === 'string') {
      items.push({ id: entry.id, type: 'asset', content: entry.content });
    }
    const text = entry.type === 'text' && asLocalizedString(entry.content);
    if (text) {
      items.push({ id: entry.id, type: 'text', content: text });
    }
  }
  return items;
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
