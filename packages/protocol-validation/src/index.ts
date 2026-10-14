import { asEntityAttributeReference } from './schemas/9/entity-attribute-reference.ts';
import { getAssetMimeType } from './utils/asset-mime-type.ts';
import {
  type AssetReferenceHit,
  collectAssetReferences,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectEntityTypeReferencesFromSchema,
  collectStageReferences,
  declaredStageReferenceSites,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  type StageReferenceHit,
} from './utils/collectEntityAttributeReferences.ts';
import { describeProtocolFileError } from './utils/describeProtocolFileError.ts';
import {
  createNetcanvasReader,
  type ExtractedAsset,
  type ExtractedAssets,
  extractProtocol,
  extractProtocolFromZip,
  loadNetcanvasArchive,
  MAX_INFLATED_BYTES,
  type MissingAsset,
  missingAssetsError,
  type NetcanvasReader,
  NetcanvasInflationLimitError,
} from './utils/extractProtocol.ts';
import { hashProtocol } from './utils/hashProtocol.ts';
import {
  MalformedNetcanvasError,
  type MalformedNetcanvasReason,
} from './utils/malformedNetcanvasError.ts';
import {
  getProtocolFileErrorKind,
  isProtocolFileFault,
  type ProtocolFileErrorKind,
} from './utils/protocolFileErrorKind.ts';
import {
  findCollidingAttributeNames,
  getVariableNamesFromNetwork,
  isUsableExternalAttributeName,
  type Network,
  validateNames,
} from './utils/validateExternalData.ts';
import validateProtocol, {
  FINISH_STAGE_TEXT_MISSING,
  formatProtocolValidationIssues,
  ProtocolValidationError,
  type ProtocolValidationIssue,
  type ProtocolValidationResult,
  type ValidateProtocolOptions,
} from './validation/validate-protocol.ts';

export {
  analyzeProtocolLocalization,
  type ProtocolLocalizationWarning,
} from './localization/analyzeProtocolLocalization.ts';
export {
  getLocaleMetadata,
  type LocaleMetadata,
  sortByLanguageName,
} from './localization/localeMetadata.ts';
export {
  normalizeLocalePreferences,
  parseAcceptLanguage,
  selectProtocolLocale,
} from './localization/localePreferences.ts';
export {
  canonicalizeLocale,
  isUndeterminedLocale,
  type LocaleTag,
  type LocalizationDeclaration,
} from './localization/localeTag.ts';
export { isBlankMessage, isBlankText } from './localization/blankText.ts';
// Localized messages whose translations may use the arguments their setting
// declares, and the versions an editor shows each one as.
export {
  composeMessage,
  findMessageArgumentProblem,
  findMissingPlacement,
  type MessageArgument,
  type MessageArguments,
  type MessagePart,
  type MessageVariant,
  messageVariants,
  type MissingPlacement,
  pluralCategoriesOf,
  pluralCountExamples,
  requiredArgumentsOf,
} from './localization/messageArguments.ts';
// Values from the interview that a stage's text shows (see
// `schemas/9/dynamic-values.ts`): the one message checker, the versions a
// message reads for given values, and the placements a translation must keep.
export {
  DYNAMIC_VALUE_MARKER,
  DYNAMIC_VALUE_NAME,
  type DynamicValueArgument,
  type DynamicValueArguments,
  type DynamicValueState,
  dynamicMessageParts,
  dynamicValueNamesIn,
  findDynamicValueProblem,
  findMissingDynamicPlacement,
  MISSING_CASE,
  type MissingDynamicPlacement,
  TOO_MANY_DYNAMIC_VERSIONS,
} from './localization/dynamicValueMessages.ts';
export { escapeMarkdownText } from './localization/markdownText.ts';
export {
  escapeMessageText,
  messageText,
} from './localization/messageSyntax.ts';
export {
  type ResolvedLocalizedString,
  resolveLocalizedString,
} from './localization/resolveLocalizedString.ts';
export {
  MigrationChain,
  type ProtocolMigration as Migration,
  protocolMigrations,
  type SessionMigrationStep,
} from './migration/index.ts';
export * from './migration/errors.ts';
export {
  detectSchemaVersion,
  getMigrationInfo,
  type MigrationInfo,
  type MigrationNote,
  migrateProtocol,
  migrateProtocolWithSessions,
  type ProtocolWithSessionMigrator,
  ProtocolMigrator,
  protocolMigrator,
} from './migration/migrate-protocol.ts';
export type {
  MigratedSession,
  PersistedSession,
  SessionDocument,
  SessionMigrationResult,
  SessionMigrator,
} from './migration/session.ts';

// Export schema types and constants (Protocol, Codebook, etc)
export * from './schemas/index.ts';
// Interface-owned value sets that are part of the current schema's contract.
// They live in the schema version directory, so a host always reads the set
// the version it targets defines.
export {
  FRAMING_IDS,
  FRAMING_SETTINGS,
  type FramingId,
  type FramingSetting,
  PEDIGREE_COMPLETENESS_SCOPES,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  PEDIGREE_GENDER_WORDS,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT,
  PEDIGREE_RELATIVES_NOT_RECORDED,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
  PEDIGREE_TWIN_KINDS,
  type PedigreeCompletenessScope,
  type PedigreeDefaultGenderIdentityValue,
  type PedigreeGenderWords,
  type PedigreeParentKind,
  type PedigreeRelationshipKind,
  type PedigreeTwinKind,
  type PedigreeRelationshipToParticipant,
  type PedigreeRelativesNotRecorded,
  type PedigreeSexAssignedAtBirth,
} from './schemas/9/family-pedigree-values.ts';
export {
  type LocalizedString,
  type LocalizedStringFormat,
} from './schemas/9/localized-string.ts';
// A stage's dynamic values: the bindings, the path vocabulary, and the one
// table of what each site can show, which validation and Architect share.
export {
  CASED_VARIABLE_TYPES,
  DYNAMIC_VALUE_ROLE_PREFIXES,
  DYNAMIC_VALUE_VARIABLE_TYPES,
  type DynamicValueBinding,
  type DynamicValueRole,
  type DynamicValues,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  type DynamicValueStatus,
  dynamicValueArgumentsAt,
  dynamicValuePathFor,
  dynamicValueRolesAt,
  dynamicValueStatus,
  dynamicValueUnshowableReason,
  INTRINSIC_DYNAMIC_VALUES,
  type IntrinsicDynamicValue,
  type ParsedDynamicValuePath,
  parseDynamicValuePath,
} from './schemas/9/dynamic-values.ts';
export {
  dynamicValueContextFor,
  type DynamicValueProblem,
  findDynamicValueProblems,
} from './schemas/9/dynamic-value-validation.ts';
// What the Family Pedigree's localized messages may use, for an editor of
// them.
export {
  type FamilyPedigreeWording,
  PEDIGREE_PERSON_ARGUMENTS,
  PEDIGREE_WORDING_ARGUMENTS,
} from './schemas/9/stages/family-pedigree.ts';
// The arguments a name generator's minimum notice may use.
export { NODE_COUNT_ARGUMENTS } from './schemas/9/stages/name-generator.ts';
export {
  familyPedigreeWordingIn,
  limitsNominationBySex,
} from './schemas/9/stage-wording/family-pedigree.ts';
// The Family Pedigree option labels Network Canvas supplies, written into a
// protocol by Architect.
export {
  hasSuppliedOptionLabels,
  isSuppliedOptionLabelSet,
  SUPPLIED_PEDIGREE_OPTION_LABELS,
  type SuppliedOptionLabelSet,
  suppliedOptionLabel,
  suppliedOptionLabels,
  suppliedOptionLabelsAfterLanguageChange,
} from './schemas/9/family-pedigree-option-labels.ts';
// How text Network Canvas supplies follows a change to a protocol's languages.
export { type LanguageChange } from './schemas/9/supplied-text.ts';
// The arguments of the Narrative Pedigree's snapshot titles, which the stage
// editor offers the same placeholders as the schema declares.
export {
  SNAPSHOT_CONDITION_ARGUMENTS,
  SNAPSHOT_INHERITANCE_ARGUMENTS,
} from './schemas/9/stages/narrative-pedigree.ts';
// The stage settings whose wording Network Canvas supplies, written into a
// stage by Architect when it is made and when a language is added.
export {
  inapplicableStageSettings,
  isSuppliedEnglishMessage,
  missingSuppliedStageText,
  type SuppliedStageText,
  suppliedStageText,
  suppliedStageSettingApplies,
  suppliedStageTextAfterLanguageChange,
} from './schemas/9/supplied-stage-text.ts';
// The interview's shared words a protocol holds in its own languages, written
// and removed by the migration and Architect as the protocol uses them.
export {
  INTERFACE_TEXT_MESSAGES,
  type InterfaceText,
  interfaceTextAfterLanguageChange,
  type InterfaceTextUpdate,
  withInterfaceText,
} from './schemas/9/interface-text.ts';
// The finish stage text Network Canvas supplies, written into a protocol by
// the v8 → v9 migration and by Architect.
export {
  createDefaultFinishSessionStage,
  DEFAULT_FINISH_SESSION_TEXT,
  defaultFinishSessionFields,
  defaultFinishSessionText,
  type FinishSessionText,
  hasDefaultFinishSessionText,
  defaultFinishSessionTextAfterLanguageChange,
} from './schemas/9/finish-session-defaults.ts';
export {
  findFinishStageTextProblems,
  type FinishStageTextField,
  type FinishStageTextProblem,
} from './schemas/9/finish-stage-text.ts';
export {
  findTimelineStructureProblems,
  isFinishSessionStage,
  type TimelineStructureProblem,
} from './schemas/9/timeline-structure.ts';
export {
  INHERITANCE_PATTERNS,
  type InheritancePattern,
} from './schemas/9/narrative-pedigree-values.ts';
export {
  findValidationContradictions,
  type ValidationContradiction,
} from './schemas/9/variables/validation-contradictions.ts';
export {
  collectVariableRoleHits,
  findVariableRoleConflicts,
  type VariableRoleConflict,
  type VariableRoleGroup,
  type VariableRoleHit,
} from './utils/findVariableRoleConflicts.ts';
// Where a stage document may hold only ONE of several shapes, so that an
// editor writing part of one can be told to write the whole of it — and
// whether a container an editor has ASSEMBLED out of two people's work is one
// the schema refuses, for the places whose members constrain each other
// without being rivals. Both are read off the stage schemas rather than listed
// here; the lists that module also derives stay internal to it, for its tests.
export {
  isExclusiveVariantContainer,
  schemaRefusesContainer,
  VARIANT_ROW_SEGMENT,
} from './schemas/9/exclusive-variant-containers.ts';
// `findExclusiveVariableConflicts` stays internal: it exists to feed the
// protocol schema's own refinement, and a host that wants to know whether a
// protocol is admissible should call `validateProtocol`.
export {
  collectLocalizedStrings,
  type LocalizedStringHit,
} from './utils/collectLocalizedStrings.ts';
export { readRosterCsv } from './utils/readRosterCsv.ts';
export {
  findRosterCharacterProblems,
  type RosterCharacterProblem,
  type RosterCharacterReport,
  type RosterFormat,
} from './utils/rosterCharacters.ts';
export {
  type ExclusiveVariableSlot,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  findStageManagedOptionBindings,
  type InterfaceOwnedOptionBinding,
  type StageManagedOptionBinding,
} from './utils/findExclusiveVariableConflicts.ts';
export {
  asEntityAttributeReference,
  type AssetReferenceHit,
  collectAssetReferences,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectEntityTypeReferencesFromSchema,
  collectStageReferences,
  createNetcanvasReader,
  declaredStageReferenceSites,
  describeProtocolFileError,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  type ExtractedAsset,
  type ExtractedAssets,
  extractProtocol,
  extractProtocolFromZip,
  FINISH_STAGE_TEXT_MISSING,
  findCollidingAttributeNames,
  formatProtocolValidationIssues,
  getAssetMimeType,
  getProtocolFileErrorKind,
  getVariableNamesFromNetwork,
  hashProtocol,
  isProtocolFileFault,
  isUsableExternalAttributeName,
  loadNetcanvasArchive,
  MalformedNetcanvasError,
  type MalformedNetcanvasReason,
  MAX_INFLATED_BYTES,
  type MissingAsset,
  missingAssetsError,
  type NetcanvasReader,
  type Network,
  NetcanvasInflationLimitError,
  type ProtocolFileErrorKind,
  ProtocolValidationError,
  type ProtocolValidationIssue,
  type ProtocolValidationResult,
  type StageReferenceHit,
  type ValidateProtocolOptions,
  validateNames,
  validateProtocol,
};
