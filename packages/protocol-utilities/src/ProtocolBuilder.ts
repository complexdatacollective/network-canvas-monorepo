import { invariant } from 'es-toolkit';

import type {
  Asset,
  ComponentType,
  CurrentProtocol,
  Item,
  Stage,
  StageType,
  VariableType,
} from '@codaco/protocol-validation';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import {
  type NcNetwork,
  type VariableValue,
  VariableValueSchema,
} from '@codaco/shared-consts';

import {
  COMPONENT_TO_VARIABLE_TYPE,
  DEFAULT_CATEGORICAL_OPTIONS,
  DEFAULT_ORDINAL_OPTIONS,
  EDGE_COLORS,
  NODE_COLORS,
  ORDINAL_COLORS,
} from './constants';
import { PromptTextGenerator } from './promptText';
import {
  type EdgeOverrideEntry,
  generateInterviews,
  type NodeOverrideEntry,
  type SessionOverrides,
} from './synthetic-interviews';
import { DEFAULT_SYNTHETIC_SEED } from './synthetic-interviews/constants';
import type {
  AddCategoricalBinPromptInput,
  AddDiseaseNominationStepInput,
  AddDyadCensusPromptInput,
  AddEdgeTypeInput,
  AddGeospatialPromptInput,
  AddNetworkComposerEdgeInput,
  AddNodeTypeInput,
  AddOneToManyDyadCensusPromptInput,
  AddOrdinalBinPromptInput,
  AddPresetInput,
  AddPromptInput,
  AddStageInput,
  AddTieStrengthCensusPromptInput,
  AddVariableInput,
  CategoricalBinPromptEntry,
  DiseaseNominationStepEntry,
  DyadCensusPromptEntry,
  EdgeEntry,
  EdgeTypeEntry,
  FilterInput,
  FormFieldInput,
  GeospatialPromptEntry,
  GetSessionInput,
  NameGeneratorPromptEntry,
  NetworkComposerEdgeEntry,
  NetworkComposerFormFieldEntry,
  NetworkComposerFormFieldInput,
  NodeEntry,
  NodeTypeEntry,
  OneToManyDyadCensusPromptEntry,
  OrdinalBinPromptEntry,
  PresetEntry,
  SkipLogicInput,
  SociogramPromptEntry,
  StageEntry,
  TieStrengthCensusPromptEntry,
  VariableEntry,
} from './types';

const omittedAttributeValue = Symbol('omittedAttributeValue');

type VariableRef = {
  id: string;
};

type NodeTypeHandle = {
  id: string;
  addVariable: (opts?: AddVariableInput) => VariableRef;
  setShape: (shape: NodeTypeEntry['shape']) => void;
};

type EdgeTypeHandle = {
  id: string;
  addVariable: (opts?: AddVariableInput) => VariableRef;
};

type StageHandleBase = {
  id: string;
  stageEntry: StageEntry;
};

type AddFormFieldOpts = {
  component: ComponentType;
  variable?: string;
  prompt?: string;
  hint?: string;
  showValidationHints?: boolean;
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};

type AddPanelOpts = {
  title?: string;
  dataSource?: string;
  filter?: FilterInput;
};

type NameGeneratorHandle = StageHandleBase & {
  addFormField: (opts: AddFormFieldOpts) => void;
  addPrompt: (opts?: AddPromptInput) => void;
  addPanel: (opts?: AddPanelOpts) => void;
};

type NameGeneratorQuickAddHandle = StageHandleBase & {
  addPrompt: (opts?: AddPromptInput) => void;
  addPanel: (opts?: AddPanelOpts) => void;
};

type NameGeneratorRosterHandle = StageHandleBase & {
  addPrompt: (opts?: AddPromptInput) => void;
};

type SociogramHandle = StageHandleBase & {
  addPrompt: (opts?: AddPromptInput) => void;
};

type NarrativeHandle = StageHandleBase & {
  addPreset: (opts?: AddPresetInput) => void;
};

type DyadCensusHandle = StageHandleBase & {
  addPrompt: (opts?: AddDyadCensusPromptInput) => void;
};

type OneToManyDyadCensusHandle = StageHandleBase & {
  addPrompt: (opts?: AddOneToManyDyadCensusPromptInput) => void;
};

type OrdinalBinHandle = StageHandleBase & {
  addPrompt: (opts?: AddOrdinalBinPromptInput) => void;
};

type CategoricalBinHandle = StageHandleBase & {
  addPrompt: (opts?: AddCategoricalBinPromptInput) => void;
};

type EgoFormHandle = StageHandleBase & {
  addFormField: (opts: AddFormFieldOpts) => void;
};

type InformationHandle = StageHandleBase;

type TieStrengthCensusHandle = StageHandleBase & {
  addPrompt: (opts?: AddTieStrengthCensusPromptInput) => void;
};

type AlterFormHandle = StageHandleBase & {
  addFormField: (opts: AddFormFieldOpts) => void;
};

type AlterEdgeFormHandle = StageHandleBase & {
  addFormField: (opts: AddFormFieldOpts) => void;
};

type AnonymisationHandle = StageHandleBase;

type FamilyPedigreeHandle = StageHandleBase & {
  addDiseaseNominationStep: (opts?: AddDiseaseNominationStepInput) => void;
};

type GeospatialHandle = StageHandleBase & {
  addPrompt: (opts?: AddGeospatialPromptInput) => void;
};

type NarrativePedigreeHandle = StageHandleBase;
type NetworkComposerHandle = StageHandleBase & {
  // Each call appends an entry to the stage's `edges[]`, returning the edge
  // type id so callers can seed edges of that type via `addEdges`.
  addEdgeType: (opts?: AddNetworkComposerEdgeInput) => { id: string };
  addNodeFormField: (opts: NetworkComposerFormFieldInput) => void;
};

type StageHandleMap = {
  NameGenerator: NameGeneratorHandle;
  NameGeneratorQuickAdd: NameGeneratorQuickAddHandle;
  NameGeneratorRoster: NameGeneratorRosterHandle;
  Sociogram: SociogramHandle;
  Narrative: NarrativeHandle;
  DyadCensus: DyadCensusHandle;
  OneToManyDyadCensus: OneToManyDyadCensusHandle;
  OrdinalBin: OrdinalBinHandle;
  CategoricalBin: CategoricalBinHandle;
  EgoForm: EgoFormHandle;
  Information: InformationHandle;
  TieStrengthCensus: TieStrengthCensusHandle;
  AlterForm: AlterFormHandle;
  AlterEdgeForm: AlterEdgeFormHandle;
  Anonymisation: AnonymisationHandle;
  FamilyPedigree: FamilyPedigreeHandle;
  Geospatial: GeospatialHandle;
  NarrativePedigree: NarrativePedigreeHandle;
  NetworkComposer: NetworkComposerHandle;
};

// Stage types that have no subject (node/edge)
const SUBJECTLESS_STAGES = new Set<StageType>([
  'EgoForm',
  'Information',
  'Anonymisation',
  'NarrativePedigree',
]);

// Stage types where the subject is an edge, not a node
const EDGE_SUBJECT_STAGES = new Set<StageType>(['AlterEdgeForm']);

/**
 * The instant the delegate anchors a payload's start window to. A fixture's
 * timestamps carry no meaning of their own — they exist so a payload is a
 * complete, byte-reproducible session — so the anchor is pinned rather than
 * read off the clock, which would give the same recipe different bytes on
 * different days.
 */
const PAYLOAD_START_ANCHOR = '2025-01-01T00:00:00.000Z';

/**
 * A codebook variable name derived from a field's participant-facing text.
 *
 * A form field may be written as `{ component, prompt }` (or the composer's
 * `{ component, label }`) without naming a variable, and the builder then
 * creates one named after that text. But the text is what a participant
 * reads — "What is their name?" — while `VariableNameSchema` allows only
 * `/^[a-zA-Z0-9._:-]+$/`, so using it verbatim writes a codebook the protocol
 * schema rejects. Nothing caught that until `getProtocolParsed()` began
 * parsing the document.
 *
 * Disallowed runs are dropped and the character after each is capitalised, so
 * the words stay legible ("WhatIsTheirName") and the same text always yields
 * the same name — the builder dedupes variables by name, so the mapping has
 * to be a function of the text alone. Text with nothing usable in it yields
 * undefined, leaving the caller's own default to name the variable.
 */
function variableNameFromDisplayText(text: string): string | undefined {
  const name = text.replace(
    /[^a-zA-Z0-9._:-]+(.)?/g,
    (_match, next: string | undefined) => (next ? next.toUpperCase() : ''),
  );
  return name.length > 0 ? name : undefined;
}

/**
 * Fluent builder for synthetic protocols: codebooks, stages, prompts, and
 * forms, terminating in {@link ProtocolBuilder.getProtocol}. Used by
 * @codaco/interview's Storybook stories, capture stories, and the e2e matrix
 * to stand up a protocol without authoring one in Architect.
 *
 * It builds a PROTOCOL and, through `initialNodes`/`addManualNode`/
 * `setNodeAttribute` and their edge counterparts, a deliberately-constructed
 * network to seed a scenario with. It does not generate interview DATA of its
 * own: {@link ProtocolBuilder.getInterviewPayload} delegates to
 * `generateInterviews`, handing the seeded entities over as the engine's
 * `overrides` channel — the value-drawing half of the original builder
 * belonged to the deleted `generateNetwork` engine.
 */
export class ProtocolBuilder {
  private seed: number;
  private idCounter = 0;
  private promptText: PromptTextGenerator;
  private nodeTypes = new Map<string, NodeTypeEntry>();
  private edgeTypes = new Map<string, EdgeTypeEntry>();
  private stages: StageEntry[] = [];
  private nodes: NodeEntry[] = [];
  private edges: EdgeEntry[] = [];
  private assets: Record<string, unknown>[] = [];
  private egoVariables = new Map<string, VariableEntry>();
  private nodeTypeCounter = 0;
  private edgeTypeCounter = 0;
  private ordinalPromptCounter = 0;
  private experiments: { encryptedVariables?: boolean } | null = null;
  private parsedProtocol: CurrentProtocol | null = null;
  private parsedFingerprint: string | null = null;

  constructor(seed = DEFAULT_SYNTHETIC_SEED) {
    this.seed = seed;
    this.promptText = new PromptTextGenerator(seed);
  }

  private nextId(prefix: string): string {
    this.idCounter++;
    return `${prefix}-${this.seed}-${this.idCounter}`;
  }

  // --- Manual codebook API ---

  addNodeType(opts?: AddNodeTypeInput): NodeTypeHandle {
    const id = this.nextId('node-type');
    const colorIndex = this.nodeTypeCounter % NODE_COLORS.length;
    this.nodeTypeCounter++;

    const entry: NodeTypeEntry = {
      id,
      name: opts?.name ?? `Person ${this.nodeTypeCounter}`,
      color: opts?.color ?? NODE_COLORS[colorIndex]!,
      icon: opts?.icon ?? 'add-a-person',
      shape: opts?.shape ?? { default: 'circle' },
      variables: new Map(),
    };

    // Seed a "name" text variable so generated initial nodes receive a
    // realistic full name via ValueGenerator. Without this, nodes render with
    // the type's display name (e.g. "Person") as their fallback label.
    const nameVarId = this.nextId('var');
    entry.variables.set(nameVarId, {
      id: nameVarId,
      name: 'name',
      type: 'text',
    });

    this.nodeTypes.set(id, entry);

    const handle: NodeTypeHandle = {
      id,
      addVariable: (varOpts?: AddVariableInput) =>
        this.addVariableToNodeType(id, varOpts),
      setShape: (shape: NodeTypeEntry['shape']) => {
        entry.shape = shape;
      },
    };

    return handle;
  }

  addEdgeType(opts?: AddEdgeTypeInput): EdgeTypeHandle {
    const id = this.nextId('edge-type');
    const colorIndex = this.edgeTypeCounter % EDGE_COLORS.length;
    this.edgeTypeCounter++;

    const entry: EdgeTypeEntry = {
      id,
      name: opts?.name ?? `Edge ${this.edgeTypeCounter}`,
      color: opts?.color ?? EDGE_COLORS[colorIndex]!,
      variables: new Map(),
    };

    this.edgeTypes.set(id, entry);

    return {
      id,
      addVariable: (varOpts?: AddVariableInput) =>
        this.addVariableToEdgeType(id, varOpts),
    };
  }

  addVariableToNodeType(
    nodeTypeId: string,
    opts?: AddVariableInput,
  ): VariableRef {
    const nodeType = this.nodeTypes.get(nodeTypeId);
    if (!nodeType) {
      throw new Error(`Node type "${nodeTypeId}" not found`);
    }

    const type = this.resolveVariableType(opts);
    const name = opts?.name ?? this.defaultVariableName(type);

    // Dedupe by name. addNodeType seeds a "name" text variable for faker-driven
    // initial nodes; callers re-declaring it (or any other name) get the existing
    // handle so external-data UUID replacement and protocol references stay aligned.
    const existing = this.findVariableByName(nodeType.variables, name);
    if (existing) {
      if (existing.type !== type) {
        throw new Error(
          `Variable "${name}" already exists on node type "${nodeTypeId}" with type "${existing.type}"; cannot redeclare as "${type}".`,
        );
      }
      // Redeclaring with encrypted:true must not be silently dropped — the
      // auto-seeded "name" variable is the most common encryption target.
      if (opts?.encrypted) {
        existing.encrypted = true;
      }
      return { id: existing.id };
    }

    const varId = opts?.id ?? this.nextId('var');
    const options = this.resolveOptions(type, opts?.options);

    const entry: VariableEntry = {
      id: varId,
      name,
      type,
      component: opts?.component,
      options,
      validation: opts?.validation,
      parameters: opts?.parameters,
      encrypted: opts?.encrypted,
    };

    nodeType.variables.set(varId, entry);
    return { id: varId };
  }

  addVariableToEdgeType(
    edgeTypeId: string,
    opts?: AddVariableInput,
  ): VariableRef {
    const edgeType = this.edgeTypes.get(edgeTypeId);
    if (!edgeType) {
      throw new Error(`Edge type "${edgeTypeId}" not found`);
    }

    const type = this.resolveVariableType(opts);
    const name = opts?.name ?? this.defaultVariableName(type);

    const existing = this.findVariableByName(edgeType.variables, name);
    if (existing) {
      if (existing.type !== type) {
        throw new Error(
          `Variable "${name}" already exists on edge type "${edgeTypeId}" with type "${existing.type}"; cannot redeclare as "${type}".`,
        );
      }
      return { id: existing.id };
    }

    const varId = opts?.id ?? this.nextId('var');
    const options = this.resolveOptions(type, opts?.options);

    const entry: VariableEntry = {
      id: varId,
      name,
      type,
      component: opts?.component,
      options,
      validation: opts?.validation,
      parameters: opts?.parameters,
    };

    edgeType.variables.set(varId, entry);
    return { id: varId };
  }

  private findVariableByName(
    variables: Map<string, VariableEntry>,
    name: string,
  ): VariableEntry | undefined {
    for (const entry of variables.values()) {
      if (entry.name === name) return entry;
    }
    return undefined;
  }

  addEgoVariable(opts?: AddVariableInput): VariableRef {
    const varId = this.nextId('ego-var');
    const type = this.resolveVariableType(opts);
    const options = this.resolveOptions(type, opts?.options);

    const entry: VariableEntry = {
      id: varId,
      name: opts?.name ?? this.defaultVariableName(type),
      type,
      component: opts?.component,
      options,
      validation: opts?.validation,
      parameters: opts?.parameters,
    };

    this.egoVariables.set(varId, entry);
    return { id: varId };
  }

  // --- Stage API ---

  addStage<T extends StageType>(
    type: T,
    opts?: AddStageInput,
  ): StageHandleMap[T] {
    const stageId = this.nextId('stage');

    // Resolve subject based on stage type
    let subject = opts?.subject;
    if (!subject && !SUBJECTLESS_STAGES.has(type)) {
      if (EDGE_SUBJECT_STAGES.has(type)) {
        // Edge-based stages need an edge type subject
        let edgeTypeId: string;
        if (this.edgeTypes.size > 0) {
          edgeTypeId = this.edgeTypes.keys().next().value!;
        } else {
          edgeTypeId = this.addEdgeType().id;
        }
        subject = { entity: 'edge', type: edgeTypeId };
      } else {
        let nodeTypeId: string;
        if (this.nodeTypes.size > 0) {
          nodeTypeId = this.nodeTypes.keys().next().value!;
        } else {
          nodeTypeId = this.addNodeType().id;
        }
        subject = { entity: 'node', type: nodeTypeId };
      }
    }

    // OneToManyDyadCensus requires behaviours.removeAfterConsideration
    const behaviours =
      type === 'OneToManyDyadCensus'
        ? {
            removeAfterConsideration:
              opts?.behaviours?.removeAfterConsideration ?? false,
            ...opts?.behaviours,
          }
        : opts?.behaviours;

    const entry: StageEntry = {
      id: stageId,
      type,
      label: opts?.label ?? type,
      interviewScript: opts?.interviewScript,
      skipLogic: opts?.skipLogic,
      filter: opts?.filter,
      subject,
      prompts: [],
      presets: [],
      panels: [],
      background:
        type === 'Sociogram' ||
        type === 'Narrative' ||
        type === 'NetworkComposer'
          ? (opts?.background ?? { concentricCircles: 4 })
          : opts?.background,
      behaviours,
      introductionPanel: opts?.introductionPanel
        ? {
            title: opts.introductionPanel.title || 'Introduction',
            text: opts.introductionPanel.text || 'Please continue.',
          }
        : type === 'DyadCensus' || type === 'TieStrengthCensus'
          ? { title: 'Introduction', text: 'Please continue.' }
          : type === 'AlterForm' || type === 'AlterEdgeForm'
            ? {
                title: opts?.introductionPanel?.title || 'Introduction',
                text: opts?.introductionPanel?.text || 'Please continue.',
              }
            : undefined,
      initialEdges: opts?.initialEdges ?? [],
      // Remembered so the delegate can list the stage in its overrides (its
      // output is predetermined even at a count of 0) and author the constant
      // count the parse candidate carries (plan D21).
      initialNodes: opts?.initialNodes,
    };

    // Handle form fields for NameGenerator (node-based)
    if (
      opts?.form &&
      subject?.entity === 'node' &&
      (type === 'NameGenerator' ||
        type === 'AlterForm' ||
        type === 'FamilyPedigree')
    ) {
      const fields = opts.form.fields.map((f) =>
        this.resolveFormField(f, subject.type),
      );
      entry.form = {
        title: opts.form.title ?? 'Add a person',
        fields,
      };
    }

    // Handle form fields for AlterEdgeForm (edge-based)
    if (opts?.form && subject?.entity === 'edge') {
      const fields = opts.form.fields.map((f) =>
        this.resolveEdgeFormField(f, subject.type),
      );
      entry.form = {
        title: opts.form.title ?? 'Describe this relationship',
        fields,
      };
    }

    // NameGeneratorQuickAdd
    if (type === 'NameGeneratorQuickAdd') {
      if (opts?.quickAdd) {
        entry.quickAdd = opts.quickAdd;
      } else {
        // The schema requires a variable ID reference, not a display name —
        // dedupe-resolve to the "name" text variable addNodeType seeds.
        const ref = this.addVariableToNodeType(subject!.type, {
          type: 'text',
          name: 'name',
        });
        entry.quickAdd = ref.id;
      }
    }

    // NameGeneratorRoster
    if (type === 'NameGeneratorRoster') {
      entry.dataSource = opts?.dataSource ?? 'externalData';
      if (opts?.cardOptions) {
        entry.cardOptions = {
          additionalProperties: opts.cardOptions.additionalProperties,
        };
      }
      if (opts?.sortOptions) {
        entry.sortOptions = {
          sortOrder: opts.sortOptions.sortOrder ?? [
            { property: 'name', direction: 'asc' },
          ],
          sortableProperties: opts.sortOptions.sortableProperties ?? [],
        };
      }
      if (opts?.searchOptions) {
        entry.searchOptions = {
          fuzziness: opts.searchOptions.fuzziness ?? 0.6,
          matchProperties: opts.searchOptions.matchProperties ?? ['name'],
        };
      }
    }

    // Anonymisation
    if (type === 'Anonymisation') {
      entry.explanationText = {
        title: opts?.explanationText?.title ?? 'Data Anonymisation',
        body:
          opts?.explanationText?.body ??
          'Please enter a passphrase to protect your data.',
      };
      if (opts?.validation) {
        entry.validation = opts.validation;
      }
    }

    // FamilyPedigree
    if (type === 'FamilyPedigree') {
      // Defaulted config slots register REAL codebook variables (text and
      // boolean shapes, which the schema's interface-owned option checks pass
      // over): the schema refuses a reference to a variable the codebook does
      // not declare, so a dangling id would make every defaulted pedigree
      // recipe unparseable.
      if (opts?.nodeConfig) {
        entry.nodeConfig = {
          ...opts.nodeConfig,
          form: opts.nodeConfig.form ?? [],
        };
      } else if (subject) {
        entry.nodeConfig = {
          type: subject.type,
          nodeLabelVariable: this.addVariableToNodeType(subject.type, {
            type: 'text',
            name: 'name',
          }).id,
          egoVariable: this.addVariableToNodeType(subject.type, {
            type: 'boolean',
            name: 'isEgo',
          }).id,
          relationshipVariable: this.addVariableToNodeType(subject.type, {
            type: 'text',
            name: 'relationshipToEgo',
          }).id,
          biologicalSexVariable: this.addVariableToNodeType(subject.type, {
            type: 'text',
            name: 'biologicalSex',
          }).id,
          form: [],
        };
      }

      if (opts?.edgeConfig) {
        const edgeTypeId = opts.edgeConfig.type;
        const isActiveVar =
          opts.edgeConfig.isActiveVariable ??
          this.addVariableToEdgeType(edgeTypeId, {
            type: 'boolean',
            name: 'isActive',
          }).id;
        const isGestCarrierVar =
          opts.edgeConfig.isGestationalCarrierVariable ??
          this.addVariableToEdgeType(edgeTypeId, {
            type: 'boolean',
            name: 'isGestationalCarrier',
          }).id;
        const gameteRoleVar =
          opts.edgeConfig.gameteRoleVariable ??
          this.addVariableToEdgeType(edgeTypeId, {
            type: 'text',
            name: 'gameteRole',
          }).id;
        entry.edgeConfig = {
          type: edgeTypeId,
          relationshipTypeVariable: opts.edgeConfig.relationshipTypeVariable,
          isActiveVariable: isActiveVar,
          isGestationalCarrierVariable: isGestCarrierVar,
          gameteRoleVariable: gameteRoleVar,
        };
      } else {
        let edgeTypeId: string;
        if (this.edgeTypes.size > 0) {
          edgeTypeId = this.edgeTypes.keys().next().value!;
        } else {
          edgeTypeId = this.addEdgeType({ name: 'Family' }).id;
        }
        entry.edgeConfig = {
          type: edgeTypeId,
          relationshipTypeVariable: this.addVariableToEdgeType(edgeTypeId, {
            type: 'text',
            name: 'relationshipType',
          }).id,
          isActiveVariable: this.addVariableToEdgeType(edgeTypeId, {
            type: 'boolean',
            name: 'isActive',
          }).id,
          isGestationalCarrierVariable: this.addVariableToEdgeType(edgeTypeId, {
            type: 'boolean',
            name: 'isGestationalCarrier',
          }).id,
          gameteRoleVariable: this.addVariableToEdgeType(edgeTypeId, {
            type: 'text',
            name: 'gameteRole',
          }).id,
        };
      }

      entry.censusPrompt =
        opts?.censusPrompt ??
        this.promptText.generatePromptText('FamilyPedigree');

      entry.nominationPrompts = opts?.nominationPrompts ?? [];

      // Required by the stage schema, so a defaulted recipe still parses.
      entry.framing = opts?.framing ?? { mode: 'participantChoice' };
      entry.boundaries = opts?.boundaries ?? {
        requireGrandparents: 'off',
        requireChildrenContributors: 'off',
      };

      if (opts?.introScreen) {
        entry.introScreen = opts.introScreen;
      }
    }

    // Geospatial
    if (type === 'Geospatial') {
      // mapOptions is required for Geospatial stages
      if (opts?.mapOptions) {
        entry.mapOptions = opts.mapOptions;
      } else {
        // Provide sensible defaults for testing/Storybook
        entry.mapOptions = {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6298, 41.8781], // Chicago
          initialZoom: 11,
          dataSourceAssetId: 'geojson-data',
          color: 'node-color-seq-1',
          targetFeatureProperty: 'name',
        };
      }
    }

    // NarrativePedigree
    if (type === 'NarrativePedigree') {
      if (opts?.sourceStageId) {
        entry.narrativePedigreeSourceStageId = opts.sourceStageId;
      }
      if (opts?.diseases) {
        entry.narrativePedigreeDiseases = opts.diseases;
      }
      if (opts?.showAtRiskStatuses !== undefined) {
        entry.narrativePedigreeShowAtRiskStatuses = opts.showAtRiskStatuses;
      }
    }

    // NetworkComposer
    if (type === 'NetworkComposer') {
      if (subject?.entity !== 'node') {
        throw new Error('NetworkComposer stages require a node subject');
      }

      const nodeTypeId = subject.type;

      // quickAdd is a text variable populated by the inline add field. Mirror
      // NameGeneratorQuickAdd's default of 'name' (the variable addNodeType
      // seeds), but accept an explicit ref.
      if (opts?.quickAdd) {
        entry.quickAdd = opts.quickAdd;
      } else {
        const ref = this.addVariableToNodeType(nodeTypeId, {
          type: 'text',
          name: 'name',
        });
        entry.quickAdd = ref.id;
      }

      // layoutVariable stores each node's { x, y } position.
      if (opts?.layoutVariable) {
        entry.layoutVariable = opts.layoutVariable;
      } else {
        const ref = this.addVariableToNodeType(nodeTypeId, {
          type: 'layout',
          name: 'composerLayout',
        });
        entry.layoutVariable = ref.id;
      }

      if (opts?.nodeForm) {
        entry.nodeForm = {
          fields: opts.nodeForm.fields.map((f) =>
            this.resolveNetworkComposerFormField(f, nodeTypeId),
          ),
        };
      }

      if (opts?.convexHullVariable) {
        entry.convexHullVariable = opts.convexHullVariable;
      }

      entry.networkComposerEdges = [];
    }

    // Generate initial nodes (only for node-based stages)
    const initialNodeCount = opts?.initialNodes?.count ?? 0;
    const initialNodePromptIndex = opts?.initialNodes?.promptIndex;
    if (initialNodeCount > 0 && subject?.entity === 'node') {
      for (let i = 0; i < initialNodeCount; i++) {
        this.nodes.push({
          uid: this.nextId('node'),
          type: subject.type,
          stageId,
          promptIDs: [],
          promptIndices:
            initialNodePromptIndex !== undefined
              ? [initialNodePromptIndex]
              : undefined,
          explicitAttributes: {},
        });
      }
    }

    // Generate initial edges
    if (entry.initialEdges.length > 0) {
      const stageNodes = this.nodes.filter((n) => n.stageId === stageId);
      for (const [fromIdx, toIdx] of entry.initialEdges) {
        const fromNode = stageNodes[fromIdx];
        const toNode = stageNodes[toIdx];
        if (fromNode && toNode) {
          // Use first edge type or create one
          let edgeTypeId: string;
          if (this.edgeTypes.size > 0) {
            edgeTypeId = this.edgeTypes.keys().next().value!;
          } else {
            edgeTypeId = this.addEdgeType().id;
          }
          this.edges.push({
            uid: this.nextId('edge'),
            type: edgeTypeId,
            from: fromNode.uid,
            to: toNode.uid,
            attributes: {},
          });
        }
      }
    }

    this.stages.push(entry);

    return this.createStageHandle(type, entry);
  }

  addInformationStage(opts?: {
    title?: string;
    text?: string;
    label?: string;
    interviewScript?: string;
    skipLogic?: SkipLogicInput;
    items?: Item[];
  }): InformationHandle {
    const stageId = this.nextId('stage');
    const title = opts?.title ?? 'Information';
    const text = opts?.text ?? '';

    const entry: StageEntry = {
      id: stageId,
      type: 'Information',
      label: opts?.label ?? title,
      interviewScript: opts?.interviewScript,
      skipLogic: opts?.skipLogic,
      title,
      items:
        opts?.items ??
        (text
          ? [{ id: this.nextId('item'), type: 'text', content: text }]
          : []),
      prompts: [],
      presets: [],
      panels: [],
      initialEdges: [],
    };

    this.stages.push(entry);
    return { id: stageId, stageEntry: entry };
  }

  private createStageHandle<T extends StageType>(
    type: T,
    entry: StageEntry,
  ): StageHandleMap[T] {
    const base: StageHandleBase = {
      id: entry.id,
      stageEntry: entry,
    };

    switch (type) {
      case 'NameGenerator':
        return {
          ...base,
          addFormField: (opts: AddFormFieldOpts) => {
            const field = this.resolveFormField(
              {
                component: opts.component,
                variable: opts.variable,
                prompt: opts.prompt,
                hint: opts.hint,
                showValidationHints: opts.showValidationHints,
                parameters: opts.parameters,
                validation: opts.validation,
              },
              entry.subject!.type,
            );
            entry.form ??= { title: 'Add a person', fields: [] };
            entry.form.fields.push(field);
          },
          addPrompt: (opts?: AddPromptInput) => {
            entry.prompts.push(this.resolvePrompt(opts, entry));
          },
          addPanel: (opts?: AddPanelOpts) => {
            entry.panels.push({
              id: this.nextId('panel'),
              title: opts?.title ?? 'Panel',
              dataSource: opts?.dataSource ?? 'existing',
              ...(opts?.filter ? { filter: opts.filter } : {}),
            });
          },
        } as StageHandleMap[T];

      case 'NameGeneratorQuickAdd':
        return {
          ...base,
          addPrompt: (opts?: AddPromptInput) => {
            entry.prompts.push(this.resolvePrompt(opts, entry));
          },
          addPanel: (opts?: AddPanelOpts) => {
            entry.panels.push({
              id: this.nextId('panel'),
              title: opts?.title ?? 'Panel',
              dataSource: opts?.dataSource ?? 'existing',
              ...(opts?.filter ? { filter: opts.filter } : {}),
            });
          },
        } as StageHandleMap[T];

      case 'NameGeneratorRoster':
        return {
          ...base,
          addPrompt: (opts?: AddPromptInput) => {
            entry.prompts.push(this.resolvePrompt(opts, entry));
          },
        } as StageHandleMap[T];

      case 'Sociogram':
        return {
          ...base,
          addPrompt: (opts?: AddPromptInput) => {
            entry.prompts.push(this.resolveSociogramPrompt(opts, entry));
          },
        } as StageHandleMap[T];

      case 'Narrative':
        return {
          ...base,
          addPreset: (opts?: AddPresetInput) => {
            entry.presets.push(this.resolveNarrativePreset(opts, entry));
          },
        } as StageHandleMap[T];

      case 'DyadCensus':
        return {
          ...base,
          addPrompt: (opts?: AddDyadCensusPromptInput) => {
            entry.prompts.push(this.resolveDyadCensusPrompt(opts));
          },
        } as StageHandleMap[T];

      case 'OneToManyDyadCensus':
        return {
          ...base,
          addPrompt: (opts?: AddOneToManyDyadCensusPromptInput) => {
            entry.prompts.push(
              this.resolveOneToManyDyadCensusPrompt(opts, entry),
            );
          },
        } as StageHandleMap[T];

      case 'OrdinalBin':
        return {
          ...base,
          addPrompt: (opts?: AddOrdinalBinPromptInput) => {
            entry.prompts.push(this.resolveOrdinalBinPrompt(opts, entry));
          },
        } as StageHandleMap[T];

      case 'CategoricalBin':
        return {
          ...base,
          addPrompt: (opts?: AddCategoricalBinPromptInput) => {
            entry.prompts.push(this.resolveCategoricalBinPrompt(opts, entry));
          },
        } as StageHandleMap[T];

      case 'EgoForm':
        return {
          ...base,
          addFormField: (opts: AddFormFieldOpts) => {
            const field = this.resolveEgoFormField(opts);
            entry.form ??= { title: 'About you', fields: [] };
            entry.form.fields.push(field);
          },
        } as StageHandleMap[T];

      case 'Information':
        return base as StageHandleMap[T];

      case 'TieStrengthCensus':
        return {
          ...base,
          addPrompt: (opts?: AddTieStrengthCensusPromptInput) => {
            entry.prompts.push(
              this.resolveTieStrengthCensusPrompt(opts, entry),
            );
          },
        } as StageHandleMap[T];

      case 'AlterForm':
        return {
          ...base,
          addFormField: (opts: AddFormFieldOpts) => {
            const field = this.resolveFormField(
              {
                component: opts.component,
                variable: opts.variable,
                prompt: opts.prompt,
                hint: opts.hint,
                showValidationHints: opts.showValidationHints,
                parameters: opts.parameters,
                validation: opts.validation,
              },
              entry.subject!.type,
            );
            entry.form ??= { title: 'About this person', fields: [] };
            entry.form.fields.push(field);
          },
        } as StageHandleMap[T];

      case 'AlterEdgeForm':
        return {
          ...base,
          addFormField: (opts: AddFormFieldOpts) => {
            const field = this.resolveEdgeFormField(
              {
                component: opts.component,
                variable: opts.variable,
                prompt: opts.prompt,
                hint: opts.hint,
                showValidationHints: opts.showValidationHints,
                parameters: opts.parameters,
                validation: opts.validation,
              },
              entry.subject!.type,
            );
            entry.form ??= {
              title: 'Describe this relationship',
              fields: [],
            };
            entry.form.fields.push(field);
          },
        } as StageHandleMap[T];

      case 'Anonymisation':
        return base as StageHandleMap[T];

      case 'FamilyPedigree':
        return {
          ...base,
          addDiseaseNominationStep: (opts?: AddDiseaseNominationStepInput) => {
            const step: DiseaseNominationStepEntry = {
              id: this.nextId('disease-nom'),
              text: opts?.text ?? 'Which family members have this condition?',
              variable: opts?.variable ?? this.nextId('disease-var'),
            };
            entry.nominationPrompts ??= [];
            entry.nominationPrompts.push(step);
          },
        } as StageHandleMap[T];

      case 'Geospatial':
        return {
          ...base,
          addPrompt: (opts?: AddGeospatialPromptInput) => {
            const prompt = this.resolveGeospatialPrompt(opts, entry);
            entry.prompts.push(prompt);
          },
        } as StageHandleMap[T];

      case 'NarrativePedigree':
        return base as StageHandleMap[T];
      case 'NetworkComposer':
        return {
          ...base,
          addEdgeType: (opts?: AddNetworkComposerEdgeInput) => {
            const edgeTypeId = opts?.type ?? this.addEdgeType().id;
            const edgeEntry: NetworkComposerEdgeEntry = {
              id: this.nextId('composer-edge'),
              subject: { entity: 'edge', type: edgeTypeId },
            };
            if (opts?.form) {
              edgeEntry.form = {
                fields: opts.form.fields.map((f) =>
                  this.resolveNetworkComposerEdgeFormField(f, edgeTypeId),
                ),
              };
            }
            entry.networkComposerEdges ??= [];
            entry.networkComposerEdges.push(edgeEntry);
            return { id: edgeTypeId };
          },
          addNodeFormField: (opts: NetworkComposerFormFieldInput) => {
            const field = this.resolveNetworkComposerFormField(
              opts,
              entry.subject!.type,
            );
            entry.nodeForm ??= { fields: [] };
            entry.nodeForm.fields.push(field);
          },
        } as StageHandleMap[T];
    }
  }

  // --- Resolution helpers ---

  private resolveVariableType(opts?: AddVariableInput): VariableType {
    if (opts?.type) return opts.type;
    if (opts?.component) return COMPONENT_TO_VARIABLE_TYPE[opts.component];
    return 'text';
  }

  private resolveOptions(
    type: VariableType,
    providedOptions?: AddVariableInput['options'],
  ) {
    if (providedOptions) return providedOptions;
    if (type === 'ordinal') return [...DEFAULT_ORDINAL_OPTIONS];
    if (type === 'categorical') return [...DEFAULT_CATEGORICAL_OPTIONS];
    return undefined;
  }

  private defaultVariableName(type: VariableType): string {
    const names: Record<string, string> = {
      text: 'textValue',
      number: 'numberValue',
      scalar: 'scaleValue',
      boolean: 'booleanValue',
      ordinal: 'likertValue',
      categorical: 'Category',
      datetime: 'Date',
      layout: 'Layout',
      location: 'Location',
    };
    return names[type] ?? 'Value';
  }

  private resolveFormField(input: FormFieldInput, nodeTypeId: string) {
    let variableId = input.variable;
    if (!variableId) {
      // Auto-create variable from component type
      const ref = this.addVariableToNodeType(nodeTypeId, {
        component: input.component,
        name:
          input.prompt === undefined
            ? undefined
            : variableNameFromDisplayText(input.prompt),
        validation: input.validation,
        parameters: input.parameters,
      });
      variableId = ref.id;
    }
    // Get the variable name if no prompt was provided
    const nodeType = this.nodeTypes.get(nodeTypeId);
    const variable = nodeType?.variables.get(variableId);
    const prompt = input.prompt ?? variable?.name ?? 'Field';

    // The strict form schemas reject a field-level `component`; the runtime
    // resolves the control from the codebook variable's own component.
    return {
      variable: variableId,
      prompt,
      ...(input.hint !== undefined ? { hint: input.hint } : {}),
      ...(input.showValidationHints !== undefined
        ? { showValidationHints: input.showValidationHints }
        : {}),
    };
  }

  private resolveEdgeFormField(input: FormFieldInput, edgeTypeId: string) {
    let variableId = input.variable;
    if (!variableId) {
      const ref = this.addVariableToEdgeType(edgeTypeId, {
        component: input.component,
        name:
          input.prompt === undefined
            ? undefined
            : variableNameFromDisplayText(input.prompt),
        validation: input.validation,
        parameters: input.parameters,
      });
      variableId = ref.id;
    }
    // Get the variable name if no prompt was provided
    const edgeType = this.edgeTypes.get(edgeTypeId);
    const variable = edgeType?.variables.get(variableId);
    const prompt = input.prompt ?? variable?.name ?? 'Field';

    // See resolveFormField: field-level `component` is schema-rejected.
    return {
      variable: variableId,
      prompt,
      ...(input.hint !== undefined ? { hint: input.hint } : {}),
      ...(input.showValidationHints !== undefined
        ? { showValidationHints: input.showValidationHints }
        : {}),
    };
  }

  private resolveNetworkComposerFormField(
    input: NetworkComposerFormFieldInput,
    nodeTypeId: string,
  ): NetworkComposerFormFieldEntry {
    let variableId = input.variable;
    if (!variableId) {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        component: input.component,
        name:
          input.label === undefined
            ? undefined
            : variableNameFromDisplayText(input.label),
        validation: input.validation,
      });
      variableId = ref.id;
    }
    const nodeType = this.nodeTypes.get(nodeTypeId);
    const variable = nodeType?.variables.get(variableId);
    return {
      variable: variableId,
      component: input.component,
      ...(input.parameters ? { parameters: input.parameters } : {}),
      label: input.label ?? variable?.name ?? 'Field',
      ...(input.hint !== undefined ? { hint: input.hint } : {}),
      ...(input.showValidationHints !== undefined
        ? { showValidationHints: input.showValidationHints }
        : {}),
    };
  }

  private resolveNetworkComposerEdgeFormField(
    input: NetworkComposerFormFieldInput,
    edgeTypeId: string,
  ): NetworkComposerFormFieldEntry {
    let variableId = input.variable;
    if (!variableId) {
      const ref = this.addVariableToEdgeType(edgeTypeId, {
        component: input.component,
        name:
          input.label === undefined
            ? undefined
            : variableNameFromDisplayText(input.label),
        validation: input.validation,
      });
      variableId = ref.id;
    }
    const edgeType = this.edgeTypes.get(edgeTypeId);
    const variable = edgeType?.variables.get(variableId);
    return {
      variable: variableId,
      component: input.component,
      ...(input.parameters ? { parameters: input.parameters } : {}),
      label: input.label ?? variable?.name ?? 'Field',
      ...(input.hint !== undefined ? { hint: input.hint } : {}),
      ...(input.showValidationHints !== undefined
        ? { showValidationHints: input.showValidationHints }
        : {}),
    };
  }

  private resolveEgoFormField(input: AddFormFieldOpts) {
    let variableId = input.variable;
    if (!variableId) {
      const ref = this.addEgoVariable({
        component: input.component,
        name:
          input.prompt === undefined
            ? undefined
            : variableNameFromDisplayText(input.prompt),
        validation: input.validation,
        parameters: input.parameters,
      });
      variableId = ref.id;
    }
    return {
      variable: variableId,
      prompt: input.prompt ?? 'Enter a value',
      ...(input.hint !== undefined ? { hint: input.hint } : {}),
      ...(input.showValidationHints !== undefined
        ? { showValidationHints: input.showValidationHints }
        : {}),
    };
  }

  private resolvePrompt(
    opts: AddPromptInput | undefined,
    entry: StageEntry,
  ): NameGeneratorPromptEntry {
    return {
      id: this.nextId('prompt'),
      text: opts?.text ?? this.promptText.generatePromptText(entry.type),
      ...(opts?.additionalAttributes
        ? { additionalAttributes: opts.additionalAttributes }
        : {}),
    };
  }

  private resolveSociogramPrompt(
    opts: AddPromptInput | undefined,
    entry: StageEntry,
  ): SociogramPromptEntry {
    const promptId = this.nextId('prompt');
    const nodeTypeId = entry.subject!.type;

    // Resolve layout variable
    let layoutVariable: string | undefined;
    if (opts?.layout?.layoutVariable) {
      layoutVariable = opts.layout.layoutVariable;
    } else {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'layout',
        name: 'sociogramLayout',
      });
      layoutVariable = ref.id;
    }

    // Resolve edges
    let edges: SociogramPromptEntry['edges'];
    if (opts?.edges) {
      let createEdgeType: string | undefined;
      if (opts.edges.create === true) {
        const handle = this.addEdgeType();
        createEdgeType = handle.id;
      } else if (typeof opts.edges.create === 'string') {
        createEdgeType = opts.edges.create;
      }
      edges = {
        create: createEdgeType,
        display: opts.edges.display ?? (createEdgeType ? [createEdgeType] : []),
      };
    }

    // Resolve highlight
    let highlight: SociogramPromptEntry['highlight'];
    if (opts?.highlight) {
      let variable: string;
      if (opts.highlight.variable === true) {
        const ref = this.addVariableToNodeType(nodeTypeId, {
          type: 'boolean',
          name: 'Highlighted',
        });
        variable = ref.id;
      } else if (typeof opts.highlight.variable === 'string') {
        variable = opts.highlight.variable;
      } else {
        const ref = this.addVariableToNodeType(nodeTypeId, {
          type: 'boolean',
          name: 'Highlighted',
        });
        variable = ref.id;
      }
      highlight = {
        allowHighlighting: true,
        variable,
      };
    }

    return {
      id: promptId,
      text: opts?.text ?? this.promptText.generatePromptText('Sociogram'),
      layout: { layoutVariable },
      ...(opts?.sortOrder ? { sortOrder: opts.sortOrder } : {}),
      edges,
      highlight,
    };
  }

  private resolveNarrativePreset(
    opts: AddPresetInput | undefined,
    entry: StageEntry,
  ): PresetEntry {
    const presetId = this.nextId('preset');
    const nodeTypeId = entry.subject!.type;

    // Resolve layout variable
    let layoutVariable: string;
    if (opts?.layoutVariable) {
      layoutVariable = opts.layoutVariable;
    } else {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'layout',
        name: 'narrativeLayout',
      });
      layoutVariable = ref.id;
    }

    // Resolve group variable
    let groupVariable: string | undefined;
    if (opts?.groupVariable === true) {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'categorical',
        name: 'Group',
      });
      groupVariable = ref.id;
    } else if (typeof opts?.groupVariable === 'string') {
      groupVariable = opts.groupVariable;
    }

    // Resolve highlight
    let highlight: string[] | undefined;
    if (opts?.highlight === true) {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'boolean',
        name: 'Highlighted',
      });
      highlight = [ref.id];
    } else if (Array.isArray(opts?.highlight)) {
      highlight = opts.highlight;
    }

    // Resolve edges
    let edges: PresetEntry['edges'];
    if (opts?.edges?.display) {
      edges = { display: opts.edges.display };
    }

    return {
      id: presetId,
      label: opts?.label ?? this.promptText.generatePresetLabel(),
      layoutVariable,
      edges,
      groupVariable,
      highlight,
    };
  }

  private resolveDyadCensusPrompt(
    opts: AddDyadCensusPromptInput | undefined,
  ): DyadCensusPromptEntry {
    const promptId = this.nextId('prompt');

    let createEdge: string;
    if (typeof opts?.createEdge === 'string') {
      createEdge = opts.createEdge;
    } else {
      if (this.edgeTypes.size > 0) {
        createEdge = this.edgeTypes.keys().next().value!;
      } else {
        createEdge = this.addEdgeType().id;
      }
    }

    return {
      id: promptId,
      text: opts?.text ?? this.promptText.generatePromptText('DyadCensus'),
      createEdge,
    };
  }

  private resolveOneToManyDyadCensusPrompt(
    opts: AddOneToManyDyadCensusPromptInput | undefined,
    _entry: StageEntry,
  ): OneToManyDyadCensusPromptEntry {
    const promptId = this.nextId('prompt');

    // Resolve edge type
    let createEdge: string;
    if (typeof opts?.createEdge === 'string') {
      createEdge = opts.createEdge;
    } else if (opts?.createEdge === true || opts?.createEdge === undefined) {
      // Auto-create or reuse an edge type
      if (this.edgeTypes.size > 0) {
        createEdge = this.edgeTypes.keys().next().value!;
      } else {
        createEdge = this.addEdgeType().id;
      }
    } else {
      createEdge =
        this.edgeTypes.size > 0
          ? this.edgeTypes.keys().next().value!
          : this.addEdgeType().id;
    }

    return {
      id: promptId,
      text:
        opts?.text ?? this.promptText.generatePromptText('OneToManyDyadCensus'),
      createEdge,
      bucketSortOrder: opts?.bucketSortOrder,
      binSortOrder: opts?.binSortOrder,
    };
  }

  private resolveOrdinalBinPrompt(
    opts: AddOrdinalBinPromptInput | undefined,
    entry: StageEntry,
  ): OrdinalBinPromptEntry {
    const promptId = this.nextId('prompt');
    const nodeTypeId = entry.subject!.type;

    // Resolve variable: use provided or auto-create an ordinal variable
    let variable: string;
    if (opts?.variable) {
      variable = opts.variable;
    } else {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'ordinal',
        name: 'Agreement',
      });
      variable = ref.id;
    }

    const colorIndex = this.ordinalPromptCounter % ORDINAL_COLORS.length;
    this.ordinalPromptCounter++;

    return {
      id: promptId,
      text: opts?.text ?? this.promptText.generatePromptText('OrdinalBin'),
      variable,
      bucketSortOrder: opts?.bucketSortOrder,
      binSortOrder: opts?.binSortOrder,
      color: opts?.color ?? ORDINAL_COLORS[colorIndex],
    };
  }

  private resolveCategoricalBinPrompt(
    opts: AddCategoricalBinPromptInput | undefined,
    entry: StageEntry,
  ): CategoricalBinPromptEntry {
    const promptId = this.nextId('prompt');
    const nodeTypeId = entry.subject!.type;

    // Resolve variable: use provided or auto-create a categorical variable
    let variable: string;
    if (opts?.variable) {
      variable = opts.variable;
    } else {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'categorical',
        name: 'Category',
      });
      variable = ref.id;
    }

    // The schema requires both 'other' labels whenever otherVariable is set;
    // default them (matching the migration's defaults) so builder output
    // stays schema-valid without every caller spelling them out.
    const otherVariable = opts?.otherVariable;
    return {
      id: promptId,
      text: opts?.text ?? this.promptText.generatePromptText('CategoricalBin'),
      variable,
      otherVariable,
      otherVariablePrompt: otherVariable
        ? (opts?.otherVariablePrompt ?? 'Please specify')
        : opts?.otherVariablePrompt,
      otherOptionLabel: otherVariable
        ? (opts?.otherOptionLabel ?? 'Other')
        : opts?.otherOptionLabel,
      bucketSortOrder: opts?.bucketSortOrder,
      binSortOrder: opts?.binSortOrder,
    };
  }

  private resolveTieStrengthCensusPrompt(
    opts: AddTieStrengthCensusPromptInput | undefined,
    _entry: StageEntry,
  ): TieStrengthCensusPromptEntry {
    const promptId = this.nextId('prompt');

    // Resolve edge type
    let createEdge: string;
    if (typeof opts?.createEdge === 'string') {
      createEdge = opts.createEdge;
    } else {
      if (this.edgeTypes.size > 0) {
        createEdge = this.edgeTypes.keys().next().value!;
      } else {
        createEdge = this.addEdgeType().id;
      }
    }

    // Resolve edge variable - must exist on the edge type
    let edgeVariable: string;
    if (opts?.edgeVariable) {
      edgeVariable = opts.edgeVariable;
    } else {
      // Auto-create an ordinal variable on the edge type
      const ref = this.addVariableToEdgeType(createEdge, {
        type: 'ordinal',
        name: 'Strength',
      });
      edgeVariable = ref.id;
    }

    return {
      id: promptId,
      text:
        opts?.text ?? this.promptText.generatePromptText('TieStrengthCensus'),
      createEdge,
      edgeVariable,
      negativeLabel: opts?.negativeLabel ?? 'No Relationship',
    };
  }

  private resolveGeospatialPrompt(
    opts: AddGeospatialPromptInput | undefined,
    entry: StageEntry,
  ): GeospatialPromptEntry {
    const promptId = this.nextId('prompt');
    const nodeTypeId = entry.subject?.type;

    // Resolve the variable to store the location selection
    let variable: string;
    if (opts?.variable) {
      variable = opts.variable;
    } else if (nodeTypeId) {
      const ref = this.addVariableToNodeType(nodeTypeId, {
        type: 'text',
        name: 'Location',
      });
      variable = ref.id;
    } else {
      variable = this.nextId('location-var');
    }

    return {
      id: promptId,
      text: opts?.text ?? this.promptText.generatePromptText('Geospatial'),
      variable,
    };
  }

  // --- Output methods ---

  getProtocol() {
    const codebook = this.buildCodebook();
    const stages = this.stages.map((s) => this.buildStageConfig(s));

    return {
      id: `protocol-${this.seed}`,
      schemaVersion: 8,
      codebook,
      // Stage configs are built dynamically and satisfy the Stage schema
      // at runtime, but TypeScript can't verify this statically.
      stages: stages as Stage[],
      assets: this.assets as unknown[],
    };
  }

  /**
   * The builder's document parsed through the current protocol schema — the
   * form `generateInterviews` requires, every `synthetic` descriptor resolved
   * by parsing.
   *
   * Two translations happen here and nowhere else:
   * - a stage's `initialNodes` count becomes its authored
   *   `synthetic.count = { distribution: 'constant', value: N }` wherever the
   *   stage's schema carries a count (the three name generators), so the
   *   parsed document itself says how many people the recipe seeds (plan D21);
   * - an asset manifest is synthesized naming every asset id the document
   *   references, because the schema's referential checks demand one while a
   *   builder recipe's real assets live host-side — generation never reads the
   *   manifest (`assetData` is the host channel), so placeholder entries
   *   change nothing about what is generated.
   *
   * Memoised against a fingerprint of the document rather than a dirty flag,
   * because stage handles mutate their entries directly and correctness comes
   * first.
   */
  getProtocolParsed(): CurrentProtocol {
    const manifest = this.synthesizeAssetManifest();
    const candidate = {
      name: 'Synthetic Protocol',
      schemaVersion: 8,
      codebook: this.buildCodebook(),
      stages: this.stages.map((stage) => this.parseCandidateStage(stage)),
      ...(Object.keys(manifest).length > 0 ? { assetManifest: manifest } : {}),
      ...(this.experiments !== null ? { experiments: this.experiments } : {}),
    };

    const fingerprint = JSON.stringify(candidate);
    if (
      this.parsedProtocol !== null &&
      this.parsedFingerprint === fingerprint
    ) {
      return this.parsedProtocol;
    }

    const parsed = CurrentProtocolSchema.parse(candidate);
    this.parsedProtocol = parsed;
    this.parsedFingerprint = fingerprint;
    return parsed;
  }

  /**
   * One synthetic interview for this recipe, delegated to the engine
   * (`generateInterviews`, count 1, dropout off), in the flat envelope the
   * old builder emitted — the fields are the same; the timestamps are the
   * engine's ISO strings now (plan D12).
   *
   * The seeded entities ride the engine's `overrides` channel: a stage with
   * seeded nodes is not simulated — its output is exactly those nodes — while
   * every other stage simulates as a participant would. `stopAt` bounds the
   * walk for mid-interview states; `{ stageIndex: 0 }` yields the blank
   * session (nothing has run, so network and ego are empty by construction —
   * plan D20). `currentStep` remains presentation state: where the payload's
   * consumer mounts the interview, defaulting to the walk's own resume
   * position under `stopAt` and to 0 otherwise.
   */
  getInterviewPayload(opts?: GetSessionInput) {
    // Assembled before the parse so a malformed written value is reported as
    // itself, not as whatever else the document may be missing.
    const overrides = this.sessionOverrides();
    const parsed = this.getProtocolParsed();
    const results = generateInterviews(parsed, {
      count: 1,
      seed: this.seed,
      simulateDropOut: false,
      respectSkipLogic: opts?.respectSkipLogic ?? false,
      // Pinned so a recipe's payload is byte-identical across runs; an
      // unpinned window reads the clock once per batch.
      startWindow: PAYLOAD_START_ANCHOR,
      ...(opts?.stopAt !== undefined ? { stopAt: opts.stopAt } : {}),
      ...(overrides !== undefined ? { overrides } : {}),
    });
    const result = results[0];
    invariant(
      result !== undefined,
      'generateInterviews returned no session for count: 1',
    );
    const { session } = result;
    const protocol = this.getProtocol();

    return {
      id: session.id,
      startTime: session.startTime,
      finishTime: session.finishTime,
      exportTime: session.exportTime,
      lastUpdated: session.lastUpdated,
      currentStep:
        opts?.currentStep ??
        (opts?.stopAt !== undefined ? result.currentStep : 0),
      stageMetadata:
        opts?.stageMetadata !== undefined
          ? opts.stageMetadata
          : (session.stageMetadata ?? null),
      network: session.network,
      protocol: {
        ...protocol,
        name: 'Synthetic Protocol',
        description: null,
        importedAt: PAYLOAD_START_ANCHOR,
        isPreview: false,
        isPending: false,
        experiments: this.experiments,
      },
    };
  }

  /** The delegated session's network — the payload's, unwrapped. */
  getNetwork(): NcNetwork {
    return this.getInterviewPayload().network;
  }

  /**
   * The stage config as the parse candidate carries it: the built config,
   * plus the authored constant count `initialNodes` translates to on the
   * stage types whose schema declares one.
   */
  private parseCandidateStage(stage: StageEntry): Record<string, unknown> {
    const config = this.buildStageConfig(stage);
    if (stage.initialNodes === undefined) return config;
    if (
      stage.type !== 'NameGenerator' &&
      stage.type !== 'NameGeneratorQuickAdd' &&
      stage.type !== 'NameGeneratorRoster'
    ) {
      return config;
    }
    return {
      ...config,
      synthetic: {
        count: { distribution: 'constant', value: stage.initialNodes.count },
      },
    };
  }

  /**
   * The builder's seeded entities, in the shape the engine's fixture channel
   * takes: per-stage node entries (a stage that declared `initialNodes` is
   * always listed, even with a count of 0, so the engine treats its output as
   * predetermined rather than simulating it), and the seeded relationships.
   *
   * A written value is validated here exactly as the old builder validated
   * it — `VariableValueSchema.parse`, so a malformed value throws before the
   * engine runs. The omission sentinel, a written null, and a written
   * undefined all become suppressions: the variable is settled and absent.
   */
  private sessionOverrides(): SessionOverrides | undefined {
    const overriddenValues = (
      written: Record<string, unknown>,
    ): Pick<NodeOverrideEntry, 'attributes' | 'suppress'> => {
      const attributes: Record<string, VariableValue> = {};
      const suppress: string[] = [];
      for (const [id, value] of Object.entries(written)) {
        if (
          value === omittedAttributeValue ||
          value === null ||
          value === undefined
        ) {
          suppress.push(id);
          continue;
        }
        attributes[id] = VariableValueSchema.parse(value);
      }
      return {
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
        ...(suppress.length > 0 ? { suppress } : {}),
      };
    };

    const nodes: Record<string, NodeOverrideEntry[]> = {};
    for (const stage of this.stages) {
      if (stage.initialNodes !== undefined) nodes[stage.id] = [];
    }
    for (const node of this.nodes) {
      const promptIndex = node.promptIndices?.[0];
      (nodes[node.stageId] ??= []).push({
        type: node.type,
        uid: node.uid,
        ...(promptIndex !== undefined ? { promptIndex } : {}),
        ...overriddenValues(node.explicitAttributes),
        ...(node.manual === true ? { manual: true } : {}),
      });
    }

    const edges: EdgeOverrideEntry[] = this.edges.map((edge) => ({
      type: edge.type,
      uid: edge.uid,
      from: edge.from,
      to: edge.to,
      ...overriddenValues(edge.attributes),
      ...(edge.manual === true ? { manual: true } : {}),
    }));

    if (Object.keys(nodes).length === 0 && edges.length === 0) {
      return undefined;
    }
    return {
      ...(Object.keys(nodes).length > 0 ? { nodes } : {}),
      ...(edges.length > 0 ? { edges } : {}),
    };
  }

  /**
   * Placeholder manifest entries for every asset id this document references,
   * merged under the builder's own `addAsset` declarations (a declared type
   * wins over a reference-derived kind). Sources are synthesized bare names:
   * the schema requires a zip-safe filename, and no consumer of a builder
   * recipe ever opens one.
   */
  private synthesizeAssetManifest(): Record<string, Asset> {
    const manifest: Record<string, Asset> = {};
    const safeSource = (id: string): string => {
      const flattened = id.replace(/[/\\]/g, '-');
      return flattened === '' || flattened === '..'
        ? 'asset.data'
        : `${flattened}.data`;
    };
    const place = (id: string | undefined, entry: Asset): void => {
      if (id === undefined || id in manifest) return;
      manifest[id] = entry;
    };

    for (const raw of this.assets) {
      const id =
        typeof raw.id === 'string'
          ? raw.id
          : typeof raw.assetId === 'string'
            ? raw.assetId
            : undefined;
      if (id === undefined) continue;
      const name = typeof raw.name === 'string' ? raw.name : id;
      const source =
        typeof raw.source === 'string' &&
        raw.source !== '' &&
        raw.source !== '..' &&
        !raw.source.includes('/') &&
        !raw.source.includes('\\')
          ? raw.source
          : safeSource(id);
      switch (raw.type) {
        case 'apikey':
          place(id, {
            name,
            type: 'apikey',
            value:
              typeof raw.value === 'string' && raw.value !== ''
                ? raw.value
                : 'synthetic-api-key',
          });
          break;
        case 'image':
        case 'network':
        case 'geojson':
        case 'video':
        case 'audio':
          place(id, { name, type: raw.type, source });
          break;
        default:
          // Untyped declarations wait for a reference below to say what kind
          // of asset the schema expects them to be.
          break;
      }
    }

    for (const stage of this.stages) {
      if (stage.type === 'NameGeneratorRoster' && stage.dataSource) {
        place(stage.dataSource, {
          name: stage.dataSource,
          type: 'network',
          source: safeSource(stage.dataSource),
        });
      }
      if (stage.mapOptions !== undefined) {
        place(stage.mapOptions.tokenAssetId, {
          name: stage.mapOptions.tokenAssetId,
          type: 'apikey',
          value: 'synthetic-api-key',
        });
        place(stage.mapOptions.dataSourceAssetId, {
          name: stage.mapOptions.dataSourceAssetId,
          type: 'geojson',
          source: safeSource(stage.mapOptions.dataSourceAssetId),
        });
      }
      if (stage.background?.image !== undefined) {
        place(stage.background.image, {
          name: stage.background.image,
          type: 'image',
          source: safeSource(stage.background.image),
        });
      }
      for (const item of stage.introScreen?.items ?? []) {
        if (item.type === 'asset') {
          place(item.content, {
            name: item.content,
            type: 'image',
            source: safeSource(item.content),
          });
        }
      }
    }

    return manifest;
  }

  private buildCodebook() {
    const node: Record<string, unknown> = {};
    for (const [id, entry] of this.nodeTypes) {
      const variables: Record<string, unknown> = {};
      for (const [varId, varEntry] of entry.variables) {
        const variable: Record<string, unknown> = {
          name: varEntry.name,
          type: varEntry.type,
        };
        if (varEntry.component) variable.component = varEntry.component;
        if (varEntry.options) variable.options = varEntry.options;
        if (varEntry.validation) variable.validation = varEntry.validation;
        if (varEntry.parameters) variable.parameters = varEntry.parameters;
        if (varEntry.encrypted) variable.encrypted = varEntry.encrypted;
        variables[varId] = variable;
      }
      node[id] = {
        name: entry.name,
        color: entry.color,
        icon: entry.icon,
        shape: entry.shape,
        variables,
      };
    }

    const edge: Record<string, unknown> = {};
    for (const [id, entry] of this.edgeTypes) {
      const edgeEntry: Record<string, unknown> = {
        name: entry.name,
        color: entry.color,
      };
      // Serialize edge type variables if any exist
      if (entry.variables.size > 0) {
        const variables: Record<string, unknown> = {};
        for (const [varId, varEntry] of entry.variables) {
          const variable: Record<string, unknown> = {
            name: varEntry.name,
            type: varEntry.type,
          };
          if (varEntry.component) variable.component = varEntry.component;
          if (varEntry.options) variable.options = varEntry.options;
          if (varEntry.validation) variable.validation = varEntry.validation;
          if (varEntry.parameters) variable.parameters = varEntry.parameters;
          variables[varId] = variable;
        }
        edgeEntry.variables = variables;
      }
      edge[id] = edgeEntry;
    }

    // Build ego codebook if ego variables exist
    let ego: Record<string, unknown> | undefined;
    if (this.egoVariables.size > 0) {
      const variables: Record<string, unknown> = {};
      for (const [varId, varEntry] of this.egoVariables) {
        const variable: Record<string, unknown> = {
          name: varEntry.name,
          type: varEntry.type,
        };
        if (varEntry.component) variable.component = varEntry.component;
        if (varEntry.options) variable.options = varEntry.options;
        if (varEntry.validation) variable.validation = varEntry.validation;
        if (varEntry.parameters) variable.parameters = varEntry.parameters;
        variables[varId] = variable;
      }
      ego = { variables };
    }

    return { node, edge, ego };
  }

  private buildStageConfig(stage: StageEntry): Record<string, unknown> {
    const config: Record<string, unknown> = {
      id: stage.id,
      type: stage.type,
      label: stage.label,
    };

    if (stage.interviewScript !== undefined) {
      config.interviewScript = stage.interviewScript;
    }

    if (stage.skipLogic) {
      config.skipLogic = stage.skipLogic;
    }

    if (stage.filter) {
      config.filter = stage.filter;
    }

    // FamilyPedigree references its entity types via nodeConfig/edgeConfig;
    // its strict schema rejects a stage-level subject.
    if (stage.subject && stage.type !== 'FamilyPedigree') {
      config.subject = stage.subject;
    }

    if (stage.form) {
      // TitlelessFormSchema: AlterForm/AlterEdgeForm/EgoForm forms must not
      // carry a title; every other form stage keeps it.
      config.form =
        stage.type === 'AlterForm' ||
        stage.type === 'AlterEdgeForm' ||
        stage.type === 'EgoForm'
          ? { fields: stage.form.fields }
          : stage.form;
    }

    if (stage.prompts.length > 0) {
      config.prompts = stage.prompts;
    }

    if (stage.presets.length > 0) {
      config.presets = stage.presets;
    }

    if (stage.panels.length > 0) {
      config.panels = stage.panels;
    }

    if (stage.background) {
      config.background = stage.background;
    }

    if (stage.behaviours) {
      config.behaviours = stage.behaviours;
    }

    if (stage.introductionPanel) {
      config.introductionPanel = stage.introductionPanel;
    }

    if (stage.title !== undefined) {
      config.title = stage.title;
    }

    if (stage.items) {
      config.items = stage.items;
    }

    // NameGeneratorQuickAdd
    if (stage.quickAdd) {
      config.quickAdd = stage.quickAdd;
    }

    // NameGeneratorRoster
    if (stage.dataSource) {
      config.dataSource = stage.dataSource;
    }
    if (stage.cardOptions) {
      config.cardOptions = stage.cardOptions;
    }
    if (stage.sortOptions) {
      config.sortOptions = stage.sortOptions;
    }
    if (stage.searchOptions) {
      config.searchOptions = stage.searchOptions;
    }

    // Anonymisation
    if (stage.explanationText) {
      config.explanationText = stage.explanationText;
    }
    if (stage.validation) {
      config.validation = stage.validation;
    }

    // FamilyPedigree
    if (stage.type === 'FamilyPedigree') {
      if (stage.nodeConfig) config.nodeConfig = stage.nodeConfig;
      if (stage.edgeConfig) config.edgeConfig = stage.edgeConfig;
      if (stage.censusPrompt) config.censusPrompt = stage.censusPrompt;
      if (stage.nominationPrompts?.length)
        config.nominationPrompts = stage.nominationPrompts;
      if (stage.framing) config.framing = stage.framing;
      if (stage.boundaries) config.boundaries = stage.boundaries;
      if (stage.introScreen) config.introScreen = stage.introScreen;
    }

    // Geospatial
    if (stage.mapOptions) {
      config.mapOptions = stage.mapOptions;
    }

    // NarrativePedigree
    if (stage.type === 'NarrativePedigree') {
      if (stage.narrativePedigreeSourceStageId) {
        config.sourceStageId = stage.narrativePedigreeSourceStageId;
      }
      if (stage.narrativePedigreeDiseases) {
        config.diseases = stage.narrativePedigreeDiseases.map((d) => ({
          ...d,
          variable: d.variable,
        }));
      }
      config.showAtRiskStatuses =
        stage.narrativePedigreeShowAtRiskStatuses ?? false;
    }

    // NetworkComposer (quickAdd is serialized by the shared block above)
    if (stage.type === 'NetworkComposer') {
      if (stage.layoutVariable) config.layoutVariable = stage.layoutVariable;
      if (stage.nodeForm) config.nodeForm = stage.nodeForm;
      if (stage.convexHullVariable)
        config.convexHullVariable = stage.convexHullVariable;
      if (stage.networkComposerEdges) {
        config.edges = stage.networkComposerEdges;
      }
    }

    return config;
  }

  // --- Node/edge manipulation after creation ---

  /**
   * Set explicit attribute values on a node by its index in the nodes array.
   * These values override the generated values at `getNetwork()` time.
   */
  setNodeAttribute(
    nodeIndex: number,
    variableId: string,
    value: VariableValue,
  ): void {
    const node = this.nodes[nodeIndex];
    if (!node) {
      throw new Error(
        `Node index ${nodeIndex} out of range (${this.nodes.length} nodes)`,
      );
    }
    node.explicitAttributes[variableId] = value;
  }

  /** Keep a node variable absent while suppressing its generated value. */
  unsetNodeAttribute(nodeIndex: number, variableId: string): void {
    const node = this.nodes[nodeIndex];
    if (!node) {
      throw new Error(
        `Node index ${nodeIndex} out of range (${this.nodes.length} nodes)`,
      );
    }
    node.explicitAttributes[variableId] = omittedAttributeValue;
  }

  /**
   * Set explicit attribute values on an edge by its index in the edges array.
   */
  setEdgeAttribute(
    edgeIndex: number,
    variableId: string,
    value: VariableValue,
  ): void {
    const edge = this.edges[edgeIndex];
    if (!edge) {
      throw new Error(
        `Edge index ${edgeIndex} out of range (${this.edges.length} edges)`,
      );
    }
    edge.attributes[variableId] = value;
  }

  /** Keep an edge variable absent while suppressing its generated value. */
  unsetEdgeAttribute(edgeIndex: number, variableId: string): void {
    const edge = this.edges[edgeIndex];
    if (!edge) {
      throw new Error(
        `Edge index ${edgeIndex} out of range (${this.edges.length} edges)`,
      );
    }
    edge.attributes[variableId] = omittedAttributeValue;
  }

  /**
   * Insert a pre-defined node directly into the network. Use this when the
   * caller needs full control over node uid and attributes (e.g. seeding a
   * pedigree for NarrativePedigree stories where node identity matters).
   */
  addManualNode(
    stageId: string,
    nodeTypeId: string,
    uid: string,
    attributes: Record<string, unknown>,
  ): void {
    this.nodes.push({
      uid,
      type: nodeTypeId,
      stageId,
      promptIDs: [],
      explicitAttributes: attributes,
      manual: true,
    });
  }

  /**
   * Insert a pre-defined edge directly into the network. Use this when the
   * caller needs full control over edge uid, endpoints, and attributes.
   */
  addManualEdge(
    edgeTypeId: string,
    uid: string,
    from: string,
    to: string,
    attributes: Record<string, unknown>,
  ): void {
    this.edges.push({
      uid,
      type: edgeTypeId,
      from,
      to,
      attributes,
      manual: true,
    });
  }

  /**
   * Add edges between existing nodes by their indices.
   * If no edge type exists, one will be created.
   */
  addEdges(pairs: [number, number][], edgeTypeId?: string): void {
    const resolvedEdgeTypeId =
      edgeTypeId ??
      (this.edgeTypes.size > 0
        ? this.edgeTypes.keys().next().value!
        : this.addEdgeType().id);

    for (const [fromIdx, toIdx] of pairs) {
      const fromNode = this.nodes[fromIdx];
      const toNode = this.nodes[toIdx];
      if (fromNode && toNode) {
        this.edges.push({
          uid: this.nextId('edge'),
          type: resolvedEdgeTypeId,
          from: fromNode.uid,
          to: toNode.uid,
          attributes: {},
        });
      }
    }
  }

  /**
   * Add an asset to the protocol output.
   */
  addAsset(asset: Record<string, unknown>): void {
    this.assets.push(asset);
  }

  /**
   * Set protocol-level experiments, emitted by getInterviewPayload().
   */
  setExperiments(experiments: { encryptedVariables?: boolean }): void {
    this.experiments = experiments;
  }

  // --- Accessors for internal state (useful for tests) ---

  getNodeTypeIds(): string[] {
    return [...this.nodeTypes.keys()];
  }

  getEdgeTypeIds(): string[] {
    return [...this.edgeTypes.keys()];
  }

  getVariableIds(nodeTypeId: string): string[] {
    const nodeType = this.nodeTypes.get(nodeTypeId);
    if (!nodeType) return [];
    return [...nodeType.variables.keys()];
  }

  getEdgeVariableIds(edgeTypeId: string): string[] {
    const edgeType = this.edgeTypes.get(edgeTypeId);
    if (!edgeType) return [];
    return [...edgeType.variables.keys()];
  }

  getNodeEntries(): NodeEntry[] {
    return this.nodes;
  }

  getEdgeEntries(): EdgeEntry[] {
    return this.edges;
  }
}
