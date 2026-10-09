import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

/** Optional researcher presentation; the core migration notes stay English. */
export const migrationNoteMessages = defineMessages({
  schema5TieStrengthCensus: {
    id: 'protocolValidation.migrationNotes.schema5.tieStrengthCensus',
    defaultMessage:
      "Enable the 'Tie Strength Census' interface, which will allow you to conduct a dyad census that also captures the strength of the tie and assigns it to an ordinal attribute.",
    description:
      'One complete Markdown bullet in schema 5 migration approval guidance: tieStrengthCensus. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema5ReferenceValidation: {
    id: 'protocolValidation.migrationNotes.schema5.referenceValidation',
    defaultMessage:
      'Add new validation options for form fields: `unique`, `sameAs`, and `differentFrom`.',
    description:
      'One complete Markdown bullet in schema 5 migration approval guidance: referenceValidation. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema5InterviewScript: {
    id: 'protocolValidation.migrationNotes.schema5.interviewScript',
    defaultMessage:
      "Enable an 'Interview Script' section for each stage, where notes for the interviewer can be added.",
    description:
      'One complete Markdown bullet in schema 5 migration approval guidance: interviewScript. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema6RosterNameGenerator: {
    id: 'protocolValidation.migrationNotes.schema6.rosterNameGenerator',
    defaultMessage:
      'Replace roster-based name generators (small and large) with a single new interface that combines the functionality of both. This will change the interview experience, and may impact your data collection!',
    description:
      'One complete Markdown bullet in schema 6 migration approval guidance: rosterNameGenerator. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema6SociogramAutomaticLayout: {
    id: 'protocolValidation.migrationNotes.schema6.sociogramAutomaticLayout',
    defaultMessage:
      'Enable support for using the automatic node positioning feature on the Sociogram interface.',
    description:
      'One complete Markdown bullet in schema 6 migration approval guidance: sociogramAutomaticLayout. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema7AlterCountLimits: {
    id: 'protocolValidation.migrationNotes.schema7.alterCountLimits',
    defaultMessage:
      'Add the ability to specify minimum and maximum numbers of named alters on name generator stages.',
    description:
      'One complete Markdown bullet in schema 7 migration approval guidance: alterCountLimits. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema7CategoricalSkipLogic: {
    id: 'protocolValidation.migrationNotes.schema7.categoricalSkipLogic',
    defaultMessage:
      'Add additional skip logic options for handling ordinal and categorical attributes.',
    description:
      'One complete Markdown bullet in schema 7 migration approval guidance: categoricalSkipLogic. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8GeospatialInterface: {
    id: 'protocolValidation.migrationNotes.schema8.geospatialInterface',
    defaultMessage:
      'New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: geospatialInterface. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8AnonymisationInterface: {
    id: 'protocolValidation.migrationNotes.schema8.anonymisationInterface',
    defaultMessage:
      'New experimental interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher. Not enabled by default. Contact the team for details.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: anonymisationInterface. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OneToManyDyadCensus: {
    id: 'protocolValidation.migrationNotes.schema8.oneToManyDyadCensus',
    defaultMessage:
      'New interface: "one-to-many dyad-census". Allows the participant to link multiple alters at a time.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: oneToManyDyadCensus. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8FamilyPedigree: {
    id: 'protocolValidation.migrationNotes.schema8.familyPedigree',
    defaultMessage:
      'New interface: "family pedigree". A pedigree building interface designed for genetic disease monitoring scenarios, with configurable node and edge types, relationship attributes, and optional disease/condition nomination prompts.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: familyPedigree. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8ComparisonValidation: {
    id: 'protocolValidation.migrationNotes.schema8.comparisonValidation',
    defaultMessage:
      'Add new validation options for form fields: `greaterThanVariable` and `lessThanVariable`.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: comparisonValidation. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8MembershipComparators: {
    id: 'protocolValidation.migrationNotes.schema8.membershipComparators',
    defaultMessage:
      'Add new comparator options for skip logic and filter: `contains` and `does not contain`.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: membershipComparators. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8SkipDestinations: {
    id: 'protocolValidation.migrationNotes.schema8.skipDestinations',
    defaultMessage:
      'Add optional targeted skip-logic destinations. When a stage is hidden, routing can continue at the next available stage, jump to a later stage, or continue to the interview finish screen.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: skipDestinations. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8MultiValueMembership: {
    id: 'protocolValidation.migrationNotes.schema8.multiValueMembership',
    defaultMessage:
      'Amplify comparator options `includes` and `excludes` for ordinal and categorical attributes to allow multiple selections.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: multiValueMembership. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RemoveDisplayVariable: {
    id: 'protocolValidation.migrationNotes.schema8.removeDisplayVariable',
    defaultMessage:
      "Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: removeDisplayVariable. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RemoveToggleOptions: {
    id: 'protocolValidation.migrationNotes.schema8.removeToggleOptions',
    defaultMessage:
      "Removed 'options' property for boolean Toggle attributes. This property was not used.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: removeToggleOptions. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8EmptyBooleanOptions: {
    id: 'protocolValidation.migrationNotes.schema8.emptyBooleanOptions',
    defaultMessage:
      "A boolean attribute's `options` must now offer at least one choice. An empty list rendered a control with no buttons at all, which a participant could never answer; the empty list is removed so the attribute falls back to the standard Yes/No choices.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: emptyBooleanOptions. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8FilterRuleEntities: {
    id: 'protocolValidation.migrationNotes.schema8.filterRuleEntities',
    defaultMessage:
      'Changed FilterRule type to use the same entity names as elsewhere',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: filterRuleEntities. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8ProtocolName: {
    id: 'protocolValidation.migrationNotes.schema8.protocolName',
    defaultMessage:
      "Added 'name' property to protocol (required dependency for migration)",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: protocolName. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8NodeIcon: {
    id: 'protocolValidation.migrationNotes.schema8.nodeIcon',
    defaultMessage: "Renamed 'iconVariant' to 'icon' on node definitions.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: nodeIcon. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8NodeShape: {
    id: 'protocolValidation.migrationNotes.schema8.nodeShape',
    defaultMessage:
      "Added 'shape' property with default 'circle' to all node definitions.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: nodeShape. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8NodePalette: {
    id: 'protocolValidation.migrationNotes.schema8.nodePalette',
    defaultMessage:
      "A node type's `color` is now restricted to the eight `node-color-seq-1`–`node-color-seq-8` palette values the interfaces can render. Older versions of Architect offered ten, so a node type using the ninth or tenth is moved back onto the palette (the ninth becomes the first, the tenth the second).",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: nodePalette. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8FieldHints: {
    id: 'protocolValidation.migrationNotes.schema8.fieldHints',
    defaultMessage:
      "Added optional 'hint' property to form fields, allowing a markdown string to be displayed as additional guidance for participants.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: fieldHints. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8ValidationHints: {
    id: 'protocolValidation.migrationNotes.schema8.validationHints',
    defaultMessage:
      "Added optional 'showValidationHints' property to form fields, enabling automatic display of hints derived from validation rules.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: validationHints. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RemoveMediaLoop: {
    id: 'protocolValidation.migrationNotes.schema8.removeMediaLoop',
    defaultMessage:
      "Removed 'loop' property from Information stage items and video/audio assets. This property was never honoured by Interviewer.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: removeMediaLoop. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RemoveScalarBounds: {
    id: 'protocolValidation.migrationNotes.schema8.removeScalarBounds',
    defaultMessage:
      'Removed the `minValue` and `maxValue` validators from scalar (visual analog scale) attributes. A scalar response is recorded on a normalised 0-1 scale, so a value bound on it was never meaningful. Any such validator is removed.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: removeScalarBounds. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RequiredBounds: {
    id: 'protocolValidation.migrationNotes.schema8.requiredBounds',
    defaultMessage:
      'A `minValue`, `minLength`, or `minSelected` validator no longer implies a field is required. To preserve the effective behaviour of existing protocols that relied on this coupling, any codebook attribute (node, edge, or ego) with one of these validators and no explicit `required: true` now has `required: true` set.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: requiredBounds. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8CategoricalArrays: {
    id: 'protocolValidation.migrationNotes.schema8.categoricalArrays',
    defaultMessage:
      'Categorical attribute values are now stored as arrays of selected option values. Existing single-value categorical filter and skip-logic rule operands (`is exactly`, `is not`, `includes`, `excludes`) are wrapped in a single-element array to match.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: categoricalArrays. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8StageLabels: {
    id: 'protocolValidation.migrationNotes.schema8.stageLabels',
    defaultMessage:
      'Stage labels are now required to be non-empty. Any stage with a missing or empty label is given a default name based on its position (e.g. "Stage 3").',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: stageLabels. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8InformationTitle: {
    id: 'protocolValidation.migrationNotes.schema8.informationTitle',
    defaultMessage:
      'The Information stage `title` (page heading) is now required. Any Information stage without one is given its stage label as the title, or "Information" when no label was authored.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: informationTitle. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8NameGeneratorTitle: {
    id: 'protocolValidation.migrationNotes.schema8.nameGeneratorTitle',
    defaultMessage:
      'The NameGenerator `form.title` (heading of the add-a-person dialog) is now required. Any NameGenerator form without one is given "Add \'{node type name}\'" (e.g. "Add Person").',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: nameGeneratorTitle. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8FieldInputControl: {
    id: 'protocolValidation.migrationNotes.schema8.fieldInputControl',
    defaultMessage:
      'A codebook attribute referenced by a form field must define a `component` (input control). Previously this was only checked by the Architect editor; a protocol violating it crashed the interview when the form rendered.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: fieldInputControl. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RequiredTextFields: {
    id: 'protocolValidation.migrationNotes.schema8.requiredTextFields',
    defaultMessage:
      "Several free-text fields that the Architect editor already requires are now required (non-empty) in the schema: a prompt's `text`, a form field's `prompt`, an introduction panel's `title` and `text`, an Information item's `content`, a Narrative preset's `label`, a side panel's `title`, a NameGeneratorRoster `dataSource`, and its `searchOptions.matchProperties` (at least one). Any that were empty are backfilled — the form-field prompt from the attribute's name, the panel title from the stage label, a preset/side-panel label by position — else a plain default. An empty `searchOptions`, and an Information asset item with no asset id (a broken reference), are dropped. (The FamilyPedigree `censusPrompt`, NarrativePedigree disease `label`/`color`, and Anonymisation `explanationText` are likewise required but are v8-only, so no migration is needed.)",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: requiredTextFields. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RequiredBackground: {
    id: 'protocolValidation.migrationNotes.schema8.requiredBackground',
    defaultMessage:
      'The Sociogram and Narrative `background` is now required and must be exactly one of its two variants: an image (`image` set, no `concentricCircles`) or concentric circles (`concentricCircles` set to a whole number, no `image`; 0 renders no rings). Stages with no background, or with an incomplete or contradictory one, are normalised: an image wins when present; otherwise `concentricCircles` defaults to 4, matching what the interview already rendered.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: requiredBackground. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OrdinalPalette: {
    id: 'protocolValidation.migrationNotes.schema8.ordinalPalette',
    defaultMessage:
      "An OrdinalBin prompt `color` is now required, restricted to the ten `ord-color-seq-1`–`ord-color-seq-10` palette values the interface can render. Any other value was silently ignored and is removed; prompts without a valid color default to the first palette color (`ord-color-seq-1`), the runtime's previous fallback.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: ordinalPalette. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OrphanOtherConfig: {
    id: 'protocolValidation.migrationNotes.schema8.orphanOtherConfig',
    defaultMessage:
      'A CategoricalBin prompt `otherOptionLabel` or `otherVariablePrompt` without an accompanying `otherVariable` was silently ignored, as was an empty-string `otherVariable`. Such orphaned properties are removed.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: orphanOtherConfig. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OtherLabels: {
    id: 'protocolValidation.migrationNotes.schema8.otherLabels',
    defaultMessage:
      'A CategoricalBin prompt with `otherVariable` set now requires both `otherVariablePrompt` and `otherOptionLabel` (previously a missing label silently dropped the whole "other" bin). A missing value is backfilled from the other authored one, else "Please specify" / "Other".',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: otherLabels. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OtherTextAttribute: {
    id: 'protocolValidation.migrationNotes.schema8.otherTextAttribute',
    defaultMessage:
      'A CategoricalBin prompt\'s `otherVariable` must reference a text attribute because its follow-up control records text. A non-text reference and its associated "other" configuration are removed.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: otherTextAttribute. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8AdditionalAttributesBoolean: {
    id: 'protocolValidation.migrationNotes.schema8.additionalAttributesBoolean',
    defaultMessage:
      "A name generator prompt's `additionalAttributes` must reference boolean attributes. The interview sets each one when a node is added to the prompt and clears it when the node is removed, so a non-boolean target had any value collected for it elsewhere overwritten with true/false and then erased. Entries referencing a non-boolean attribute are removed.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: additionalAttributesBoolean. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8SociogramHighlightAndEdges: {
    id: 'protocolValidation.migrationNotes.schema8.sociogramHighlightAndEdges',
    defaultMessage:
      'A Sociogram prompt with `highlight.allowHighlighting` enabled must name the boolean attribute to toggle, and an `edges` object must set `create` and/or `display`. Prompts violating either were runtime no-ops; the highlight toggle is turned off and the empty edges object removed.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: sociogramHighlightAndEdges. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8AutomaticLayoutBoolean: {
    id: 'protocolValidation.migrationNotes.schema8.automaticLayoutBoolean',
    defaultMessage:
      "The Sociogram and Narrative `automaticLayout` behaviour is now a plain boolean (previously `'{ enabled }'`); existing values are flattened. The Narrative interface gains this behaviour for the first time; it is only active when explicitly enabled, so existing Narrative stages keep their hand-authored static positions.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: automaticLayoutBoolean. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8ContradictoryRules: {
    id: 'protocolValidation.migrationNotes.schema8.contradictoryRules',
    defaultMessage:
      'Validation rules that contradict each other are removed so existing protocols stay valid under the new schema checks: inverted `min`/`max` pairs (both removed), `required` text or categorical attributes whose maximum is zero (the zero maximum is removed), `minSelected` above the option count, `sameAs` and `differentFrom` naming one target (both removed), comparator structures no value can satisfy — impossible cycles, comparisons inside a `sameAs` group, comparisons whose value ranges cannot overlap (the comparator is removed; value bounds are kept), `sameAs` groups whose bounds share no value (the `sameAs` rules are removed) — and validation references to an attribute of a different type. Count-valued rules must be non-negative; negative values are removed.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: contradictoryRules. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8DatePickerBounds: {
    id: 'protocolValidation.migrationNotes.schema8.datePickerBounds',
    defaultMessage:
      "DatePicker `min`/`max` parameters must be real dates written exactly at the picker's resolution, with `min` not after `max`. Values with more precision than the resolution are truncated; other invalid values are removed. At year or month resolution, a bound must use a four-digit year of 1000 or later — the interview builds that resolution's year options unpadded, so an earlier, zero-padded year could never match a stored value; such a bound is removed. Any parameter key other than `type`, `min`, or `max` — e.g. a RelativeDatePicker `anchor` left over from a component switch — is also removed.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: datePickerBounds. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8RelativeDateParameters: {
    id: 'protocolValidation.migrationNotes.schema8.relativeDateParameters',
    defaultMessage:
      "A datetime codebook attribute's RelativeDatePicker `anchor` must be a real date inside the native input's year range of 0001–9999, and its `before`/`after` offsets must be non-negative whole numbers of days. Invalid values, and any unrecognised parameter, are removed; a removed anchor reverts the picker to its interview-date default.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: relativeDateParameters. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8DatetimeParameterObject: {
    id: 'protocolValidation.migrationNotes.schema8.datetimeParameterObject',
    defaultMessage:
      "A datetime attribute's `parameters` must be a plain object; a wrong-typed value (a string, number, list, or null) is removed, reverting the picker to its defaults.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: datetimeParameterObject. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8UnsupportedValidation: {
    id: 'protocolValidation.migrationNotes.schema8.unsupportedValidation',
    defaultMessage:
      "Validation rules the new schema cannot express are removed: rule names it has never defined, rules whose value has the wrong type (e.g. a quoted number), and rules that do not apply to the attribute's type (e.g. `minValue` on a text attribute, or `requiredAcceptsNull` anywhere). A removed `minValue`/`minLength`/`minSelected` still marks the attribute required, preserving the old implied-required behaviour. Layout attributes take no validation at all; theirs is removed.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: unsupportedValidation. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8InputControlCompatibility: {
    id: 'protocolValidation.migrationNotes.schema8.inputControlCompatibility',
    defaultMessage:
      "An attribute's `component` (input control) must be one its type can render. An unrecognised or mismatched control is replaced with the type's standard control (for datetime, chosen by the shape of its `parameters`); layout attributes, which have no control, have it removed.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: inputControlCompatibility. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OptionValueTypes: {
    id: 'protocolValidation.migrationNotes.schema8.optionValueTypes',
    defaultMessage:
      "Ordinal and categorical option values must be strings or whole numbers; a fractional value is converted to its string form (as legacy boolean values already are), and a numeric option label becomes the same text it already displayed. A boolean attribute's option entry that is not a labelled true/false choice is removed; if no entries remain the attribute falls back to the standard Yes/No choices.",
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: optionValueTypes. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8OtherAndQuickAddValidation: {
    id: 'protocolValidation.migrationNotes.schema8.otherAndQuickAddValidation',
    defaultMessage:
      'The CategoricalBin "other" input and the NameGenerator quick-add field now honour the referenced attribute\'s configured validation. Both previously required a response locally, so migration adds `required: true` to every attribute they reference while preserving its other validation rules.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: otherAndQuickAddValidation. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema8DuplicateFormAttributes: {
    id: 'protocolValidation.migrationNotes.schema8.duplicateFormAttributes',
    defaultMessage:
      'A form may no longer collect the same attribute twice. Two fields naming one attribute always shared a single answer — whichever the participant filled in last overwrote the other — so the repeat was never collecting anything of its own. Only the first field for each attribute is kept.',
    description:
      'One complete Markdown bullet in schema 8 migration approval guidance: duplicateFormAttributes. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema9AttributeNames: {
    id: 'protocolValidation.migrationNotes.schema9.attributeNames',
    defaultMessage:
      'Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: attributeNames. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema9DefaultLanguage: {
    id: 'protocolValidation.migrationNotes.schema9.defaultLanguage',
    defaultMessage:
      "Text that participants see is now recorded as English, because older protocols do not record which language they use. After upgrading, confirm the protocol's default language: if your protocol is written in another language, change it on the Languages page in Architect.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded. "Languages" must match the name of the Architect page where languages are managed.',
  },
  schema9BlankFieldQuestions: {
    id: 'protocolValidation.migrationNotes.schema9.blankFieldQuestions',
    defaultMessage:
      'A form field whose question was empty or contained only spaces now uses the name of its attribute as the question, because every question must contain some text.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded. A form field is one question in a form; its attribute is the piece of information the question collects.',
  },
  schema9EncryptedAttributes: {
    id: 'protocolValidation.migrationNotes.schema9.encryptedAttributes',
    defaultMessage:
      'Encrypted attributes are no longer experimental: the Anonymisation interface is always available, and an attribute marked as encrypted is always encrypted. If this protocol marked attributes as encrypted without turning on the experimental "Encrypted Attributes" feature, those attributes are no longer marked, so they keep being collected without encryption.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: encryptedAttributes. "Encrypted Attributes" is the name of the former experimental feature switch in Architect. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema9ContradictoryPassphraseRules: {
    id: 'protocolValidation.migrationNotes.schema9.contradictoryPassphraseRules',
    defaultMessage:
      'If an Anonymisation stage required a minimum passphrase length longer than its maximum, no participant could choose a passphrase, so both lengths are removed and the default minimum length applies.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: contradictoryPassphraseRules. Anonymisation is the name of the interface (stage type) that asks a participant to choose a passphrase protecting some of their answers; the lengths are the shortest and longest passphrase the researcher allowed. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema9DuplicateOptionValues: {
    id: 'protocolValidation.migrationNotes.schema9.duplicateOptionValues',
    defaultMessage:
      'Each option of an ordinal or categorical attribute must now have a value of its own, because answers are stored by value and two options with the same value cannot be told apart. Where options shared a value, the first is kept and the later ones are removed. Values are compared as written, except that a number and text that read the same, such as 1 and "1", count as the same value. Answers already recorded, and skip logic and filters, keep the value they use. If removing options leaves an attribute requiring more selections than it has options, that requirement is removed.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: duplicateOptionValues. An ordinal or categorical attribute offers a fixed list of options; each option has a label the participant reads and a value stored as the answer. Skip logic decides whether a stage is shown; a filter decides which people a stage lists. "Requiring more selections" refers to the minimum number of options a participant must choose. Keep 1 and "1" exactly as written.',
  },
  schema9IntroductionPanelText: {
    id: 'protocolValidation.migrationNotes.schema9.introductionPanelText',
    defaultMessage:
      "An introduction panel's text is now optional, so a panel can show only its title. Text that contained only spaces is removed, so the panel shows only its title, as before. An introduction panel's title must contain some text, so a title that contained only spaces now uses the stage's name.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: introductionPanelText. An introduction panel is the screen with a title and text that opens a form or census stage before its questions. The stage name is the name shown for the stage in the list of stages.',
  },
  schema9OtherBinText: {
    id: 'protocolValidation.migrationNotes.schema9.otherBinText',
    defaultMessage:
      'On a Categorical Bin stage, the label of the bin for answers not listed and the question that asks participants to describe their answer must now contain some text. Where either contained only spaces, it now uses the other\'s text, or "Other" for the label and "Please specify" for the question.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: otherBinText. Categorical Bin is the name of an interface (stage type) where participants sort people into bins; one bin can collect answers that are not listed, and then asks the participant to describe their answer. "Other" and "Please specify" are literal English defaults written into protocol data: keep them in English.',
  },
  schema9TieStrengthDeclineLabel: {
    id: 'protocolValidation.migrationNotes.schema9.tieStrengthDeclineLabel',
    defaultMessage:
      'On a Tie-Strength Census stage, the label of the option for declining to rate a relationship must now contain some text. Where it contained only spaces, it now reads "No relationship".',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: tieStrengthDeclineLabel. Tie-Strength Census is the name of an interface (stage type) where participants rate the strength of the relationship between pairs of people; one option lets them decline to rate it. "No relationship" is a literal English default written into protocol data: keep it in English.',
  },
  schema9EncryptedAttributeRules: {
    id: 'protocolValidation.migrationNotes.schema9.encryptedAttributeRules',
    defaultMessage:
      "Skip logic and filters can no longer compare the answers to an encrypted attribute. Rules are checked without the participant's passphrase, so under schema 8 a rule like this only ever compared the encrypted text, never the answer. These rules are removed. Rules that only check whether an encrypted attribute is answered still work, so they are kept. Skip logic left with no rules is removed, so its stage now always appears: a stage that was shown only when a removed rule matched may never have appeared under schema 8. A filter left with no rules is removed, so it no longer limits what its stage or panel shows. Where other rules remain, they may now match differently: if all rules had to match, they now match at least as often as before; if any one rule could match, at most as often. Check the stages that used the removed rules. Rules in a panel that lists people from an external data file are kept, because that data is not encrypted.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance: encryptedAttributeRules. An encrypted attribute is one whose answers are stored encrypted with a passphrase the participant chooses. Skip logic decides whether a stage is shown; a filter decides which people a stage or panel lists; each is made of rules. A rule either compares an answer (for example, "the name is Alice") or only checks whether the question was answered. A panel is the side list on a name generator stage. "All rules had to match" and "any one rule could match" are the two ways a set of rules can be combined. Preserve code identifiers and literal English defaults written into protocol data. Braces in code examples are ICU-quoted literal text.',
  },
  schema9FamilyPedigree: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigree',
    defaultMessage:
      'Family Pedigree stages are converted to the redesigned Family Pedigree. If a stage had an introduction screen, the screen becomes an Information stage just before the pedigree, which is skipped whenever the pedigree is skipped.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigree. "Family Pedigree" and "Information" are interface names. Keep quoted IDs and attribute names ("pedigree", "relativesNotRecorded") exactly as written.',
  },
  schema9FamilyPedigreeLabels: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeLabels',
    defaultMessage:
      'The Family Pedigree answers for sex assigned at birth and for the kind of each relationship keep the values already recorded, but their labels change to the wording of the redesigned interface. A nomination prompt with the ID "pedigree", which is now reserved, is given a new ID.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeLabels. "Family Pedigree" and "Information" are interface names. Keep quoted IDs and attribute names ("pedigree", "relativesNotRecorded") exactly as written.',
  },
  schema9FamilyPedigreeCompleteness: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeCompleteness',
    defaultMessage:
      "The old Family Pedigree always required two of the participant's parents. A converted Family Pedigree requires both of the participant's biological parents or, where it required recording grandparents, the family up to the grandparents, which also includes siblings, children, the other biological parent of each of the participant's children, aunts and uncles. Where it recommended recording grandparents, it now recommends recording the family up to the grandparents, so recording both parents becomes a recommendation rather than a requirement, because a stage has only one completeness setting. Only biological parents and gamete donors now count as parents; the old interface also counted adoptive parents and surrogates.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeCompleteness. "Family Pedigree" is an interface name. "Parents" are the participant\'s mother and father or other parents; "biological parents" are those who gave the participant their genes.',
  },
  schema9FamilyPedigreeRelativesNotRecorded: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeRelativesNotRecorded',
    defaultMessage:
      'A new attribute, "relativesNotRecorded", is added for the people in every converted Family Pedigree, to record when a participant says someone has no siblings or no children, or does not know. If the person type already has an attribute with that name, the new attribute\'s name ends in a number instead, such as "relativesNotRecorded2".',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeRelativesNotRecorded. "Family Pedigree" is an interface name. Keep the attribute names "relativesNotRecorded" and "relativesNotRecorded2" exactly as written.',
  },
  schema9FamilyPedigreeRemoved: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeRemoved',
    defaultMessage:
      "Two Family Pedigree settings change because the redesigned interface does not use them as they were. Requiring the other biological parent of the participant's children is now part of every completeness setting from parents, siblings and children upwards, and that parent's own family is no longer required. The attribute for which gamete each parent gave is removed, because the interface now works the gamete out from sex assigned at birth; it stays in the codebook with any answers already recorded, but is no longer filled in.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeRemoved. "Family Pedigree" and "Information" are interface names. Keep quoted IDs and attribute names ("pedigree", "relativesNotRecorded") exactly as written.',
  },
  schema9FamilyPedigreeRelationshipToParticipant: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeRelationshipToParticipant',
    defaultMessage:
      "The old Family Pedigree could write each person's relationship to the participant as English text. The redesigned interface records it in a categorical attribute with fixed values that do not depend on language, which a text attribute cannot hold, so a converted stage records no relationship. To keep recording it, for example to filter later stages to the participant's parents, choose or create a categorical attribute for it in the Family Pedigree stage in Architect. The old attribute stays in the codebook with any answers already recorded, but is no longer filled in.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeRelationshipToParticipant. "Family Pedigree" is an interface name and "Architect" is an app name. A categorical attribute is one whose answers are chosen from a fixed list of options.',
  },
  schema9FamilyPedigreeGenderIdentity: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeGenderIdentity',
    defaultMessage:
      "The converted Family Pedigree does not ask about gender identity. Where it uses gendered words such as mother or sister, they follow each person's sex assigned at birth.",
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeGenderIdentity. "Family Pedigree" and "Information" are interface names. Keep quoted IDs and attribute names ("pedigree", "relativesNotRecorded") exactly as written.',
  },
  schema9FamilyPedigreeOwnFields: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeOwnFields',
    defaultMessage:
      'Additional person fields on a Family Pedigree that collected the name or sex assigned at birth are removed, because the redesigned interface asks every person for both itself. The old interface never showed a field for the name. Answers already recorded are kept.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeOwnFields. "Family Pedigree" is an interface name and "Architect" is an app name.',
  },
  schema9FamilyPedigreeSharedAttributes: {
    id: 'protocolValidation.migrationNotes.schema9.familyPedigreeSharedAttributes',
    defaultMessage:
      'A Family Pedigree cannot be converted if two of its answers use the same attribute: two nomination prompts, a nomination prompt and an additional person field, or the name and another answer. Each now needs an attribute of its own. Give each its own attribute in the version of Architect that made the protocol, then upgrade it.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded: familyPedigreeSharedAttributes. "Family Pedigree" is an interface name and "Architect" is an app name.',
  },
  schema9FinishStage: {
    id: 'protocolValidation.migrationNotes.schema9.finishStage',
    defaultMessage:
      'The screen that ends the interview is now a Finish Screen stage at the end of your protocol, so you can change its heading and text and translate them like the rest of your protocol. It starts with the text the interview has always shown there.',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded. "Finish Screen" is the name Architect gives the stage type that ends an interview, where the participant reads closing text and presses Finish; use the same name Architect uses for it.',
  },
  schema9RosterPanelTitle: {
    id: 'protocolValidation.migrationNotes.schema9.rosterPanelTitle',
    defaultMessage:
      'A Name Generator Roster stage now has a panel title, shown above the list of people participants choose from, so you can change it and translate it like the rest of your protocol. It starts with the heading the interview has always shown there, "Available to add".',
    description:
      'One complete Markdown bullet in schema 9 migration approval guidance, shown to researchers when an older protocol is upgraded. "Name Generator Roster" is the name Architect gives the interface; use the same name Architect uses for it. "Available to add" is the English text written into the protocol: keep it in English, in quotation marks.',
  },
});

// Each descriptor is a whole bullet. Markdown separators are structural:
// FormatJS normalizes whitespace when compiling defaults, so putting an entire
// list in one descriptor would silently flatten English production output.
const migrationNoteSets = {
  5: {
    prefix: '',
    suffix: '',
    messages: [
      migrationNoteMessages.schema5TieStrengthCensus,
      migrationNoteMessages.schema5ReferenceValidation,
      migrationNoteMessages.schema5InterviewScript,
    ],
  },
  6: {
    prefix: '\n',
    suffix: '\n',
    messages: [
      migrationNoteMessages.schema6RosterNameGenerator,
      migrationNoteMessages.schema6SociogramAutomaticLayout,
    ],
  },
  7: {
    prefix: '',
    suffix: '',
    messages: [
      migrationNoteMessages.schema7AlterCountLimits,
      migrationNoteMessages.schema7CategoricalSkipLogic,
    ],
  },
  8: {
    prefix: '\n',
    suffix: '\n',
    messages: [
      migrationNoteMessages.schema8GeospatialInterface,
      migrationNoteMessages.schema8AnonymisationInterface,
      migrationNoteMessages.schema8OneToManyDyadCensus,
      migrationNoteMessages.schema8FamilyPedigree,
      migrationNoteMessages.schema8ComparisonValidation,
      migrationNoteMessages.schema8MembershipComparators,
      migrationNoteMessages.schema8SkipDestinations,
      migrationNoteMessages.schema8MultiValueMembership,
      migrationNoteMessages.schema8RemoveDisplayVariable,
      migrationNoteMessages.schema8RemoveToggleOptions,
      migrationNoteMessages.schema8EmptyBooleanOptions,
      migrationNoteMessages.schema8FilterRuleEntities,
      migrationNoteMessages.schema8ProtocolName,
      migrationNoteMessages.schema8NodeIcon,
      migrationNoteMessages.schema8NodeShape,
      migrationNoteMessages.schema8NodePalette,
      migrationNoteMessages.schema8FieldHints,
      migrationNoteMessages.schema8ValidationHints,
      migrationNoteMessages.schema8RemoveMediaLoop,
      migrationNoteMessages.schema8RemoveScalarBounds,
      migrationNoteMessages.schema8RequiredBounds,
      migrationNoteMessages.schema8CategoricalArrays,
      migrationNoteMessages.schema8StageLabels,
      migrationNoteMessages.schema8InformationTitle,
      migrationNoteMessages.schema8NameGeneratorTitle,
      migrationNoteMessages.schema8FieldInputControl,
      migrationNoteMessages.schema8RequiredTextFields,
      migrationNoteMessages.schema8RequiredBackground,
      migrationNoteMessages.schema8OrdinalPalette,
      migrationNoteMessages.schema8OrphanOtherConfig,
      migrationNoteMessages.schema8OtherLabels,
      migrationNoteMessages.schema8OtherTextAttribute,
      migrationNoteMessages.schema8AdditionalAttributesBoolean,
      migrationNoteMessages.schema8SociogramHighlightAndEdges,
      migrationNoteMessages.schema8AutomaticLayoutBoolean,
      migrationNoteMessages.schema8ContradictoryRules,
      migrationNoteMessages.schema8DatePickerBounds,
      migrationNoteMessages.schema8RelativeDateParameters,
      migrationNoteMessages.schema8DatetimeParameterObject,
      migrationNoteMessages.schema8UnsupportedValidation,
      migrationNoteMessages.schema8InputControlCompatibility,
      migrationNoteMessages.schema8OptionValueTypes,
      migrationNoteMessages.schema8OtherAndQuickAddValidation,
      migrationNoteMessages.schema8DuplicateFormAttributes,
    ],
  },
  9: {
    prefix: '',
    suffix: '',
    messages: [
      migrationNoteMessages.schema9AttributeNames,
      migrationNoteMessages.schema9DefaultLanguage,
      migrationNoteMessages.schema9BlankFieldQuestions,
      migrationNoteMessages.schema9EncryptedAttributes,
      migrationNoteMessages.schema9ContradictoryPassphraseRules,
      migrationNoteMessages.schema9DuplicateOptionValues,
      migrationNoteMessages.schema9IntroductionPanelText,
      migrationNoteMessages.schema9OtherBinText,
      migrationNoteMessages.schema9TieStrengthDeclineLabel,
      migrationNoteMessages.schema9EncryptedAttributeRules,
      migrationNoteMessages.schema9FamilyPedigree,
      migrationNoteMessages.schema9FamilyPedigreeLabels,
      migrationNoteMessages.schema9FamilyPedigreeCompleteness,
      migrationNoteMessages.schema9FamilyPedigreeRelativesNotRecorded,
      migrationNoteMessages.schema9FamilyPedigreeRemoved,
      migrationNoteMessages.schema9FamilyPedigreeRelationshipToParticipant,
      migrationNoteMessages.schema9FamilyPedigreeGenderIdentity,
      migrationNoteMessages.schema9FamilyPedigreeOwnFields,
      migrationNoteMessages.schema9FamilyPedigreeSharedAttributes,
      migrationNoteMessages.schema9FinishStage,
      migrationNoteMessages.schema9RosterPanelTitle,
    ],
  },
};

const isKnownMigration = (
  version: number,
): version is keyof typeof migrationNoteSets =>
  Object.hasOwn(migrationNoteSets, version);

/** Format known migration guidance, retaining unknown-version notes as supplied. */
export function formatMigrationNotes(
  version: number,
  notes: string,
  intl: IntlShape,
): string {
  if (!isKnownMigration(version)) return notes;
  const noteSet = migrationNoteSets[version];
  return (
    noteSet.prefix +
    noteSet.messages
      .map((message) => `- ${intl.formatMessage(message)}`)
      .join('\n') +
    noteSet.suffix
  );
}
