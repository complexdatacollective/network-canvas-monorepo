import type {
  ComponentType,
  FamilyPedigreeBoundaries,
  FamilyPedigreeEdgeConfigInput,
  FamilyPedigreeFraming,
  FamilyPedigreeIntroItem,
  FamilyPedigreeNodeConfigInput,
  FamilyPedigreeNominationPromptInput,
  FilterOperator,
  Item,
  StageType,
  VariableType,
} from '@codaco/protocol-validation';

/**
 * Structural (unbranded) filter input. The real `Filter` type brands
 * `options.attribute` as an EntityAttributeReference, which callers building
 * test protocols cannot produce without a schema parse; the e2e adapter
 * re-validates the whole protocol against `CurrentProtocolSchema` anyway, so
 * the builder accepts the plain shape. `Filter` is assignable to this type.
 */
export type FilterRuleInput = {
  id: string;
  type: 'node' | 'edge' | 'ego';
  options: {
    type?: string;
    attribute?: string;
    operator: FilterOperator;
    value?: string | number | boolean | unknown[];
  };
};

export type FilterInput = {
  join?: 'AND' | 'OR';
  rules: FilterRuleInput[];
};

type SkipLogicDestinationInput =
  | { type: 'stage'; stageId: string }
  | { type: 'finish' };

export type SkipLogicInput = {
  action: 'SHOW' | 'SKIP';
  filter: FilterInput;
  destination?: SkipLogicDestinationInput;
};

/**
 * Structural variable option input: boolean values are legal on boolean
 * variables (schema-validated downstream), which the exported VariableOption
 * union does not admit.
 */
export type VariableOptionInput = {
  label: string;
  value: string | number | boolean;
  negative?: boolean;
};

export type VariableEntry = {
  id: string;
  name: string;
  type: VariableType;
  component?: ComponentType;
  options?: VariableOptionInput[];
  validation?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  // Only meaningful on node text variables; the variable schema rejects
  // `encrypted` on ego/edge variables, so only the node codebook emits it.
  encrypted?: boolean;
};

type ShapeMapping =
  | {
      variable: string;
      type: 'discrete';
      map: { value: string | number | boolean; shape: string }[];
    }
  | {
      variable: string;
      type: 'breakpoints';
      thresholds: { value: number; shape: string }[];
    };

export type NodeTypeEntry = {
  id: string;
  name: string;
  color: string;
  icon: string;
  shape: { default: string; dynamic?: ShapeMapping };
  variables: Map<string, VariableEntry>;
};

export type EdgeTypeEntry = {
  id: string;
  name: string;
  color: string;
  variables: Map<string, VariableEntry>;
};

export type NameGeneratorPromptEntry = {
  id: string;
  text: string;
  additionalAttributes?: { variable: string; value: boolean }[];
};

export type SociogramPromptEntry = {
  id: string;
  text: string;
  layout: {
    layoutVariable: string;
  };
  sortOrder?: { property: string; direction: 'asc' | 'desc' }[];
  edges?: {
    create?: string;
    display?: string[];
  };
  highlight?: {
    allowHighlighting?: boolean;
    variable?: string;
  };
};

type SortRule = {
  property: string;
  direction: 'asc' | 'desc';
};

export type DyadCensusPromptEntry = {
  id: string;
  text: string;
  createEdge: string;
};

export type OneToManyDyadCensusPromptEntry = {
  id: string;
  text: string;
  createEdge: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type OrdinalBinPromptEntry = {
  id: string;
  text: string;
  variable: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
  color?: string;
};

export type CategoricalBinPromptEntry = {
  id: string;
  text: string;
  variable: string;
  otherVariable?: string;
  otherVariablePrompt?: string;
  otherOptionLabel?: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type TieStrengthCensusPromptEntry = {
  id: string;
  text: string;
  createEdge: string;
  edgeVariable: string;
  negativeLabel: string;
};

export type DiseaseNominationStepEntry = {
  id: string;
  text: string;
  variable: string;
};

export type GeospatialPromptEntry = {
  id: string;
  text: string;
  variable: string;
};

type MapOptionsEntry = {
  tokenAssetId: string;
  style: string;
  center: [number, number];
  initialZoom: number;
  dataSourceAssetId: string;
  color: string;
  targetFeatureProperty: string;
  showTransit?: boolean;
  allowSearch?: boolean;
};

type PromptEntry =
  | NameGeneratorPromptEntry
  | SociogramPromptEntry
  | DyadCensusPromptEntry
  | OneToManyDyadCensusPromptEntry
  | OrdinalBinPromptEntry
  | CategoricalBinPromptEntry
  | TieStrengthCensusPromptEntry
  | GeospatialPromptEntry;

export type PresetEntry = {
  id: string;
  label: string;
  layoutVariable: string;
  edges?: {
    display: string[];
  };
  groupVariable?: string;
  highlight?: string[];
};

type FormFieldEntry = {
  variable: string;
  component?: ComponentType;
  prompt?: string;
};

// Unlike the shared form fields' `prompt`, composer attribute fields caption
// with an optional `label` (the runtime falls back to the variable's name).
// Mirrors the schema's ComposerFormFieldSchema: `component` is required.
export type NetworkComposerFormFieldEntry = {
  variable: string;
  component: ComponentType;
  parameters?: Record<string, unknown>;
  label?: string;
  hint?: string;
  showValidationHints?: boolean;
};

// A drawable edge type within a NetworkComposer stage. Mirrors the schema's
// `edges[]` entries: an id, an edge subject, and an optional attribute form.
export type NetworkComposerEdgeEntry = {
  id: string;
  subject: { entity: 'edge'; type: string };
  form?: { fields: NetworkComposerFormFieldEntry[] };
};

type FormEntry = {
  title: string;
  fields: FormFieldEntry[];
};

type PanelEntry = {
  id: string;
  title: string;
  dataSource: string;
  filter?: FilterInput;
};

export type StageEntry = {
  id: string;
  type: StageType;
  label: string;
  interviewScript?: string;
  skipLogic?: SkipLogicInput;
  filter?: FilterInput;
  subject?: { entity: 'node'; type: string } | { entity: 'edge'; type: string };
  form?: FormEntry;
  prompts: PromptEntry[];
  presets: PresetEntry[];
  panels: PanelEntry[];
  background?: {
    concentricCircles?: number;
    skewedTowardCenter?: boolean;
    // Sociogram only — NetworkComposer's schema rejects a background image
    // (strictObject), which buildSyntheticPayload validation surfaces.
    image?: string;
  };
  behaviours?: {
    automaticLayout?: boolean;
    freeDraw?: boolean;
    allowRepositioning?: boolean;
    removeAfterConsideration?: boolean;
    minNodes?: number;
    maxNodes?: number;
  };
  introductionPanel?: {
    title: string;
    text: string;
  };
  title?: string;
  items?: Item[];
  initialEdges: [number, number][];
  // NameGeneratorQuickAdd
  quickAdd?: string;
  // NameGeneratorRoster
  dataSource?: string;
  cardOptions?: {
    additionalProperties?: { label: string; variable: string }[];
  };
  sortOptions?: {
    sortOrder: SortRule[];
    sortableProperties: { variable: string; label: string }[];
  };
  searchOptions?: {
    fuzziness: number;
    matchProperties: string[];
  };
  // Anonymisation
  explanationText?: {
    title: string;
    body: string;
  };
  validation?: { minLength?: number; maxLength?: number };
  // TieStrengthCensus (edge type reference on stage)
  edgeType?: { entity: 'edge'; type: string };
  // FamilyPedigree-specific fields, derived from the protocol-validation schema
  // so they cannot drift from it.
  nodeConfig?: FamilyPedigreeNodeConfigInput;
  edgeConfig?: FamilyPedigreeEdgeConfigInput;
  framing?: FamilyPedigreeFraming;
  // NarrativePedigree-specific fields
  narrativePedigreeSourceStageId?: string;
  narrativePedigreeDiseases?: NarrativeDiseaseEntry[];
  narrativePedigreeShowAtRiskStatuses?: boolean;
  boundaries?: FamilyPedigreeBoundaries;
  introScreen?: {
    items: FamilyPedigreeIntroItem[];
  };
  censusPrompt?: string;
  nominationPrompts?: FamilyPedigreeNominationPromptInput[];
  // Geospatial
  mapOptions?: MapOptionsEntry;
  // NetworkComposer
  layoutVariable?: string;
  nodeForm?: { fields: NetworkComposerFormFieldEntry[] };
  networkComposerEdges?: NetworkComposerEdgeEntry[];
  convexHullVariable?: string;
};

export type NodeEntry = {
  uid: string;
  type: string;
  stageId: string;
  promptIDs: string[];
  // Indices into the owning stage's prompts. Resolved to prompt IDs at
  // getNetwork() time, since prompts are added after the stage is created.
  promptIndices?: number[];
  explicitAttributes: Record<string, unknown>;
  // Manually seeded nodes (addManualNode) take full control of their
  // attributes: unset attributes are left neutral rather than randomised.
  manual?: boolean;
};

export type EdgeEntry = {
  uid: string;
  type: string;
  from: string;
  to: string;
  attributes: Record<string, unknown>;
};

// --- Input types for builder methods ---

export type InitialNodesSpec = {
  count: number;
  // Index of the prompt these nodes should be assigned to (0-based) within
  // the owning stage. Resolved at getNetwork() time. Omit for nodes that
  // should sit in the network without belonging to any prompt.
  promptIndex?: number;
};

export type AddNodeTypeInput = {
  name?: string;
  color?: string;
  icon?: string;
  shape?: { default: string; dynamic?: ShapeMapping };
};

export type AddEdgeTypeInput = {
  name?: string;
  color?: string;
};

export type AddVariableInput = {
  id?: string;
  name?: string;
  type?: VariableType;
  component?: ComponentType;
  options?: VariableOptionInput[];
  validation?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  encrypted?: boolean;
};

export type FormFieldInput = {
  variable?: string;
  prompt?: string;
  hint?: string;
  showValidationHints?: boolean;
  component: ComponentType;
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};

// Input for NetworkComposer attribute fields, which caption with `label`
// (optional; the runtime falls back to the variable's name) instead of the
// shared fields' `prompt`.
export type NetworkComposerFormFieldInput = {
  variable?: string;
  label?: string;
  hint?: string;
  showValidationHints?: boolean;
  component: ComponentType;
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};

export type AddStageInput = {
  label?: string;
  interviewScript?: string;
  skipLogic?: SkipLogicInput;
  filter?: FilterInput;
  subject?: { entity: 'node'; type: string } | { entity: 'edge'; type: string };
  initialNodes?: InitialNodesSpec;
  initialEdges?: [number, number][];
  background?: {
    concentricCircles?: number;
    skewedTowardCenter?: boolean;
    // Sociogram only — NetworkComposer's schema rejects a background image
    // (strictObject), which buildSyntheticPayload validation surfaces.
    image?: string;
  };
  behaviours?: {
    automaticLayout?: boolean;
    freeDraw?: boolean;
    allowRepositioning?: boolean;
    removeAfterConsideration?: boolean;
    minNodes?: number;
    maxNodes?: number;
  };
  form?: {
    title?: string;
    fields: FormFieldInput[];
  };
  introductionPanel?: {
    title?: string;
    text?: string;
  };
  // NameGeneratorQuickAdd
  quickAdd?: string;
  // NameGeneratorRoster
  dataSource?: string;
  cardOptions?: {
    additionalProperties?: { label: string; variable: string }[];
  };
  sortOptions?: {
    sortOrder?: SortRule[];
    sortableProperties?: { variable: string; label: string }[];
  };
  searchOptions?: {
    fuzziness?: number;
    matchProperties?: string[];
  };
  // Anonymisation
  explanationText?: {
    title?: string;
    body?: string;
  };
  validation?: { minLength?: number; maxLength?: number };
  // FamilyPedigree
  nodeConfig?: FamilyPedigreeNodeConfigInput;
  // Derived from the schema's edge config, but the builder fills the non-core
  // variables when omitted, so they are optional here.
  edgeConfig?: Pick<
    FamilyPedigreeEdgeConfigInput,
    'type' | 'relationshipTypeVariable'
  > &
    Partial<
      Omit<FamilyPedigreeEdgeConfigInput, 'type' | 'relationshipTypeVariable'>
    >;
  framing?: FamilyPedigreeFraming;
  boundaries?: FamilyPedigreeBoundaries;
  introScreen?: {
    items: FamilyPedigreeIntroItem[];
  };
  censusPrompt?: string;
  nominationPrompts?: FamilyPedigreeNominationPromptInput[];
  // Geospatial
  mapOptions?: MapOptionsEntry;
  // NarrativePedigree
  sourceStageId?: string;
  diseases?: NarrativeDiseaseEntry[];
  showAtRiskStatuses?: boolean;
  // NetworkComposer (quickAdd above is shared with NameGeneratorQuickAdd)
  layoutVariable?: string;
  nodeForm?: { fields: NetworkComposerFormFieldInput[] };
  convexHullVariable?: string;
};

export type AddNetworkComposerEdgeInput = {
  // Accept an existing edge type id, or omit to auto-create one.
  type?: string;
  form?: { fields: NetworkComposerFormFieldInput[] };
};

export type AddPromptInput = {
  text?: string;
  additionalAttributes?: { variable: string; value: boolean }[];
  sortOrder?: SortRule[];
  layout?: {
    layoutVariable?: string;
  };
  edges?: {
    create?: boolean | string;
    display?: string[];
  };
  highlight?: {
    variable?: string | boolean;
  };
};

export type AddDyadCensusPromptInput = {
  text?: string;
  createEdge?: boolean | string;
};

export type AddOneToManyDyadCensusPromptInput = {
  text?: string;
  createEdge?: boolean | string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type AddOrdinalBinPromptInput = {
  text?: string;
  variable?: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
  color?: string;
};

export type AddCategoricalBinPromptInput = {
  text?: string;
  variable?: string;
  otherVariable?: string;
  otherVariablePrompt?: string;
  otherOptionLabel?: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type AddTieStrengthCensusPromptInput = {
  text?: string;
  createEdge?: boolean | string;
  edgeVariable?: string;
  negativeLabel?: string;
};

export type AddDiseaseNominationStepInput = {
  text?: string;
  variable?: string;
};

export type AddGeospatialPromptInput = {
  text?: string;
  variable?: string;
};

export type AddPresetInput = {
  label?: string;
  layoutVariable?: string;
  edges?: {
    display?: string[];
  };
  groupVariable?: string | boolean;
  highlight?: string[] | boolean;
};

export type NarrativeDiseaseEntry = {
  id: string;
  label: string;
  color: string;
  variable: string;
  inheritancePattern: string;
};

export type GetSessionInput = {
  currentStep?: number;
  promptIndex?: number;
  stageMetadata?: Record<number, unknown> | null;
};
