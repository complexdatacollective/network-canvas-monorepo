'use client';

import { useEffect, useEffectEvent, useMemo, useRef } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import BooleanField, {
  messages as booleanFieldMessages,
} from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { formMessages } from '@codaco/fresco-ui/form/hooks/useForm';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type {
  FormSubmissionResult,
  FormSubmitHandler,
  ValidationContext,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type FamilyPedigreeWording,
  type FormField,
  type FramingId,
  type LocalizedString,
  type PedigreeParentKind,
  type PedigreeRelationshipKind,
  type PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import PassphraseEntry from '../../../components/PassphraseEntry';
import type { LabelNode } from '../../../dynamicValues/FormDynamicValues';
import QuestionFlow from '../../../forms/QuestionFlow';
import useProtocolForm from '../../../forms/useProtocolForm';
import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  useResolveLocalizedMessage,
  useResolveLocalizedString,
} from '../../../localization/ProtocolLocalizationProvider';
import { useContentFormat } from '../../../localization/useContentFormat';
import {
  getValidationContext,
  selectValidationMetadataForVariable,
  validationPropsFor,
} from '../../../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../../../selectors/protocol';
import { readOwnProperty, writeOwnProperty } from '../../../utils/ownProperty';
import { interfaceMessages } from '../../messages';
import { RELATIVES_NOT_RECORDED } from '../completeness';
import { formatOwnedLabel, parentTermFrom } from '../kinship';
import {
  type AddRelativeRequest,
  type Family,
  type FamilyLink,
  type PedigreeConfig,
  type Person,
  type PersonDetails,
  type Relation,
  type TwinZygosity,
  carrierGivingWay,
  carrierOf,
  carrierRecordOf,
  familyWithLinkKinds,
  type FamilyLinkKind,
  adoptedApart,
  couldCarryPregnancy,
  familyWithIdenticalParents,
  familyWithPlan,
  firmGeneticParentSexes,
  firmGeneticParentsOf,
  geneticParentBlock,
  geneticParentGivingWay,
  geneticParentsPossible,
  hasCarrier,
  surrogateOf,
  holdsGeneratedLabel,
  differentSexesAtBirth,
  couldBeCarrierOf,
  identicalParentLinks,
  identicalSetOf,
  identicalTwinBlocks,
  isGeneticKind,
  isStandIn,
  mayHaveCarried,
  type PlannedLink,
  otherParentChoices,
  sexAnswerGivesWay,
  type SexConflict,
  sexConflicts,
  sexesRefused,
  planAdditionUnder,
  planStandIns,
  planTwinChanges,
  possibleCarriers,
  primaryParentsOf,
  REPLACED_PARENT_KINDS,
  siblingTie,
  siblingsOf,
  standInPlaceTakenFor,
  twinCandidatesOf,
  twinCarrierOf,
  twinCarrierUpdates,
  twinSetOf,
  twinsOf,
} from '../model';
import { childKindWording, type OwnedOptionLabels } from '../options';
import {
  configuredWord,
  type PedigreeWords,
  usePedigreeWords,
} from '../pedigreeWords';
import { DerivedAnswersScope, useDerivedAnswer } from './derivedAnswers';
import {
  bothSameSexReason,
  cannotCarryReason,
  carrierRecordedReason,
  carrierReplacedReason,
  geneticParentReason,
  geneticParentReplacedReason,
  joinReasons,
  type Reason,
  type ReasonContext,
  reasonsFor,
  type UnavailableAnswer,
  sexConflictReason,
} from './unavailableReasons';

export type PersonFormMode =
  | {
      kind: 'add';
      relation: Relation;
      anchor: Person;
      /** Ids for the new person (first) and any unnamed parents their
       * relationship needs, fixed for the opening so the person drawn while
       * the form is filled in, and anyone the form offers as one of their
       * parents, is the one added. */
      ids: readonly string[];
    }
  | {
      kind: 'edit';
      person: Person;
      /** The researcher's questions whose stored answer can never be shown.
       * Each is left as stored unless a new answer is given. */
      unavailable: readonly string[];
    };

export type PersonFormResult = {
  /** Attributes to set on the person. */
  set: PersonDetails;
  /** Attributes to clear (edit only). */
  unset: string[];
  request?: AddRelativeRequest;
  /** Changes to the person's existing relationships (edit only). */
  linkUpdates?: LinkUpdate[];
  /** The answers to whether the person has siblings, and children, for
   * each asked (edit only). */
  relativesAnswers?: Partial<Record<RelativesGroup, RelativesAnswer>>;
  /** Changes to who the person's twins are (edit only). */
  twinChanges?: ReturnType<typeof planTwinChanges>;
  /** People whose sex at birth is cleared, since the person's own, as
   * saved, contradicts it (`sexAnswerGivesWay`; edit only). */
  clearedSexIds?: string[];
  /** Genetic parent links that give twins answered identical the same
   * biological parents and donors (`identicalParentLinks`; edit only). */
  identicalParentLinks?: PlannedLink[];
};

type RelativesGroup = 'siblings' | 'children';
type RelativesAnswer = 'yes' | 'no' | 'unknown';

/** Which relatives to ask about, whether they must be answered, the stage's
 * question for each (`completeness.itemText`), and which the participant has
 * already said "Yes — I'll add them" to. */
export type AskAbout = {
  siblings: boolean;
  children: boolean;
  required: boolean;
  questions: Readonly<{ siblings: LocalizedString; children: LocalizedString }>;
  /** "Yes" is not recorded in the network, so the stage keeps it for the
   * visit and the panel opens on it again. */
  answeredYes?: Partial<Record<RelativesGroup, boolean>>;
};

/** The person being added, as the form stands: shown in the family before
 * the participant confirms them. */
export type PersonDraft = {
  details: PersonDetails;
  request: AddRelativeRequest;
  /** The kind of parent, child or sibling they are has not been chosen: the
   * request assumes one only to draw them in place, so they are not called
   * by it. */
  kindUnanswered: boolean;
};

export type LinkUpdate = {
  linkId: string;
  kind: PedigreeRelationshipKind;
  /** As `FamilyLink`'s: undefined, nothing recorded, while not known. */
  isGestationalCarrier: boolean | undefined;
  isCurrentPartner: boolean;
};

// Names of the relationship questions. They are not attributes: the answers
// decide which links are created.
const ROLE = {
  parentKind: 'pedigreeParentKind',
  carriedPregnancy: 'pedigreeCarriedPregnancy',
  carriedPregnancyUnavailable: 'pedigreeCarriedPregnancyUnavailable',
  partnerId: 'pedigreePartnerId',
  partnershipCurrent: 'pedigreePartnershipCurrent',
  alsoParentOf: 'pedigreeAlsoParentOf',
  replacedParentKind: 'pedigreeReplacedParentKind',
  sharedParents: 'pedigreeSharedParents',
  sharedParentCount: 'pedigreeSharedParentCount',
  siblingKind: 'pedigreeSiblingKind',
  siblingBiologicalParent: 'pedigreeSiblingBiologicalParent',
  siblingOtherBiologicalParent: 'pedigreeSiblingOtherBiologicalParent',
  otherParent: 'pedigreeOtherParent',
  childKind: 'pedigreeChildKind',
  carrier: 'pedigreeCarrier',
  parentCarrier: 'pedigreeParentCarrier',
  biologicalParent: 'pedigreeBiologicalParent',
  otherParentBiological: 'pedigreeOtherParentBiological',
  twin: 'pedigreeTwin',
  twins: 'pedigreeTwins',
  hasSiblings: 'pedigreeHasSiblings',
  hasChildren: 'pedigreeHasChildren',
} as const;

const NONE = '__none';
const UNKNOWN = '__unknown';
/** The sibling form's answer that a new sibling is a twin of the anchor who
 * could not be identical to them, so is fraternal. */
const NOT_IDENTICAL_TWIN = '__notIdenticalTwin';

const PARENT_KINDS: PedigreeParentKind[] = [
  'biological',
  'adoptive',
  'social',
  'donor',
  'surrogate',
];
// A child can be added as any kind of child a parent can be recorded as
// having; a sibling, to the parents they share, as their biological or
// adopted child, the ties that make them a sibling (`siblingTie`). Someone a
// parent raises as a step-child is a step-sibling, added as the child of
// their own parent.
const CHILD_KINDS = PARENT_KINDS;
const SIBLING_KINDS = ['biological', 'adoptive'] as const;
const ZYGOSITIES: TwinZygosity[] = ['identical', 'fraternal', 'unknown'];
const asZygosity = (value: FieldValue | undefined) =>
  ZYGOSITIES.find((zygosity) => zygosity === value);

export type GenderIdentityOption = {
  value: string | number;
  label: string;
};

/** The stage's wording for the name question (`nodeConfiguration.nameField`). */
type NameFieldText = Readonly<{
  prompt: LocalizedString;
  hint?: LocalizedString;
}>;

type PersonFormProps = {
  formId: string;
  /**
   * Where a new person's form puts its step buttons, shown a group of
   * questions at a time. Without it the form shows whole.
   */
  stepNavigation?: HTMLElement | null;
  mode: PersonFormMode;
  family: Family;
  config: PedigreeConfig;
  /** The stage's words for family members, gendered or by gamete. */
  framing: FramingId;
  /** The options of the codebook's gender identity attribute, as the
   * researcher defined them. Empty when the stage does not ask about gender
   * identity. */
  genderIdentityOptions: GenderIdentityOption[];
  /** The codebook's labels for the answers about sex assigned at birth and
   * the kinds of parent. */
  optionLabels: OwnedOptionLabels;
  formFields: FormField[];
  /** The stage's record of who holds a label it saved as their name, by
   * person id. Labels are given afresh, so a typed name may repeat one. */
  generatedLabels: Readonly<Record<string, string>>;
  /** Each encrypted name the stage has decrypted, by person id. */
  decryptedNames: ReadonlyMap<string, string>;
  displayName: (personId: string) => string;
  /** The stage's question asking the person's name, and its hint. */
  nameField: NameFieldText;
  /** Edit only: ask whether the person has siblings, and children. */
  askAbout?: AskAbout;
  /** What the researcher's questions call the relative, or the participant,
   * where they show the node's label: the words the pedigree names them by,
   * as the panel's answers leave them. Without it, the codebook's label
   * rules name them. */
  labelNode?: LabelNode;
  /** Add only: called with the person being added whenever the answers
   * that decide how they are drawn change. */
  onDraftChange?: (draft: PersonDraft) => void;
  /** Stores the result, and says whether it was stored: the panel keeps
   * the answers and shows the errors when it was not. */
  onSubmit: (
    result: PersonFormResult,
  ) => FormSubmissionResult | Promise<FormSubmissionResult>;
};

const asString = (value: FieldValue | undefined) =>
  typeof value === 'string' ? value : undefined;
/** The one of `kinds` the answer names, if it names one. */
const asKind = <Kind extends string>(
  kinds: readonly Kind[],
  value: FieldValue | undefined,
): Kind | undefined => kinds.find((kind) => kind === asString(value));
const asOption = (value: FieldValue | undefined) =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;
const asStringArray = (value: FieldValue | undefined) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/**
 * The name of a question about one particular person, chosen in another
 * answer (which of the anchor and the child's other parent are the child's
 * biological parents; whether a new parent is still with the parent chosen as
 * their partner). Each person the question can be about has their own
 * answer, so choosing someone else asks it afresh rather than giving them the
 * answer about the first, and an answer about someone no longer chosen is
 * never saved: only the question shown is among the form's answers.
 */
const aboutPerson = (question: string, personId: string) =>
  `${question}:${personId}`;

/** The questions about a particular person that the answers as they stand
 * ask, each named for that person (`aboutPerson`). */
const personQuestions = (values: Record<string, FieldValue | undefined>) => {
  const otherParent = asString(values[ROLE.otherParent]);
  const partnerId = asString(values[ROLE.partnerId]);
  return [
    ...(otherParent && otherParent !== NONE && otherParent !== UNKNOWN
      ? [
          aboutPerson(ROLE.biologicalParent, otherParent),
          aboutPerson(ROLE.otherParentBiological, otherParent),
        ]
      : []),
    ...(partnerId && partnerId !== NONE
      ? [aboutPerson(ROLE.partnershipCurrent, partnerId)]
      : []),
  ];
};

/**
 * The form inside the side panel. Asks the interface's own questions about the
 * person, then — when adding — how they are related, then the researcher's
 * additional questions.
 */
export default function PersonForm({
  formId,
  mode,
  family,
  config,
  framing,
  genderIdentityOptions,
  optionLabels,
  formFields,
  generatedLabels,
  decryptedNames,
  displayName,
  nameField,
  askAbout,
  labelNode,
  onDraftChange,
  onSubmit,
  stepNavigation,
}: PersonFormProps) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const contentFormat = useContentFormat();
  const resolve = useResolveLocalizedString();
  const person = mode.kind === 'edit' ? mode.person : undefined;

  const isEgo = person?.isEgo ?? false;
  // The participant is never asked their own name: they are shown as "You",
  // and only what the family tree needs is asked about them. Nor is anyone
  // whose name the stage cannot read, which it would otherwise show as blank
  // and clear.
  const asksName = !isEgo && person?.hasUnreadableName !== true;

  // A typed name follows whatever validation the codebook gives the name
  // attribute (unique, length…), by the same mapping the interview's other
  // forms use. The name may always be left blank, even when the attribute is
  // required: anyone left unnamed is given a label when the participant
  // leaves the stage. `unique` resolves against the people already in the
  // network, leaving out the person being edited, so their own saved name is
  // not a duplicate, and the labels saved for anyone else, which are given
  // afresh. Encrypted names are compared as decrypted.
  const stageVariables = useStageSelector(getCodebookVariablesForSubjectType);
  const nameValidation = selectValidationMetadataForVariable(
    stageVariables,
    config.nameAttribute,
  );
  const { required: _required, ...nameValidationProps } = nameValidation
    ? validationPropsFor(nameValidation)
    : {};
  const baseValidationContext = useStageSelector(getValidationContext);
  const personId = person?.id;
  const nameValidationContext = useMemo<ValidationContext | undefined>(() => {
    const { codebook, network, stageSubject } = baseValidationContext;
    if (!stageSubject) return undefined;
    const isSavedLabel = (node: NcNode) =>
      holdsGeneratedLabel(
        generatedLabels,
        node[entityPrimaryKeyProperty],
        node[entityAttributesProperty][config.nameAttribute],
      );
    return {
      codebook,
      network: {
        ...network,
        nodes: network.nodes.map((node) => {
          const { [config.nameAttribute]: _label, ...attributes } =
            node[entityAttributesProperty];
          if (isSavedLabel(node)) {
            return { ...node, [entityAttributesProperty]: attributes };
          }
          const decrypted = decryptedNames.get(node[entityPrimaryKeyProperty]);
          if (decrypted === undefined) return node;
          return {
            ...node,
            [entityAttributesProperty]: {
              ...attributes,
              [config.nameAttribute]: decrypted,
            },
          };
        }),
      },
      stageSubject,
      ...(personId !== undefined ? { currentEntityId: personId } : {}),
    };
  }, [
    baseValidationContext,
    personId,
    generatedLabels,
    decryptedNames,
    config.nameAttribute,
  ]);

  const initialResearcherValues = useMemo(() => {
    if (!person) return undefined;
    const values: Record<string, FieldValue> = {};
    for (const field of formFields) {
      const value = readOwnProperty(person.attributes, field.variable);
      if (value !== null && value !== undefined) {
        writeOwnProperty(values, field.variable, value);
      }
    }
    return values;
  }, [person, formFields]);

  // The name, gender identity and sex questions come before the
  // researcher's fields, whose text can show their answers as given.
  const builtInVariables = useMemo(
    () => [
      ...(asksName ? [config.nameAttribute] : []),
      ...(config.genderIdentity ? [config.genderIdentity.attribute] : []),
      config.sexAssignedAtBirthAttribute,
    ],
    [
      asksName,
      config.nameAttribute,
      config.genderIdentity,
      config.sexAssignedAtBirthAttribute,
    ],
  );

  const { fieldComponents, toAttributePatch, passphraseNeeded } =
    useProtocolForm({
      fields: formFields,
      subject: { entity: 'node', type: config.personType },
      initialValues: initialResearcherValues,
      currentEntityId: person?.id,
      unavailableVariables: mode.kind === 'edit' ? mode.unavailable : undefined,
      precedingVariables: builtInVariables,
      labelNode,
      isParticipant: isEgo,
    });

  const handleSubmit: FormSubmitHandler = (values) => {
    const set: PersonDetails = readOwnDetails(values, config);
    // A name the form does not ask is left as it is.
    const unset = builtInVariables.filter(
      (variable) => !Object.hasOwn(set, variable),
    );

    // "No" and "Don't know" are recorded; "Yes" leaves the question to the
    // siblings or children the participant goes on to add.
    const notRecordedAttribute = config.relativesNotRecordedAttribute;
    const relativesAnswers: Partial<Record<RelativesGroup, RelativesAnswer>> =
      {};
    for (const [group, question, asked] of [
      ['siblings', ROLE.hasSiblings, askAbout?.siblings],
      ['children', ROLE.hasChildren, askAbout?.children],
    ] as const) {
      const value = asString(values[question]);
      if (asked && (value === 'yes' || value === 'no' || value === 'unknown')) {
        relativesAnswers[group] = value;
      }
    }
    if (
      person &&
      notRecordedAttribute &&
      (askAbout?.siblings || askAbout?.children)
    ) {
      let recorded: string[] = person.relativesNotRecorded;
      const answer = (
        question: string,
        group: (typeof RELATIVES_NOT_RECORDED)[keyof typeof RELATIVES_NOT_RECORDED],
      ) => {
        recorded = recorded.filter(
          (value) => value !== group.none && value !== group.unknown,
        );
        const value = asString(values[question]);
        if (value === 'no') recorded.push(group.none);
        if (value === 'unknown') recorded.push(group.unknown);
      };
      if (askAbout.siblings) {
        answer(ROLE.hasSiblings, RELATIVES_NOT_RECORDED.siblings);
      }
      if (askAbout.children) {
        answer(ROLE.hasChildren, RELATIVES_NOT_RECORDED.children);
      }
      writeOwnProperty(set, notRecordedAttribute, recorded);
    }

    // Every answer the sibling form accepts makes the new person a sibling
    // (`siblingTie`). Someone who shares only a step-parent, or only the
    // surrogate who carried the anchor, is not one, and is added as the
    // child of their own parent instead.
    if (mode.kind === 'add' && mode.relation === 'sibling') {
      const request = readSiblingRequest(values);
      if (
        !makesSibling(
          family,
          mode.anchor.id,
          mode.ids,
          request,
          config.sexAssignedAtBirthAttribute,
        )
      ) {
        return {
          success: false,
          formErrors: [],
          fieldErrors: {
            [ROLE.sharedParents]: [
              text(wording.sharedParentsNotSibling, {
                isYou: mode.anchor.isEgo ? 'true' : 'false',
                name: displayName(mode.anchor.id),
                chosen: contentFormat.formatList(
                  request.sharedParentIds.map((id) =>
                    siblingParentLabel(
                      words,
                      family,
                      mode.anchor,
                      id,
                      displayName,
                      framing,
                    ),
                  ),
                ),
              }),
            ],
          },
        };
      }
    }

    // An answer the network cannot hold fails the whole save, as on the
    // interview's other forms: nothing is saved, and the panel stays open.
    if (formFields.length > 0) {
      const patch = toAttributePatch(values);
      if (!patch.success) {
        return {
          success: false,
          formErrors: [createMessageError(formMessages.submitFailed)],
        };
      }
      for (const [variable, value] of Object.entries(patch.patch.set)) {
        writeOwnProperty(set, variable, value);
      }
      unset.push(...patch.patch.unset);
    }

    // Twins answered identical are given the same biological parents and
    // donors, so their twin changes are read from the family as that leaves
    // it.
    const parentLinksForTwins =
      mode.kind === 'edit'
        ? identicalTwinParentLinks(
            draftFamily(family, mode.person.id, values),
            mode.person.id,
            values,
          )
        : [];
    const twinChanges =
      mode.kind === 'edit'
        ? readTwinChanges(
            familyWithIdenticalParents(
              draftFamily(family, mode.person.id, values),
              parentLinksForTwins,
              config.sexAssignedAtBirthAttribute,
            ),
            mode.person.id,
            values,
            config.sexAssignedAtBirthAttribute,
          )
        : undefined;
    const linkUpdates =
      mode.kind === 'edit'
        ? readLinkUpdates(
            family,
            existingLinksOf(family, mode.person.id),
            values,
            standInsGivingWay(
              family,
              draftFamily(family, mode.person.id, values),
              mode.person.id,
              config.sexAssignedAtBirthAttribute,
            ),
          )
        : undefined;
    // What the sex at birth chosen contradicts gives way to it.
    const sex = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.find(
      (value) => value === asString(values[config.sexAssignedAtBirthAttribute]),
    );
    const givesWay =
      mode.kind === 'edit' &&
      sex !== undefined &&
      sex !== mode.person.sexAssignedAtBirth
        ? sexAnswerGivesWay(family, mode.person.id, sex)
        : undefined;
    const uncarried = (givesWay?.uncarriedLinkIds ?? []).flatMap((linkId) => {
      const link = family.links.find((each) => each.id === linkId);
      return link
        ? [{ ...linkUpdateOf(link), isGestationalCarrier: undefined }]
        : [];
    });
    return onSubmit({
      set,
      unset,
      request:
        mode.kind === 'add'
          ? readRequest(
              mode.relation,
              values,
              mode.anchor,
              family,
              config.sexAssignedAtBirthAttribute,
            )
          : undefined,
      linkUpdates:
        mode.kind === 'edit' && linkUpdates
          ? [
              ...linkUpdates,
              ...twinCarrierSync(
                family,
                mode.person.id,
                linkUpdates,
                twinChanges,
                values,
              ),
              ...uncarried,
            ]
          : undefined,
      relativesAnswers: mode.kind === 'edit' ? relativesAnswers : undefined,
      twinChanges,
      clearedSexIds: givesWay?.clearedSexIds,
      ...(parentLinksForTwins.length > 0
        ? { identicalParentLinks: parentLinksForTwins }
        : {}),
    });
  };

  // Every answer made unavailable by what the family records says why: the
  // hint names the record in the way, and how to choose the answer anyway.
  const reasonContext: ReasonContext = {
    words,
    family,
    displayName,
    sexLabels: optionLabels.sexAssignedAtBirth,
    formatList: contentFormat.formatList,
  };
  return (
    <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
      <DerivedAnswersScope>
        <QuestionFlow
          className="flex flex-col gap-8"
          stepped={mode.kind === 'add'}
          navigation={stepNavigation}
          finish={
            <SubmitButton form={formId}>
              <AppMessage message={commonMessages.save} />
            </SubmitButton>
          }
        >
          <section data-question-step className="flex flex-col">
            {asksName && (
              <Field
                component={InputField}
                name={config.nameAttribute}
                nameMode="opaque"
                label={resolve(nameField.prompt).text}
                {...(nameField.hint === undefined
                  ? {}
                  : { hint: resolve(nameField.hint).text })}
                initialValue={person?.name}
                autoComplete="off"
                // Someone new is named first, so the panel opens ready to type.
                {...(mode.kind === 'add' ? { 'data-initial-focus': true } : {})}
                {...nameValidationProps}
                validationContext={nameValidationContext}
              />
            )}
            {config.genderIdentity && (
              <Field
                component={RadioGroupField}
                name={config.genderIdentity.attribute}
                nameMode="opaque"
                label={text(configuredWord(wording.genderIdentityLabel))}
                options={genderIdentityOptions}
                required
                initialValue={person?.genderIdentity}
              />
            )}
            <SexAssignedAtBirthField
              person={person}
              family={family}
              sexAttribute={config.sexAssignedAtBirthAttribute}
              reasonContext={reasonContext}
            />
          </section>
          {mode.kind === 'add' && onDraftChange && (
            <DraftWatcher
              relation={mode.relation}
              anchor={mode.anchor}
              family={family}
              config={config}
              onDraftChange={onDraftChange}
            />
          )}
          {mode.kind === 'add' && (
            <section data-question-step className="flex flex-col">
              <RelationshipFields
                relation={mode.relation}
                anchor={mode.anchor}
                ids={mode.ids}
                family={family}
                displayName={displayName}
                config={config}
                framing={framing}
                parentKindLabels={optionLabels.parentKind}
                reasonContext={reasonContext}
              />
            </section>
          )}
          {person && askAbout && (askAbout.siblings || askAbout.children) && (
            <RelativesQuestions
              person={person}
              askAbout={askAbout}
              displayName={displayName}
            />
          )}
          {mode.kind === 'edit' && (
            <ExistingRelationshipFields
              person={mode.person}
              family={family}
              displayName={displayName}
              parentKindLabels={optionLabels.parentKind}
              reasonContext={reasonContext}
              sexAttribute={config.sexAssignedAtBirthAttribute}
            />
          )}
          {formFields.length > 0 && (
            <section data-question-step className="flex flex-col">
              <PassphraseEntry needed={passphraseNeeded} />
              {fieldComponents}
            </section>
          )}
        </QuestionFlow>
      </DerivedAnswersScope>
    </FormWithoutProvider>
  );
}

/**
 * Whether the person has siblings, and children, asked when the family must
 * account for them and none are recorded yet.
 */
/** A link as it is recorded, as an update that leaves it so. */
const linkUpdateOf = (link: FamilyLink): LinkUpdate => ({
  linkId: link.id,
  kind: link.kind,
  isGestationalCarrier: link.isGestationalCarrier,
  isCurrentPartner: link.isCurrentPartner,
});

/**
 * The person's sex at birth. Nothing else recorded makes an answer
 * unavailable, except being a surrogate, who always carried the pregnancy:
 * an answer that contradicts how someone is recorded as a parent gives way
 * to it when it is saved (`sexAnswerGivesWay`), so a mistake in either of two
 * answers that depend on each other can be corrected where it was made. The
 * hint says what saving the answer chosen will change before it is saved.
 */
function SexAssignedAtBirthField({
  person,
  family,
  sexAttribute,
  reasonContext,
}: {
  person: Person | undefined;
  family: Family;
  sexAttribute: string;
  reasonContext: ReasonContext;
}) {
  const { wording, text } = usePedigreeWords();
  const value = asString(useFormValue([sexAttribute], 'opaque')[sexAttribute]);
  const answered = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.find(
    (each) => each === value,
  );
  const reasonsOf = (
    sex: PedigreeSexAssignedAtBirth,
    only?: SexConflict['rule'],
  ) =>
    person
      ? sexConflicts(family, person.id, sex)
          .filter((conflict) => only === undefined || conflict.rule === only)
          .map((conflict) =>
            sexConflictReason(reasonContext, person.id, conflict),
          )
      : [];
  const refused = person ? sexesRefused(family, person.id) : [];
  // Only being a surrogate refuses an answer; what else it would contradict
  // is said only once it is chosen, which it cannot be.
  const refusals = refused.flatMap((sex) => reasonsOf(sex, 'surrogate'));
  // What the answer chosen changes, said only once it differs from the
  // answer recorded, which contradicts nothing.
  const changes =
    answered !== undefined &&
    answered !== person?.sexAssignedAtBirth &&
    !refused.includes(answered)
      ? reasonsOf(answered)
      : [];
  const options = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((sex) => ({
    value: sex,
    label: reasonContext.sexLabels[sex],
    disabled: refused.includes(sex),
    description: reasonsFor(reasonContext, refusals, sex),
  }));
  return (
    <Field
      component={RadioGroupField}
      name={sexAttribute}
      nameMode="opaque"
      label={text(wording.sexAssignedAtBirthLabel)}
      options={options}
      required
      hint={joinReasons(reasonContext, [...refusals, ...changes])}
      initialValue={person?.sexAssignedAtBirth}
    />
  );
}

function RelativesQuestions({
  person,
  askAbout,
  displayName,
}: {
  person: Person;
  askAbout: AskAbout;
  displayName: (personId: string) => string;
}) {
  const intl = useAppIntl();
  const resolveMessage = useResolveLocalizedMessage();
  const values = {
    isYou: person.isEgo ? 'true' : 'false',
    name: displayName(person.id),
  };
  const options = [
    { value: 'yes', label: intl.formatMessage(booleanFieldMessages.yes) },
    { value: 'no', label: intl.formatMessage(booleanFieldMessages.no) },
    { value: 'unknown', label: intl.formatMessage(interfaceMessages.dontKnow) },
  ];
  const initial = (relatives: RelativesGroup) => {
    const group = RELATIVES_NOT_RECORDED[relatives];
    if (person.relativesNotRecorded.includes(group.none)) return 'no';
    if (person.relativesNotRecorded.includes(group.unknown)) return 'unknown';
    if (askAbout.answeredYes?.[relatives]) return 'yes';
    return undefined;
  };
  return (
    <section className="flex flex-col">
      {askAbout.siblings && (
        <Field
          component={RadioGroupField}
          name={ROLE.hasSiblings}
          label={resolveMessage(askAbout.questions.siblings, values).text}
          options={options}
          required={askAbout.required}
          initialValue={initial('siblings')}
        />
      )}
      {askAbout.children && (
        <Field
          component={RadioGroupField}
          name={ROLE.hasChildren}
          label={resolveMessage(askAbout.questions.children, values).text}
          options={options}
          required={askAbout.required}
          initialValue={initial('children')}
        />
      )}
    </section>
  );
}

/** The links an edit can change: the person's partnerships and parents. */
function existingLinksOf(family: Family, personId: string) {
  return {
    partnerships: family.links.filter(
      (link) =>
        link.kind === 'partner' &&
        (link.source === personId || link.target === personId),
    ),
    parents: family.links.filter(
      (link) => link.kind !== 'partner' && link.target === personId,
    ),
  };
}

const linkField = (
  link: FamilyLink,
  question: 'current' | 'kind' | 'carrier',
) => `pedigreeLink:${link.id}:${question}`;

/**
 * The family as the panel's unsaved answers about the person's parents
 * leave it: each parent the kind of parent chosen. Twins and stand-ins are
 * worked out from it until the answers are saved, so the panel never offers
 * an answer the save would contradict.
 */
function draftFamily(
  family: Family,
  personId: string,
  values: Record<string, FieldValue | undefined>,
): Family {
  const kinds = new Map<string, FamilyLinkKind>();
  for (const link of existingLinksOf(family, personId).parents) {
    const kind = PARENT_KINDS.find(
      (each) => each === values[linkField(link, 'kind')],
    );
    if (kind !== undefined && kind !== link.kind) kinds.set(link.id, kind);
  }
  return familyWithLinkKinds(family, kinds);
}

/** The person's stand-in parents whose place, as the answers stand, a
 * genetic parent fills (`planStandIns`): they give way when the answers are
 * saved, so are not asked about. */
function standInsGivingWay(
  family: Family,
  draft: Family,
  personId: string,
  sexAttribute: string,
): Set<string> {
  const { removedLinkIds } = planStandIns(
    draft,
    () => '\u0000unused',
    sexAttribute,
    family,
  );
  return new Set(
    existingLinksOf(family, personId)
      .parents.filter(
        (link) =>
          isStandIn(family, link.source) && removedLinkIds.includes(link.id),
      )
      .map((link) => link.id),
  );
}

function readLinkUpdates(
  family: Family,
  links: ReturnType<typeof existingLinksOf>,
  values: Record<string, FieldValue>,
  /** Links not asked about: a stand-in's, giving way. */
  skipped: ReadonlySet<string> = new Set(),
): LinkUpdate[] {
  const updates: LinkUpdate[] = [];
  for (const link of links.partnerships) {
    const isCurrentPartner = values[linkField(link, 'current')] !== false;
    if (isCurrentPartner !== link.isCurrentPartner) {
      updates.push({
        linkId: link.id,
        kind: 'partner',
        isGestationalCarrier: false,
        isCurrentPartner,
      });
    }
  }
  const kindOf = (link: FamilyLink) =>
    asKind(PARENT_KINDS, values[linkField(link, 'kind')]) ?? link.kind;
  const asked = links.parents.filter((link) => !skipped.has(link.id));
  // A surrogate carried them, so none of their other parents did.
  const surrogate = asked.find((link) => kindOf(link) === 'surrogate');
  // Who carried the pregnancy, as answered: one of the parents asked about,
  // or someone else (`ParentCarrierField`).
  const chosen = asString(values[ROLE.parentCarrier]);
  for (const link of asked) {
    const kind = kindOf(link);
    // "No" recorded for a parent who adopted the person rests on the
    // adoption, so goes once another kind of parent is chosen.
    const kept =
      link.kind === 'adoptive' &&
      kind !== 'adoptive' &&
      link.isGestationalCarrier === false
        ? undefined
        : link.isGestationalCarrier;
    const isGestationalCarrier =
      kind === 'surrogate'
        ? true
        : surrogate !== undefined ||
            !mayHaveCarried(kind) ||
            !couldCarryPregnancy(
              family.byId.get(link.source)?.sexAssignedAtBirth,
            )
          ? false
          : chosen === undefined
            ? kept
            : chosen === NONE
              ? // Someone else, or not known: a parent recorded as having
                // carried them is no longer, and nobody is said not to have.
                kept === true
                ? undefined
                : kept
              : chosen === link.source;
    if (
      kind !== link.kind ||
      isGestationalCarrier !== link.isGestationalCarrier
    ) {
      updates.push({
        linkId: link.id,
        kind,
        isGestationalCarrier,
        isCurrentPartner: true,
      });
    }
  }
  return updates;
}

/** Who carried the person, as the answers about their parents leave it. */
function answeredCarrier(
  family: Family,
  personId: string,
  linkUpdates: readonly LinkUpdate[],
): string | undefined {
  const updated = new Map(linkUpdates.map((update) => [update.linkId, update]));
  return existingLinksOf(family, personId).parents.find((link) => {
    const update = updated.get(link.id);
    return update === undefined
      ? link.isGestationalCarrier === true
      : update.isGestationalCarrier === true;
  })?.source;
}

/**
 * Twins come from one pregnancy, so share one carrier: a change to who
 * carried the person, or twins newly recorded for someone with a carrier,
 * records that carrier for each of their twins as the answers leave them
 * (`twinCarrierUpdates`).
 */
function twinCarrierSync(
  family: Family,
  personId: string,
  linkUpdates: readonly LinkUpdate[],
  twinChanges: ReturnType<typeof readTwinChanges>,
  values: Record<string, FieldValue>,
): LinkUpdate[] {
  const carrier = answeredCarrier(family, personId, linkUpdates);
  // The twins as the answers leave them: another set chosen joins whole,
  // and someone unticked from the person's own set leaves it
  // (`planTwinChanges`).
  const current = twinSetOf(family, personId);
  const twinIds = (
    twinChanges === undefined
      ? current
      : asStringArray(values[ROLE.twins]).flatMap((twinId) =>
          current.includes(twinId) ? [twinId] : twinSetOf(family, twinId),
        )
  ).filter((id, at, all) => id !== personId && all.indexOf(id) === at);
  const changed = carrier !== carrierOf(family, personId);
  const joined = (twinChanges?.added.length ?? 0) > 0 && carrier !== undefined;
  // Someone with nobody recorded as carrying them is asked about their
  // twins' carrier (`ParentCarrierField`): answering someone else, or not
  // known, takes it back for the twins too.
  const twinsCarrier = twinIds
    .map((id) => carrierOf(family, id))
    .find((id) => id !== undefined);
  const twinsCarrierTakenBack =
    values[ROLE.parentCarrier] === NONE &&
    carrier === undefined &&
    twinsCarrier !== undefined &&
    existingLinksOf(family, personId).parents.some(
      (link) =>
        link.source === twinsCarrier && link.isGestationalCarrier === undefined,
    );
  if (!changed && !joined && !twinsCarrierTakenBack) return [];
  return twinCarrierUpdates(family, twinIds, carrier).map((update) => ({
    ...update,
    isCurrentPartner: true,
  }));
}

const twinZygosityField = (twinId: string) => `pedigreeTwin:${twinId}`;

/** The answers about the person's twins, as the changes to make, in
 * `family` as the panel's answers leave it (`draftFamily`), with the
 * person's sex at birth as answered: an answer about someone who is no
 * longer the person's sibling there is dropped. */
function readTwinChanges(
  family: Family,
  personId: string,
  values: Record<string, FieldValue>,
  sexAttribute: string,
) {
  const candidates = twinCandidatesOf(family, personId);
  if (candidates.length === 0) return undefined;
  const answeredSex = asString(values[sexAttribute]);
  const sexOf = (id: string) =>
    id === personId ? answeredSex : family.byId.get(id)?.sexAssignedAtBirth;
  const chosen = asStringArray(values[ROLE.twins]).filter((twinId) =>
    candidates.includes(twinId),
  );
  const identicalChosen = chosen.filter(
    (twinId) => values[twinZygosityField(twinId)] === 'identical',
  );
  // Twins who could not be identical are fraternal, and are not asked
  // (`TwinZygosityField`).
  const answers = new Map<string, TwinZygosity>();
  for (const twinId of chosen) {
    answers.set(
      twinId,
      identicalTwinOutlook(
        family,
        personId,
        twinId,
        sexOf,
        identicalChosen.filter((id) => id !== twinId),
        sexAttribute,
      ).possible
        ? (asZygosity(values[twinZygosityField(twinId)]) ?? 'unknown')
        : 'fraternal',
    );
  }
  const changes = planTwinChanges(family, personId, answers, sexOf);
  return changes.added.length > 0 ||
    changes.changed.length > 0 ||
    changes.removedLinkIds.length > 0
    ? changes
    : undefined;
}

/**
 * The person and everyone they would be identical to, as answered: the
 * twins answered identical and everyone identical to those.
 */
function identicalGroup(
  family: Family,
  personId: string,
  identicalTwinIds: readonly string[],
): string[] {
  return [
    ...new Set([
      personId,
      ...identicalTwinIds.flatMap((id) => identicalSetOf(family, id)),
    ]),
  ];
}

/** The genetic parent links that give the person and the twins answered
 * identical the same biological parents and donors, where that is possible
 * (`identicalParentLinks`); none otherwise. */
function identicalTwinParentLinks(
  family: Family,
  personId: string,
  values: Record<string, FieldValue | undefined>,
): PlannedLink[] {
  const identical = asStringArray(values[ROLE.twins]).filter(
    (twinId) => asZygosity(values[twinZygosityField(twinId)]) === 'identical',
  );
  if (identical.length === 0) return [];
  return (
    identicalParentLinks(family, identicalGroup(family, personId, identical)) ??
    []
  );
}

/**
 * Which of the person's siblings are their twins, and for each whether they
 * are identical (ruling 16). Identical twins have the same genetic parents
 * and sex at birth, so a twin who does not share them is fraternal, and is
 * not asked (`TwinZygosityField`).
 */
function TwinFields({
  person,
  family,
  recordedFamily,
  carrierId,
  displayName,
  sexAttribute,
}: {
  person: Person;
  /** The family as the panel's answers leave it (`draftFamily`). */
  family: Family;
  /** The family as recorded. */
  recordedFamily: Family;
  /** Who carried the person, as the answers stand. */
  carrierId: string | undefined;
  displayName: (personId: string) => string;
  sexAttribute: string;
}) {
  const { wording, text } = usePedigreeWords();
  const values = useFormValue([ROLE.twins], 'opaque');
  const chosen = asStringArray(values[ROLE.twins]);
  // Twins come from one pregnancy, so a sibling is not offered as their twin
  // while someone in the sibling's twin set is recorded as carried by
  // someone who could not be recorded instead as whoever carried the person,
  // as the answers stand, or any other twin set chosen (`twinCarrierSync`).
  // Someone with nobody recorded is left so.
  const ownSet = twinSetOf(family, person.id);
  const carrierOfSet = (id: string) =>
    twinSetOf(family, id)
      .map((twinId) => carrierOf(family, twinId))
      .find((carrier) => carrier !== undefined);
  const candidates = twinCandidatesOf(family, person.id).filter((id) => {
    if (ownSet.includes(id)) return true;
    const set = twinSetOf(family, id);
    return [
      carrierId,
      ...chosen.filter((other) => !set.includes(other)).map(carrierOfSet),
    ].every(
      (carrier) =>
        carrier === undefined ||
        set.every(
          (twinId) =>
            carrierOf(family, twinId) === undefined ||
            couldBeCarrierOf(family, twinId, carrier),
        ),
    );
  });
  // Twins answered identical to the person are identical to each other too.
  const zygosities = useFormValue(chosen.map(twinZygosityField), 'opaque');
  const identicalChosen = chosen.filter(
    (twinId) => zygosities[twinZygosityField(twinId)] === 'identical',
  );
  // Everyone in their twin set, so a set recorded with a pair missing is made
  // whole when saved; someone no longer their sibling as the answers stand is
  // not offered, so is not among them (`useDerivedAnswer`).
  const twinsAnswer = useDerivedAnswer({
    name: ROLE.twins,
    nameMode: 'opaque',
    derived: twinSetOf(family, person.id).filter((id) => id !== person.id),
    isAvailable: (id) => typeof id === 'string' && candidates.includes(id),
  });
  if (candidates.length === 0) return null;
  const isYou = (personId: string) => family.byId.get(personId)?.isEgo === true;
  const who = (twinId: string) =>
    isYou(person.id) ? 'personIsYou' : isYou(twinId) ? 'twinIsYou' : 'other';
  return (
    <>
      <Field
        component={CheckboxGroupField}
        name={ROLE.twins}
        nameMode="opaque"
        label={text(wording.twinsLabel, {
          isYou: isYou(person.id) ? 'true' : 'false',
          name: displayName(person.id),
        })}
        hint={text(wording.twinsHint)}
        options={candidates.map((id) => ({
          value: id,
          label: displayName(id),
        }))}
        {...twinsAnswer}
      />
      {chosen
        .filter((twinId) => candidates.includes(twinId))
        .map((twinId) => (
          <TwinZygosityField
            key={twinId}
            person={person}
            twinId={twinId}
            family={family}
            recordedFamily={recordedFamily}
            who={who(twinId)}
            identicalWith={identicalChosen.filter((id) => id !== twinId)}
            displayName={displayName}
            sexAttribute={sexAttribute}
          />
        ))}
    </>
  );
}

/**
 * Whether the person and one of their twins could be identical, with sexes
 * at birth as `sexOf` reads them. Identical twins have the same genetic
 * parents and sex at birth (`identicalTwinBlocks`). Twins whose biological
 * parents and donors differ are given the same ones when answered identical,
 * where that is possible (newest answer wins, `identicalParentLinks`), so
 * only what that leaves rules them out; a difference in sex at birth is
 * answered in each twin's own panel. Answering this twin identical makes
 * everyone identical to them identical to the person and to `identicalWith`,
 * the person's other twins answered identical, and to everyone identical to
 * those, so no two of them may be recorded with different sexes at birth.
 */
function identicalTwinOutlook(
  family: Family,
  personId: string,
  twinId: string,
  sexOf: (id: string) => string | undefined,
  identicalWith: readonly string[],
  sexAttribute: string,
): { possible: boolean; parentsAligned: boolean } {
  const blocks = identicalTwinBlocks(family, personId, twinId, sexOf);
  const parentLinks = blocks.every((block) => block === 'geneticParents')
    ? identicalParentLinks(
        family,
        identicalGroup(family, personId, [...identicalWith, twinId]),
      )
    : undefined;
  const parentsAligned =
    blocks.length > 0 &&
    parentLinks !== undefined &&
    identicalTwinBlocks(
      familyWithIdenticalParents(family, parentLinks, sexAttribute),
      personId,
      twinId,
      sexOf,
    ).length === 0;
  if (blocks.length > 0 && !parentsAligned) {
    return { possible: false, parentsAligned };
  }
  const joining = identicalSetOf(family, twinId).filter(
    (id) => id !== personId,
  );
  const clash = [
    personId,
    ...identicalWith.flatMap((id) => identicalSetOf(family, id)),
  ].some((first) =>
    joining.some(
      (second) =>
        first !== second &&
        !(first === personId && second === twinId) &&
        differentSexesAtBirth(sexOf(first), sexOf(second)),
    ),
  );
  return { possible: !clash, parentsAligned };
}

/**
 * Whether the person and one of their twins are identical, asked only while
 * they could be: otherwise they are fraternal, and recorded so
 * (`readTwinChanges`). A fraternal answer recorded while they could not be
 * identical was never asked, so is not taken as an answer once they could:
 * the question is then asked afresh.
 */
function TwinZygosityField({
  person,
  twinId,
  family,
  recordedFamily,
  who,
  identicalWith,
  displayName,
  sexAttribute,
}: {
  person: Person;
  twinId: string;
  /** The family as the panel's answers leave it (`draftFamily`). */
  family: Family;
  /** The family as recorded. */
  recordedFamily: Family;
  who: 'personIsYou' | 'twinIsYou' | 'other';
  /** The person's other twins answered as identical to them. */
  identicalWith: readonly string[];
  displayName: (personId: string) => string;
  sexAttribute: string;
}) {
  const { wording, text } = usePedigreeWords();
  const intl = useAppIntl();
  // The person's sex at birth as answered in this form.
  const answeredSex = asString(
    useFormValue([sexAttribute], 'opaque')[sexAttribute],
  );
  const recorded = twinsOf(family, person.id).find(
    (each) => each.twinId === twinId,
  );
  const outlook = identicalTwinOutlook(
    family,
    person.id,
    twinId,
    (id) =>
      id === person.id ? answeredSex : family.byId.get(id)?.sexAssignedAtBirth,
    identicalWith,
    sexAttribute,
  );
  // "Fraternal" recorded where identical was impossible was assumed rather
  // than answered, so it is asked afresh once identical is possible.
  const assumedFraternal =
    recorded?.zygosity === 'fraternal' &&
    !identicalTwinOutlook(
      recordedFamily,
      person.id,
      twinId,
      (id) => recordedFamily.byId.get(id)?.sexAssignedAtBirth,
      twinsOf(recordedFamily, person.id).flatMap((each) =>
        each.zygosity === 'identical' && each.twinId !== twinId
          ? [each.twinId]
          : [],
      ),
      sexAttribute,
    ).possible;
  // The answer recorded, followed until the participant answers
  // (`useDerivedAnswer`); none while the question is not asked.
  const zygosityAnswer = useDerivedAnswer({
    name: twinZygosityField(twinId),
    nameMode: 'opaque',
    derived: assumedFraternal ? undefined : recorded?.zygosity,
    isAvailable: () => outlook.possible,
  });
  // What answering identical changes is said once it is chosen.
  const chosenZygosity = asZygosity(
    useFormValue([twinZygosityField(twinId)], 'opaque')[
      twinZygosityField(twinId)
    ],
  );
  if (!outlook.possible) return null;
  const args = {
    who,
    name: displayName(person.id),
    twin: displayName(twinId),
  };
  return (
    <Field
      component={RadioGroupField}
      name={twinZygosityField(twinId)}
      nameMode="opaque"
      label={text(wording.twinZygosityLabel, args)}
      options={ZYGOSITIES.map((value) => ({
        value,
        label:
          value === 'unknown'
            ? intl.formatMessage(interfaceMessages.dontKnow)
            : text(zygosityWording(wording, value)),
      }))}
      hint={
        outlook.parentsAligned && chosenZygosity === 'identical'
          ? text(wording.identicalTwinSharesParents, {
              ...args,
              answer: text(wording.zygosityIdentical),
            })
          : undefined
      }
      required
      {...zygosityAnswer}
    />
  );
}

/**
 * The stage's words of the option for each zygosity two twins may have; the
 * twins' zygosity is unknown in the protocol's own Don't know.
 */
const zygosityWording = (
  wording: FamilyPedigreeWording,
  zygosity: Exclude<TwinZygosity, 'unknown'>,
): LocalizedString =>
  zygosity === 'identical'
    ? wording.zygosityIdentical
    : wording.zygosityFraternal;

function ExistingRelationshipFields({
  person,
  family,
  displayName,
  parentKindLabels,
  reasonContext,
  sexAttribute,
}: {
  person: Person;
  family: Family;
  displayName: (personId: string) => string;
  parentKindLabels: Readonly<Record<PedigreeParentKind, string>>;
  reasonContext: ReasonContext;
  sexAttribute: string;
}) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const { partnerships, parents: allParents } = existingLinksOf(
    family,
    person.id,
  );
  // Who carried the pregnancy, as the answers stand: one parent at most, so
  // while one does, the others are not asked and cannot be a surrogate.
  const linkValues = useFormValue(
    [ROLE.parentCarrier, ...allParents.map((link) => linkField(link, 'kind'))],
    'opaque',
  );
  // The family as the answers leave it. A stand-in whose place a parent
  // re-described as genetic fills gives way when the answers are saved, so
  // is not asked about meanwhile.
  const draft = draftFamily(family, person.id, linkValues);
  const givingWay = standInsGivingWay(family, draft, person.id, sexAttribute);
  const parents = allParents.filter((link) => !givingWay.has(link.id));
  const canCarry = (link: FamilyLink) =>
    couldCarryPregnancy(family.byId.get(link.source)?.sexAssignedAtBirth);
  const kindOf = (link: FamilyLink) =>
    asString(linkValues[linkField(link, 'kind')]) ?? link.kind;
  // Whether the parent could be a genetic parent alongside the others who
  // are, as the answers stand.
  // A stand-in gives way to a genetic parent recorded in their place.
  const otherGeneticParents = (link: FamilyLink) =>
    parents
      .filter(
        (other) =>
          other.id !== link.id &&
          isGeneticKind(kindOf(other)) &&
          !isStandIn(family, other.source),
      )
      .map((other) => other.source);
  const sexOf = (personId: string) =>
    family.byId.get(personId)?.sexAssignedAtBirth;
  const canBeGenetic = (link: FamilyLink) =>
    geneticParentsPossible(
      otherGeneticParents(link).map(sexOf).concat(sexOf(link.source)),
    );
  // A parent re-described as genetic where a biological parent with the same
  // sex at birth is recorded takes their place (newest answer wins,
  // `geneticParentGivingWay`): that parent's kind is asked again, and must
  // be answered. Two parents both recorded as genetic, as a family saved
  // before every change kept the rule may be, are left as they are.
  const parentGivingWayTo = (link: FamilyLink) =>
    canBeGenetic(link) || isGeneticKind(link.kind)
      ? undefined
      : geneticParentGivingWay(
          family,
          person.id,
          sexOf(link.source),
          otherGeneticParents(link),
        );
  const replacedParents = new Set(
    parents.flatMap((link) => {
      const replaced = parentGivingWayTo(link);
      return replaced !== undefined && isGeneticKind(kindOf(link))
        ? [replaced]
        : [];
    }),
  );
  // Twins come from one pregnancy: someone with nobody recorded as carrying
  // them was carried by whoever carried their twins as the answers stand,
  // twins newly chosen included, until answered otherwise.
  const twinAnswers = useFormValue([ROLE.twins], 'opaque')[ROLE.twins];
  const twinsCarrier =
    carrierOf(family, person.id) !== undefined
      ? undefined
      : twinAnswers === undefined
        ? twinCarrierOf(family, person.id)
        : asStringArray(twinAnswers)
            .flatMap((twinId) => twinSetOf(family, twinId))
            .filter((id) => id !== person.id)
            .map((id) => carrierOf(family, id))
            .find((id) => id !== undefined);
  const recordedCarrying = (link: FamilyLink) =>
    link.isGestationalCarrier ??
    (twinsCarrier === undefined ? undefined : link.source === twinsCarrier);
  // A surrogate who carried one of their twins, as the answers stand, and is
  // not one of their own parents carried them too, so none of their parents
  // can have: one pregnancy has one carrier (`twinCarrierUpdates` keeps a
  // surrogate's twin as recorded).
  const parentSources = new Set(parents.map((link) => link.source));
  const twinSurrogate = (
    twinAnswers === undefined
      ? twinSetOf(family, person.id)
      : asStringArray(twinAnswers).flatMap((twinId) =>
          twinSetOf(family, twinId),
        )
  )
    .filter((id) => id !== person.id)
    .flatMap((twinId) => {
      const surrogateId = surrogateOf(family, twinId);
      return surrogateId === undefined || parentSources.has(surrogateId)
        ? []
        : [{ carrierId: surrogateId, childId: twinId }];
    })[0];
  // The parents who might have carried the pregnancy, as the answers stand,
  // asked about in one question while no surrogate is among their parents
  // (`ParentCarrierField`).
  const mightHaveCarried = (link: FamilyLink) => {
    const kind = kindOf(link);
    return kind !== 'surrogate' && mayHaveCarried(kind) && canCarry(link);
  };
  const surrogateParent = parents.find((link) => kindOf(link) === 'surrogate');
  const carrierCandidates =
    surrogateParent === undefined ? parents.filter(mightHaveCarried) : [];
  const chosenCarrier = asString(linkValues[ROLE.parentCarrier]);
  const carries = (link: FamilyLink) => {
    if (kindOf(link) === 'surrogate') return true;
    if (!mightHaveCarried(link)) return false;
    return chosenCarrier === undefined
      ? recordedCarrying(link) === true
      : chosenCarrier === link.source;
  };
  if (
    partnerships.length === 0 &&
    parents.length === 0 &&
    twinCandidatesOf(draft, person.id).length === 0
  ) {
    return null;
  }

  const isYou = (personId: string) =>
    family.byId.get(personId)?.isEgo ? 'true' : 'false';

  return (
    <section className="flex flex-col">
      {partnerships.map((link) => {
        const partnerId = link.source === person.id ? link.target : link.source;
        return (
          <Field
            key={link.id}
            component={BooleanField}
            name={linkField(link, 'current')}
            nameMode="opaque"
            label={text(wording.stillTogetherLabel, {
              named: 'true',
              personIsYou: isYou(person.id),
              partnerIsYou: isYou(partnerId),
              partner: displayName(partnerId),
            })}
            initialValue={link.isCurrentPartner}
          />
        );
      })}
      {parents.map((link) => {
        const otherParentCarrying = parents.find(
          (other) => other.id !== link.id && carries(other),
        );
        const anotherCarrier = otherParentCarrying
          ? { carrierId: otherParentCarrying.source, childId: person.id }
          : twinSurrogate;
        const replaces = parentGivingWayTo(link);
        // Why a kind of parent is unavailable, for each that is.
        const geneticBlock =
          canBeGenetic(link) || replaces !== undefined
            ? undefined
            : geneticParentBlock(
                family,
                person.id,
                otherGeneticParents(link),
                sexOf(link.source),
              );
        const sex = sexOf(link.source);
        const kindAnswers = (kinds: readonly PedigreeParentKind[]) =>
          kinds.map((value) => ({ value, label: parentKindLabels[value] }));
        const kindReasons = [
          geneticBlock &&
            geneticParentReason(
              geneticBlock,
              kindAnswers(PARENT_KINDS.filter(isGeneticKind)),
            ),
          // One reason at a time: someone who could not have carried a
          // pregnancy is told only that.
          anotherCarrier &&
            canCarry(link) &&
            carrierRecordedReason(
              anotherCarrier.childId,
              anotherCarrier.carrierId,
              kindAnswers(['surrogate']),
            ),
          !canCarry(link) &&
            sex !== undefined &&
            cannotCarryReason(link.source, sex, kindAnswers(['surrogate'])),
        ];
        // What the kind chosen replaces, said once it is chosen.
        const kind = kindOf(link);
        const kindChanges = [
          replaces !== undefined &&
            isGeneticKind(kind) &&
            geneticParentReplacedReason(person.id, replaces, {
              value: kind,
              label: parentKindLabels[kind],
            }),
        ];
        return (
          <ParentLinkFields
            key={link.id}
            link={link}
            canBeGenetic={canBeGenetic(link) || replaces !== undefined}
            kindChanges={kindChanges}
            givesWay={replacedParents.has(link.source)}
            canCarry={canCarry(link)}
            kindReasons={kindReasons}
            reasonContext={reasonContext}
            anotherCarrier={anotherCarrier}
            personIsYou={isYou(person.id)}
            parentIsYou={isYou(link.source)}
            parentName={displayName(link.source)}
            personName={displayName(person.id)}
            parentKindLabels={parentKindLabels}
          />
        );
      })}
      {carrierCandidates.length > 0 && (
        <ParentCarrierField
          candidates={carrierCandidates}
          recordedCarrying={recordedCarrying}
          kindOf={kindOf}
          twinSurrogate={twinSurrogate}
          reasonContext={reasonContext}
          displayName={displayName}
        />
      )}
      <TwinFields
        person={person}
        family={draft}
        recordedFamily={family}
        carrierId={answeredCarrier(
          family,
          person.id,
          readLinkUpdates(
            family,
            existingLinksOf(family, person.id),
            linkValues,
            givingWay,
          ),
        )}
        displayName={displayName}
        sexAttribute={sexAttribute}
      />
    </section>
  );
}

function ParentLinkFields({
  link,
  canBeGenetic,
  kindChanges,
  givesWay,
  canCarry,
  kindReasons,
  reasonContext,
  anotherCarrier,
  personIsYou,
  parentIsYou,
  parentName,
  personName,
  parentKindLabels,
}: {
  parentKindLabels: Readonly<Record<PedigreeParentKind, string>>;
  link: FamilyLink;
  /** This parent could be a genetic parent alongside the person's others,
   * or in the place of one who gives way. */
  canBeGenetic: boolean;
  /** What the kind chosen replaces in what is recorded, said in the hint. */
  kindChanges: readonly (Reason | undefined | false)[];
  /** This biological parent gives way to another parent answered as genetic
   * in their place, so their kind must be answered again. */
  givesWay: boolean;
  /** This parent could have carried a pregnancy: they are not recorded as
   * male at birth. */
  canCarry: boolean;
  /** Why the kinds of parent that are unavailable are, each naming them. */
  kindReasons: readonly (Reason | undefined | false)[];
  reasonContext: ReasonContext;
  /** Someone else who carried the pregnancy: another of the person's
   * parents, or a surrogate who carried one of their twins, recorded as
   * having carried `childId`. */
  anotherCarrier: { carrierId: string; childId: string } | undefined;
  personIsYou: string;
  parentIsYou: string;
  parentName: string;
  personName: string;
}) {
  const { wording, text } = usePedigreeWords();
  const kindField = linkField(link, 'kind');
  const kindUnavailable = (value: string) =>
    (isGeneticKind(value) && !canBeGenetic) ||
    (value === 'surrogate' && (anotherCarrier !== undefined || !canCarry));
  // The kind recorded, until it is unavailable (`useDerivedAnswer`): it is
  // then shown unchosen, and left as stored unless another is chosen.
  const kindAnswer = useDerivedAnswer({
    name: kindField,
    nameMode: 'opaque',
    derived: link.kind,
    isAvailable: (value) => !kindUnavailable(String(value)),
  });
  return (
    <Field
      component={RadioGroupField}
      name={kindField}
      nameMode="opaque"
      label={text(wording.parentLinkKindLabel, {
        personIsYou,
        parentIsYou,
        parent: parentName,
        child: personName,
      })}
      options={PARENT_KINDS.map((value) => ({
        value,
        label: parentKindLabels[value],
        disabled: kindUnavailable(value),
        description: reasonsFor(reasonContext, kindReasons, value),
      }))}
      hint={joinReasons(reasonContext, [...kindReasons, ...kindChanges])}
      {...(givesWay ? { required: true } : {})}
      {...kindAnswer}
    />
  );
}

/**
 * Who carried the pregnancy: one of the person's parents who might have, as
 * the answers stand, or someone else, as the add forms ask it. Choosing a
 * parent records them as having carried it and the others as not. While a
 * surrogate who carried one of the person's twins carried them too, none of
 * their parents can have, so each is unavailable, naming the surrogate.
 */
function ParentCarrierField({
  candidates,
  recordedCarrying,
  kindOf,
  twinSurrogate,
  reasonContext,
  displayName,
}: {
  /** The parents who might have carried it, as the answers stand. */
  candidates: readonly FamilyLink[];
  /** Whether a parent carried the pregnancy, as recorded, or as recorded
   * for the person's twins while nothing is recorded for the person. */
  recordedCarrying: (link: FamilyLink) => boolean | undefined;
  /** The kind of parent each is, as answered. */
  kindOf: (link: FamilyLink) => string;
  twinSurrogate: { carrierId: string; childId: string } | undefined;
  reasonContext: ReasonContext;
  displayName: (personId: string) => string;
}) {
  const { wording, text } = usePedigreeWords();
  // "No" recorded for a parent who adopted the person rests on the adoption
  // (an adoptive parent added is recorded as not having carried), so once
  // another kind of parent is chosen it is not taken as an answer.
  const recordedFor = (link: FamilyLink) =>
    link.kind === 'adoptive' &&
    kindOf(link) !== 'adoptive' &&
    recordedCarrying(link) === false
      ? undefined
      : recordedCarrying(link);
  const answers = candidates.map((link) => ({
    value: link.source,
    label: displayName(link.source),
  }));
  const reasons = [
    twinSurrogate &&
      carrierRecordedReason(
        twinSurrogate.childId,
        twinSurrogate.carrierId,
        answers,
      ),
  ];
  // The parent recorded as having carried it; someone else while a twin's
  // surrogate did, or every parent asked about is recorded as not having;
  // otherwise nothing, until answered (`useDerivedAnswer`).
  const recorded = candidates.find((link) => recordedFor(link) === true);
  const carrierAnswer = useDerivedAnswer({
    name: ROLE.parentCarrier,
    derived:
      twinSurrogate !== undefined
        ? NONE
        : recorded !== undefined
          ? recorded.source
          : candidates.every((link) => recordedFor(link) === false)
            ? NONE
            : undefined,
    isAvailable: (value) =>
      value === NONE ||
      (twinSurrogate === undefined &&
        candidates.some((link) => link.source === value)),
  });
  return (
    <Field
      component={RadioGroupField}
      name={ROLE.parentCarrier}
      label={text(wording.carrierLabel)}
      options={[
        ...answers.map((answer) => ({
          ...answer,
          disabled: twinSurrogate !== undefined,
          description: reasonsFor(reasonContext, reasons, answer.value),
        })),
        { value: NONE, label: text(wording.carrierUnknown) },
      ]}
      hint={joinReasons(reasonContext, reasons)}
      {...carrierAnswer}
    />
  );
}

/** "Yes", as an answer a reason makes unavailable. */
const yesAnswer = (intl: ReturnType<typeof useAppIntl>): UnavailableAnswer => ({
  value: 'true',
  label: intl.formatMessage(booleanFieldMessages.yes),
});

/** The answers to whether a parent carried the pregnancy: "Yes" unavailable,
 * described by `yesUnavailable`, while someone else did. "Don't know" is an
 * answer, so the question can be required, and records nothing. */
const carriedOptions = (
  intl: ReturnType<typeof useAppIntl>,
  yesUnavailable?: string,
) => [
  {
    label: intl.formatMessage(booleanFieldMessages.yes),
    value: 'yes',
    disabled: yesUnavailable !== undefined,
    description: yesUnavailable,
  },
  { label: intl.formatMessage(booleanFieldMessages.no), value: 'no' },
  { label: intl.formatMessage(interfaceMessages.dontKnow), value: 'unknown' },
];

/** Whether a parent carried the pregnancy, as answered: nothing for "Don't
 * know", told apart from "No". */
const asCarried = (value: FieldValue | undefined) =>
  value === 'yes' ? true : value === 'no' ? false : undefined;

/** The interface's own details about the person: name, gender identity (where
 * the stage asks) and sex assigned at birth, where given. */
function readOwnDetails(
  values: Record<string, FieldValue | undefined>,
  config: PedigreeConfig,
): PersonDetails {
  const details: PersonDetails = {};
  // The name is kept as typed, as its validation saw it; a name of nothing
  // but spaces is no name, as validation treats it.
  const name = asString(readOwnProperty(values, config.nameAttribute));
  if (name !== undefined && name.trim() !== '') {
    writeOwnProperty(details, config.nameAttribute, name);
  }
  if (config.genderIdentity) {
    const { attribute } = config.genderIdentity;
    const gender = asOption(readOwnProperty(values, attribute));
    if (gender !== undefined && gender !== '') {
      writeOwnProperty(details, attribute, [gender]);
    }
  }
  const sex = asString(
    readOwnProperty(values, config.sexAssignedAtBirthAttribute),
  );
  if (sex) writeOwnProperty(details, config.sexAssignedAtBirthAttribute, [sex]);
  return details;
}

/** The question asking what kind of relative the new person is. */
const KIND_QUESTION: Record<Relation, string | undefined> = {
  parent: ROLE.parentKind,
  child: ROLE.childKind,
  sibling: ROLE.siblingKind,
  partner: undefined,
};

/** Reports the person being added as the answers that decide how they are
 * drawn — their own details and how they are related — change. */
function DraftWatcher({
  relation,
  anchor,
  family,
  config,
  onDraftChange,
}: {
  relation: Relation;
  anchor: Person;
  family: Family;
  config: PedigreeConfig;
  onDraftChange: (draft: PersonDraft) => void;
}) {
  const roleValues = useFormValue([
    config.nameAttribute,
    ...(config.genderIdentity ? [config.genderIdentity.attribute] : []),
    config.sexAssignedAtBirthAttribute,
    ...Object.values(ROLE),
  ]);
  const replaced = replacedParentQuestion(
    relation,
    roleValues,
    anchor,
    family,
    config.sexAssignedAtBirthAttribute,
  );
  const personValues = useFormValue([
    ...personQuestions(roleValues),
    ...(replaced === undefined ? [] : [replaced.question]),
  ]);
  const values = useMemo(
    () => ({ ...roleValues, ...personValues }),
    [roleValues, personValues],
  );
  const report = useEffectEvent((draft: PersonDraft) => onDraftChange(draft));
  useEffect(() => {
    const kindQuestion = KIND_QUESTION[relation];
    report({
      details: readOwnDetails(values, config),
      request: readRequest(
        relation,
        values,
        anchor,
        family,
        config.sexAssignedAtBirthAttribute,
      ),
      kindUnanswered:
        kindQuestion !== undefined &&
        asString(values[kindQuestion]) === undefined,
    });
  }, [values, config, relation, anchor, family]);
  return null;
}

/**
 * Who the child form offers as having carried the pregnancy, by who they
 * are: the anchor and the other parent (`UNKNOWN` for someone not shown yet),
 * whatever kind of parent they are (a donor who carried is a traditional
 * surrogate), but not one recorded as male at birth; an unknown other parent
 * might have. A surrogate carried the child they are the surrogate of, so is
 * not asked. Someone else carried an adopted child, so of an adopted child's
 * parents only an other parent said to be their biological parent is.
 */
function childCarrierChoices(
  family: Family,
  anchor: Person,
  childKind: string | undefined,
  otherParent: string | undefined,
  otherParentBiological: boolean,
): string[] {
  if (childKind === 'surrogate') return [];
  const adopted = childKind === 'adoptive';
  return [
    ...(!adopted && couldCarryPregnancy(anchor.sexAssignedAtBirth)
      ? [anchor.id]
      : []),
    ...(otherParent !== undefined &&
    otherParent !== NONE &&
    (!adopted || otherParentBiological) &&
    (otherParent === UNKNOWN ||
      couldCarryPregnancy(family.byId.get(otherParent)?.sexAssignedAtBirth))
      ? [otherParent]
      : []),
  ];
}

/**
 * The biological parent of the anchor a new parent of a genetic kind takes
 * the place of, as the answers stand (`geneticParentGivingWay`), with the
 * question asking what kind of parent they are to the anchor instead,
 * named for them (`aboutPerson`) so that another parent
 * giving way is asked afresh.
 */
function replacedParentQuestion(
  relation: Relation,
  values: Record<string, FieldValue | undefined>,
  anchor: Person,
  family: Family,
  sexAttribute: string,
): { parentId: string; question: string } | undefined {
  if (relation !== 'parent') return undefined;
  const kind = asString(values[ROLE.parentKind]);
  if (kind === undefined || !isGeneticKind(kind)) return undefined;
  const parentId = geneticParentGivingWay(
    family,
    anchor.id,
    asString(readOwnProperty(values, sexAttribute)),
  );
  return parentId === undefined
    ? undefined
    : { parentId, question: aboutPerson(ROLE.replacedParentKind, parentId) };
}

function readRequest(
  relation: Relation,
  values: Record<string, FieldValue | undefined>,
  anchor: Person,
  family: Family,
  sexAttribute: string,
): AddRelativeRequest {
  switch (relation) {
    case 'parent': {
      const partnerId = asString(values[ROLE.partnerId]);
      const partnered = partnerId && partnerId !== NONE ? partnerId : null;
      const replaced = replacedParentQuestion(
        relation,
        values,
        anchor,
        family,
        sexAttribute,
      );
      const replacedKind =
        replaced &&
        REPLACED_PARENT_KINDS.find(
          (kind) => kind === asString(values[replaced.question]),
        );
      return {
        relation,
        parentKind:
          asKind(PARENT_KINDS, values[ROLE.parentKind]) ?? 'biological',
        // "Don't know", or not asked, records nothing, told apart from "No".
        carriedPregnancy: asCarried(values[ROLE.carriedPregnancy]),
        partnerId: partnered,
        partnershipCurrent:
          partnered === null ||
          values[aboutPerson(ROLE.partnershipCurrent, partnered)] !== false,
        alsoParentOf: asStringArray(values[ROLE.alsoParentOf]),
        ...(replaced && replacedKind
          ? { replaces: { parentId: replaced.parentId, kind: replacedKind } }
          : {}),
      };
    }
    case 'partner':
      return {
        relation,
        partnershipCurrent: values[ROLE.partnershipCurrent] !== false,
      };
    case 'child': {
      const otherParent = asString(values[ROLE.otherParent]);
      const childKind =
        asKind(CHILD_KINDS, values[ROLE.childKind]) ?? 'biological';
      // The answers about the other parent are theirs (`aboutPerson`).
      const otherPersonId =
        otherParent && otherParent !== NONE && otherParent !== UNKNOWN
          ? otherParent
          : undefined;
      const biologicalAnswer = otherPersonId
        ? asString(values[aboutPerson(ROLE.biologicalParent, otherPersonId)])
        : undefined;
      // A step or adopted child's other parent, said to be their biological
      // parent.
      const otherParentBiological =
        (childKind === 'social' || childKind === 'adoptive') &&
        otherPersonId !== undefined &&
        values[aboutPerson(ROLE.otherParentBiological, otherPersonId)] === true;
      const biologicalParent =
        otherParentBiological ||
        (childKind === 'biological' && biologicalAnswer === 'otherParent')
          ? 'otherParent'
          : childKind === 'biological' && biologicalAnswer === 'anchor'
            ? 'anchor'
            : 'both';
      // The carrier is answered by who they are, so an answer about an other
      // parent since replaced is no longer one of the choices, and is shown
      // and saved as no answer.
      const answer = asString(values[ROLE.carrier]);
      const carrier =
        answer === undefined ||
        !childCarrierChoices(
          family,
          anchor,
          childKind,
          otherParent,
          otherParentBiological,
        ).includes(answer)
          ? null
          : answer === anchor.id
            ? 'anchor'
            : 'otherParent';
      return {
        relation,
        otherParent:
          otherParent === UNKNOWN ? 'unknown' : (otherPersonId ?? null),
        parentKind: childKind,
        biologicalParent,
        carrier,
      };
    }
    case 'sibling':
      return readSiblingRequest(values);
  }
}

/**
 * Whether the answers about a new sibling make them the anchor's sibling
 * (`siblingTie`), as every answer the sibling form accepts must: the new
 * person is `ids[0]`, as `planAdditionUnder` plans them.
 */
function makesSibling(
  family: Family,
  anchorId: string,
  ids: readonly string[],
  request: Extract<AddRelativeRequest, { relation: 'sibling' }>,
  sexAttribute: string,
): boolean {
  const [newPersonId] = ids;
  if (newPersonId === undefined) return true;
  const plan = planAdditionUnder(ids, {
    family,
    anchorId,
    details: {},
    request,
    sexAttribute,
  });
  return (
    siblingTie(
      familyWithPlan(family, plan.people, plan.links, sexAttribute),
      anchorId,
      newPersonId,
    ) !== undefined
  );
}

/**
 * A parent the sibling form offers, as it names them. An unnamed parent of
 * someone other than the participant is called by how they are related to
 * them ("Priya’s father"), not to the participant, whose relationship to them
 * says nothing about which parent they are. A name is shown as typed.
 */
function siblingParentLabel(
  words: PedigreeWords,
  family: Family,
  anchor: Person,
  id: string,
  displayName: (personId: string) => string,
  framing: FramingId,
): string {
  const parent = family.byId.get(id);
  if (
    anchor.isEgo ||
    !parent ||
    parent.isEgo ||
    parent.name !== undefined ||
    parent.hasUnreadableName
  ) {
    return displayName(id);
  }
  const term = parentTermFrom(family, anchor.id, id, framing);
  return term === undefined
    ? displayName(id)
    : formatOwnedLabel(displayName(anchor.id), term, words);
}

/** The answers about a new sibling, as the request to add them. */
function readSiblingRequest(
  values: Record<string, FieldValue | undefined>,
): Extract<AddRelativeRequest, { relation: 'sibling' }> {
  const placeholders = asString(values[ROLE.sharedParentCount]);
  // The model records the carrier only while the answers still make them
  // one of the sibling's parents who could have carried the pregnancy.
  const carrier = asString(values[ROLE.carrier]);
  return {
    relation: 'sibling',
    sharedParentIds: asStringArray(values[ROLE.sharedParents]),
    sharesOnly:
      placeholders === 'eggParent' || placeholders === 'spermParent'
        ? placeholders
        : undefined,
    parentKind: asKind(SIBLING_KINDS, values[ROLE.siblingKind]) ?? 'biological',
    biologicalParentIds: [
      ROLE.siblingBiologicalParent,
      ROLE.siblingOtherBiologicalParent,
    ].flatMap((question) => asString(values[question]) ?? []),
    twin:
      values[ROLE.twin] === NOT_IDENTICAL_TWIN
        ? 'fraternal'
        : asZygosity(values[ROLE.twin]),
    carrier: carrier && carrier !== NONE ? carrier : null,
  };
}

function RelationshipFields({
  relation,
  anchor,
  ids,
  family,
  displayName,
  config,
  framing,
  parentKindLabels,
  reasonContext,
}: {
  parentKindLabels: Readonly<Record<PedigreeParentKind, string>>;
  reasonContext: ReasonContext;
  relation: Relation;
  anchor: Person;
  ids: readonly string[];
  family: Family;
  displayName: (personId: string) => string;
  config: PedigreeConfig;
  framing: FramingId;
}) {
  switch (relation) {
    case 'parent':
      return (
        <ParentFields
          anchor={anchor}
          family={family}
          displayName={displayName}
          config={config}
          parentKindLabels={parentKindLabels}
          reasonContext={reasonContext}
        />
      );
    case 'partner':
      return (
        <PartnershipCurrentField
          partnerIsYou={anchor.isEgo}
          partner={displayName(anchor.id)}
        />
      );
    case 'child':
      return (
        <ChildFields
          anchor={anchor}
          family={family}
          displayName={displayName}
          reasonContext={reasonContext}
        />
      );
    case 'sibling':
      return (
        <SiblingFields
          anchor={anchor}
          ids={ids}
          family={family}
          displayName={displayName}
          config={config}
          framing={framing}
        />
      );
  }
}

/** Whether a partnership is current: of the new partner, or of a new parent
 * with the parent chosen as their partner (named for them, `aboutPerson`),
 * asked naming who they are together with, as the edit form does. It must
 * be answered: a partnership is drawn as current or as ended, and nothing is
 * assumed for the participant. */
function PartnershipCurrentField({
  name = ROLE.partnershipCurrent,
  partnerIsYou,
  partner,
}: {
  name?: string;
  /** The person being added is together with the participant. */
  partnerIsYou: boolean;
  /** Who the person being added is together with. */
  partner: string;
}) {
  const { wording, text } = usePedigreeWords();
  return (
    <Field
      component={BooleanField}
      name={name}
      label={text(wording.stillTogetherLabel, {
        named: 'true',
        personIsYou: 'false',
        partnerIsYou: partnerIsYou ? 'true' : 'false',
        partner,
      })}
      required
    />
  );
}

function ParentFields({
  anchor,
  family,
  displayName,
  config,
  parentKindLabels,
  reasonContext,
}: {
  parentKindLabels: Readonly<Record<PedigreeParentKind, string>>;
  reasonContext: ReasonContext;
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
  config: PedigreeConfig;
}) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const contentFormat = useContentFormat();
  const intl = useAppIntl();
  const values = useFormValue([
    ROLE.parentKind,
    ROLE.carriedPregnancy,
    ROLE.partnerId,
    ROLE.alsoParentOf,
  ]);
  const sexAssignedAtBirth = asString(
    useFormValue([config.sexAssignedAtBirthAttribute], 'opaque')[
      config.sexAssignedAtBirthAttribute
    ],
  );
  const chosenKind = asString(values[ROLE.parentKind]);
  const parentKind = chosenKind ?? 'biological';
  // A partner is asked about once the kind of parent is chosen: a donor or a
  // surrogate is never recorded as a parent's partner.
  const raises =
    chosenKind === 'biological' ||
    chosenKind === 'adoptive' ||
    chosenKind === 'social';

  // A stand-in is never recorded as anyone's partner (ruling 25), so is not
  // offered as the new parent's partner.
  const existingParents = primaryParentsOf(family, anchor.id).filter(
    (parentId) => !isStandIn(family, parentId),
  );
  // One person carried the pregnancy at most. A new parent answered as
  // having carried the anchor replaces whoever was recorded as carrying them
  // or a twin (newest answer wins, `carrierGivingWay`), unless a surrogate
  // did, who carried them by definition: then the new parent cannot have.
  const anchorHasCarrier = hasCarrier(family, anchor.id);
  const carrierReplaced = carrierGivingWay(family, anchor.id);
  const anchorCarrierFixed = anchorHasCarrier && carrierReplaced === undefined;
  // Nor can a parent recorded as male at birth.
  const canCarry =
    !anchorCarrierFixed && couldCarryPregnancy(sexAssignedAtBirth);
  // A genetic parent provided the egg or the sperm, which another genetic
  // parent may already have. A stand-in gives way to a genetic parent
  // recorded in their place, and a biological parent with the same sex at
  // birth to the new one (newest answer wins, `geneticParentGivingWay`): the
  // participant is then asked what kind of parent they are to the anchor
  // instead.
  const canBeGeneticParentOf = (personId: string) =>
    geneticParentsPossible([
      ...firmGeneticParentSexes(family, personId),
      sexAssignedAtBirth,
    ]);
  const givingWay = geneticParentGivingWay(
    family,
    anchor.id,
    sexAssignedAtBirth,
  );
  const kindPossible = (kind: string) =>
    isGeneticKind(kind)
      ? canBeGeneticParentOf(anchor.id) || givingWay !== undefined
      : kind !== 'surrogate' || canCarry;
  const siblings = siblingsOf(family, anchor.id);
  const partnerChoice = asString(values[ROLE.partnerId]);
  // The new parent is the same kind of parent to the siblings chosen, in the
  // place of the same biological parent where one gives way.
  const siblingPossible = (siblingId: string) =>
    isGeneticKind(parentKind)
      ? canBeGeneticParentOf(siblingId) ||
        (givingWay !== undefined &&
          geneticParentGivingWay(family, siblingId, sexAssignedAtBirth) ===
            givingWay)
      : parentKind !== 'surrogate' || !hasCarrier(family, siblingId);
  const chosenSiblings = asStringArray(values[ROLE.alsoParentOf]);

  // Why a kind of parent, or a sibling, is unavailable, naming the record in
  // the way: the genetic parents someone already has, or whoever carried
  // them.
  const geneticReason = (
    personId: string,
    answers: readonly UnavailableAnswer[],
  ) => {
    const block = geneticParentBlock(
      family,
      personId,
      firmGeneticParentsOf(family, personId),
      sexAssignedAtBirth,
    );
    return block && geneticParentReason(block, answers);
  };
  const carrierReason = (
    personId: string,
    answers: readonly UnavailableAnswer[],
  ) => {
    // Whoever carried them or a twin, the same pregnancy.
    const record = carrierRecordOf(family, personId);
    return record === undefined
      ? undefined
      : carrierRecordedReason(record.childId, record.carrierId, answers);
  };
  const kindAnswers = (kinds: readonly PedigreeParentKind[]) =>
    kinds.map((value) => ({ value, label: parentKindLabels[value] }));
  const kindReasons = [
    !kindPossible('biological') &&
      geneticReason(anchor.id, kindAnswers(PARENT_KINDS.filter(isGeneticKind))),
    // One reason at a time: a new parent who could not have carried a
    // pregnancy is told only that.
    !canCarry &&
      couldCarryPregnancy(sexAssignedAtBirth) &&
      carrierReason(anchor.id, kindAnswers(['surrogate'])),
    !canCarry &&
      sexAssignedAtBirth !== undefined &&
      !couldCarryPregnancy(sexAssignedAtBirth) &&
      cannotCarryReason(
        undefined,
        sexAssignedAtBirth,
        kindAnswers(['surrogate']),
      ),
  ];
  // What the kind chosen replaces is said once it is chosen: the biological
  // parent who gives way to a genetic one, and whoever was recorded as
  // carrying the anchor, for a surrogate.
  const chosenParentKind = PARENT_KINDS.find((kind) => kind === chosenKind);
  const chosenAnswer =
    chosenParentKind === undefined
      ? undefined
      : { value: chosenParentKind, label: parentKindLabels[chosenParentKind] };
  const kindChanges = chosenAnswer && [
    isGeneticKind(chosenAnswer.value) &&
      givingWay !== undefined &&
      geneticParentReplacedReason(anchor.id, givingWay, chosenAnswer),
    chosenAnswer.value === 'surrogate' &&
      canCarry &&
      carrierReplaced !== undefined &&
      carrierReplacedReason(
        carrierReplaced.childId,
        carrierReplaced.carrierId,
        chosenAnswer,
      ),
  ];
  const kindHint = joinReasons(reasonContext, [
    ...kindReasons,
    ...(kindChanges ?? []),
  ]);
  // A genetic parent recorded in the place of a stand-in the anchor shares
  // with siblings takes it for them too (`standInPlaceTakenFor`): they are
  // shown chosen, and cannot be unticked, saying why.
  const takenOver =
    (parentKind === 'biological' || parentKind === 'donor') &&
    canBeGeneticParentOf(anchor.id)
      ? standInPlaceTakenFor(
          family,
          anchor.id,
          parentKind,
          sexAssignedAtBirth,
          config.sexAssignedAtBirthAttribute,
        ).filter((id) => siblings.includes(id))
      : [];
  const siblingReasons = siblings
    .filter((id) => !siblingPossible(id))
    .map((id) => {
      const answers = [{ value: id, label: displayName(id) }];
      return isGeneticKind(parentKind)
        ? geneticReason(id, answers)
        : carrierReason(id, answers);
    });
  const siblingsHint = [
    joinReasons(reasonContext, siblingReasons),
    takenOver.length > 0
      ? text(wording.standInPlaceTaken, {
          anchorIsYou: anchor.isEgo ? 'true' : 'false',
          anchor: displayName(anchor.id),
          count: takenOver.length,
          names: contentFormat.formatList(takenOver.map(displayName)),
        })
      : undefined,
  ]
    .filter((sentence) => sentence !== undefined)
    .join(' ');

  // Answers made impossible by a later one — the new parent's sex at birth,
  // or their kind — are taken back, so the question is asked again
  // (`useDerivedAnswer`). Nothing is answered for the participant.
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const kindAnswer = useDerivedAnswer({
    name: ROLE.parentKind,
    derived: undefined,
    isAvailable: (kind) => kindPossible(String(kind)),
  });
  const keptSiblings = chosenSiblings.filter(siblingPossible);

  // A new parent of any kind but a surrogate (who always did) who could have
  // carried a pregnancy is asked whether they did for everyone they are added as a parent of who has
  // nobody recorded as carrying theirs: one question, whose answer is
  // recorded for each of them. It is about the anchor while the anchor has
  // nobody, and otherwise about the siblings chosen who have nobody. While
  // nobody is left to ask about, an answer given is taken back.
  const siblingsWithoutCarrier = keptSiblings.filter(
    (id) => !hasCarrier(family, id),
  );
  // Nothing is asked before the kind of parent is chosen, since the kind
  // decides whether they could have carried it. Someone else carried an
  // adopted child, so an adoptive parent is not asked (`carrierAnswer`).
  const mightHaveCarried =
    chosenKind !== undefined &&
    parentKind !== 'surrogate' &&
    parentKind !== 'adoptive' &&
    mayHaveCarried(parentKind) &&
    couldCarryPregnancy(sexAssignedAtBirth);
  const asksCarried =
    mightHaveCarried &&
    (!anchorCarrierFixed || siblingsWithoutCarrier.length > 0);
  const carriedAnswer = useDerivedAnswer({
    name: ROLE.carriedPregnancy,
    derived: undefined,
    isAvailable: () => asksCarried,
  });
  const [onlySibling] = siblingsWithoutCarrier;
  // "Yes" about the anchor replaces whoever was recorded as carrying them,
  // said once it is chosen.
  const carriedChange =
    asksCarried &&
    carrierReplaced !== undefined &&
    asCarried(values[ROLE.carriedPregnancy]) === true
      ? joinReasons(reasonContext, [
          carrierReplacedReason(
            carrierReplaced.childId,
            carrierReplaced.carrierId,
            yesAnswer(intl),
          ),
        ])
      : undefined;
  // With nobody left to ask about, because a surrogate carried the anchor,
  // the question is shown unavailable, naming them: a child has one carrier
  // at most.
  const carriedUnavailable =
    !asksCarried && mightHaveCarried && anchorCarrierFixed;
  // Only "Yes" would record a second carrier, so only it is unavailable,
  // and "No" is the answer shown. It is a question of its own, so the
  // answer is never taken for the siblings the question may go on to ask
  // about.
  const carriedYesReason = carriedUnavailable
    ? joinReasons(reasonContext, [carrierReason(anchor.id, [yesAnswer(intl)])])
    : undefined;
  const carriedUnavailableField = carriedUnavailable && (
    <Field
      component={RadioGroupField}
      name={ROLE.carriedPregnancyUnavailable}
      label={text(wording.parentCarriedLabel, { named: 'false' })}
      options={carriedOptions(intl, carriedYesReason)}
      hint={carriedYesReason}
      initialValue="no"
    />
  );
  const carriedField = asksCarried && (
    <Field
      component={RadioGroupField}
      name={ROLE.carriedPregnancy}
      options={carriedOptions(intl)}
      required
      label={
        anchorCarrierFixed
          ? text(wording.carriedSiblingsPregnancyLabel, {
              single: siblingsWithoutCarrier.length === 1 ? 'true' : 'false',
              count: siblingsWithoutCarrier.length,
              isYou:
                onlySibling !== undefined && family.byId.get(onlySibling)?.isEgo
                  ? 'true'
                  : 'false',
              name: onlySibling === undefined ? '' : displayName(onlySibling),
            })
          : text(wording.parentCarriedLabel, { named: 'false' })
      }
      hint={carriedChange}
      {...carriedAnswer}
    />
  );
  // What kind of parent, to the anchor, the biological parent a genetic kind
  // takes the place of is: they are still a
  // parent, of another kind, and nothing is assumed about which.
  const replacedField = chosenKind !== undefined &&
    isGeneticKind(chosenKind) &&
    givingWay !== undefined && (
      <Field
        component={RadioGroupField}
        name={aboutPerson(ROLE.replacedParentKind, givingWay)}
        label={text(wording.parentLinkKindLabel, {
          parentIsYou: family.byId.get(givingWay)?.isEgo ? 'true' : 'false',
          personIsYou: anchor.isEgo ? 'true' : 'false',
          parent: displayName(givingWay),
          child: displayName(anchor.id),
        })}
        options={REPLACED_PARENT_KINDS.map((value) => ({
          value,
          label: parentKindLabels[value],
        }))}
        required
      />
    );

  // Nothing is assumed about the new parent's partner or the siblings they
  // are a parent of: each question starts unanswered. Only a sibling whose
  // unknown parent the new parent takes the place of is chosen, as they must
  // be; a sibling the new parent could not be the same kind of parent of is
  // never left chosen.
  const partnerAnswer = useDerivedAnswer({
    name: ROLE.partnerId,
    derived: undefined,
    isAvailable: () => raises,
  });
  const siblingsAnswer = useDerivedAnswer({
    name: ROLE.alsoParentOf,
    derived: siblings.filter((id) => takenOver.includes(id)),
    isAvailable: (id) => typeof id === 'string' && siblingPossible(id),
  });
  // Once the participant has answered, the siblings the new parent takes a
  // stand-in's place for are still kept chosen, and let go again when they
  // no longer are (another kind or sex chosen).
  const getFormValues = useFormStore((store) => store.getFormValues);
  const takenOverAdded = useRef<string[]>([]);
  const keepTakenOverChosen = useEffectEvent(() => {
    const chosen = asStringArray(getFormValues()[ROLE.alsoParentOf]);
    const released = takenOverAdded.current.filter(
      (id) => !takenOver.includes(id),
    );
    const added = takenOver.filter((id) => !chosen.includes(id));
    takenOverAdded.current = [
      ...takenOverAdded.current.filter((id) => takenOver.includes(id)),
      ...added,
    ];
    if (released.length === 0 && added.length === 0) return;
    setFieldValue(ROLE.alsoParentOf, [
      ...chosen.filter((id) => !released.includes(id)),
      ...added,
    ]);
  });
  const takenOverKey = takenOver.join('\u0000');
  useEffect(() => keepTakenOverChosen(), [takenOverKey]);

  return (
    <>
      <Field
        component={RadioGroupField}
        name={ROLE.parentKind}
        label={text(wording.parentKindLabel)}
        options={PARENT_KINDS.map((value) => ({
          value,
          label: parentKindLabels[value],
          disabled: !kindPossible(value),
          description: reasonsFor(reasonContext, kindReasons, value),
        }))}
        hint={kindHint}
        required
        {...kindAnswer}
      />
      {replacedField}
      {!anchorCarrierFixed && carriedField}
      {carriedUnavailableField}
      {raises && existingParents.length > 0 && (
        <Field
          component={RadioGroupField}
          name={ROLE.partnerId}
          label={text(wording.parentPartnerLabel)}
          options={[
            ...existingParents.map((id) => ({
              value: id,
              label: displayName(id),
            })),
            { value: NONE, label: intl.formatMessage(booleanFieldMessages.no) },
          ]}
          {...partnerAnswer}
        />
      )}
      {raises && partnerChoice !== undefined && partnerChoice !== NONE && (
        <PartnershipCurrentField
          name={aboutPerson(ROLE.partnershipCurrent, partnerChoice)}
          partnerIsYou={family.byId.get(partnerChoice)?.isEgo === true}
          partner={displayName(partnerChoice)}
        />
      )}
      {siblings.length > 0 && (
        <Field
          component={CheckboxGroupField}
          name={ROLE.alsoParentOf}
          label={text(wording.alsoParentOfLabel)}
          options={siblings.map((id) => ({
            value: id,
            label: displayName(id),
            disabled: !siblingPossible(id) || takenOver.includes(id),
          }))}
          hint={siblingsHint || undefined}
          {...siblingsAnswer}
        />
      )}
      {anchorCarrierFixed && carriedField}
    </>
  );
}

function ChildFields({
  anchor,
  family,
  displayName,
  reasonContext,
}: {
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
  reasonContext: ReasonContext;
}) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const values = useFormValue([ROLE.childKind, ROLE.otherParent]);
  const choices = otherParentChoices(family, anchor.id);
  const childKind = asString(values[ROLE.childKind]);
  const otherParent = asString(values[ROLE.otherParent]);
  // Nothing is assumed about the other parent: the participant chooses.
  const otherParentAnswer = useDerivedAnswer({
    name: ROLE.otherParent,
    derived: undefined,
  });
  const hasOtherParent = otherParent !== undefined && otherParent !== NONE;
  // With a partner as the other parent of a biological child, either or
  // both of them may be its biological parents. Someone not yet in the
  // family is added as its other biological parent.
  const otherPartner =
    childKind === 'biological' && hasOtherParent && otherParent !== UNKNOWN
      ? otherParent
      : undefined;
  // Which of them are its biological parents is asked about that partner,
  // so is asked afresh when another is chosen (`aboutPerson`).
  const biologicalField =
    otherPartner && aboutPerson(ROLE.biologicalParent, otherPartner);
  // Both, only when one could have provided the egg and the other the
  // sperm.
  const bothPossible =
    otherPartner === undefined ||
    geneticParentsPossible([
      anchor.sexAssignedAtBirth,
      family.byId.get(otherPartner)?.sexAssignedAtBirth,
    ]);
  // Asked with nothing chosen; "Both" is taken back once it is impossible,
  // so the question is asked again (`useDerivedAnswer`).
  const biologicalAnswer = useDerivedAnswer({
    name: biologicalField || undefined,
    derived: undefined,
    isAvailable: (answer) => answer !== 'both' || bothPossible,
  });
  // A step or adopted child's other parent, someone already recorded, may
  // be the child's own biological parent (a partner's child the anchor
  // raises or adopted), so is asked about: nothing is assumed either way.
  const raisedWithOtherParent =
    (childKind === 'social' || childKind === 'adoptive') &&
    hasOtherParent &&
    otherParent !== UNKNOWN
      ? otherParent
      : undefined;
  const otherBiologicalField =
    raisedWithOtherParent &&
    aboutPerson(ROLE.otherParentBiological, raisedWithOtherParent);
  const otherBiologicalValues = useFormValue(
    otherBiologicalField ? [otherBiologicalField] : [],
  );
  const otherParentBiological =
    otherBiologicalField !== undefined &&
    otherBiologicalValues[otherBiologicalField] === true;
  // Who carried the pregnancy is asked once the kind of child is known.
  const carriers =
    childKind === undefined
      ? []
      : childCarrierChoices(
          family,
          anchor,
          childKind,
          otherParent,
          otherParentBiological,
        );
  // An answer naming someone no longer offered — an other parent since
  // replaced — is taken back, so the question is asked again.
  const carrierAnswer = useDerivedAnswer({
    name: ROLE.carrier,
    derived: undefined,
    isAvailable: (id) =>
      carriers.length > 0 &&
      (id === NONE || (typeof id === 'string' && carriers.includes(id))),
  });

  // The kinds of child are named as the participant's own when the anchor
  // is the participant.
  const isYou = anchor.isEgo ? 'true' : 'false';
  // Why an answer is unavailable, naming it.
  const childKindReasons = [
    anchor.sexAssignedAtBirth !== undefined &&
      !couldCarryPregnancy(anchor.sexAssignedAtBirth) &&
      cannotCarryReason(anchor.id, anchor.sexAssignedAtBirth, [
        {
          value: 'surrogate',
          label: text(childKindWording(wording, 'surrogate'), { isYou }),
        },
      ]),
  ];
  const bothReasons = [
    otherPartner !== undefined &&
      !bothPossible &&
      anchor.sexAssignedAtBirth !== undefined &&
      bothSameSexReason(anchor.id, otherPartner, anchor.sexAssignedAtBirth, [
        {
          value: 'both',
          label: text(wording.biologicalParentBoth, {
            firstIsYou: anchor.isEgo ? 'true' : 'false',
            first: displayName(anchor.id),
            second: displayName(otherPartner),
          }),
        },
      ]),
  ];

  return (
    <>
      <Field
        component={RadioGroupField}
        name={ROLE.otherParent}
        label={text(wording.otherParentLabel)}
        options={[
          ...choices.map((id) => ({ value: id, label: displayName(id) })),
          {
            value: UNKNOWN,
            label: text(wording.otherParentUnknown),
          },
          { value: NONE, label: text(wording.otherParentNone) },
        ]}
        required
        {...otherParentAnswer}
      />
      <Field
        component={RadioGroupField}
        name={ROLE.childKind}
        label={text(wording.childKindLabel)}
        options={CHILD_KINDS.map((value) => ({
          value,
          label: text(childKindWording(wording, value), { isYou }),
          // Someone recorded as male at birth carried nobody.
          disabled:
            value === 'surrogate' &&
            !couldCarryPregnancy(anchor.sexAssignedAtBirth),
          description: reasonsFor(reasonContext, childKindReasons, value),
        }))}
        hint={joinReasons(reasonContext, childKindReasons)}
        required
      />
      {biologicalField && otherPartner && (
        <Field
          component={RadioGroupField}
          name={biologicalField}
          label={text(wording.biologicalParentLabel)}
          hint={[
            text(wording.biologicalParentHint),
            joinReasons(reasonContext, bothReasons),
          ]
            .filter((sentence) => sentence !== undefined)
            .join(' ')}
          options={[
            {
              value: 'both',
              label: text(wording.biologicalParentBoth, {
                firstIsYou: anchor.isEgo ? 'true' : 'false',
                first: displayName(anchor.id),
                second: displayName(otherPartner),
              }),
              disabled: !bothPossible,
              description: reasonsFor(reasonContext, bothReasons, 'both'),
            },
            { value: 'anchor', label: displayName(anchor.id) },
            { value: 'otherParent', label: displayName(otherPartner) },
          ]}
          required
          {...biologicalAnswer}
        />
      )}
      {raisedWithOtherParent && otherBiologicalField && (
        <Field
          component={BooleanField}
          name={otherBiologicalField}
          label={text(wording.otherParentBiologicalLabel, {
            otherIsYou: family.byId.get(raisedWithOtherParent)?.isEgo
              ? 'true'
              : 'false',
            other: displayName(raisedWithOtherParent),
          })}
          required
        />
      )}
      {carriers.length > 0 && (
        <Field
          component={RadioGroupField}
          name={ROLE.carrier}
          label={text(wording.carrierLabel)}
          options={[
            ...carriers.map((id) => ({
              value: id,
              label:
                id === UNKNOWN
                  ? text(wording.otherParentUnknown)
                  : displayName(id),
            })),
            {
              value: NONE,
              label: text(wording.carrierUnknown),
            },
          ]}
          required
          {...carrierAnswer}
        />
      )}
    </>
  );
}

function SiblingFields({
  anchor,
  ids,
  family,
  displayName,
  config,
  framing,
}: {
  anchor: Person;
  ids: readonly string[];
  family: Family;
  displayName: (personId: string) => string;
  config: PedigreeConfig;
  framing: FramingId;
}) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const values = useFormValue([
    ROLE.sharedParents,
    ROLE.sharedParentCount,
    ROLE.siblingKind,
    ROLE.siblingBiologicalParent,
    ROLE.siblingOtherBiologicalParent,
    ROLE.carrier,
    ROLE.twin,
  ]);
  const parents = primaryParentsOf(family, anchor.id);
  // The anchor's donors are offered too, so that a sibling who shares only a
  // donor can be added (ruling 20), and so is the surrogate who carried
  // them, who then carried the sibling.
  const anchorParentsOf = (kind: FamilyLinkKind) =>
    family.links
      .filter((link) => link.target === anchor.id && link.kind === kind)
      .map((link) => link.source);
  const donors = anchorParentsOf('donor');
  const surrogates = anchorParentsOf('surrogate');
  const args = {
    isYou: anchor.isEgo ? 'true' : 'false',
    name: displayName(anchor.id),
  };
  const parentLabel = (id: string) =>
    siblingParentLabel(words, family, anchor, id, displayName, framing);

  // The sibling as the biological child of the parents they share, as the
  // answers stand. The plan makes them the biological child of every shared
  // parent who could have given a gamete beside the others, and leaves any
  // other the kind of parent they are to the anchor; a biological child is
  // possible while at least one could.
  const biologicalPlan = planAdditionUnder(ids, {
    family,
    anchorId: anchor.id,
    details: {},
    request: { ...readSiblingRequest(values), parentKind: 'biological' },
    sexAttribute: config.sexAssignedAtBirthAttribute,
  });
  const biologicalPossible = biologicalPlan.links.some(
    (link) => link.target === ids[0] && link.kind === 'biological',
  );
  // Choosing parents can make a biological child impossible; the question
  // is then asked again. Parents who would make no sibling of either kind
  // (a step-parent or the surrogate alone) are refused on saving, saying
  // why, so the kind is left as it is for them.
  const sharesEnough = (['biological', 'adoptive'] as const).some((kind) =>
    makesSibling(
      family,
      anchor.id,
      ids,
      { ...readSiblingRequest(values), parentKind: kind },
      config.sexAssignedAtBirthAttribute,
    ),
  );
  const biologicalUnavailable = !biologicalPossible && sharesEnough;
  const kindAnswer = useDerivedAnswer({
    name: ROLE.siblingKind,
    derived: undefined,
    isAvailable: (kind) => kind !== 'biological' || !biologicalUnavailable,
  });

  // A sibling is asked who carried the pregnancy, as a child is: each parent
  // the sibling will have, as the answers stand, who could have carried it —
  // the parents chosen, and any unnamed parent added for both of them —
  // offered by the name they are shown by, whatever kind of parent they are.
  // An adopted sibling is not asked: someone else carried them, and none of
  // the parents who adopted them is recorded as having done so.
  const siblingKind = asString(values[ROLE.siblingKind]);
  const adopted = siblingKind === 'adoptive';
  const siblingPlan =
    siblingKind === undefined || siblingKind === 'biological'
      ? biologicalPlan
      : planAdditionUnder(ids, {
          family,
          anchorId: anchor.id,
          details: {},
          request: readSiblingRequest(values),
          sexAttribute: config.sexAssignedAtBirthAttribute,
        });
  // While no parent they share is chosen, nobody is offered: the answer
  // is still to come, and the form cannot be saved without it.
  const nothingShared =
    parents.length > 0 &&
    asStringArray(values[ROLE.sharedParents]).length === 0;
  const carriers =
    siblingKind === undefined || adopted || nothingShared
      ? []
      : possibleCarriers(
          family,
          siblingPlan,
          ids[0] ?? '',
          config.sexAssignedAtBirthAttribute,
        );
  // A twin was carried by whoever carried the twins they join, so is not
  // asked while that is recorded: the model records them as that carrier
  // (`planAddition`). Answering that they are not twins asks it again.
  const isTwin = values[ROLE.twin] !== undefined && values[ROLE.twin] !== NONE;
  const anchorCarrier =
    carrierOf(family, anchor.id) ?? twinCarrierOf(family, anchor.id);
  const asksCarrier =
    carriers.length > 0 &&
    !(
      isTwin &&
      anchorCarrier !== undefined &&
      carriers.includes(anchorCarrier)
    );
  const carrierAnswer = useDerivedAnswer({
    name: ROLE.carrier,
    derived: undefined,
    isAvailable: (id) =>
      asksCarrier &&
      (id === NONE || (typeof id === 'string' && carriers.includes(id))),
  });
  // A biological sibling of parents not all of whom could be their genetic
  // parents — two mothers, say, or a mother and two fathers — is asked which
  // (ruling 26), with nothing chosen for them: first one of the shared
  // parents who could be, then, while that answer leaves more than one who
  // could be the other, which of those. Anyone who could be a genetic parent
  // beside the ones named, when nobody else could, is one.
  const sharedRecorded = asStringArray(values[ROLE.sharedParents]).filter(
    (id) => parents.includes(id),
  );
  const biologicalWhenNamed = (named: readonly string[], id: string) =>
    planAdditionUnder(ids, {
      family,
      anchorId: anchor.id,
      details: {},
      request: {
        ...readSiblingRequest(values),
        parentKind: 'biological',
        biologicalParentIds: named,
      },
      sexAttribute: config.sexAssignedAtBirthAttribute,
    }).links.some(
      (link) =>
        link.source === id &&
        link.target === ids[0] &&
        link.kind === 'biological',
    );
  // Who could be named after `named`, and whether they must be: while not
  // all of them would be genetic parents beside `named` anyway. A naming
  // that would leave the sibling sharing no genetic or adoptive parent with
  // the anchor — a step-parent named the biological parent in place of the
  // anchor's own — makes no sibling, so is not offered.
  const siblingWhenNamed = (named: readonly string[]) =>
    makesSibling(
      family,
      anchor.id,
      ids,
      {
        ...readSiblingRequest(values),
        parentKind: 'biological',
        biologicalParentIds: named,
      },
      config.sexAssignedAtBirthAttribute,
    );
  const namingAfter = (named: readonly string[]) => {
    const candidates = sharedRecorded.filter(
      (id) =>
        !named.includes(id) &&
        biologicalWhenNamed([...named, id], id) &&
        siblingWhenNamed([...named, id]),
    );
    return {
      candidates,
      asked:
        candidates.length > 1 &&
        !candidates.every((id) => biologicalWhenNamed(named, id)),
    };
  };
  const first =
    siblingKind === 'biological'
      ? namingAfter([])
      : { candidates: [], asked: false };
  const firstAnswer = asString(values[ROLE.siblingBiologicalParent]);
  const firstNamed =
    first.asked &&
    firstAnswer !== undefined &&
    first.candidates.includes(firstAnswer)
      ? firstAnswer
      : undefined;
  const second =
    firstNamed === undefined
      ? { candidates: [], asked: false }
      : namingAfter([firstNamed]);
  const firstAnswerKept = useDerivedAnswer({
    name: ROLE.siblingBiologicalParent,
    derived: undefined,
    isAvailable: (id) =>
      first.asked && typeof id === 'string' && first.candidates.includes(id),
  });
  const secondAnswerKept = useDerivedAnswer({
    name: ROLE.siblingOtherBiologicalParent,
    derived: undefined,
    isAvailable: (id) =>
      second.asked && typeof id === 'string' && second.candidates.includes(id),
  });

  // Twins (ruling 16): identical twins have the same genetic parents and
  // sex at birth, so a sibling who would not have all of the anchor's, or is
  // recorded female where the anchor is male (or the other way round),
  // cannot be one.
  const siblingSex = asString(
    useFormValue([config.sexAssignedAtBirthAttribute], 'opaque')[
      config.sexAssignedAtBirthAttribute
    ],
  );
  const sameGeneticParents =
    planAdditionUnder(ids, {
      family,
      anchorId: anchor.id,
      details: {},
      request: { ...readSiblingRequest(values), twin: 'identical' },
      sexAttribute: config.sexAssignedAtBirthAttribute,
    }).twins?.[0]?.zygosity === 'identical';
  // The new twin would be identical to everyone identical to the anchor, so
  // checks their sexes at birth too, the anchor's first.
  const sexClash = identicalSetOf(family, anchor.id).find((id) =>
    differentSexesAtBirth(siblingSex, family.byId.get(id)?.sexAssignedAtBirth),
  );
  const sexesDiffer = sexClash !== undefined;
  const identicalPossible = sameGeneticParents && !sexesDiffer;
  // Twins were carried in one pregnancy, so a sibling who would not share
  // whoever carried the anchor cannot be their twin of any kind, nor can one
  // whose twins were carried by someone the sibling cannot have as a parent,
  // such as a surrogate who carried another twin but is not recorded for the
  // anchor. Nor is someone adopted by a parent they share the twin of
  // someone born to that parent (`adoptedApart`), nor an adopted sibling the
  // twin of someone carried by a parent who adopted them. The question is
  // not asked while any of these holds, and an answer given is taken back.
  const sharedChosen = values[ROLE.sharedParents];
  const carrierLeftOut =
    anchorCarrier !== undefined &&
    [...parents, ...donors, ...surrogates].includes(anchorCarrier) &&
    sharedChosen !== undefined &&
    !asStringArray(sharedChosen).includes(anchorCarrier);
  const carrierOutOfReach =
    anchorCarrier !== undefined &&
    ![...parents, ...donors, ...surrogates].includes(anchorCarrier) &&
    twinSetOf(family, anchor.id).some(
      (id) => carrierOf(family, id) === anchorCarrier,
    );
  const [newPersonId = ''] = ids;
  const twinAsked =
    !carrierLeftOut &&
    !carrierOutOfReach &&
    !adoptedApart(
      familyWithPlan(
        family,
        siblingPlan.people,
        siblingPlan.links,
        config.sexAssignedAtBirthAttribute,
      ),
      anchor.id,
      newPersonId,
    ) &&
    !(
      adopted &&
      anchorCarrier !== undefined &&
      sharedRecorded.includes(anchorCarrier)
    );
  // While they cannot be identical, they are fraternal if twins at all: the
  // question asks only whether they are, with an answer of its own that is
  // taken back, and asked again, once they could be identical.
  const twinOptions = identicalPossible
    ? [
        { value: 'identical', label: text(wording.siblingTwinIdentical) },
        { value: 'fraternal', label: text(wording.siblingTwinFraternal) },
        { value: 'unknown', label: text(wording.siblingTwinUnknown) },
      ]
    : [
        {
          value: NOT_IDENTICAL_TWIN,
          label: text(wording.siblingTwinFraternal),
        },
      ];
  const twinAnswer = useDerivedAnswer({
    name: ROLE.twin,
    derived: undefined,
    isAvailable: (answer) =>
      twinAsked &&
      (answer === NONE || twinOptions.some(({ value }) => value === answer)),
  });

  // Someone with no parents is given an egg parent and a sperm parent,
  // unnamed; the sibling may share both or one of them, and the surrogate
  // who carried the anchor beside them (never in their place, which would
  // make no sibling). Someone with only
  // donors (two, since one donor alone is given a stand-in beside them) is
  // given unnamed adoptive parents, whom the sibling shares, and may share
  // the donors too. Anyone else chooses among the parents recorded, stand-ins
  // included, and the donors: a genetic parent is never missing beside a
  // recorded one (the stand-in rule, `planStandIns`).
  const sharedField =
    parents.length === 0 && donors.length > 0 ? (
      <Field
        component={CheckboxGroupField}
        name={ROLE.sharedParents}
        label={text(wording.sharedDonorsLabel, {
          ...args,
          hasSurrogate: surrogates.length > 0 ? 'true' : 'false',
        })}
        options={[...donors, ...surrogates].map((id) => ({
          value: id,
          label: parentLabel(id),
        }))}
        initialValue={[]}
      />
    ) : parents.length === 0 ? (
      <>
        <Field
          component={RadioGroupField}
          name={ROLE.sharedParentCount}
          label={text(wording.sharedParentCountLabel, args)}
          hint={text(wording.placeholderParentsNote, {
            framing,
            shared: asString(values[ROLE.sharedParentCount]) ?? 'both',
          })}
          options={[
            {
              value: 'both',
              label: text(wording.sharedParentCountBoth),
            },
            {
              value: 'eggParent',
              label: text(wording.sharedParentEggOnly, {
                parent: 'egg',
                framing,
              }),
            },
            {
              value: 'spermParent',
              label: text(wording.sharedParentEggOnly, {
                parent: 'sperm',
                framing,
              }),
            },
          ]}
          required
        />
        {surrogates.length > 0 && (
          <Field
            component={CheckboxGroupField}
            name={ROLE.sharedParents}
            label={text(wording.sharedSurrogateLabel, args)}
            options={surrogates.map((id) => ({
              value: id,
              label: parentLabel(id),
            }))}
            initialValue={[]}
          />
        )}
      </>
    ) : (
      <Field
        component={CheckboxGroupField}
        name={ROLE.sharedParents}
        label={text(wording.sharedParentCountLabel, args)}
        options={[...parents, ...donors, ...surrogates].map((id) => ({
          value: id,
          label: parentLabel(id),
        }))}
        required
      />
    );

  return (
    <>
      {sharedField}
      <Field
        component={RadioGroupField}
        name={ROLE.siblingKind}
        label={text(wording.siblingKindLabel)}
        options={SIBLING_KINDS.map((value) => ({
          value,
          // The kinds are named as the parents' children, never yours.
          label: text(childKindWording(wording, value), { isYou: 'false' }),
          disabled: value === 'biological' && biologicalUnavailable,
        }))}
        required
        {...kindAnswer}
      />
      {first.asked && (
        <Field
          component={RadioGroupField}
          name={ROLE.siblingBiologicalParent}
          label={text(wording.siblingBiologicalParentLabel)}
          options={first.candidates.map((id) => ({
            value: id,
            label: parentLabel(id),
          }))}
          required
          {...firstAnswerKept}
        />
      )}
      {second.asked && (
        <Field
          component={RadioGroupField}
          name={ROLE.siblingOtherBiologicalParent}
          label={text(wording.siblingOtherBiologicalParentLabel)}
          options={second.candidates.map((id) => ({
            value: id,
            label: parentLabel(id),
          }))}
          required
          {...secondAnswerKept}
        />
      )}
      {twinAsked && (
        <Field
          component={RadioGroupField}
          name={ROLE.twin}
          label={text(wording.siblingTwinLabel, args)}
          hint={text(wording.siblingTwinHint)}
          options={[
            { value: NONE, label: text(wording.siblingTwinNo) },
            ...twinOptions,
          ]}
          {...twinAnswer}
        />
      )}
      {asksCarrier && (
        <Field
          component={RadioGroupField}
          name={ROLE.carrier}
          label={text(wording.carrierLabel)}
          options={[
            ...carriers.map((id) => ({ value: id, label: parentLabel(id) })),
            {
              value: NONE,
              label: text(wording.carrierUnknown),
            },
          ]}
          required
          {...carrierAnswer}
        />
      )}
    </>
  );
}
