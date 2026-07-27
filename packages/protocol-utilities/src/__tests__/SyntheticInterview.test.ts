import { describe, expect, it } from 'vitest';

import { type Filter, stageSchema } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { SyntheticDataConstraintError } from '../generateNetwork/constraints/error';
import { SyntheticInterview } from '../SyntheticInterview';

describe('SyntheticInterview', () => {
  describe('determinism', () => {
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

      expect(a.getNetwork()).toEqual(b.getNetwork());
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
      const prompts = stageConfig.prompts as { text: string }[];
      const panels = stageConfig.panels as { title: string }[];
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.text).toBe('Name your friends');
      expect(panels).toHaveLength(1);
      expect(panels[0]!.title).toBe('Previous contacts');
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
        text: string;
        layout: { layoutVariable: string };
        edges: { create: string; display: string[] };
        highlight: { allowHighlighting: boolean; variable: string };
      }[];
      expect(prompts).toHaveLength(1);

      const prompt = prompts[0]!;
      expect(prompt.text).toBe('Place people');
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
        label: string;
        layoutVariable: string;
        groupVariable: string;
        highlight: string[];
      }[];
      expect(presets).toHaveLength(1);

      const preset = presets[0]!;
      expect(preset.label).toBe('Full View');
      expect(preset.layoutVariable).toBeTruthy();
      expect(preset.groupVariable).toBeTruthy();
      expect(preset.highlight).toHaveLength(1);
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
      const affected = nt.addVariable({ type: 'boolean', name: 'affected' });
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

      const stage = si.addStage('Narrative', {
        subject: { entity: 'node', type: nt.id },
      });
      si.addManualNode(stage.id, nt.id, 'person-1', { [isEgo.id]: true });

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
      const prompts = stageConfig.prompts as { text: string }[];
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.text).toBe('Name your friends');
    });

    it('supports panels', () => {
      const si = new SyntheticInterview();
      const stage = si.addStage('NameGeneratorQuickAdd');
      stage.addPrompt();
      stage.addPanel({ title: 'Existing' });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const panels = stageConfig.panels as { title: string }[];
      expect(panels).toHaveLength(1);
      expect(panels[0]!.title).toBe('Existing');
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
        negativeLabel: string;
      }[];
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.createEdge).toBe(et.id);
      expect(prompts[0]!.edgeVariable).toBe(varRef.id);
      expect(prompts[0]!.negativeLabel).toBe('No Friendship');
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
        title: string;
        body: string;
      };
      expect(explText.title).toBe('Protect Your Data');
      expect(explText.body).toBe('Enter a passphrase.');
    });

    it('provides default explanationText', () => {
      const si = new SyntheticInterview();
      si.addStage('Anonymisation');

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      const explText = stageConfig.explanationText as {
        title: string;
        body: string;
      };
      expect(explText.title).toBeTruthy();
      expect(explText.body).toBeTruthy();
    });
  });

  describe('FamilyPedigree', () => {
    it('creates stage with new config structure', () => {
      const si = new SyntheticInterview();
      const nt = si.addNodeType({ name: 'Person' });
      const et = si.addEdgeType({ name: 'Family' });
      const relVar = et.addVariable({
        type: 'categorical',
        name: 'Relationship',
        options: [
          { label: 'Parent', value: 'parent' },
          { label: 'Child', value: 'child' },
        ],
      });
      nt.addVariable({
        type: 'categorical',
        name: 'Sex',
        options: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
        ],
      });
      const nameVar = nt.addVariable({ type: 'text', name: 'Name' });
      const egoVar = nt.addVariable({ type: 'boolean', name: 'Is Ego' });
      const relToEgoVar = nt.addVariable({
        type: 'text',
        name: 'Rel to Ego',
      });
      const bioSexVar = nt.addVariable({
        type: 'text',
        name: 'Biological Sex',
      });
      const isActiveVar = et.addVariable({
        type: 'boolean',
        name: 'Is Active',
      });
      const isGestVar = et.addVariable({
        type: 'boolean',
        name: 'Is Gest Carrier',
      });

      const stage = si.addStage('FamilyPedigree', {
        subject: { entity: 'node', type: nt.id },
        initialNodes: { count: 3 },
        nodeConfig: {
          type: nt.id,
          nodeLabelVariable: nameVar.id,
          egoVariable: egoVar.id,
          relationshipVariable: relToEgoVar.id,
          biologicalSexVariable: bioSexVar.id,
          form: [{ variable: nameVar.id, prompt: 'Name' }],
        },
        edgeConfig: {
          type: et.id,
          relationshipTypeVariable: relVar.id,
          isActiveVariable: isActiveVar.id,
          isGestationalCarrierVariable: isGestVar.id,
        },
        censusPrompt: 'Build your family pedigree',
      });
      stage.addDiseaseNominationStep({
        text: 'Who has the disease?',
        variable: 'hasDisease',
      });

      const protocol = si.getProtocol();
      const stageConfig = protocol.stages[0] as Record<string, unknown>;
      expect(stageConfig.type).toBe('FamilyPedigree');

      const nodeConfig = stageConfig.nodeConfig as Record<string, unknown>;
      expect(nodeConfig.type).toBe(nt.id);
      expect(nodeConfig.nodeLabelVariable).toBe(nameVar.id);

      const edgeConfig = stageConfig.edgeConfig as Record<string, unknown>;
      expect(edgeConfig.type).toBe(et.id);
      expect(edgeConfig.relationshipTypeVariable).toBe(relVar.id);
      expect(edgeConfig.isActiveVariable).toBe(isActiveVar.id);

      expect(stageConfig.censusPrompt).toBe('Build your family pedigree');
      expect(stageConfig.label).toBeDefined();

      const nomPrompts = stageConfig.nominationPrompts as {
        text: string;
        variable: string;
      }[];
      expect(nomPrompts).toHaveLength(1);
      expect(nomPrompts[0]!.text).toBe('Who has the disease?');
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
    expect(stage.form.fields[0]?.hint).toBe('A helpful hint');
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

  it('emits Anonymisation validation and protocol experiments', () => {
    const synth = new SyntheticInterview();
    synth.addStage('Anonymisation', {
      validation: { minLength: 4, maxLength: 12 },
    });
    synth.setExperiments({ encryptedVariables: true });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.validation).toEqual({ minLength: 4, maxLength: 12 });
    const payload = synth.getInterviewPayload();
    expect(payload.protocol.experiments).toEqual({ encryptedVariables: true });
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
    expect(stage.nodeForm.fields[0]?.hint).toBe('Enter age in years');
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
    // the ones the builder produced before nodes were drawn as whole entities,
    // pinned so that moving them has to be a deliberate act rather than a side
    // effect of a change to the constraint machinery. Date variables are left
    // out: an open date window ends at today, which no fixed expectation
    // survives.
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
        name: 'Mohammad',
        label: 'Charlie',
        age: 22,
        small: 1,
        active: false,
        rating: 1,
        interests: ['family'],
        closeness: 0.71,
        position: { x: 0.1, y: 0.1 },
      },
      {
        name: 'Rey',
        label: 'Claudia',
        age: 40,
        small: -20,
        active: true,
        rating: 2,
        interests: ['work', 'school'],
        closeness: 0.29,
        position: { x: 0.27, y: 0.33 },
      },
      {
        name: 'Edgar',
        label: 'Pearl',
        age: 32,
        small: -21,
        active: false,
        rating: 3,
        interests: ['school'],
        closeness: 0.05,
        position: { x: 0.44000000000000006, y: 0.56 },
      },
      {
        name: 'Arnold',
        label: 'Presley',
        age: 40,
        small: -47,
        active: false,
        rating: 4,
        interests: ['neighborhood', 'family'],
        closeness: 0.44,
        position: { x: 0.61, y: 0.79 },
      },
    ]);
  });
});
