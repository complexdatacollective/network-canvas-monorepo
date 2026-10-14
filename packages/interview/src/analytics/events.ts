import { Schema } from 'effect';

import type { ComponentType, StageType } from '@codaco/protocol-validation';
import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';

import type { interviewLocales } from '../i18n/locales';
import { MAX_ELAPSED_MS } from './elapsed.ts';

export type AnalyticsStageType = StageType | 'FinishSession';

const DECLARED_STAGE_TYPES = [
  'AlterEdgeForm',
  'AlterForm',
  'Anonymisation',
  'CategoricalBin',
  'DyadCensus',
  'EgoForm',
  'FamilyPedigree',
  'FinishSession',
  'Geospatial',
  'Information',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Narrative',
  'NarrativePedigree',
  'NetworkComposer',
  'OneToManyDyadCensus',
  'OrdinalBin',
  'Sociogram',
  'TieStrengthCensus',
] as const satisfies readonly AnalyticsStageType[];

export const ANALYTICS_STAGE_TYPES: [
  Exclude<AnalyticsStageType, (typeof DECLARED_STAGE_TYPES)[number]>,
] extends [never]
  ? typeof DECLARED_STAGE_TYPES
  : never = DECLARED_STAGE_TYPES;

const DECLARED_COMPONENT_TYPES = [
  'Boolean',
  'CheckboxGroup',
  'Number',
  'RadioGroup',
  'Text',
  'TextArea',
  'Toggle',
  'ToggleButtonGroup',
  'VisualAnalogScale',
  'LikertScale',
  'DatePicker',
  'RelativeDatePicker',
] as const satisfies readonly ComponentType[];

export const ANALYTICS_COMPONENT_TYPES: [
  Exclude<ComponentType, (typeof DECLARED_COMPONENT_TYPES)[number]>,
] extends [never]
  ? typeof DECLARED_COMPONENT_TYPES
  : never = DECLARED_COMPONENT_TYPES;

type InterviewLocale = (typeof interviewLocales)[number]['locale'];

const DECLARED_LOCALES = [
  'en',
  'en-GB',
  'es',
  'zh-Hans',
  'zh-Hant',
  'de',
  'nl',
  'pt-BR',
  'it',
  'fr',
] as const satisfies readonly InterviewLocale[];

export const ANALYTICS_LOCALES: [
  Exclude<InterviewLocale, (typeof DECLARED_LOCALES)[number]>,
] extends [never]
  ? typeof DECLARED_LOCALES
  : never = DECLARED_LOCALES;

export const STAGE_VALIDATION_KINDS = [
  'unknown',
  'comparison_response_required',
] as const;

export type StageValidationKind = (typeof STAGE_VALIDATION_KINDS)[number];

export const FORM_KINDS = ['alter', 'alter_edge', 'ego', 'slides'] as const;

export type FormKind = (typeof FORM_KINDS)[number];

export type AnalyticsFieldComponent = ComponentType | 'unknown';

const MAX_INDEX = 10_000;
const MAX_COUNT = 1_000_000;

const boundedInt = (maximum: number) =>
  Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 0, maximum }),
  );

const Index = boundedInt(MAX_INDEX);
const Count = boundedInt(MAX_COUNT);
const DurationMs = boundedInt(MAX_ELAPSED_MS);

const EntityId = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    { expected: 'a session pseudonym' },
  ),
);

const StageTypeCode = Schema.Literals(ANALYTICS_STAGE_TYPES);
const FieldComponent = Schema.Literals([
  ...ANALYTICS_COMPONENT_TYPES,
  'unknown',
]);
const FormKindCode = Schema.Literals(FORM_KINDS);
const StepDirection = Schema.Literals(['forward', 'back', 'jumped']);

const noProperties = Schema.Struct({});

const nodeOnly = Schema.Struct({ node_id: EntityId });

const optionalNode = Schema.Struct({ node_id: Schema.optionalKey(EntityId) });

const binIndex = Schema.Struct({ bin_index: Index });

export const InterviewAnalyticsEvents = {
  interview_started: noProperties,
  interview_finished: Schema.Struct({ stage_count: Count }),
  stage_entered: Schema.Struct({
    stage_type: Schema.optionalKey(StageTypeCode),
    stage_index: Index,
    direction: Schema.Literals(['initial', 'forward', 'back', 'jumped']),
  }),
  stage_exited: Schema.Struct({
    stage_type: Schema.optionalKey(StageTypeCode),
    stage_index: Index,
    duration_ms: DurationMs,
    exit_direction: StepDirection,
  }),
  stage_validation_failed: Schema.Struct({
    validation_kind: Schema.Literals(STAGE_VALIDATION_KINDS),
    direction: Schema.Literals(['forwards', 'backwards']),
  }),
  node_added: Schema.Struct({
    node_id: EntityId,
    node_type_index: Schema.optionalKey(Index),
  }),
  node_removed: nodeOnly,
  edge_created: Schema.Struct({
    edge_id: EntityId,
    edge_type_index: Schema.optionalKey(Index),
  }),
  edge_removed: Schema.Struct({ edge_id: EntityId }),
  node_added_to_prompt: optionalNode,
  node_removed_from_prompt: optionalNode,
  passphrase_set: noProperties,
  passphrase_validation_failed: noProperties,
  node_form_opened: optionalNode,
  node_form_dismissed_without_save: optionalNode,
  simulation_started: Schema.Struct({ node_count: Count, edge_count: Count }),
  simulation_finished: Schema.Struct({
    duration_ms: DurationMs,
    node_count: Count,
    edge_count: Count,
  }),
  node_selected: nodeOnly,
  node_deselected: nodeOnly,
  node_repositioned: nodeOnly,
  node_initial_positioned: nodeOnly,
  node_unplaced: nodeOnly,
  pair_shown: Schema.Struct({ node_a_id: EntityId, node_b_id: EntityId }),
  focal_node: nodeOnly,
  roster_loaded: Schema.Struct({ entry_count: Count }),
  roster_filter_changed: Schema.Struct({ has_filter: Schema.Boolean }),
  form_opened: Schema.Struct({
    form_kind: FormKindCode,
    field_details: Schema.Array(FieldComponent).check(
      Schema.isMaxLength(MAX_INDEX),
    ),
    entity_id: Schema.optionalKey(EntityId),
  }),
  form_submitted: Schema.Struct({
    form_kind: FormKindCode,
    entity_id: Schema.optionalKey(EntityId),
  }),
  form_dismissed_without_save: Schema.Struct({ form_kind: FormKindCode }),
  form_validation_failed: Schema.Struct({
    form_kind: FormKindCode,
    field_errors: Schema.Array(
      Schema.Struct({ field_index: Index, component: FieldComponent }),
    ).check(Schema.isMaxLength(MAX_INDEX)),
  }),
  slides_form_slide_advanced: Schema.Struct({
    slide_index: Index,
    total_slides: Count,
  }),
  bin_expanded: binIndex,
  bin_collapsed: binIndex,
  node_binned: Schema.Struct({
    node_id: EntityId,
    node_type_index: Schema.optionalKey(Index),
    bin_index: Index,
  }),
  node_rebinned: Schema.Struct({
    node_id: EntityId,
    node_type_index: Schema.optionalKey(Index),
    from_bin_index: Index,
    to_bin_index: Index,
  }),
  annotation_drawn: noProperties,
  annotations_reset: noProperties,
  narrative_preset_changed: Schema.Struct({
    preset_index: Index,
    direction: StepDirection,
  }),
  narrative_preset_updated: Schema.Struct({
    preset_index: Index,
    changed: Schema.Literals(['highlight', 'group', 'edge_type']),
  }),
  pedigree_wizard_shown: noProperties,
  pedigree_wizard_abandoned: noProperties,
  pedigree_wizard_complete: Schema.Struct({
    nodes_created: Count,
    edges_created: Count,
  }),
  geospatial_location_selected: Schema.Struct({
    node_id: EntityId,
    selection_kind: Schema.Literals(['search', 'pin']),
  }),
  geospatial_search_performed: nodeOnly,
};

export type InterviewAnalyticsEventName = keyof typeof InterviewAnalyticsEvents;

export type InterviewAnalyticsEventProperties<
  Name extends InterviewAnalyticsEventName,
> = (typeof InterviewAnalyticsEvents)[Name]['Type'];

export const InterviewExceptionProperties = Schema.Union([
  Schema.Struct({
    feature: Schema.Literal('locale-load'),
    locale: Schema.optionalKey(Schema.Literals(ANALYTICS_LOCALES)),
  }),
  Schema.Struct({
    feature: Schema.Literal('information-media'),
    media_kind: Schema.Literal('video'),
  }),
  Schema.Struct({
    feature: Schema.Literal('stage-error-boundary'),
    component_stack: Schema.optionalKey(Schema.NullOr(Schema.String)),
    is_offline: Schema.Boolean,
  }),
  Schema.Struct({ feature: Schema.Literal('external-data') }),
  Schema.Struct({ feature: Schema.Literal('geospatial-map-init') }),
]);

export type InterviewExceptionProperties =
  typeof InterviewExceptionProperties.Type;

const HostValue = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
);

const VersionString = Schema.String.check(
  Schema.isPattern(/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:[-+][0-9A-Za-z.-]{1,64})?$/, {
    expected: 'a version string',
  }),
);

export const InterviewAnalyticsEnvelope = Schema.Struct({
  [POSTHOG_APP_PROPS.APP]: HostValue,
  [POSTHOG_APP_PROPS.APP_NAME]: HostValue,
  [POSTHOG_APP_PROPS.APP_VERSION]: Schema.optionalKey(HostValue),
  [POSTHOG_APP_PROPS.INSTALLATION_ID]: HostValue,
  [POSTHOG_APP_PROPS.HOST_VERSION]: Schema.optionalKey(HostValue),
  package_version: VersionString,
  protocol_hash: HostValue,
  distinct_id: HostValue,
});
