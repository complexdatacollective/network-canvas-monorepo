import { useCallback, useEffect, useMemo, useRef } from 'react';

import type {
  Codebook,
  Item,
  Panel,
  StageSubject,
  Variable,
  Variables,
} from '@codaco/protocol-validation';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import type { ProtocolBuilderProtocolContext } from '../protocol-context.ts';
import { computeAutoNameUpdate } from './computeAutoNameUpdate.ts';
import { generateStageLabel, STAGE_TYPE_NAMES } from './generateStageLabel.ts';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from './resolveStageNameParts.ts';

/**
 * The only part of a panel a proposed name reads.
 *
 * Panels are supplied by whoever owns them rather than read from the draft:
 * a name generator's panels live in the stage form as per-index leaves, not
 * as one `panels` value, and only the section that writes them knows how to
 * assemble the list back out of its own slots.
 */
export type AutoStageNamePanel = Pick<Panel, 'dataSource'>;

export type AutoStageNameOptions = Readonly<{
  /**
   * Whether the stage is being created.
   *
   * Only a new stage is named automatically. An existing stage's name is the
   * researcher's — they may have typed it, or accepted a proposal months ago —
   * and nothing later done to its configuration is licence to rewrite it.
   */
  isNewStage: boolean;
  panels?: readonly AutoStageNamePanel[];
}>;

export type AutoStageName = Readonly<{
  /**
   * Hand to the name control's `onFieldBlur`. A researcher who clears the name
   * and tabs away while it is still empty gets the proposal back.
   */
  onLabelBlur: () => void;
}>;

/**
 * Proposes a name for the stage being created, and keeps proposing while the
 * researcher has not named it themselves.
 *
 * Everything the proposal is derived from is read from the package's own
 * context — the draft in the stage form, and the codebook, asset manifest and
 * stage order in `protocolContext` — so the same proposal is made in any host.
 *
 * Ownership is tracked in refs rather than in form state because it is not
 * part of the stage: it is this editing session's memory of who last wrote the
 * name. Undo and redo are the reason it can be tracked that simply — both
 * replace the agreed draft, which re-keys the form store and remounts this
 * hook, so a restored name arrives as a name already in the field. The
 * classifier reads a non-empty name it did not itself generate as the
 * researcher's, which is the safe direction: a proposal is never written over
 * a name a person might have chosen.
 */
export function useAutoStageName(options: AutoStageNameOptions): AutoStageName {
  const { isNewStage, panels } = options;
  const { storeApi, identity, protocolContext } = useStageEditorForm();
  const draft = useStageNameSources();
  const liveLabel = draft.label;

  const generatedLabel = useMemo(() => {
    const subjectName = resolveStageSubjectName(draft.subject, (entity, type) =>
      entityName(protocolContext.codebook, entity, type),
    );
    const variablesById = allVariablesById(protocolContext.codebook);
    const qualifier = resolveStageQualifier(
      {
        type: identity.type,
        panels: panels === undefined ? undefined : [...panels],
        items: draft.items,
        nominationPrompts: draft.nominationPrompts,
      },
      {
        resolveAssetType: (assetId) =>
          protocolContext.assets[assetId]?.type ?? null,
        resolveVariableName: (variableId) =>
          variablesById[variableId]?.name ?? null,
      },
    );
    return generateStageLabel({
      typeName: STAGE_TYPE_NAMES[identity.type],
      subjectName,
      qualifier,
      existingLabels: existingStageLabels(protocolContext, identity.id),
    });
  }, [draft, identity, panels, protocolContext]);

  const isCustomRef = useRef(false);
  const lastGeneratedRef = useRef<string | undefined>(undefined);

  // Kept current each render so the stable blur handler reads the latest
  // values rather than the ones it closed over.
  const liveLabelRef = useRef(liveLabel);
  liveLabelRef.current = liveLabel;
  const generatedLabelRef = useRef(generatedLabel);
  generatedLabelRef.current = generatedLabel;

  const applyLabel = useCallback(
    (nextLabel: string) => {
      lastGeneratedRef.current = nextLabel;
      storeApi.getState().setFieldValue('label', nextLabel);
    },
    [storeApi],
  );

  useEffect(() => {
    const update = computeAutoNameUpdate({
      isNewStage,
      isCustom: isCustomRef.current,
      liveLabel,
      lastGenerated: lastGeneratedRef.current,
      generatedLabel,
    });
    isCustomRef.current = update.nextIsCustom;
    if (update.label !== undefined) {
      applyLabel(update.label);
    }
  }, [applyLabel, generatedLabel, isNewStage, liveLabel]);

  // Re-engage on blur: if the researcher cleared the name and tabs away while
  // it is still empty, fill the proposal back in — rather than fighting their
  // keystrokes the instant the field goes empty.
  const onLabelBlur = useCallback(() => {
    if (!isNewStage) {
      return;
    }
    if (liveLabelRef.current.trim() === '' && generatedLabelRef.current) {
      isCustomRef.current = false;
      applyLabel(generatedLabelRef.current);
    }
  }, [applyLabel, isNewStage]);

  return useMemo(() => ({ onLabelBlur }), [onLabelBlur]);
}

/** Everything about the stage being edited that its proposed name reads. */
type StageNameSources = Readonly<{
  label: string;
  subject: StageSubject | undefined;
  items: Item[] | undefined;
  nominationPrompts: { variable: string }[] | undefined;
}>;

/**
 * The draft as it stands right now, for the four values a name is built from.
 *
 * Each is read through the package's one draft-value hook rather than through
 * a resolution of its own, so a proposed name sees exactly what every other
 * section sees — including a subject that only the committed draft holds
 * because the section owning it has not been opened yet, which would otherwise
 * cost the proposal its subject name.
 *
 * Parsed inside one memo keyed on the RAW values. Each reader builds a fresh
 * object or array, and the generated name is derived from the result, so
 * parsing on every render would re-derive the name on every render.
 */
function useStageNameSources(): StageNameSources {
  const rawLabel = useStageValue('label');
  const rawSubject = useStageValue('subject');
  const rawItems = useStageValue('items');
  const rawNominationPrompts = useStageValue('nominationPrompts');

  return useMemo(
    () => ({
      label: readLabel(rawLabel),
      subject: readSubject(rawSubject),
      items: readItems(rawItems),
      nominationPrompts: readNominationPrompts(rawNominationPrompts),
    }),
    [rawItems, rawLabel, rawNominationPrompts, rawSubject],
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

function entityName(
  codebook: Readonly<Codebook>,
  entity: 'node' | 'edge',
  type: string,
): string | null {
  const types = entity === 'node' ? codebook.node : codebook.edge;
  return types?.[type]?.name ?? null;
}

/**
 * Every attribute in the codebook by its record key, whichever entity type
 * declares it. A nomination prompt names an attribute by key alone, so the
 * lookup cannot be scoped to one entity.
 */
function allVariablesById(
  codebook: Readonly<Codebook>,
): Readonly<Record<string, Variable>> {
  const flattened: Record<string, Variable> = {};
  const add = (variables: Readonly<Variables> | undefined) => {
    for (const [id, variable] of Object.entries(variables ?? {})) {
      flattened[id] = variable;
    }
  };
  for (const definition of Object.values(codebook.node ?? {})) {
    add(definition.variables);
  }
  for (const definition of Object.values(codebook.edge ?? {})) {
    add(definition.variables);
  }
  add(codebook.ego?.variables);
  return flattened;
}

/**
 * The names already taken, so a proposal is unique in the interview.
 *
 * The stage being edited is excluded: a host that has already written it into
 * the protocol would otherwise have every proposal collide with the stage's
 * own last accepted name and come back suffixed ` #2`, then ` #3`.
 */
function existingStageLabels(
  context: ProtocolBuilderProtocolContext,
  stageId: string,
): string[] {
  return context.orderedStages
    .filter((stage) => stage.id !== stageId)
    .map((stage) => stage.label)
    .filter((label) => label !== '');
}
