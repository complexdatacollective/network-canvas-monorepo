import { describe, expect, it } from 'vitest';

import {
  type Filter,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
  stageSchema,
  validateProtocol,
  analyzeProtocolLocalization,
  CurrentProtocolSchema,
  escapeMessageText,
  type LocalizedString,
  messageText,
} from '@codaco/protocol-validation';
import {
  NcNetworkSchema,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { SyntheticDataConstraintError } from '../generateNetwork/constraints/error.ts';
import {
  DEFAULT_SYNTHETIC_SEED,
  SyntheticInterview,
} from '../SyntheticInterview.ts';

/**
 * Validates a built protocol against the current schema. The builder emits the
 * interview payload's `id` and `assets` in place of a protocol file's `name`.
 */
function validateSynthetic(
  protocol: ReturnType<SyntheticInterview['getProtocol']>,
) {
  const { id: _id, assets: _assets, ...file } = protocol;
  return validateProtocol({
    ...file,
    name: 'Synthetic protocol',
  } as unknown as Parameters<typeof validateProtocol>[0]);
}

describe('SyntheticInterview', () => {
  describe('determinism', () => {
    it('uses the shared synthetic seed by default', () => {
      const implicit = new SyntheticInterview();
      const explicit = new SyntheticInterview(DEFAULT_SYNTHETIC_SEED);

      implicit.addStage('Sociogram', { initialNodes: { count: 5 } });
      explicit.addStage('Sociogram', { initialNodes: { count: 5 } });

      expect(implicit.getInterviewPayload()).toEqual(
        explicit.getInterviewPayload(),
      );
    });

    it('produces identical protocol output for the same seed', () => {
      const a = new SyntheticInterview(42);
      const b = new SyntheticInterview(42);

      a.addStage('Sociogram');
      b.addStage('Sociogram');

      expect(a.getProtocol()).toEqual(b.getProtocol());
    });

    it('produces identical network output for the same seed', () => {
      const a = new SyntheticInterview(42);
      const b = new SyntheticInterview(42);

      const stageA = a.addStage('Sociogram', { initialNodes: { count: 5 } });
      stageA.addPrompt();

      const stageB = b.addStage('Sociogram', { initialNodes: { count: 5 } });
      stageB.addPrompt();

      const network = a.getNetwork();
      expect(network).toEqual(b.getNetwork());
      expect(NcNetworkSchema.parse(network)).toStrictEqual(network);
    });

    it('produces different output for different seeds', () => {
      const a = new SyntheticInterview(1);
      const b = new SyntheticInterview(2);

      a.addStage('Sociogram', { initialNodes: { count: 3 } });
      b.addStage('Sociogram', { initialNodes: { count: 3 } });

      expect(a.getProtocol().id).not.toBe(b.getProtocol().id);

      const netA = a.getNetwork();
      const netB = b.getNetwork();
      expect(netA.nodes[0]![entityPrimaryKeyProperty]).not.toBe(
        netB.nodes[0]![entityPrimaryKeyProperty],
      );
    });
  });

  describe('auto-creation', () => {
    it('auto-creates node type when adding a stage without subject', () => {
      const si = new SyntheticInterview();
      si.addStage('Sociogram');

      const protocol = si.getProtocol();
      const nodeTypeIds = Object.keys(protocol.codebook.node);
      expect(nodeTypeIds).toHaveLength(1);
    });

    it('reuses existing node type for subsequent stages', () => {
      const si = new SyntheticInterview();
      si.addStage('Sociogram');
      si.addStage('Narrative');

      const protocol = si.getProtocol();
      const nodeTypeIds = Object.keys(protocol.codebook.node);
      expect(nodeTypeIds).toHaveLength(1);
    });

    it('auto-creates layout variable for Sociogram prompt', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('Sociogram');
      stage.addPrompt();

      const protocol = si.getProtocol();
      const nodeTypeId = Object.keys(protocol.codebook.node)[0]!;
      const nodeType = protocol.codebook.node[nodeTypeId] as Record<
        string,
        unknown
      >;
      const variables = nodeType.variables as Record<string, { type: string }>;
      const layoutVars = Object.values(variables).filter(
        (v) => v.type === 'layout',
      );
      expect(layoutVars).toHaveLength(1);
    });

    it('auto-creates edge type for Sociogram prompt with edges.create=true', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('Sociogram');
      stage.addPrompt({ edges: { create: true } });

      const protocol = si.getProtocol();
      const edgeTypeIds = Object.keys(protocol.codebook.edge);
      expect(edgeTypeIds).toHaveLength(1);
    });

    it('auto-creates boolean variable for highlight=true', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('Sociogram');
      stage.addPrompt({ highlight: { variable: true } });

      const protocol = si.getProtocol();
      const nodeTypeId = Object.keys(protocol.codebook.node)[0]!;
      const nodeType = protocol.codebook.node[nodeTypeId] as Record<
        string,
        unknown
      >;
      const variables = nodeType.variables as Record<string, { type: string }>;
      const boolVars = Object.values(variables).filter(
        (v) => v.type === 'boolean',
      );
      expect(boolVars).toHaveLength(1);
    });
  });

  describe('manual codebook', () => {
    it('creates node type with custom name and color', () => {
      const si = new SyntheticInterview();
      const handle = si.addNodeType({
        name: 'Organization',
        color: 'node-color-seq-3',
      });

      const protocol = si.getProtocol();
      const nodeType = protocol.codebook.node[handle.id] as Record<
        string,
        unknown
      >;
      expect(nodeType.name).toBe('Organization');
      expect(nodeType.color).toBe('node-color-seq-3');
    });

    it('adds variables to node type', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const varRef = nt.addVariable({ type: 'number', name: 'Age' });

      const protocol = si.getProtocol();
      const nodeType = protocol.codebook.node[nt.id] as Record<string, unknown>;
      const variables = nodeType.variables as Record<
        string,
        { name: string; type: string }
      >;
      expect(variables[varRef.id]).toEqual(
        expect.objectContaining({ name: 'Age', type: 'number' }),
      );
    });

    it('infers variable type from component', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const varRef = nt.addVariable({ component: 'RadioGroup' });

      const protocol = si.getProtocol();
      const nodeType = protocol.codebook.node[nt.id] as Record<string, unknown>;
      const variables = nodeType.variables as Record<
        string,
        { type: string; options: unknown[] }
      >;
      expect(variables[varRef.id]!.type).toBe('ordinal');
      expect(variables[varRef.id]!.options).toHaveLength(5);
    });

    it('auto-generates options for categorical variables', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const varRef = nt.addVariable({ component: 'CheckboxGroup' });

      const protocol = si.getProtocol();
      const nodeType = protocol.codebook.node[nt.id] as Record<string, unknown>;
      const variables = nodeType.variables as Record<
        string,
        { type: string; options: unknown[] }
      >;
      expect(variables[varRef.id]!.type).toBe('categorical');
      expect(variables[varRef.id]!.options).toHaveLength(4);
    });
  });

  describe('NameGenerator', () => {
    it('creates form fields that auto-create variables', () => {
      const si = new SyntheticInterview();
      si.addStage('NameGenerator', {
        form: {
          fields: [{ component: 'Text' }, { component: 'Number' }],
        },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const form = stageConfig.form as {
        fields: { variable: string }[];
      };
      expect(form.fields).toHaveLength(2);
      // The strict form schemas reject field-level `component`; the control
      // is resolved from the codebook variable instead.
      expect(form.fields[0]).not.toHaveProperty('component');
      expect(form.fields[1]).not.toHaveProperty('component');

      // Variables should exist in codebook, carrying the component
      const nodeTypeId = Object.keys(protocol.codebook.node)[0]!;
      const nodeType = protocol.codebook.node[nodeTypeId] as Record<
        string,
        unknown
      >;
      const variables = nodeType.variables as Record<
        string,
        { type: string; component?: string }
      >;
      const varTypes = Object.values(variables).map((v) => v.type);
      expect(varTypes).toContain('text');
      expect(varTypes).toContain('number');
      const components = Object.values(variables).map((v) => v.component);
      expect(components).toContain('Text');
      expect(components).toContain('Number');
    });

    it('supports addFormField on stage handle', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGenerator');
      stage.addFormField({ component: 'RadioGroup' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const form = stageConfig.form as { fields: { variable: string }[] };
      expect(form.fields).toHaveLength(1);
      expect(form.fields[0]).not.toHaveProperty('component');

      // The component lives on the auto-created codebook variable.
      const nodeTypeId = Object.keys(protocol.codebook.node)[0]!;
      const nodeType = protocol.codebook.node[nodeTypeId] as {
        variables: Record<string, { component?: string }>;
      };
      expect(nodeType.variables[form.fields[0]!.variable]?.component).toBe(
        'RadioGroup',
      );
    });

    it('supports prompts and panels', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGenerator');
      stage.addPrompt({ text: 'Name your friends' });
      stage.addPanel({ title: 'Previous contacts' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const prompts = stageConfig.prompts as { text: LocalizedString }[];
      const panels = stageConfig.panels as { title: LocalizedString }[];
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.text).toEqual({ 'en-US': 'Name your friends' });
      expect(panels).toHaveLength(1);
      expect(panels[0]!.title).toEqual({ 'en-US': 'Previous contacts' });
    });

    it('generates initial nodes', () => {
      const si = new SyntheticInterview();
      si.addStage('NameGenerator', { initialNodes: { count: 5 } });

      const network = si.getNetwork();
      expect(network.nodes).toHaveLength(5);
    });
  });

  describe('Sociogram', () => {
    it('creates prompts with layout, edges, and highlight', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('Sociogram');
      stage.addPrompt({
        text: 'Place people',
        edges: { create: true },
        highlight: { variable: true },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const prompts = stageConfig.prompts as {
        text: LocalizedString;
        layout: { layoutVariable: string };
        edges: { create: string; display: string[] };
        highlight: { allowHighlighting: boolean; variable: string };
      }[];
      expect(prompts).toHaveLength(1);

      const prompt = prompts[0]!;
      expect(prompt.text).toEqual({ 'en-US': 'Place people' });
      expect(prompt.layout.layoutVariable).toBeTruthy();
      expect(prompt.edges.create).toBeTruthy();
      expect(prompt.highlight.allowHighlighting).toBe(true);
      expect(prompt.highlight.variable).toBeTruthy();
    });

    it('creates Sociogram with background options', () => {
      const si = new SyntheticInterview();
      si.addStage('Sociogram', {
        background: { concentricCircles: 4, skewedTowardCenter: true },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const bg = stageConfig.background as Record<string, unknown>;
      expect(bg.concentricCircles).toBe(4);
      expect(bg.skewedTowardCenter).toBe(true);
    });

    it('creates Sociogram with automatic layout', () => {
      const si = new SyntheticInterview();
      si.addStage('Sociogram', {
        behaviours: { automaticLayout: true },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const behaviours = stageConfig.behaviours as Record<string, unknown>;
      expect(behaviours.automaticLayout).toBe(true);
    });
  });

  describe('Narrative', () => {
    it('creates presets with all options auto-created', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('Narrative');
      stage.addPreset({
        label: 'Full View',
        groupVariable: true,
        highlight: true,
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const presets = stageConfig.presets as {
        label: LocalizedString;
        layoutVariable: string;
        groupVariable: string;
        highlight: { variable: string; label: LocalizedString }[];
      }[];
      expect(presets).toHaveLength(1);

      const preset = presets[0]!;
      expect(preset.label).toEqual({ 'en-US': 'Full View' });
      expect(preset.layoutVariable).toBeTruthy();
      expect(preset.groupVariable).toBeTruthy();
      expect(preset.highlight).toEqual([
        { variable: expect.any(String), label: { 'en-US': 'Highlighted' } },
      ]);
    });

    it("labels each highlight with its attribute's name, as copy in the default language", () => {
      const si = new SyntheticInterview();
      const person = si.addNodeType({ name: 'Person' });
      const close = person.addVariable({
        type: 'boolean',
        name: "Friend's {nickname}",
      });
      const stage = si.addStage('Narrative', {
        subject: { entity: 'node', type: person.id },
      });
      stage.addPreset({ highlight: [close.id] });

      const { stages } = expectValid(si);
      const narrative = stages[0];
      expect(narrative?.type === 'Narrative' && narrative.presets[0]).toEqual(
        expect.objectContaining({
          highlight: [
            {
              variable: close.id,
              label: { 'en-US': escapeMessageText("Friend's {nickname}") },
            },
          ],
        }),
      );
    });

    it('creates presets with explicit edge display', () => {
      const si = new SyntheticInterview();
      const et = si.addEdgeType({ name: 'Friendship' });
      const stage = si.addStage('Narrative');
      stage.addPreset({
        edges: { display: [et.id] },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const presets = stageConfig.presets as {
        edges: { display: string[] };
      }[];
      expect(presets[0]!.edges.display).toEqual([et.id]);
    });

    it('supports behaviours (freeDraw, allowRepositioning)', () => {
      const si = new SyntheticInterview();
      si.addStage('Narrative', {
        behaviours: { freeDraw: true, allowRepositioning: true },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const behaviours = stageConfig.behaviours as Record<string, unknown>;
      expect(behaviours.freeDraw).toBe(true);
      expect(behaviours.allowRepositioning).toBe(true);
    });

    it('creates Narrative with an image background', () => {
      const si = new SyntheticInterview();
      si.addStage('Narrative', {
        background: { image: 'narrative-background' },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.background).toEqual({
        image: 'narrative-background',
      });
    });
  });

  describe('node attributes (deferred fill)', () => {
    it('fills all codebook variables on nodes at getNetwork time', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      nt.addVariable({ type: 'number', name: 'Age' });
      nt.addVariable({ type: 'boolean', name: 'Active' });

      si.addStage('Sociogram', {
        initialNodes: { count: 3 },
        subject: { entity: 'node', type: nt.id },
      });

      const network = si.getNetwork();
      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        // Should have 2 added variables (Age, Active)
        expect(Object.keys(attrs).length).toBeGreaterThanOrEqual(2);
      }
    });

    it('fills variables added after addStage', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const stage = si.addStage('Sociogram', {
        initialNodes: { count: 3 },
        subject: { entity: 'node', type: nt.id },
      });

      // Add variable after stage and nodes were created
      const varRef = nt.addVariable({ type: 'number', name: 'Score' });

      // Also add a prompt that creates a layout variable
      stage.addPrompt();

      const network = si.getNetwork();
      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        expect(attrs[varRef.id]).toBeDefined();
      }
    });
  });

  describe('manual nodes', () => {
    it('defaults unset attributes on manual nodes to neutral values instead of randomising', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const isEgo = nt.addVariable({ type: 'boolean', name: 'isEgo' });
      const affected = nt.addVariable({
        type: 'boolean',
        name: 'affected',
        component: 'Boolean',
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      });
      const relationship = nt.addVariable({
        type: 'text',
        name: 'relationship',
      });
      const tags = nt.addVariable({
        type: 'categorical',
        name: 'tags',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      });
      const score = nt.addVariable({ type: 'number', name: 'score' });
      const nickname = nt.addVariable({ type: 'text', name: 'nickname' });

      const stage = si.addStage('Narrative', {
        subject: { entity: 'node', type: nt.id },
      });
      si.addManualNode(stage.id, nt.id, 'person-1', {
        [isEgo.id]: true,
        [score.id]: null,
        [nickname.id]: undefined,
      });

      const network = si.getNetwork();
      const node = network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === 'person-1',
      )!;
      const attrs = node[entityAttributesProperty];

      // Explicitly-seeded attribute is preserved.
      expect(attrs[isEgo.id]).toBe(true);
      // Unset attributes get type-appropriate neutrals, never random values.
      expect(attrs[affected.id]).toBe(false);
      expect(attrs[relationship.id]).toBe('');
      expect(attrs[tags.id]).toEqual([]);
      expect(attrs).not.toHaveProperty(score.id);
      expect(attrs).not.toHaveProperty(nickname.id);
    });

    it('rejects malformed defined attributes on manual nodes', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const flag = nt.addVariable({ type: 'boolean', name: 'flag' });
      const stage = si.addStage('Narrative', {
        subject: { entity: 'node', type: nt.id },
      });

      si.addManualNode(stage.id, nt.id, 'person-1', {
        [flag.id]: Symbol('not the omission sentinel'),
      });

      expect(() => si.getNetwork()).toThrow();
    });

    it('still randomises unset attributes on procedurally-generated nodes', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const label = nt.addVariable({ type: 'text', name: 'label' });

      si.addStage('Narrative', {
        initialNodes: { count: 1 },
        subject: { entity: 'node', type: nt.id },
      });

      const node = si.getNetwork().nodes[0]!;
      const value = node[entityAttributesProperty][label.id];
      expect(typeof value).toBe('string');
      expect(value).not.toBe('');
    });

    it('omits an attribute whose variable has no drawable value', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const unanswered = nt.addVariable({
        type: 'ordinal',
        name: 'Unanswered',
        options: [],
      });

      si.addStage('Narrative', {
        initialNodes: { count: 1 },
        subject: { entity: 'node', type: nt.id },
      });

      expect(
        si.getNetwork().nodes[0]![entityAttributesProperty],
      ).not.toHaveProperty(unanswered.id);
    });
  });

  describe('edge generation', () => {
    it('creates edges between initial nodes', () => {
      const si = new SyntheticInterview();
      si.addEdgeType({ name: 'Friendship' });
      si.addStage('Sociogram', {
        initialNodes: { count: 5 },
        initialEdges: [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
      });

      const network = si.getNetwork();
      expect(network.edges).toHaveLength(3);

      // Verify from/to reference valid node UIDs
      const nodeUids = new Set(
        network.nodes.map((n) => n[entityPrimaryKeyProperty]),
      );
      for (const edge of network.edges) {
        expect(nodeUids.has(edge.from)).toBe(true);
        expect(nodeUids.has(edge.to)).toBe(true);
      }
    });
  });

  describe('getInterviewPayload', () => {
    it('returns interview payload matching expected shape', () => {
      const si = new SyntheticInterview();
      si.addStage('Sociogram', { initialNodes: { count: 3 } });

      const payload = si.getInterviewPayload();

      expect(payload.network.nodes).toHaveLength(3);
      expect(payload.protocol.codebook).toBeDefined();
      expect(payload.protocol.name).toBe('Synthetic Protocol');
      expect(payload.startTime).toBeInstanceOf(Date);
      expect(payload.stageMetadata).toBeNull();
    });
  });

  describe('cross-stage nodes', () => {
    it('nodes from earlier stages are in the network for later stages', () => {
      const si = new SyntheticInterview();
      si.addStage('NameGenerator', { initialNodes: { count: 3 } });
      si.addStage('Sociogram', { initialNodes: { count: 2 } });

      const network = si.getNetwork();
      expect(network.nodes).toHaveLength(5);
    });
  });

  describe('initialNodes promptIndex assignment', () => {
    it('assigns initial nodes to the prompt at the given index', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGenerator', {
        initialNodes: { count: 3, promptIndex: 0 },
      });
      stage.addPrompt({ text: 'Prompt 1' });
      stage.addPrompt({ text: 'Prompt 2' });

      const network = si.getNetwork();
      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as { prompts: { id: string }[] };
      const firstPromptId = stageConfig.prompts[0]!.id;

      expect(network.nodes).toHaveLength(3);
      for (const node of network.nodes) {
        expect(node.promptIDs).toEqual([firstPromptId]);
      }
    });

    it('leaves promptIDs empty when no promptIndex is provided', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGenerator', {
        initialNodes: { count: 2 },
      });
      stage.addPrompt();

      const network = si.getNetwork();
      for (const node of network.nodes) {
        expect(node.promptIDs).toEqual([]);
      }
    });

    it('throws when promptIndex resolves to a non-existent prompt', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGenerator', {
        initialNodes: { count: 1, promptIndex: 5 },
      });
      stage.addPrompt({ text: 'Only prompt' });

      expect(() => si.getNetwork()).toThrow(/prompt index 5/);
    });

    it('nominates a manual node on the prompts it names', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const stage = si.addStage('NameGenerator', {
        subject: { entity: 'node', type: nt.id },
      });
      stage.addPrompt({ text: 'Prompt 1' });
      stage.addPrompt({ text: 'Prompt 2' });
      si.addManualNode(stage.id, nt.id, 'seeded', {}, { promptIndices: [1] });
      si.addManualNode(stage.id, nt.id, 'unprompted', {});

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as { prompts: { id: string }[] };
      const nodes = new Map(
        si.getNetwork().nodes.map((n) => [n[entityPrimaryKeyProperty], n]),
      );

      expect(nodes.get('seeded')?.promptIDs).toEqual([
        stageConfig.prompts[1]!.id,
      ]);
      expect(nodes.get('unprompted')?.promptIDs).toEqual([]);
    });
  });

  describe('NameGeneratorQuickAdd', () => {
    it('creates stage with quickAdd field', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGeneratorQuickAdd');
      stage.addPrompt({ text: 'Name your friends' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.type).toBe('NameGeneratorQuickAdd');
      expect(stageConfig.quickAdd).toBeTruthy();
      const prompts = stageConfig.prompts as { text: LocalizedString }[];
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.text).toEqual({ 'en-US': 'Name your friends' });
    });

    it('supports panels', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGeneratorQuickAdd');
      stage.addPrompt();
      stage.addPanel({ title: 'Existing' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const panels = stageConfig.panels as { title: LocalizedString }[];
      expect(panels).toHaveLength(1);
      expect(panels[0]!.title).toEqual({ 'en-US': 'Existing' });
    });
  });

  describe('NameGeneratorRoster', () => {
    it('creates stage with dataSource and card/sort/search options', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGeneratorRoster', {
        dataSource: 'externalData',
        cardOptions: {
          additionalProperties: [{ label: 'Name', variable: 'name' }],
        },
        sortOptions: {
          sortOrder: [{ property: 'name', direction: 'asc' }],
          sortableProperties: [{ variable: 'name', label: 'Name' }],
        },
        searchOptions: {
          fuzziness: 0.6,
          matchProperties: ['name'],
        },
      });
      stage.addPrompt({ text: 'Select people' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.type).toBe('NameGeneratorRoster');
      expect(stageConfig.dataSource).toBe('externalData');
      expect(stageConfig.cardOptions).toBeDefined();
      expect(stageConfig.sortOptions).toBeDefined();
      expect(stageConfig.searchOptions).toBeDefined();
    });
  });

  describe('TieStrengthCensus', () => {
    it('creates stage with edge variable on prompt', () => {
      const si = new SyntheticInterview();
      const et = si.addEdgeType({ name: 'Friendship' });
      const varRef = et.addVariable({
        type: 'ordinal',
        name: 'Strength',
        options: [
          { label: 'Weak', value: 1 },
          { label: 'Strong', value: 3 },
        ],
      });

      const stage = si.addStage('TieStrengthCensus', {
        initialNodes: { count: 3 },
      });
      stage.addPrompt({
        createEdge: et.id,
        edgeVariable: varRef.id,
        negativeLabel: 'No Friendship',
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.type).toBe('TieStrengthCensus');

      const prompts = stageConfig.prompts as {
        createEdge: string;
        edgeVariable: string;
        negativeLabel: LocalizedString;
      }[];
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.createEdge).toBe(et.id);
      expect(prompts[0]!.edgeVariable).toBe(varRef.id);
      expect(prompts[0]!.negativeLabel).toEqual({ 'en-US': 'No Friendship' });
    });

    it('auto-creates edge type and variable when none provided', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('TieStrengthCensus', {
        initialNodes: { count: 3 },
      });
      stage.addPrompt();

      const protocol = si.getProtocol();
      const edgeTypeIds = Object.keys(protocol.codebook.edge);
      expect(edgeTypeIds.length).toBeGreaterThanOrEqual(1);

      const edgeType = protocol.codebook.edge[edgeTypeIds[0]!] as Record<
        string,
        unknown
      >;
      expect(edgeType.variables).toBeDefined();
    });
  });

  describe('AlterForm', () => {
    it('creates stage with form fields for node attributes', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('AlterForm', {
        initialNodes: { count: 3 },
        introductionPanel: { title: 'About each person' },
      });
      stage.addFormField({ component: 'Text', prompt: 'Nickname' });
      stage.addFormField({ component: 'Number', prompt: 'Age' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.type).toBe('AlterForm');
      expect(stageConfig.introductionPanel).toBeDefined();

      const form = stageConfig.form as {
        fields: { variable: string; component: string }[];
      };
      expect(form.fields).toHaveLength(2);
    });
  });

  describe('AlterEdgeForm', () => {
    it('creates stage with edge subject and form fields', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType();
      const et = si.addEdgeType({ name: 'Friendship' });

      si.addStage('NameGenerator', {
        initialNodes: { count: 3 },
        subject: { entity: 'node', type: nt.id },
      });
      si.addEdges(
        [
          [0, 1],
          [1, 2],
        ],
        et.id,
      );

      const stage = si.addStage('AlterEdgeForm', {
        subject: { entity: 'edge', type: et.id },
        introductionPanel: { title: 'About each relationship' },
      });
      stage.addFormField({ component: 'RadioGroup', prompt: 'Closeness' });

      const protocol = si.getProtocol();
      // AlterEdgeForm is the second stage
      const stageConfig = protocol.stages[1] as Record<string, unknown>;
      expect(stageConfig.type).toBe('AlterEdgeForm');
      const subject = stageConfig.subject as { entity: string; type: string };
      expect(subject.entity).toBe('edge');

      const form = stageConfig.form as {
        fields: { variable: string; component: string }[];
      };
      expect(form.fields).toHaveLength(1);

      // Edge variable should be in codebook
      const edgeCodebook = protocol.codebook.edge[et.id] as Record<
        string,
        unknown
      >;
      expect(edgeCodebook.variables).toBeDefined();
    });
  });

  describe('Anonymisation', () => {
    it('creates subjectless stage with explanationText', () => {
      const si = new SyntheticInterview();
      si.addStage('Anonymisation', {
        explanationText: {
          title: 'Protect Your Data',
          body: 'Enter a passphrase.',
        },
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.type).toBe('Anonymisation');
      expect(stageConfig.subject).toBeUndefined();

      const explText = stageConfig.explanationText as {
        title: LocalizedString;
        body: LocalizedString;
      };
      expect(explText.title).toEqual({ 'en-US': 'Protect Your Data' });
      expect(explText.body).toEqual({ 'en-US': 'Enter a passphrase.' });
    });

    it('provides default explanationText', () => {
      const si = new SyntheticInterview();
      si.addStage('Anonymisation');

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const explText = stageConfig.explanationText as {
        title: LocalizedString;
        body: LocalizedString;
      };
      expect(explText.title).toBeTruthy();
      expect(explText.body).toBeTruthy();
    });
  });

  describe('FamilyPedigree', () => {
    it('builds a valid stage with its person and family types and default prompt', async () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('FamilyPedigree');

      const protocol = si.getProtocol();
      const result = await validateSynthetic(protocol);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);

      const config = protocol.stages[0] as unknown as Record<string, unknown>;
      expect(config.type).toBe('FamilyPedigree');
      expect(config.subject).toEqual({
        entity: 'node',
        type: stage.personType,
      });
      expect(config.prompt).toEqual({ 'en-US': expect.any(String) });
      expect(config.nodeConfiguration).toEqual({
        nameAttribute: stage.name,
        nameField: {
          prompt: { 'en-US': 'Name (optional)' },
          hint: {
            'en-US': expect.stringContaining('first name') as unknown as string,
          },
        },
        genderIdentity: {
          attribute: stage.genderIdentity,
          terms: [...PEDIGREE_DEFAULT_GENDER_IDENTITIES],
        },
        sexAssignedAtBirthAttribute: stage.sexAssignedAtBirth,
        egoAttribute: stage.ego,
      });
      expect(config.edgeConfiguration).toEqual({
        type: stage.edgeType,
        kindAttribute: stage.kind,
        gestationalCarrierAttribute: stage.gestationalCarrier,
        currentPartnerAttribute: stage.currentPartner,
      });
      expect(config).not.toHaveProperty('form');
    });

    it('seeds the gender identity variable with the six default options and gives the other owned variables exactly the interface options', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('FamilyPedigree');
      const { codebook } = si.getProtocol();

      type Typed = Record<string, { variables: Record<string, unknown> }>;
      const person = (codebook.node as Typed)[stage.personType]!.variables;
      const family = (codebook.edge as Typed)[stage.edgeType]!.variables;
      expect(person[stage.name]).toMatchObject({ type: 'text' });
      expect(person[stage.ego]).toMatchObject({ type: 'boolean' });
      expect(person[stage.genderIdentity!]).toMatchObject({
        type: 'categorical',
        options: PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value }) => ({
          value,
          label: { 'en-US': expect.any(String) },
        })),
      });
      expect(person[stage.sexAssignedAtBirth]).toMatchObject({
        type: 'categorical',
        options: PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS.map(
          ({ value, label }) => ({ value, label: { 'en-US': label } }),
        ),
      });
      expect(family[stage.kind]).toMatchObject({
        type: 'categorical',
        options: PEDIGREE_RELATIONSHIP_KIND_OPTIONS.map(({ value, label }) => ({
          value,
          label: { 'en-US': label },
        })),
      });
      expect(family[stage.gestationalCarrier]).toMatchObject({
        type: 'boolean',
      });
      expect(family[stage.currentPartner]).toMatchObject({ type: 'boolean' });
    });

    it('takes researcher-defined gender identity options and the words each takes', async () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('FamilyPedigree', {
        genderIdentities: [
          { value: 'transWoman', label: 'Trans woman', words: 'feminine' },
          { value: 'agender', label: 'Agender', words: 'neutral' },
        ],
      });
      const protocol = si.getProtocol();
      const config = protocol.stages[0] as unknown as {
        nodeConfiguration: { genderIdentity: { terms: unknown } };
      };
      expect(config.nodeConfiguration.genderIdentity.terms).toEqual([
        { value: 'transWoman', words: 'feminine' },
        { value: 'agender', words: 'neutral' },
      ]);
      type Typed = Record<string, { variables: Record<string, unknown> }>;
      expect(
        (protocol.codebook.node as Typed)[stage.personType]!.variables[
          stage.genderIdentity!
        ],
      ).toMatchObject({
        options: [
          { value: 'transWoman', label: { 'en-US': 'Trans woman' } },
          { value: 'agender', label: { 'en-US': 'Agender' } },
        ],
      });
      const result = await validateSynthetic(protocol);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("keeps a stage's own wording and supplies the rest", async () => {
      const si = new SyntheticInterview();
      si.addStage('FamilyPedigree', {
        nameField: { prompt: 'What do you call them?' },
        completeness: {
          scope: 'firstDegree',
          enforcement: 'recommended',
          itemText: {
            siblings: {
              listItem:
                '{isYou, select, true {Your brothers and sisters} other {{name}’s brothers and sisters}}',
            },
          },
          recommendedNote: 'Next again skips these.',
        },
      });
      const protocol = si.getProtocol();
      const config = protocol.stages[0] as unknown as {
        nodeConfiguration: { nameField: unknown };
        completeness: {
          itemText: Record<string, Record<string, unknown>>;
          recommendedNote: unknown;
        };
      };
      // A name question without a hint keeps none: the hint is the
      // researcher's to remove.
      expect(config.nodeConfiguration.nameField).toEqual({
        prompt: { 'en-US': 'What do you call them?' },
      });
      // A message is written as given, its arguments intact.
      expect(config.completeness.itemText.siblings!.listItem).toEqual({
        'en-US':
          '{isYou, select, true {Your brothers and sisters} other {{name}’s brothers and sisters}}',
      });
      expect(config.completeness.itemText.siblings!.noneButton).toEqual({
        'en-US': expect.any(String) as unknown as string,
      });
      expect(Object.keys(config.completeness.itemText).toSorted()).toEqual([
        'children',
        'details',
        'parents',
        'siblings',
      ]);
      expect(config.completeness.recommendedNote).toEqual({
        'en-US': 'Next again skips these.',
      });
      const result = await validateSynthetic(protocol);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('leaves gender identity out when the stage does not ask about it', async () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('FamilyPedigree', {
        askGenderIdentity: false,
      });
      const protocol = si.getProtocol();
      expect(stage.genderIdentity).toBeUndefined();
      const config = protocol.stages[0] as unknown as {
        nodeConfiguration: Record<string, unknown>;
      };
      expect(config.nodeConfiguration).toEqual({
        nameAttribute: stage.name,
        nameField: {
          prompt: { 'en-US': 'Name (optional)' },
          hint: {
            'en-US': expect.stringContaining('first name') as unknown as string,
          },
        },
        sexAssignedAtBirthAttribute: stage.sexAssignedAtBirth,
        egoAttribute: stage.ego,
      });
      // No gender identity variable is created either.
      type Typed = Record<string, { variables: Record<string, unknown> }>;
      const variables = (protocol.codebook.node as Typed)[stage.personType]!
        .variables;
      expect(Object.keys(variables)).toHaveLength(3);
      const result = await validateSynthetic(protocol);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('reuses a supplied person type and adds researcher form fields', async () => {
      const si = new SyntheticInterview();
      const person = si.addNodeType({ name: 'Relative' });
      const stage = si.addStage('FamilyPedigree', {
        subject: { entity: 'node', type: person.id },
        prompt: 'Draw your family',
        form: {
          fields: [{ component: 'Text', prompt: 'Occupation' }],
        },
      });
      stage.addFormField({ component: 'Toggle', prompt: 'Deceased' });

      const protocol = si.getProtocol();
      expect(stage.personType).toBe(person.id);
      const config = protocol.stages[0] as unknown as {
        prompt: LocalizedString;
        form: { fields: { prompt: LocalizedString }[] };
      };
      expect(config.prompt).toEqual({ 'en-US': 'Draw your family' });
      expect(config.form.fields.map((field) => field.prompt)).toEqual([
        { 'en-US': 'Occupation' },
        { 'en-US': 'Deceased' },
      ]);
      expect(config.form).not.toHaveProperty('title');

      const result = await validateSynthetic(protocol);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('seeds people and relationships a story writes onto it', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('FamilyPedigree', {
        initialNodes: { count: 2 },
      });
      si.setNodeAttribute(0, stage.ego, true);
      si.setNodeAttribute(1, stage.genderIdentity!, ['woman']);
      si.addEdges([[1, 0]], stage.edgeType);
      si.setEdgeAttribute(0, stage.kind, ['biological']);

      const network = si.getNetwork();
      expect(network.nodes).toHaveLength(2);
      expect(network.edges).toHaveLength(1);
      expect(network.edges[0]![entityAttributesProperty][stage.kind]).toEqual([
        'biological',
      ]);
    });
  });

  describe('edge variable codebook serialization', () => {
    it('serializes edge type variables in codebook', () => {
      const si = new SyntheticInterview();
      const et = si.addEdgeType({ name: 'Friendship' });
      et.addVariable({
        type: 'ordinal',
        name: 'Strength',
        options: [
          { label: 'Weak', value: 1 },
          { label: 'Strong', value: 3 },
        ],
      });

      const protocol = si.getProtocol();
      const edgeCodebook = protocol.codebook.edge[et.id] as Record<
        string,
        unknown
      >;
      expect(edgeCodebook.variables).toBeDefined();

      const variables = edgeCodebook.variables as Record<
        string,
        { name: string; type: string }
      >;
      const varEntries = Object.values(variables);
      expect(varEntries).toHaveLength(1);
      expect(varEntries[0]!.name).toBe('Strength');
      expect(varEntries[0]!.type).toBe('ordinal');
    });
  });

  describe('setEdgeAttribute', () => {
    it('sets explicit attribute values on edges', () => {
      const si = new SyntheticInterview();
      const et = si.addEdgeType({ name: 'Friendship' });
      const varRef = et.addVariable({
        type: 'ordinal',
        name: 'Strength',
        options: [
          { label: 'Weak', value: 1 },
          { label: 'Strong', value: 3 },
        ],
      });

      si.addStage('NameGenerator', { initialNodes: { count: 3 } });
      si.addEdges(
        [
          [0, 1],
          [1, 2],
        ],
        et.id,
      );

      si.setEdgeAttribute(0, varRef.id, 3);
      si.setEdgeAttribute(1, varRef.id, 1);

      const network = si.getNetwork();
      expect(network.edges[0]![entityAttributesProperty][varRef.id]).toBe(3);
      expect(network.edges[1]![entityAttributesProperty][varRef.id]).toBe(1);
    });

    it('throws for out-of-range edge index', () => {
      const si = new SyntheticInterview();
      expect(() => si.setEdgeAttribute(0, 'var', 1)).toThrow(/out of range/);
    });

    it('keeps explicitly unset node and edge variables absent', () => {
      const si = new SyntheticInterview(21);
      const nt = si.addNodeType({ name: 'Person' });
      const nodeVariable = nt.addVariable({ type: 'boolean', name: 'Flag' });
      const et = si.addEdgeType({ name: 'Friendship' });
      const edgeVariable = et.addVariable({ type: 'boolean', name: 'Flag' });

      si.addStage('NameGenerator', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 2 },
      });
      si.addEdges([[0, 1]], et.id);
      si.unsetNodeAttribute(0, nodeVariable.id);
      si.unsetEdgeAttribute(0, edgeVariable.id);

      const network = si.getNetwork();
      expect(network.nodes[0]![entityAttributesProperty]).not.toHaveProperty(
        nodeVariable.id,
      );
      expect(network.edges[0]![entityAttributesProperty]).not.toHaveProperty(
        edgeVariable.id,
      );
    });

    it('rejects malformed defined attributes on manual edges', () => {
      const si = new SyntheticInterview();
      const et = si.addEdgeType({ name: 'Friendship' });
      const flag = et.addVariable({ type: 'boolean', name: 'Flag' });

      si.addManualEdge(et.id, 'edge-1', 'person-1', 'person-2', {
        [flag.id]: { invalid: true },
      });

      expect(() => si.getNetwork()).toThrow();
    });
  });

  describe('stageMetadata passthrough', () => {
    it('passes stageMetadata through to interview payload', () => {
      const si = new SyntheticInterview();
      si.addStage('FamilyPedigree', { initialNodes: { count: 2 } });

      const metadata = {
        1: { hasSeenScaffoldPrompt: true, nodes: [] },
      };

      const payload = si.getInterviewPayload({
        currentStep: 1,
        stageMetadata: metadata,
      });

      expect(payload.stageMetadata).toEqual(metadata);
    });
  });

  describe('NetworkComposer', () => {
    it('auto-creates quickAdd, layout, and a default edge type', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NetworkComposer', {
        initialNodes: { count: 3 },
      });
      stage.addEdgeType();

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;

      expect(stageConfig.type).toBe('NetworkComposer');
      expect(stageConfig.quickAdd).toBeTruthy();
      expect(stageConfig.layoutVariable).toBeTruthy();

      const subject = stageConfig.subject as { entity: string; type: string };
      expect(subject.entity).toBe('node');

      const edges = stageConfig.edges as {
        id: string;
        subject: { entity: string; type: string };
      }[];
      expect(edges).toHaveLength(1);
      expect(edges[0]!.id).toBeTruthy();
      expect(edges[0]!.subject.entity).toBe('edge');
      expect(Object.keys(protocol.codebook.edge)).toContain(
        edges[0]!.subject.type,
      );
    });

    it('produces a stage that passes the NetworkComposer schema', () => {
      const si = new SyntheticInterview(1);
      const nt = si.addNodeType({ name: 'Person' });
      const quickAddVar = nt.addVariable({ type: 'text', name: 'name' });
      const layoutVar = nt.addVariable({
        type: 'layout',
        name: 'Composer Layout',
      });
      const friendship = si.addEdgeType({ name: 'Friendship' });

      const stage = si.addStage('NetworkComposer', {
        subject: { entity: 'node', type: nt.id },
        quickAdd: quickAddVar.id,
        layoutVariable: layoutVar.id,
        initialNodes: { count: 6 },
      });
      stage.addNodeFormField({ component: 'Number', label: 'Age' });
      stage.addEdgeType({
        type: friendship.id,
        form: { fields: [{ component: 'Toggle', label: 'Close friend?' }] },
      });
      stage.addEdgeType();

      const protocol = si.getProtocol();
      const builtStage = protocol.stages[0];

      const result = stageSchema.safeParse(builtStage);
      expect(result.success).toBe(true);
    });

    it('captions a field given no label with its variable name, as markdown that shows it as written', () => {
      const si = new SyntheticInterview();
      const person = si.addNodeType({ name: 'Person' });
      const nickname = person.addVariable({
        type: 'text',
        name: 'nick_name',
        component: 'Text',
      });
      const knows = si.addEdgeType({ name: 'Knows' });
      const note = knows.addVariable({
        type: 'text',
        name: 'Note',
        component: 'Text',
      });
      const stage = si.addStage('NetworkComposer', {
        subject: { entity: 'node', type: person.id },
      });
      stage.addNodeFormField({ variable: nickname.id, component: 'Text' });
      stage.addEdgeType({
        type: knows.id,
        form: { fields: [{ variable: note.id, component: 'Text' }] },
      });

      const builtStage = si.getProtocol().stages[0] as {
        nodeForm: { fields: { label: unknown }[] };
        edges: { form: { fields: { label: unknown }[] } }[];
      };
      expect(builtStage.nodeForm.fields[0]?.label).toEqual({
        'en-US': 'nick\\_name',
      });
      expect(builtStage.edges[0]?.form.fields[0]?.label).toEqual({
        'en-US': 'Note',
      });
      expect(stageSchema.safeParse(builtStage).success).toBe(true);
    });

    it('rejects duplicate edge subject types via the schema refinement', () => {
      const si = new SyntheticInterview(2);
      const friendship = si.addEdgeType({ name: 'Friendship' });
      const stage = si.addStage('NetworkComposer');
      stage.addEdgeType({ type: friendship.id });
      stage.addEdgeType({ type: friendship.id });

      const builtStage = si.getProtocol().stages[0];
      const result = stageSchema.safeParse(builtStage);
      expect(result.success).toBe(false);
    });

    it('omits nodeForm when no node form fields are added', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NetworkComposer');
      stage.addEdgeType();

      const stageConfig = si.getProtocol().stages[0] as Record<string, unknown>;
      expect(stageConfig.nodeForm).toBeUndefined();
    });

    it('emits the component on a NetworkComposer node attribute field', () => {
      const si = new SyntheticInterview();
      const node = si.addNodeType({ name: 'person' });
      const stage = si.addStage('NetworkComposer', {
        subject: { entity: 'node', type: node.id },
      });
      stage.addNodeFormField({ component: 'Number', label: 'Age' });
      const payload = si.getInterviewPayload();
      const composer = payload.protocol.stages.find(
        (s) => s.type === 'NetworkComposer',
      );
      expect((composer as Record<string, unknown>).nodeForm).toBeDefined();
      expect(
        (
          (composer as Record<string, unknown>).nodeForm as {
            fields: { component: string }[];
          }
        ).fields[0]?.component,
      ).toBe('Number');
    });

    it('draws builder nodes inside a NetworkComposer field date window', () => {
      const si = new SyntheticInterview(7);
      const node = si.addNodeType({ name: 'Person' });
      const born = node.addVariable({
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
      });
      const stage = si.addStage('NetworkComposer', {
        subject: { entity: 'node', type: node.id },
        initialNodes: { count: 3 },
      });
      stage.addNodeFormField({
        variable: born.id,
        component: 'RelativeDatePicker',
        parameters: { anchor: '2020-06-15', before: 0, after: 0 },
      });

      const values = si
        .getNetwork()
        .nodes.map((entry) => entry[entityAttributesProperty][born.id]);

      expect(values).toEqual(['2020-06-15', '2020-06-15', '2020-06-15']);
    });

    it('refuses disjoint ordinary-form and composer date windows', () => {
      const si = new SyntheticInterview(7);
      const node = si.addNodeType({ name: 'Person' });
      const born = node.addVariable({
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: {
          type: 'full',
          min: '2000-01-01',
          max: '2010-12-31',
        },
      });
      si.addStage('AlterForm', {
        subject: { entity: 'node', type: node.id },
        form: {
          fields: [
            {
              variable: born.id,
              component: 'DatePicker',
              prompt: 'When?',
            },
          ],
        },
      });
      const composer = si.addStage('NetworkComposer', {
        subject: { entity: 'node', type: node.id },
        initialNodes: { count: 1 },
      });
      composer.addNodeFormField({
        variable: born.id,
        component: 'DatePicker',
        parameters: {
          type: 'full',
          min: '2020-01-01',
          max: '2030-12-31',
        },
      });

      expect(() => si.getNetwork()).toThrow(
        'this protocol renders one attribute with incompatible date controls',
      );
    });

    it('rejects a non-node (edge) subject', () => {
      const si = new SyntheticInterview();
      const friendship = si.addEdgeType({ name: 'Friendship' });
      expect(() =>
        si.addStage('NetworkComposer', {
          subject: { entity: 'edge', type: friendship.id },
        }),
      ).toThrow(/node subject/);
    });
  });
});

describe('e2e-matrix builder extensions', () => {
  const filter: Filter = {
    join: 'AND',
    rules: [
      {
        id: 'rule-1',
        type: 'node',
        options: { type: 'person', operator: 'EXISTS' },
      },
    ],
  };

  it('emits skipLogic and stage-level filter on stage configs', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
      skipLogic: { action: 'SKIP', filter },
      filter,
    });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.skipLogic).toEqual({ action: 'SKIP', filter });
    expect(stage.filter).toEqual(filter);
  });

  it('emits skipLogic destinations (stage and finish) on stage configs', () => {
    const synth = new SyntheticInterview();
    const source = synth.addInformationStage({ title: 'Source' });
    synth.addInformationStage({
      title: 'Finish source',
      skipLogic: { action: 'SKIP', filter, destination: { type: 'finish' } },
    });
    const target = synth.addInformationStage({ title: 'Target' });
    // The handle's stageEntry is the stored entry, so setting skipLogic after
    // the destination stage exists flows into the emitted protocol.
    source.stageEntry.skipLogic = {
      action: 'SKIP',
      filter,
      destination: { type: 'stage', stageId: target.id },
    };
    const stages = synth.getProtocol().stages;
    expect(stages[0]?.skipLogic).toEqual({
      action: 'SKIP',
      filter,
      destination: { type: 'stage', stageId: target.id },
    });
    expect(stages[1]?.skipLogic).toEqual({
      action: 'SKIP',
      filter,
      destination: { type: 'finish' },
    });
  });

  it('emits panel filter', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const ng = synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
    });
    ng.addPanel({ title: 'Filtered', dataSource: 'existing', filter });
    const stage = synth.getProtocol().stages[0] as {
      panels: { filter?: unknown }[];
    };
    expect(stage.panels[0]?.filter).toEqual(filter);
  });

  it('passes hint/showValidationHints/parameters through form fields', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const af = synth.addStage('AlterForm', {
      subject: { entity: 'node', type: person.id },
    });
    af.addFormField({
      component: 'Text',
      hint: 'A helpful hint',
      showValidationHints: true,
      parameters: { minLabel: 'Low' },
    });
    const stage = synth.getProtocol().stages[0] as {
      form: { fields: Record<string, unknown>[] };
    };
    expect(stage.form.fields[0]?.hint).toEqual({ 'en-US': 'A helpful hint' });
    expect(stage.form.fields[0]?.showValidationHints).toBe(true);
  });

  it('never emits form.title on AlterForm/AlterEdgeForm', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('AlterForm', {
      subject: { entity: 'node', type: person.id },
      form: { title: 'Should be dropped', fields: [] },
    });
    const stage = synth.getProtocol().stages[0] as {
      form: Record<string, unknown>;
    };
    expect(stage.form).not.toHaveProperty('title');
  });

  it('passes sortOrder through Sociogram prompts', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const soc = synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
    });
    soc.addPrompt({
      sortOrder: [{ property: 'name', direction: 'asc' }],
    });
    const stage = synth.getProtocol().stages[0] as {
      prompts: { sortOrder?: unknown }[];
    };
    expect(stage.prompts[0]?.sortOrder).toEqual([
      { property: 'name', direction: 'asc' },
    ]);
  });

  it('emits Anonymisation validation', () => {
    const synth = new SyntheticInterview();
    synth.addStage('Anonymisation', {
      validation: { minLength: 4, maxLength: 12 },
    });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.validation).toEqual({ minLength: 4, maxLength: 12 });
  });

  it('emits protocol experiments only once they are set', () => {
    const synth = new SyntheticInterview();
    expect(synth.getInterviewPayload().protocol).not.toHaveProperty(
      'experiments',
    );

    synth.setExperiments({});
    expect(synth.getInterviewPayload().protocol.experiments).toStrictEqual({});
  });

  it('passes additionalAttributes through NameGenerator-family prompts', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const closeTie = person.addVariable({ type: 'boolean', name: 'closeTie' });
    const ng = synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
    });
    ng.addPrompt({
      text: 'Who is close to you?',
      additionalAttributes: [{ variable: closeTie.id, value: true }],
    });
    const stage = synth.getProtocol().stages[0] as {
      prompts: { additionalAttributes?: unknown }[];
    };
    expect(stage.prompts[0]?.additionalAttributes).toEqual([
      { variable: closeTie.id, value: true },
    ]);
  });

  it('emits encrypted on node text variables and rejects it on edge/ego', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const nameVar = person.addVariable({
      type: 'text',
      name: 'name',
      encrypted: true,
    });
    const codebook = synth.getProtocol().codebook as {
      node: Record<
        string,
        { variables: Record<string, { encrypted?: boolean }> }
      >;
    };
    expect(codebook.node[person.id]?.variables[nameVar.id]?.encrypted).toBe(
      true,
    );

    // Redeclaring an existing node variable with encrypted:true mutates the
    // existing entry rather than being silently dropped by the dedupe branch.
    const nameVarAgain = person.addVariable({
      type: 'text',
      name: 'name',
      encrypted: true,
    });
    expect(nameVarAgain.id).toBe(nameVar.id);

    // Edge/ego variables never carry `encrypted` — protocol-validation's
    // variable schema rejects it outright for those entities, so the builder
    // must not thread it through those paths at all.
    const colleague = synth.addEdgeType({ name: 'Colleague' });
    const edgeVar = colleague.addVariable({ type: 'text', name: 'note' });
    const codebookWithEdge = synth.getProtocol().codebook as {
      edge: Record<
        string,
        { variables: Record<string, { encrypted?: boolean }> }
      >;
    };
    expect(
      codebookWithEdge.edge[colleague.id]?.variables[edgeVar.id],
    ).not.toHaveProperty('encrypted');
  });

  it('emits interviewScript verbatim on stage configs', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
      interviewScript: 'Ask the participant who they trust.',
    });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.interviewScript).toBe('Ask the participant who they trust.');
  });

  it('passes hint/showValidationHints through NetworkComposer form fields', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const nc = synth.addStage('NetworkComposer', {
      subject: { entity: 'node', type: person.id },
    });
    nc.addNodeFormField({
      component: 'Text',
      label: 'Age',
      hint: 'Enter age in years',
      showValidationHints: true,
    });
    const stage = synth.getProtocol().stages[0] as {
      nodeForm: { fields: Record<string, unknown>[] };
    };
    expect(stage.nodeForm.fields[0]?.hint).toEqual({
      'en-US': 'Enter age in years',
    });
    expect(stage.nodeForm.fields[0]?.showValidationHints).toBe(true);
  });
});

describe('quickAdd variable reference', () => {
  it('defaults NameGeneratorQuickAdd.quickAdd to the seeded name variable id', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const stage = synth.addStage('NameGeneratorQuickAdd', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPrompt();
    const config = synth.getProtocol().stages[0] as { quickAdd: string };
    // The auto-seeded "name" variable is the node type's first variable.
    const nameVarId = synth.getVariableIds(person.id)[0];
    expect(config.quickAdd).toBe(nameVarId);
    expect(config.quickAdd).not.toBe('name');
  });
});

describe('addInformationStage items', () => {
  it('emits explicit items and interviewScript verbatim', () => {
    const synth = new SyntheticInterview();
    synth.addInformationStage({
      title: 'Media stage',
      interviewScript: 'Internal note.',
      items: [
        { id: 'item-a', type: 'text', content: 'Hello' },
        { id: 'item-b', type: 'asset', content: 'img-1', size: 'LARGE' },
      ],
    });
    const stage = synth.getProtocol().stages[0] as {
      items: { id: string; type: string }[];
      interviewScript?: string;
    };
    expect(stage.items.map((i) => i.id)).toEqual(['item-a', 'item-b']);
    expect(stage.interviewScript).toBe('Internal note.');
  });
});

describe('validation rules on generated nodes', () => {
  // Enough seeds that a rule satisfied by luck on one of them cannot pass:
  // two booleans agree half the time by chance, so a single seed proves
  // nothing about `sameAs`.
  const SEEDS = [1, 2, 7, 42, 99, 1234, 20260727];

  const attributesOf = (network: NcNetwork) =>
    network.nodes.map((node) => node[entityAttributesProperty]);

  it('gives every member of a sameAs pair one value', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const nt = si.addNodeType();
      const flagA = nt.addVariable({ type: 'boolean', name: 'flagA' });
      const flagB = nt.addVariable({
        type: 'boolean',
        name: 'flagB',
        validation: { sameAs: flagA.id },
      });
      si.addStage('Sociogram', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 8 },
      });

      for (const attrs of attributesOf(si.getNetwork())) {
        expect(attrs[flagB.id]).toBe(attrs[flagA.id]);
      }
    }
  });

  it('orders a comparison rule against the value its counterpart was given', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const nt = si.addNodeType();
      const low = nt.addVariable({
        type: 'number',
        name: 'low',
        validation: { minValue: 0, maxValue: 100 },
      });
      const high = nt.addVariable({
        type: 'number',
        name: 'high',
        validation: { minValue: 0, maxValue: 100, greaterThanVariable: low.id },
      });
      si.addStage('Sociogram', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 8 },
      });

      for (const attrs of attributesOf(si.getNetwork())) {
        expect(Number(attrs[high.id])).toBeGreaterThan(Number(attrs[low.id]));
      }
    }
  });

  it('keeps a differentFrom pair apart', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const nt = si.addNodeType();
      // A two-option ordinal, so a colliding draw is likely rather than
      // merely possible.
      const first = nt.addVariable({
        type: 'ordinal',
        name: 'first',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ],
      });
      const second = nt.addVariable({
        type: 'ordinal',
        name: 'second',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ],
        validation: { differentFrom: first.id },
      });
      si.addStage('Sociogram', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 8 },
      });

      for (const attrs of attributesOf(si.getNetwork())) {
        expect(attrs[second.id]).not.toBe(attrs[first.id]);
      }
    }
  });

  it('issues a unique variable no value twice across the whole network', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const nt = si.addNodeType();
      const codeName = nt.addVariable({
        type: 'text',
        name: 'codeName',
        validation: { unique: true },
      });
      // Two stages, so the registry has to be shared across them rather than
      // reset per stage.
      si.addStage('Sociogram', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 12 },
      });
      si.addStage('Narrative', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 12 },
      });

      const issued = attributesOf(si.getNetwork()).map(
        (attrs) => attrs[codeName.id],
      );
      expect(new Set(issued).size).toBe(issued.length);
    }
  });

  it('draws around a value the caller set outright', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const anchor = nt.addVariable({
      type: 'number',
      name: 'anchor',
      validation: { minValue: 0, maxValue: 100 },
    });
    const echo = nt.addVariable({
      type: 'number',
      name: 'echo',
      validation: { minValue: 0, maxValue: 100, sameAs: anchor.id },
    });
    const above = nt.addVariable({
      type: 'number',
      name: 'above',
      validation: {
        minValue: 0,
        maxValue: 100,
        greaterThanVariable: anchor.id,
      },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 4 },
    });
    si.setNodeAttribute(0, anchor.id, 12);

    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[anchor.id]).toBe(12);
    expect(attrs[echo.id]).toBe(12);
    expect(Number(attrs[above.id])).toBeGreaterThan(12);
  });

  it('never issues a unique value another node was given outright', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const nt = si.addNodeType();
      const flag = nt.addVariable({
        type: 'boolean',
        name: 'flag',
        validation: { unique: true },
      });
      // A boolean holds two values, so a node fixed to one leaves exactly one
      // for the draw — and the fixed node is the *last*, which a registry
      // populated as nodes are reached would not have seen in time.
      si.addStage('Sociogram', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 2 },
      });
      si.setNodeAttribute(1, flag.id, true);

      const issued = attributesOf(si.getNetwork()).map(
        (attrs) => attrs[flag.id],
      );
      expect(issued).toEqual([false, true]);
    }
  });

  it('refuses a unique value the caller sets on two nodes', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const codeName = nt.addVariable({
      type: 'text',
      name: 'codeName',
      validation: { unique: true },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 2 },
    });
    si.setNodeAttribute(0, codeName.id, 'Raven');
    si.setNodeAttribute(1, codeName.id, 'Raven');

    // The values are the caller's rather than drawn, so both would be copied
    // into the network: the draw never sees them, and claiming one value twice
    // keys the same set entry.
    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(
      /the caller sets this to "Raven" on two nodes, but unique allows one node to hold a value/,
    );
  });

  it('refuses a unique value two manual nodes were built with', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const codeName = nt.addVariable({
      type: 'text',
      name: 'codeName',
      validation: { unique: true },
    });
    const stage = si.addStage('Narrative', {
      subject: { entity: 'node', type: nt.id },
    });
    si.addManualNode(stage.id, nt.id, 'person-1', { [codeName.id]: 'Raven' });
    si.addManualNode(stage.id, nt.id, 'person-2', { [codeName.id]: 'Raven' });

    // A manual node keeps its unset attributes neutral, but the ones it was
    // built with are in the network verbatim — the same duplicate.
    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
  });

  it('reports every variable of a group the caller duplicated one value across', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const codeName = nt.addVariable({
      type: 'text',
      name: 'codeName',
      validation: { unique: true },
    });
    nt.addVariable({
      type: 'text',
      name: 'alias',
      validation: { sameAs: codeName.id },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 2 },
    });
    si.setNodeAttribute(0, codeName.id, 'Raven');
    si.setNodeAttribute(1, codeName.id, 'Raven');

    expect(() => si.getNetwork()).toThrow(
      /"codeName" and "alias" \(unique\): the caller sets these variables, which are held equal, to "Raven" on two nodes/,
    );
  });

  it('lets one node hold a unique value across every variable of its group', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const codeName = nt.addVariable({
      type: 'text',
      name: 'codeName',
      validation: { unique: true },
    });
    const alias = nt.addVariable({
      type: 'text',
      name: 'alias',
      validation: { sameAs: codeName.id },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 2 },
    });
    // Held equal, so they are issued from one slot: setting both spends a
    // single claim rather than colliding with itself.
    si.setNodeAttribute(0, codeName.id, 'Raven');
    si.setNodeAttribute(0, alias.id, 'Raven');

    const attrs = attributesOf(si.getNetwork());
    expect(attrs[0]![codeName.id]).toBe('Raven');
    expect(attrs[0]![alias.id]).toBe('Raven');
    expect(attrs[1]![codeName.id]).not.toBe('Raven');
  });

  it('lets the caller repeat a value a variable does not declare unique', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const label = nt.addVariable({ type: 'text', name: 'label' });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 2 },
    });
    si.setNodeAttribute(0, label.id, 'Raven');
    si.setNodeAttribute(1, label.id, 'Raven');

    const issued = attributesOf(si.getNetwork()).map(
      (attrs) => attrs[label.id],
    );
    expect(issued).toEqual(['Raven', 'Raven']);
  });

  it('refuses a codebook whose rules leave a node no value, rather than emitting one that breaks them', () => {
    // No feasibility pass runs here — its verdict is measured against how many
    // entities a `generateNetwork` run would fabricate, and this builder's
    // nodes are the ones the caller asked for. What refuses instead is the
    // draw, which runs out against the count that is actually being generated:
    // a boolean holds two values and this asks for three distinct ones.
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    nt.addVariable({
      type: 'boolean',
      name: 'flag',
      validation: { unique: true },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 3 },
    });

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(/cannot all be satisfied together/);
  });

  it('refuses a pair of values the caller sets that sameAs cannot hold', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const anchor = nt.addVariable({
      type: 'number',
      name: 'anchor',
      validation: { minValue: 0, maxValue: 100 },
    });
    const echo = nt.addVariable({
      type: 'number',
      name: 'echo',
      validation: { minValue: 0, maxValue: 100, sameAs: anchor.id },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });
    // Held to one value and given two: the node can carry either, and both are
    // the caller's, so there is no assignment that honours what was asked.
    si.setNodeAttribute(0, anchor.id, 10);
    si.setNodeAttribute(0, echo.id, 20);

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(
      /"anchor" and "echo" \(sameAs\): the caller sets these variables on one node to 10 and 20, which sameAs cannot hold/,
    );
  });

  it('refuses a comparator the caller sets the wrong way round', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const low = nt.addVariable({
      type: 'number',
      name: 'low',
      validation: { minValue: 0, maxValue: 100 },
    });
    const high = nt.addVariable({
      type: 'number',
      name: 'high',
      validation: { minValue: 0, maxValue: 100, greaterThanVariable: low.id },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });
    si.setNodeAttribute(0, low.id, 80);
    si.setNodeAttribute(0, high.id, 20);

    expect(() => si.getNetwork()).toThrow(/greaterThanVariable cannot hold/);
  });

  it('keeps a value the caller sets outside its own bounds', () => {
    // The deliberate counterpart to the two tests above. One value, named by
    // the caller, with nothing to weigh it against: setting an attribute is how
    // a story puts chosen data in front of an interface, and stories set values
    // no participant could have entered — an off-list option among them.
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const age = nt.addVariable({
      type: 'number',
      name: 'age',
      validation: { minValue: 18, maxValue: 90 },
    });
    const community = nt.addVariable({
      type: 'categorical',
      name: 'community',
      options: [
        { label: 'Family', value: 'family' },
        { label: 'Work', value: 'work' },
      ],
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });
    si.setNodeAttribute(0, age.id, 5);
    si.setNodeAttribute(0, community.id, ['biological']);

    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[age.id]).toBe(5);
    expect(attrs[community.id]).toEqual(['biological']);
  });

  it('refuses length rules that leave the draw no string to reach', () => {
    // The drawer has no way to report that it could not comply: it fits its
    // answer to whichever bound it can reach and emits it, so this used to
    // arrive as a ten-character value under a five-character ceiling.
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    nt.addVariable({
      type: 'text',
      name: 'bio',
      validation: { minLength: 10, maxLength: 5 },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 2 },
    });

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(
      /"bio" \(maxLength\): the closest value these rules leave drawable is "\w{10}", which maxLength rejects/,
    );
  });

  it('refuses value bounds that cross over', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    nt.addVariable({
      type: 'number',
      name: 'age',
      validation: { minValue: 50, maxValue: 10 },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });

    expect(() => si.getNetwork()).toThrow(/which maxValue rejects/);
  });

  it('refuses a selection ceiling the variable requires an answer above', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    nt.addVariable({
      type: 'categorical',
      name: 'interests',
      validation: { required: true, maxSelected: 0 },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });

    expect(() => si.getNetwork()).toThrow(/which required rejects/);
  });

  it('refuses a sameAs group whose members leave no value between them', () => {
    // Each variable's own bounds are satisfiable; held to one value they are
    // not, and the value that arrived was outside one of the two ranges.
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const early = nt.addVariable({
      type: 'number',
      name: 'early',
      validation: { minValue: 0, maxValue: 10 },
    });
    nt.addVariable({
      type: 'number',
      name: 'late',
      validation: { minValue: 20, maxValue: 30, sameAs: early.id },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(/which maxValue rejects/);
  });

  it('leaves a value the caller set to reach a drawn variable unjudged', () => {
    // `sameAs` hands the caller's value straight on, so refusing what the draw
    // did with it would refuse the value itself by another route — which the
    // test above this one says the builder does not do.
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const anchor = nt.addVariable({
      type: 'number',
      name: 'anchor',
      validation: { minValue: 18, maxValue: 90 },
    });
    const echo = nt.addVariable({
      type: 'number',
      name: 'echo',
      validation: { minValue: 18, maxValue: 90, sameAs: anchor.id },
    });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 1 },
    });
    si.setNodeAttribute(0, anchor.id, 5);

    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[anchor.id]).toBe(5);
    expect(attrs[echo.id]).toBe(5);
  });

  it('leaves a manual node its neutral values rather than solving them', () => {
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    const flagA = nt.addVariable({ type: 'boolean', name: 'flagA' });
    const flagB = nt.addVariable({
      type: 'boolean',
      name: 'flagB',
      validation: { sameAs: flagA.id },
    });
    const stage = si.addStage('Narrative', {
      subject: { entity: 'node', type: nt.id },
    });
    si.addManualNode(stage.id, nt.id, 'person-1', { [flagA.id]: true });

    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[flagA.id]).toBe(true);
    // `sameAs` would make this true; the manual contract says unanswered.
    expect(attrs[flagB.id]).toBe(false);
  });

  it('draws a codebook carrying no cross-variable rule to the values it always has', () => {
    // Every Storybook story's fixture is a codebook of this shape, so a drift
    // in what it draws rewrites every visual baseline at once. These values are
    // the ones the builder produces with personal names drawn from their own
    // deterministic stream, pinned so that moving them has to be a deliberate
    // act rather than a side effect of a change to the constraint machinery.
    // Date variables are left out: an open date window ends at today, which no
    // fixed expectation survives.
    const si = new SyntheticInterview(42);
    const nt = si.addNodeType();
    nt.addVariable({ type: 'text', name: 'label' });
    nt.addVariable({
      type: 'number',
      name: 'age',
      validation: { minValue: 18, maxValue: 90 },
    });
    nt.addVariable({
      type: 'number',
      name: 'small',
      validation: { maxValue: 9 },
    });
    nt.addVariable({ type: 'boolean', name: 'active' });
    nt.addVariable({ type: 'ordinal', name: 'rating' });
    nt.addVariable({ type: 'categorical', name: 'interests' });
    nt.addVariable({
      type: 'scalar',
      name: 'closeness',
      component: 'VisualAnalogScale',
    });
    nt.addVariable({ type: 'layout', name: 'position' });
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count: 4 },
    });

    const ids = si.getVariableIds(nt.id);
    const byName = attributesOf(si.getNetwork()).map((attrs) =>
      Object.fromEntries(
        [
          'name',
          'label',
          'age',
          'small',
          'active',
          'rating',
          'interests',
          'closeness',
          'position',
          // The node type seeds its own "name" variable ahead of these.
        ].map((name, at) => [name, attrs[ids[at]!]]),
      ),
    );

    expect(byName).toEqual([
      {
        name: 'Nikita Crist',
        label: 'Nikita',
        age: 61,
        small: -44,
        active: true,
        rating: 1,
        interests: ['family'],
        closeness: 0.06,
        position: { x: 0.1, y: 0.1 },
      },
      {
        name: 'Lilliana Wisozk',
        label: 'Moises',
        age: 19,
        small: 8,
        active: false,
        rating: 2,
        interests: ['work', 'school'],
        closeness: 0.21,
        position: { x: 0.27, y: 0.33 },
      },
      {
        name: 'Collin Leffler',
        label: 'Emelia',
        age: 56,
        small: -26,
        active: true,
        rating: 3,
        interests: ['school'],
        closeness: 0.61,
        position: { x: 0.44000000000000006, y: 0.56 },
      },
      {
        name: 'Lola Hilll',
        label: 'Georgianna',
        age: 51,
        small: -4,
        active: true,
        rating: 4,
        interests: ['neighborhood', 'family'],
        closeness: 0.51,
        position: { x: 0.61, y: 0.79 },
      },
    ]);
  });
});

describe('validation rules on generated edges', () => {
  // As for nodes: enough seeds that a rule satisfied by luck on one of them
  // cannot pass.
  const SEEDS = [1, 2, 7, 42, 99, 1234, 20260727];

  const attributesOf = (network: NcNetwork) =>
    network.edges.map((edge) => edge[entityAttributesProperty]);

  /** Two nodes and one edge type, the smallest thing that can carry an edge. */
  const twoNodes = (si: SyntheticInterview, count = 2) => {
    const nt = si.addNodeType();
    si.addStage('Sociogram', {
      subject: { entity: 'node', type: nt.id },
      initialNodes: { count },
    });
  };

  it('gives a procedural edge the variables its type declares', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const strength = et.addVariable({
      type: 'number',
      name: 'strength',
      validation: { required: true, minValue: 1, maxValue: 10 },
    });
    twoNodes(si);
    si.addEdges([[0, 1]], et.id);

    // The edge's attribute store starts empty and `getNetwork` once copied it
    // verbatim, so a required variable was absent rather than answered.
    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[strength.id]).toBeGreaterThanOrEqual(1);
    expect(attrs[strength.id]).toBeLessThanOrEqual(10);
  });

  it('gives every member of a sameAs pair one value', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const et = si.addEdgeType();
      const flagA = et.addVariable({ type: 'boolean', name: 'flagA' });
      const flagB = et.addVariable({
        type: 'boolean',
        name: 'flagB',
        validation: { sameAs: flagA.id },
      });
      twoNodes(si, 8);
      si.addEdges(
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
          [5, 6],
          [6, 7],
        ],
        et.id,
      );

      for (const attrs of attributesOf(si.getNetwork())) {
        expect(attrs[flagB.id]).toBe(attrs[flagA.id]);
      }
    }
  });

  it('orders a comparison rule against the value its counterpart was given', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const et = si.addEdgeType();
      const low = et.addVariable({
        type: 'number',
        name: 'low',
        validation: { minValue: 0, maxValue: 100 },
      });
      const high = et.addVariable({
        type: 'number',
        name: 'high',
        validation: { minValue: 0, maxValue: 100, greaterThanVariable: low.id },
      });
      twoNodes(si, 4);
      si.addEdges(
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
        et.id,
      );

      for (const attrs of attributesOf(si.getNetwork())) {
        expect(Number(attrs[high.id])).toBeGreaterThan(Number(attrs[low.id]));
      }
    }
  });

  it('issues a unique edge variable no value twice across the whole network', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const et = si.addEdgeType();
      const codeName = et.addVariable({
        type: 'text',
        name: 'codeName',
        validation: { unique: true },
      });
      twoNodes(si, 6);
      si.addEdges(
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
        et.id,
      );

      const issued = attributesOf(si.getNetwork()).map(
        (attrs) => attrs[codeName.id],
      );
      expect(new Set(issued).size).toBe(issued.length);
    }
  });

  it('draws around a value the caller set outright', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const anchor = et.addVariable({
      type: 'number',
      name: 'anchor',
      validation: { minValue: 0, maxValue: 100 },
    });
    const echo = et.addVariable({
      type: 'number',
      name: 'echo',
      validation: { minValue: 0, maxValue: 100, sameAs: anchor.id },
    });
    const above = et.addVariable({
      type: 'number',
      name: 'above',
      validation: {
        minValue: 0,
        maxValue: 100,
        greaterThanVariable: anchor.id,
      },
    });
    twoNodes(si);
    si.addEdges([[0, 1]], et.id);
    si.setEdgeAttribute(0, anchor.id, 12);

    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[anchor.id]).toBe(12);
    expect(attrs[echo.id]).toBe(12);
    expect(Number(attrs[above.id])).toBeGreaterThan(12);
  });

  it('refuses a pair of values the caller sets on one edge that sameAs cannot hold', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const anchor = et.addVariable({
      type: 'number',
      name: 'anchor',
      validation: { minValue: 0, maxValue: 100 },
    });
    const echo = et.addVariable({
      type: 'number',
      name: 'echo',
      validation: { minValue: 0, maxValue: 100, sameAs: anchor.id },
    });
    twoNodes(si);
    si.addEdges([[0, 1]], et.id);
    si.setEdgeAttribute(0, anchor.id, 10);
    si.setEdgeAttribute(0, echo.id, 20);

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(
      /the caller sets these variables on one edge to 10 and 20, which sameAs cannot hold/,
    );
  });

  it('refuses length rules that leave an edge draw no string to reach', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    et.addVariable({
      type: 'text',
      name: 'note',
      validation: { minLength: 10, maxLength: 5 },
    });
    twoNodes(si);
    si.addEdges([[0, 1]], et.id);

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(/which maxLength rejects/);
  });

  it('never issues a unique value another edge was given outright', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const et = si.addEdgeType();
      const flag = et.addVariable({
        type: 'boolean',
        name: 'flag',
        validation: { unique: true },
      });
      twoNodes(si, 3);
      si.addEdges(
        [
          [0, 1],
          [1, 2],
        ],
        et.id,
      );
      // A boolean holds two values, so an edge fixed to one leaves exactly one
      // for the draw — and the fixed edge is the *last*, which a registry
      // populated as edges are reached would not have seen in time.
      si.setEdgeAttribute(1, flag.id, true);

      const issued = attributesOf(si.getNetwork()).map(
        (attrs) => attrs[flag.id],
      );
      expect(issued).toEqual([false, true]);
    }
  });

  it('refuses a unique value the caller sets on two edges', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const codeName = et.addVariable({
      type: 'text',
      name: 'codeName',
      validation: { unique: true },
    });
    twoNodes(si, 3);
    si.addEdges(
      [
        [0, 1],
        [1, 2],
      ],
      et.id,
    );
    si.setEdgeAttribute(0, codeName.id, 'Raven');
    si.setEdgeAttribute(1, codeName.id, 'Raven');

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(
      /the caller sets this to "Raven" on two edges, but unique allows one edge to hold a value/,
    );
  });

  it('refuses a unique value two manual edges were built with', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const codeName = et.addVariable({
      type: 'text',
      name: 'codeName',
      validation: { unique: true },
    });
    twoNodes(si);

    const [from, to] = si.getNodeEntries();
    si.addManualEdge(et.id, 'edge-1', from!.uid, to!.uid, {
      [codeName.id]: 'Raven',
    });
    si.addManualEdge(et.id, 'edge-2', to!.uid, from!.uid, {
      [codeName.id]: 'Raven',
    });

    // A manual edge keeps its unset attributes neutral, but the ones it was
    // built with are in the network verbatim — the same duplicate.
    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
  });

  it('leaves a manual edge its neutral values rather than solving them', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const flagA = et.addVariable({ type: 'boolean', name: 'flagA' });
    const flagB = et.addVariable({
      type: 'boolean',
      name: 'flagB',
      validation: { sameAs: flagA.id },
    });
    twoNodes(si);

    const [from, to] = si.getNodeEntries();
    si.addManualEdge(et.id, 'edge-1', from!.uid, to!.uid, {
      [flagA.id]: true,
    });

    const attrs = attributesOf(si.getNetwork())[0]!;
    expect(attrs[flagA.id]).toBe(true);
    // `sameAs` would make this true; the manual contract says unanswered.
    expect(attrs[flagB.id]).toBe(false);
  });

  it('lets the caller repeat a value an edge variable does not declare unique', () => {
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    const label = et.addVariable({ type: 'text', name: 'label' });
    twoNodes(si, 3);
    si.addEdges(
      [
        [0, 1],
        [1, 2],
      ],
      et.id,
    );
    si.setEdgeAttribute(0, label.id, 'Raven');
    si.setEdgeAttribute(1, label.id, 'Raven');

    const issued = attributesOf(si.getNetwork()).map(
      (attrs) => attrs[label.id],
    );
    expect(issued).toEqual(['Raven', 'Raven']);
  });

  it('refuses an edge codebook whose rules leave an edge no value', () => {
    // No feasibility pass runs for edges either: `worstCaseEntityCounts` models
    // what a `generateNetwork` run fabricates from stage behaviours, while
    // these edges are the ones the caller asked for by name. What refuses
    // instead is the draw, running out against the count actually generated —
    // a boolean holds two values and this asks for three distinct ones.
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    et.addVariable({
      type: 'boolean',
      name: 'flag',
      validation: { unique: true },
    });
    twoNodes(si, 4);
    si.addEdges(
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      et.id,
    );

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    expect(() => si.getNetwork()).toThrow(/cannot all be satisfied together/);
  });

  it('leaves an edge type carrying no variables its empty attributes', () => {
    // Most story fixtures declare edge types with no variables at all, and
    // this is why generating edge attributes leaves them untouched.
    const si = new SyntheticInterview(42);
    const et = si.addEdgeType();
    twoNodes(si, 3);
    si.addEdges(
      [
        [0, 1],
        [1, 2],
      ],
      et.id,
    );

    expect(attributesOf(si.getNetwork())).toEqual([{}, {}]);
  });
});

describe('validation rules on the generated ego', () => {
  // As for nodes and edges: enough seeds that a rule satisfied by luck on one
  // of them cannot pass. There is only ever one ego, so a seed is the only
  // repetition available.
  const SEEDS = [1, 2, 7, 42, 99, 1234, 20260727];

  const egoAttributesOf = (network: NcNetwork) =>
    network.ego[entityAttributesProperty];

  it('answers a required ego variable rather than leaving it absent', () => {
    const si = new SyntheticInterview(42);
    const age = si.addEgoVariable({
      type: 'number',
      name: 'age',
      validation: { required: true, minValue: 18, maxValue: 90 },
    });
    si.addStage('EgoForm');

    // `getNetwork` once hard-coded the ego's attributes to `{}`, so a required
    // ego variable arrived absent and every ego form rendered empty.
    const attrs = egoAttributesOf(si.getNetwork());
    expect(attrs).toHaveProperty(age.id);
    expect(attrs[age.id]).toBeGreaterThanOrEqual(18);
    expect(attrs[age.id]).toBeLessThanOrEqual(90);
  });

  it('gives every member of a sameAs pair one value', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const code = si.addEgoVariable({ type: 'text', name: 'code' });
      const codeConfirm = si.addEgoVariable({
        type: 'text',
        name: 'codeConfirm',
        validation: { sameAs: code.id },
      });

      const attrs = egoAttributesOf(si.getNetwork());
      expect(attrs[codeConfirm.id]).toBe(attrs[code.id]);
      expect(attrs[code.id]).not.toBeUndefined();
    }
  });

  it('orders a comparison rule against the value its counterpart was given', () => {
    for (const seed of SEEDS) {
      const si = new SyntheticInterview(seed);
      const age = si.addEgoVariable({
        type: 'number',
        name: 'age',
        validation: { minValue: 18, maxValue: 65 },
      });
      const retirementAge = si.addEgoVariable({
        type: 'number',
        name: 'retirementAge',
        validation: {
          minValue: 18,
          maxValue: 90,
          greaterThanVariable: age.id,
        },
      });

      const attrs = egoAttributesOf(si.getNetwork());
      expect(Number(attrs[retirementAge.id])).toBeGreaterThan(
        Number(attrs[age.id]),
      );
    }
  });

  it('keeps a differentFrom pair apart', () => {
    for (const seed of SEEDS) {
      // A two-option ordinal, so a colliding draw is likely rather than
      // merely possible.
      const options = [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
      ];
      const si = new SyntheticInterview(seed);
      const first = si.addEgoVariable({
        type: 'ordinal',
        name: 'first',
        options,
      });
      const second = si.addEgoVariable({
        type: 'ordinal',
        name: 'second',
        options,
        validation: { differentFrom: first.id },
      });

      const attrs = egoAttributesOf(si.getNetwork());
      expect(attrs[second.id]).not.toBe(attrs[first.id]);
    }
  });

  it('refuses an ego codebook whose rules leave ego no value', () => {
    const si = new SyntheticInterview(42);
    si.addEgoVariable({
      type: 'text',
      name: 'bio',
      validation: { minLength: 10, maxLength: 5 },
    });

    // Reported without an entity type, because the codebook holds one ego
    // section rather than a map of named types.
    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    try {
      si.getNetwork();
    } catch (error) {
      expect(error).toBeInstanceOf(SyntheticDataConstraintError);
      const [conflict] = (error as SyntheticDataConstraintError).conflicts;
      expect(conflict).toMatchObject({
        entity: 'ego',
        variableNames: ['bio'],
        rules: ['maxLength'],
      });
      expect(conflict).not.toHaveProperty('entityType');
      expect(conflict).not.toHaveProperty('entityTypeName');
    }
  });

  it('leaves an interview declaring no ego variables its empty attributes', () => {
    const si = new SyntheticInterview(42);
    si.addStage('Sociogram', { initialNodes: { count: 2 } });

    expect(egoAttributesOf(si.getNetwork())).toEqual({});
  });

  it('draws without disturbing the values its nodes and edges were given', () => {
    // Ego is drawn after the entities precisely so that adding an ego variable
    // to a fixture cannot move the node and edge values a story or a snapshot
    // was built around.
    const build = (withEgo: boolean) => {
      const si = new SyntheticInterview(42);
      if (withEgo) {
        si.addEgoVariable({ type: 'text', name: 'nickname' });
        si.addEgoVariable({ type: 'number', name: 'age' });
      }
      const nt = si.addNodeType();
      nt.addVariable({ type: 'number', name: 'closeness' });
      const et = si.addEdgeType();
      et.addVariable({ type: 'text', name: 'note' });
      si.addStage('Sociogram', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 4 },
      });
      si.addEdges(
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
        et.id,
      );
      return si.getNetwork();
    };

    // Compared as values rather than whole entities: declaring an ego variable
    // advances the builder's own id counter, so the variable ids the two
    // networks key their attributes by differ while the drawn values do not.
    const drawnValues = (network: NcNetwork) => [
      ...network.nodes.map((node) =>
        Object.values(node[entityAttributesProperty]),
      ),
      ...network.edges.map((edge) =>
        Object.values(edge[entityAttributesProperty]),
      ),
    ];

    const withEgo = build(true);
    const withoutEgo = build(false);
    expect(drawnValues(withEgo)).toEqual(drawnValues(withoutEgo));
    expect(Object.keys(egoAttributesOf(withEgo))).toHaveLength(2);
  });

  it('refuses unique on an ego variable', () => {
    // Unlike a node or edge type, ego has exactly one instance, so `unique`
    // is trivially satisfiable and the draw below would happily emit it —
    // but the runtime `unique` validator invariants on `stageSubject.entity
    // !== 'ego'` and throws the moment an EgoForm submits one (see `unique`
    // in packages/fresco-ui/src/form/validation/functions.ts), and
    // generateNetwork's own feasibility pass refuses the same declaration
    // before drawing anything (see `analyseEntity` in
    // generateNetwork/constraints/feasibility.ts). This builder must refuse
    // it the same way, at construction, rather than handing a schema-valid
    // payload to an EgoForm that crashes on submit.
    const si = new SyntheticInterview(42);
    si.addEgoVariable({
      type: 'text',
      name: 'ssn',
      validation: { unique: true },
    });
    si.addStage('EgoForm');

    expect(() => si.getNetwork()).toThrow(SyntheticDataConstraintError);
    try {
      si.getNetwork();
    } catch (error) {
      expect(error).toBeInstanceOf(SyntheticDataConstraintError);
      const [conflict] = (error as SyntheticDataConstraintError).conflicts;
      expect(conflict).toMatchObject({
        entity: 'ego',
        variableNames: ['ssn'],
        rules: ['unique'],
        reason: 'unique is not supported on ego variables',
      });
      expect(conflict).not.toHaveProperty('entityType');
      expect(conflict).not.toHaveProperty('entityTypeName');
    }
  });

  it('still generates an ego variable that does not declare unique', () => {
    // Guards the refusal above against being too broad: a plain ego
    // variable, with no `unique`, must keep drawing normally.
    const si = new SyntheticInterview(42);
    const nickname = si.addEgoVariable({ type: 'text', name: 'nickname' });
    si.addStage('EgoForm');

    const attrs = egoAttributesOf(si.getNetwork());
    expect(attrs).toHaveProperty(nickname.id);
    expect(typeof attrs[nickname.id]).toBe('string');
  });
});

// The builder's output carries no protocol name, which the schema requires;
// everything else that is parsed came from the builder.
const expectValid = (synth: SyntheticInterview) => {
  const { localization, schemaVersion, codebook, stages } = synth.getProtocol();
  const result = CurrentProtocolSchema.safeParse({
    name: 'Localized protocol',
    localization,
    schemaVersion,
    codebook,
    stages,
  });
  expect(result.error?.issues ?? []).toEqual([]);
  if (!result.success) throw new Error('The built protocol is invalid');
  return result.data;
};

describe('localization', () => {
  it('declares en-US as the only language by default', () => {
    const synth = new SyntheticInterview();
    const stage = synth.addStage('NameGenerator', { label: 'Friends' });
    stage.addPrompt({ text: 'Name your friends' });
    stage.addFormField({ component: 'Text', prompt: 'Name' });

    const protocol = expectValid(synth);
    expect(protocol.localization).toEqual({
      defaultLocale: 'en-US',
      locales: ['en-US'],
    });
    expect(protocol.stages[0]?.label).toEqual({ 'en-US': 'Friends' });
  });

  it('escapes plain text into an ICU literal message', () => {
    const synth = new SyntheticInterview();
    const stage = synth.addStage('NameGenerator', {
      label: "Don't skip {this}",
    });
    stage.addPrompt({ text: 'Who uses {curly} braces?' });
    stage.addFormField({ component: 'Text', prompt: 'Name' });

    const built = expectValid(synth).stages[0];
    if (built?.type !== 'NameGenerator') {
      throw new Error('Expected a NameGenerator stage');
    }
    expect(built.label).toEqual({ 'en-US': "Don't skip '{'this'}'" });
    const text = built.prompts[0]?.text;
    expect(text).toEqual({ 'en-US': "Who uses '{'curly'}' braces?" });
    expect(messageText(text?.['en-US'] ?? '')).toBe('Who uses {curly} braces?');
  });

  it('labels codebook entries with their names unless given a label', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const friend = synth.addEdgeType({
      name: 'Friend',
      label: 'Close friend',
    });
    const age = person.addVariable({ name: 'age', type: 'number' });
    const closeness = friend.addVariable({
      name: 'closeness',
      label: 'How close?',
      type: 'ordinal',
      options: [
        { label: 'Very close', value: 1 },
        { label: 'Distant', value: 2 },
      ],
    });
    const mood = synth.addEgoVariable({ name: 'mood', type: 'text' });

    const { codebook } = expectValid(synth);
    const personType = codebook.node?.[person.id];
    const friendType = codebook.edge?.[friend.id];
    expect(personType?.label).toEqual({ 'en-US': 'Person' });
    expect(personType?.variables?.[age.id]?.label).toBe('age');
    expect(friendType?.label).toEqual({ 'en-US': 'Close friend' });
    expect(friendType?.variables?.[closeness.id]).toMatchObject({
      label: 'How close?',
      options: [
        { label: { 'en-US': 'Very close' }, value: 1 },
        { label: { 'en-US': 'Distant' }, value: 2 },
      ],
    });
    expect(codebook.ego?.variables?.[mood.id]?.label).toBe('mood');
  });

  it('writes plain text in a default language set after it was added', () => {
    const synth = new SyntheticInterview();
    const stage = synth.addStage('NameGenerator', { label: 'Amigos' });
    stage.addPrompt({ text: 'Nombra a tus amigos' });
    stage.addFormField({ component: 'Text', prompt: 'Nombre' });
    synth.setLocalization({ defaultLocale: 'es', locales: ['es'] });

    const protocol = expectValid(synth);
    expect(protocol.localization).toEqual({
      defaultLocale: 'es',
      locales: ['es'],
    });
    expect(protocol.stages[0]?.label).toEqual({ es: 'Amigos' });
  });

  it('emits locale maps as written in a multi-language protocol', () => {
    const synth = new SyntheticInterview();
    synth.setLocalization({
      defaultLocale: 'en-US',
      locales: ['en-US', 'es', 'ar'],
    });
    const person = synth.addNodeType({
      name: 'Person',
      label: { 'en-US': 'Person', 'es': 'Persona', 'ar': 'شخص' },
    });
    const closeness = person.addVariable({
      name: 'closeness',
      type: 'ordinal',
      options: [
        {
          label: { 'en-US': 'Close', 'es': 'Cercano', 'ar': 'قريب' },
          value: 1,
        },
        {
          label: { 'en-US': 'Distant', 'es': 'Lejano', 'ar': 'بعيد' },
          value: 2,
        },
      ],
    });
    const stage = synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
      label: { 'en-US': 'Friends', 'es': 'Amigos', 'ar': 'أصدقاء' },
    });
    stage.addPrompt({
      text: {
        'en-US': 'Name your friends',
        'es': 'Nombra a tus amigos',
        'ar': 'اذكر أصدقاءك',
      },
    });
    stage.addFormField({
      component: 'Text',
      prompt: { 'en-US': 'Name', 'es': 'Nombre', 'ar': 'الاسم' },
    });
    // Plain text is written in the default language only.
    stage.addPanel({ title: 'Previous contacts' });

    const protocol = expectValid(synth);
    expect(protocol.localization).toEqual({
      defaultLocale: 'en-US',
      locales: ['en-US', 'es', 'ar'],
    });
    const personType = protocol.codebook.node?.[person.id];
    expect(personType?.label).toEqual({
      'en-US': 'Person',
      'es': 'Persona',
      'ar': 'شخص',
    });
    expect(personType?.variables?.[closeness.id]).toMatchObject({
      options: [
        {
          label: { 'en-US': 'Close', 'es': 'Cercano', 'ar': 'قريب' },
          value: 1,
        },
        {
          label: { 'en-US': 'Distant', 'es': 'Lejano', 'ar': 'بعيد' },
          value: 2,
        },
      ],
    });

    const built = protocol.stages[0];
    if (built?.type !== 'NameGenerator') {
      throw new Error('Expected a NameGenerator stage');
    }
    expect(built.prompts[0]?.text).toEqual({
      'en-US': 'Name your friends',
      'es': 'Nombra a tus amigos',
      'ar': 'اذكر أصدقاءك',
    });
    expect(built.panels?.[0]?.title).toEqual({
      'en-US': 'Previous contacts',
    });

    const missing = analyzeProtocolLocalization(protocol).filter((warning) =>
      warning.path.includes('panels'),
    );
    expect(missing.map(({ locale }) => locale)).toEqual(['es', 'ar']);
  });

  it('names an auto-created variable from the default-language caption', () => {
    const synth = new SyntheticInterview();
    synth.setLocalization({ defaultLocale: 'es', locales: ['en-US', 'es'] });
    const stage = synth.addStage('EgoForm', {
      introductionPanel: { title: 'Sobre ti', text: 'Cuéntanos de ti.' },
    });
    stage.addFormField({
      component: 'Text',
      prompt: { 'en-US': 'Your nickname', 'es': "Tu apodo '{'casa'}'" },
    });

    const variables = expectValid(synth).codebook.ego?.variables ?? {};
    expect(Object.values(variables).map(({ name }) => name)).toContain(
      'Tu apodo {casa}',
    );
  });
});

describe('LanguageChooser stage', () => {
  it('builds a subjectless stage', () => {
    const synth = new SyntheticInterview();
    synth.addStage('LanguageChooser');

    const stage = expectValid(synth).stages[0];
    expect(stage?.type).toBe('LanguageChooser');
    expect(stage).not.toHaveProperty('subject');
  });

  it('adds nothing to the generated network', () => {
    const synth = new SyntheticInterview();
    synth.addStage('LanguageChooser');

    const network = synth.getNetwork();
    expect(network.nodes).toEqual([]);
    expect(network.edges).toEqual([]);
  });
});

describe('FinishSession stage', () => {
  it('ends a protocol built without one at a finish stage with the supplied text', () => {
    const synth = new SyntheticInterview();
    synth.setLocalization({ defaultLocale: 'en', locales: ['en', 'es'] });
    synth.addInformationStage({ title: 'Welcome' });

    const { stages } = expectValid(synth);
    expect(stages).toHaveLength(2);
    expect(stages[1]).toEqual({
      id: 'finish',
      type: 'FinishSession',
      label: { en: 'Finish Interview', es: 'Finalizar entrevista' },
      title: { en: 'Finish Interview', es: 'Finalizar entrevista' },
      content: {
        en: 'You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
        es: 'Has llegado al final de la entrevista. Si estás conforme con la información que has introducido, puedes finalizar la entrevista ahora.',
      },
      outcome: 'completed',
    });
  });

  it('writes English under a default language with no supplied text', () => {
    const synth = new SyntheticInterview();
    synth.setLocalization({ defaultLocale: 'ja', locales: ['ja'] });

    const stage = expectValid(synth).stages.at(-1);
    expect(stage).toMatchObject({
      type: 'FinishSession',
      title: { ja: 'Finish Interview' },
    });
  });

  it('keeps a finish stage the fixture adds, and adds no second one', () => {
    const synth = new SyntheticInterview();
    synth.addInformationStage({ title: 'Welcome' });
    synth.addFinishSessionStage({
      title: 'Not eligible',
      content: 'Thank you for your time.',
      outcome: 'ineligible',
    });

    const { stages } = expectValid(synth);
    expect(stages).toHaveLength(2);
    expect(stages[1]).toMatchObject({
      type: 'FinishSession',
      label: { 'en-US': 'Not eligible' },
      title: { 'en-US': 'Not eligible' },
      content: { 'en-US': 'Thank you for your time.' },
      outcome: 'ineligible',
    });
  });

  it('adds nothing to the generated network', () => {
    const synth = new SyntheticInterview();
    synth.addFinishSessionStage();

    const network = synth.getNetwork();
    expect(network.nodes).toEqual([]);
    expect(network.edges).toEqual([]);
  });
});
