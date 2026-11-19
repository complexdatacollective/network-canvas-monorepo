import { describe, expect, it } from 'vitest';

import {
  isProtocolObjectId,
  type ProtocolObjectKind,
} from '@codaco/protocol-validation';

import { collapseNarrativePreset } from '../editors/narrative/sections/presets/NarrativePresetFields.tsx';
import { newAttributeRow } from '../form/arrayFields/AssignAttributes.tsx';
import { newRow } from '../form/arrayFields/MultiSelect.tsx';
import { rowTemplate } from '../form/rowDialog.tsx';
import { createEmptyRule } from '../rules/RuleList.tsx';
import { createStageIdentity } from '../stageDocument.ts';

const idOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, 'id')
    : undefined;

const firstOf = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : undefined;

const collapsedPreset = () =>
  collapseNarrativePreset({
    highlight: ['close_friend'],
    edges: { display: ['friend'] },
  });

/**
 * The editor that creates each kind of protocol object, as the id it gives a
 * new one. Typed as a record over every kind, so a kind the schema adds or
 * removes fails to compile here until its editor is written down.
 */
const TEMPLATES = {
  stage: () => createStageIdentity('Information').id,
  prompt: () => idOf(rowTemplate()()),
  panel: () => idOf(rowTemplate()()),
  informationItem: () => idOf(rowTemplate()()),
  formField: () => idOf(rowTemplate()()),
  rule: () => idOf(createEmptyRule()),
  sortRule: () => idOf(newRow()),
  additionalAttribute: () => idOf(newAttributeRow()),
  rosterCardProperty: () => idOf(newRow()),
  rosterSortableProperty: () => idOf(newRow()),
  narrativePreset: () => idOf(rowTemplate()()),
  narrativePresetEdge: () =>
    idOf(firstOf(Reflect.get(Object(collapsedPreset().edges), 'display'))),
  narrativePresetHighlight: () => idOf(firstOf(collapsedPreset().highlight)),
  disease: () => idOf(rowTemplate()()),
  composerEdge: () => idOf(rowTemplate()()),
} satisfies Record<ProtocolObjectKind, () => unknown>;

describe('every kind of protocol object', () => {
  it.each(Object.entries(TEMPLATES))(
    'is created with an id of its own: %s',
    (_kind, template) => {
      const first = template();
      const second = template();

      expect(isProtocolObjectId(first)).toBe(true);
      expect(second).not.toBe(first);
    },
  );
});
