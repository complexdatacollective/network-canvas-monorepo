import type {
  ColorReference,
  ComponentType,
  FamilyPedigreeBoundaries,
  FamilyPedigreeEdgeConfigInput,
  FamilyPedigreeFraming,
  FamilyPedigreeNodeConfigInput,
  FamilyPedigreeNominationPromptInput,
  EdgeColorReference,
  FilterOperator,
  Item,
  LocaleTag,
  LocalizedString,
  NodeColorReference,
  OrdinalColorReference,
  StageType,
  VariableType,
} from '@codaco/protocol-validation';

/**
 * Participant-facing text. A plain string is plain text in the protocol's
 * default locale and is escaped into an ICU literal message on output; a
 * locale map is emitted as written, so its values must already be ICU literal
 * messages.
 */
export type TextInput = string | LocalizedString;

export type LocalizationInput = {
  defaultLocale: LocaleTag;
  locales: readonly LocaleTag[];
};

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
  label: TextInput;
  value: string | number | boolean;
  negative?: boolean;
};

export type VariableEntry = {
  id: string;
  name: string;
  // Codebook label; the variable's name when omitted.
  label?: TextInput;
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
  label?: TextInput;
  color: NodeColorReference;
  icon: string;
  shape: { default: string; dynamic?: ShapeMapping };
  variables: Map<string, VariableEntry>;
};

export type EdgeTypeEntry = {
  id: string;
  name: string;
  label?: TextInput;
  color: EdgeColorReference;
  variables: Map<string, VariableEntry>;
};

export type NameGeneratorPromptEntry = {
  id: string;
  text: TextInput;
  additionalAttributes?: { variable: string; value: boolean }[];
};

export type SociogramPromptEntry = {
  id: string;
  text: TextInput;
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
  text: TextInput;
  createEdge: string;
};

export type OneToManyDyadCensusPromptEntry = {
  id: string;
  text: TextInput;
  createEdge: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type OrdinalBinPromptEntry = {
  id: string;
  text: TextInput;
  variable: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
  color?: OrdinalColorReference;
};

export type CategoricalBinPromptEntry = {
  id: string;
  text: TextInput;
  variable: string;
  otherVariable?: string;
  otherVariablePrompt?: TextInput;
  otherOptionLabel?: TextInput;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type TieStrengthCensusPromptEntry = {
  id: string;
  text: TextInput;
  createEdge: string;
  edgeVariable: string;
  negativeLabel: TextInput;
};

export type DiseaseNominationStepEntry = {
  id: string;
  text: TextInput;
  variable: string;
};

export type GeospatialPromptEntry = {
  id: string;
  text: TextInput;
  variable: string;
};

type MapOptionsEntry = {
  tokenAssetId: string;
  style: string;
  center: [number, number];
  initialZoom: number;
  dataSourceAssetId: string;
  color: ColorReference;
  targetFeatureProperty: string;
  showTransit?: boolean;
  allowSearch?: boolean;
};

export type PromptEntry =
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
  label: TextInput;
  layoutVariable: string;
  edges?: {
    display: string[];
  };
  groupVariable?: string;
  highlight?: string[];
};

type FormFieldEntry = {
  variable: string;
  prompt: TextInput;
  hint?: TextInput;
  showValidationHints?: boolean;
};

// Unlike the shared form fields' `prompt`, composer attribute fields caption
// with an optional `label` (the runtime falls back to the variable's name).
// Mirrors the schema's ComposerFormFieldSchema: `component` is required.
export type NetworkComposerFormFieldEntry = {
  variable: string;
  component: ComponentType;
  parameters?: Record<string, unknown>;
  label?: TextInput;
  hint?: TextInput;
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
  title: TextInput;
  fields: FormFieldEntry[];
};

type PanelEntry = {
  id: string;
  title: TextInput;
  dataSource: string;
  filter?: FilterInput;
};

type TextItemInput = {
  id: string;
  type: 'text';
  content: TextInput;
  // A researcher note, never shown to participants, so it is not localized.
  description?: string;
};

type AssetItemInput = {
  id: string;
  type: 'asset';
  content: string;
  description?: TextInput;
};

export type ItemInput =
  | TextItemInput
  | (AssetItemInput & { size?: Extract<Item, { type: 'asset' }>['size'] });

// The pedigree intro screen has no item-resizing UI, so its asset items carry
// no `size`.
export type IntroItemInput = TextItemInput | AssetItemInput;

export type NominationPromptInput = Omit<
  FamilyPedigreeNominationPromptInput,
  'text'
> & { text: TextInput };

type FamilyPedigreeFormItemInput = NonNullable<
  FamilyPedigreeNodeConfigInput['form']
>[number];

export type FamilyPedigreeNodeConfigEntryInput = Omit<
  FamilyPedigreeNodeConfigInput,
  'form'
> & {
  form?: (Omit<FamilyPedigreeFormItemInput, 'prompt' | 'hint'> & {
    prompt: TextInput;
    hint?: TextInput;
  })[];
};

export type StageEntry = {
  id: string;
  type: StageType;
  label: TextInput;
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
    title: TextInput;
    text: TextInput;
  };
  title?: TextInput;
  items?: ItemInput[];
  initialEdges: [number, number][];
  // NameGeneratorQuickAdd
  quickAdd?: string;
  // NameGeneratorRoster
  dataSource?: string;
  cardOptions?: {
    additionalProperties?: { label: TextInput; variable: string }[];
  };
  sortOptions?: {
    sortOrder: SortRule[];
    sortableProperties: { variable: string; label: TextInput }[];
  };
  searchOptions?: {
    fuzziness: number;
    matchProperties: string[];
  };
  // Anonymisation
  explanationText?: {
    title: TextInput;
    body: TextInput;
  };
  validation?: { minLength?: number; maxLength?: number };
  // TieStrengthCensus (edge type reference on stage)
  edgeType?: { entity: 'edge'; type: string };
  // FamilyPedigree-specific fields, derived from the protocol-validation schema
  // so they cannot drift from it.
  nodeConfig?: FamilyPedigreeNodeConfigEntryInput;
  edgeConfig?: FamilyPedigreeEdgeConfigInput;
  framing?: FamilyPedigreeFraming;
  // NarrativePedigree-specific fields
  narrativePedigreeSourceStageId?: string;
  narrativePedigreeDiseases?: NarrativeDiseaseEntry[];
  narrativePedigreeShowAtRiskStatuses?: boolean;
  boundaries?: FamilyPedigreeBoundaries;
  introScreen?: {
    items: IntroItemInput[];
  };
  censusPrompt?: TextInput;
  nominationPrompts?: NominationPromptInput[];
  // Geospatial
  mapOptions?: MapOptionsEntry;
  // LanguageChooser
  introduction?: TextInput;
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
  // Manually seeded edges (addManualEdge) take full control of their
  // attributes: unset attributes are left neutral rather than randomised.
  manual?: boolean;
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
  label?: TextInput;
  color?: NodeColorReference;
  icon?: string;
  shape?: { default: string; dynamic?: ShapeMapping };
};

export type AddEdgeTypeInput = {
  name?: string;
  label?: TextInput;
  color?: EdgeColorReference;
};

export type AddVariableInput = {
  id?: string;
  name?: string;
  label?: TextInput;
  type?: VariableType;
  component?: ComponentType;
  options?: VariableOptionInput[];
  validation?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  encrypted?: boolean;
};

export type FormFieldInput = {
  variable?: string;
  prompt?: TextInput;
  hint?: TextInput;
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
  label?: TextInput;
  hint?: TextInput;
  showValidationHints?: boolean;
  component: ComponentType;
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};

export type AddStageInput = {
  label?: TextInput;
  interviewScript?: string;
  skipLogic?: SkipLogicInput;
  filter?: FilterInput;
  subject?: { entity: 'node'; type: string } | { entity: 'edge'; type: string };
  initialNodes?: InitialNodesSpec;
  initialEdges?: [number, number][];
  background?: {
    concentricCircles?: number;
    skewedTowardCenter?: boolean;
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
    title?: TextInput;
    fields: FormFieldInput[];
  };
  introductionPanel?: {
    title?: TextInput;
    text?: TextInput;
  };
  // NameGeneratorQuickAdd
  quickAdd?: string;
  // NameGeneratorRoster
  dataSource?: string;
  cardOptions?: {
    additionalProperties?: { label: TextInput; variable: string }[];
  };
  sortOptions?: {
    sortOrder?: SortRule[];
    sortableProperties?: { variable: string; label: TextInput }[];
  };
  searchOptions?: {
    fuzziness?: number;
    matchProperties?: string[];
  };
  // Anonymisation
  explanationText?: {
    title?: TextInput;
    body?: TextInput;
  };
  validation?: { minLength?: number; maxLength?: number };
  // FamilyPedigree
  nodeConfig?: FamilyPedigreeNodeConfigEntryInput;
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
    items: IntroItemInput[];
  };
  censusPrompt?: TextInput;
  nominationPrompts?: NominationPromptInput[];
  // Geospatial
  mapOptions?: MapOptionsEntry;
  // LanguageChooser
  introduction?: TextInput;
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
  text?: TextInput;
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
  text?: TextInput;
  createEdge?: boolean | string;
};

export type AddOneToManyDyadCensusPromptInput = {
  text?: TextInput;
  createEdge?: boolean | string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type AddOrdinalBinPromptInput = {
  text?: TextInput;
  variable?: string;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
  color?: OrdinalColorReference;
};

export type AddCategoricalBinPromptInput = {
  text?: TextInput;
  variable?: string;
  otherVariable?: string;
  otherVariablePrompt?: TextInput;
  otherOptionLabel?: TextInput;
  bucketSortOrder?: SortRule[];
  binSortOrder?: SortRule[];
};

export type AddTieStrengthCensusPromptInput = {
  text?: TextInput;
  createEdge?: boolean | string;
  edgeVariable?: string;
  negativeLabel?: TextInput;
};

export type AddDiseaseNominationStepInput = {
  text?: TextInput;
  variable?: string;
};

export type AddGeospatialPromptInput = {
  text?: TextInput;
  variable?: string;
};

export type AddPresetInput = {
  label?: TextInput;
  layoutVariable?: string;
  edges?: {
    display?: string[];
  };
  groupVariable?: string | boolean;
  highlight?: string[] | boolean;
};

export type NarrativeDiseaseEntry = {
  id: string;
  label: TextInput;
  color: NodeColorReference;
  variable: string;
  inheritancePattern: string;
};

export type GetSessionInput = {
  currentStep?: number;
  promptIndex?: number;
  stageMetadata?: Record<number, unknown> | null;
};
