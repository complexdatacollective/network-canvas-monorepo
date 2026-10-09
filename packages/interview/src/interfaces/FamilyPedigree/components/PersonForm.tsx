'use client';

import { useEffect, useEffectEvent, useMemo, useRef } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
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
import {
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type FamilyPedigreeWording,
  type FormField,
  type FramingId,
  type LocalizedString,
  type PedigreeParentKind,
  type PedigreeRelationshipKind,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import PassphraseEntry from '../../../components/PassphraseEntry';
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
import { RELATIVES_NOT_RECORDED } from '../completeness';
import { formatRelativeTerm, parentTermFrom } from '../kinship';
import {
  type AddRelativeRequest,
  type Family,
  type FamilyLink,
  type MissingDetail,
  type PedigreeConfig,
  type Person,
  type PersonDetails,
  type Relation,
  type TwinZygosity,
  carrierOf,
  familyWithLinkKinds,
  type FamilyLinkKind,
  couldCarryPregnancy,
  familyWithPlan,
  firmGeneticParentSexes,
  firmGeneticParentsOf,
  fullSiblingsOf,
  geneticParentBlock,
  geneticParentsPossible,
  hasCarrier,
  holdsGeneratedLabel,
  identicalTwinsPossible,
  isGeneticKind,
  isStandIn,
  mayHaveCarried,
  otherParentChoices,
  sexesRuledOut,
  planAdditionUnder,
  planStandIns,
  planTwinChanges,
  possibleCarriers,
  primaryParentsOf,
  siblingTie,
  siblingsOf,
  standInPlaceTakenFor,
  twinCandidatesOf,
  twinSetOf,
  twinsOf,
} from '../model';
import {
  builtInDetailWording,
  childKindWording,
  type OwnedOptionLabels,
} from '../options';
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
  geneticParentReason,
  joinReasons,
  type Reason,
  type ReasonContext,
  reasonsFor,
  type UnavailableAnswer,
  sexRuledOutReason,
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
      missing: MissingDetail[];
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
  sharedParents: 'pedigreeSharedParents',
  sharedParentCount: 'pedigreeSharedParentCount',
  siblingKind: 'pedigreeSiblingKind',
  siblingBiologicalParent: 'pedigreeSiblingBiologicalParent',
  siblingOtherBiologicalParent: 'pedigreeSiblingOtherBiologicalParent',
  otherParent: 'pedigreeOtherParent',
  childKind: 'pedigreeChildKind',
  carrier: 'pedigreeCarrier',
  biologicalParent: 'pedigreeBiologicalParent',
  otherParentBiological: 'pedigreeOtherParentBiological',
  twin: 'pedigreeTwin',
  twins: 'pedigreeTwins',
  hasSiblings: 'pedigreeHasSiblings',
  hasChildren: 'pedigreeHasChildren',
} as const;

const NONE = '__none';
const UNKNOWN = '__unknown';

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
const asBoolean = (value: FieldValue | undefined) =>
  typeof value === 'boolean' ? value : undefined;
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
  onDraftChange,
  onSubmit,
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

  const { fieldComponents, toAttributePatch, passphraseNeeded } =
    useProtocolForm({
      fields: formFields,
      subject: { entity: 'node', type: config.personType },
      initialValues: initialResearcherValues,
      currentEntityId: person?.id,
      unavailableVariables: mode.kind === 'edit' ? mode.unavailable : undefined,
    });

  const handleSubmit: FormSubmitHandler = (values) => {
    const set: PersonDetails = readOwnDetails(values, config);
    // A name the form does not ask is left as it is.
    const unset = [
      ...(asksName ? [config.nameAttribute] : []),
      ...(config.genderIdentity ? [config.genderIdentity.attribute] : []),
      config.sexAssignedAtBirthAttribute,
    ].filter((variable) => !Object.hasOwn(set, variable));

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

    return onSubmit({
      set,
      unset,
      request:
        mode.kind === 'add'
          ? readRequest(mode.relation, values, mode.anchor, family)
          : undefined,
      linkUpdates:
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
          : undefined,
      relativesAnswers: mode.kind === 'edit' ? relativesAnswers : undefined,
      twinChanges:
        mode.kind === 'edit'
          ? readTwinChanges(
              draftFamily(family, mode.person.id, values),
              mode.person.id,
              values,
            )
          : undefined,
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
  // A person recorded as a parent cannot be given a sex at birth that
  // contradicts it.
  const ruledOut = person ? sexesRuledOut(family, person.id) : [];
  const sexReasons = person
    ? ruledOut.map((reason) =>
        sexRuledOutReason(reasonContext, person.id, reason),
      )
    : [];
  const sexOptions = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
    value,
    label: optionLabels.sexAssignedAtBirth[value],
    disabled: ruledOut.some((reason) => reason.sex === value),
    description: reasonsFor(reasonContext, sexReasons, value),
  }));

  // A researcher's question, in the interview's language, names the detail
  // still missing; the attribute's own name stands in without one.
  const fieldPromptText = (variable: string) => {
    const prompt = formFields.find(
      (field) => field.variable === variable,
    )?.prompt;
    return prompt === undefined ? variable : resolve(prompt).text;
  };

  // Each missing detail, by the question that asks it and how it is named.
  const missingQuestions =
    mode.kind === 'edit'
      ? mode.missing.map((detail) =>
          typeof detail === 'string'
            ? {
                name:
                  detail === 'genderIdentity'
                    ? (config.genderIdentity?.attribute ?? '')
                    : config.sexAssignedAtBirthAttribute,
                label: text(builtInDetailWording(wording, detail)),
              }
            : {
                name: detail.variable,
                label: fieldPromptText(detail.variable),
              },
        )
      : [];

  return (
    <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
      <DerivedAnswersScope>
        <div className="flex flex-col gap-8">
          <MissingDetailsNotice questions={missingQuestions} />
          <section className="flex flex-col">
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
            <Field
              component={RadioGroupField}
              name={config.sexAssignedAtBirthAttribute}
              nameMode="opaque"
              label={text(wording.sexAssignedAtBirthLabel)}
              options={sexOptions}
              required
              hint={joinReasons(reasonContext, sexReasons)}
              initialValue={person?.sexAssignedAtBirth}
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
            <section className="flex flex-col">
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
            <section className="flex flex-col">
              <PassphraseEntry needed={passphraseNeeded} />
              {fieldComponents}
            </section>
          )}
        </div>
      </DerivedAnswersScope>
    </FormWithoutProvider>
  );
}

/** An answer that leaves a detail missing. */
const isUnanswered = (value: FieldValue | undefined) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/**
 * The details the panel opened missing that are still unanswered, as the
 * form stands: one answered drops out of the notice, and one cleared again
 * comes back.
 */
function MissingDetailsNotice({
  questions,
}: {
  questions: readonly { name: string; label: string }[];
}) {
  const { wording, text } = usePedigreeWords();
  const contentFormat = useContentFormat();
  const values = useFormValue(
    questions.map((question) => question.name),
    'opaque',
  );
  const labels = questions
    .filter((question) => isUnanswered(values[question.name]))
    .map((question) => question.label);
  if (labels.length === 0) return null;
  return (
    <Alert variant="warning">
      {text(wording.missingDetailsList, {
        details: contentFormat.formatList(labels),
      })}
    </Alert>
  );
}

/**
 * Whether the person has siblings, and children, asked when the family must
 * account for them and none are recorded yet.
 */
function RelativesQuestions({
  person,
  askAbout,
  displayName,
}: {
  person: Person;
  askAbout: AskAbout;
  displayName: (personId: string) => string;
}) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const intl = useAppIntl();
  const resolveMessage = useResolveLocalizedMessage();
  const values = {
    isYou: person.isEgo ? 'true' : 'false',
    name: displayName(person.id),
  };
  const options = [
    { value: 'yes', label: intl.formatMessage(booleanFieldMessages.yes) },
    { value: 'no', label: intl.formatMessage(booleanFieldMessages.no) },
    { value: 'unknown', label: text(wording.dontKnow) },
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
  for (const link of links.parents) {
    if (skipped.has(link.id)) continue;
    const kind =
      (asString(values[linkField(link, 'kind')]) as
        | PedigreeParentKind
        | undefined) ?? link.kind;
    // The answer as given, or nothing while it is not: "No" only when
    // answered, or when the parent could not have carried them.
    const answer = values[linkField(link, 'carrier')];
    const isGestationalCarrier =
      kind === 'surrogate'
        ? true
        : !mayHaveCarried(kind) ||
            !couldCarryPregnancy(
              family.byId.get(link.source)?.sexAssignedAtBirth,
            )
          ? false
          : typeof answer === 'boolean'
            ? answer
            : undefined;
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

const twinZygosityField = (twinId: string) => `pedigreeTwin:${twinId}`;

/** The answers about the person's twins, as the changes to make, in
 * `family` as the panel's answers leave it (`draftFamily`): an answer about
 * someone who is no longer the person's sibling there is dropped. */
function readTwinChanges(
  family: Family,
  personId: string,
  values: Record<string, FieldValue>,
) {
  const candidates = twinCandidatesOf(family, personId);
  if (candidates.length === 0) return undefined;
  const answers = new Map<string, TwinZygosity>();
  for (const twinId of asStringArray(values[ROLE.twins])) {
    if (!candidates.includes(twinId)) continue;
    answers.set(
      twinId,
      asZygosity(values[twinZygosityField(twinId)]) ?? 'unknown',
    );
  }
  const changes = planTwinChanges(family, personId, answers);
  return changes.added.length > 0 ||
    changes.changed.length > 0 ||
    changes.removedLinkIds.length > 0
    ? changes
    : undefined;
}

/**
 * Which of the person's siblings are their twins, and for each whether they
 * are identical (ruling 16). Identical twins have the same genetic parents,
 * so "identical" is unavailable, saying why, for a sibling who does not.
 */
function TwinFields({
  person,
  family,
  displayName,
}: {
  person: Person;
  family: Family;
  displayName: (personId: string) => string;
}) {
  const { wording, text } = usePedigreeWords();
  const candidates = twinCandidatesOf(family, person.id);
  const values = useFormValue([ROLE.twins], 'opaque');
  const chosen = asStringArray(values[ROLE.twins]);
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
            who={who(twinId)}
            displayName={displayName}
          />
        ))}
    </>
  );
}

/** Whether the person and one of their twins are identical. */
function TwinZygosityField({
  person,
  twinId,
  family,
  who,
  displayName,
}: {
  person: Person;
  twinId: string;
  family: Family;
  who: 'personIsYou' | 'twinIsYou' | 'other';
  displayName: (personId: string) => string;
}) {
  const { wording, text } = usePedigreeWords();
  const recorded = twinsOf(family, person.id).find(
    (each) => each.twinId === twinId,
  );
  // Identical twins have the same genetic parents. Twins recorded as
  // identical whose parents differ (saved before every change kept that, or
  // as a parent is re-described) are shown as the family records them after
  // the next change: not known to be identical (`planStandIns`). That answer
  // is worked out from the parents as the answers stand, so follows them
  // until the participant answers, and "identical" is never left chosen
  // while it is unavailable (`useDerivedAnswer`).
  const identicalUnavailable = !identicalTwinsPossible(
    family,
    person.id,
    twinId,
  );
  const recordedZygosity =
    recorded?.zygosity === 'identical' && identicalUnavailable
      ? 'unknown'
      : recorded?.zygosity;
  const zygosityAnswer = useDerivedAnswer({
    name: twinZygosityField(twinId),
    nameMode: 'opaque',
    derived: recordedZygosity,
    isAvailable: (value) => value !== 'identical' || !identicalUnavailable,
  });
  const args = {
    who,
    name: displayName(person.id),
    twin: displayName(twinId),
  };
  const identicalHint = identicalUnavailable
    ? text(wording.unavailableIdenticalTwin, {
        ...args,
        answer: text(wording.zygosityIdentical),
      })
    : undefined;
  return (
    <Field
      component={RadioGroupField}
      name={twinZygosityField(twinId)}
      nameMode="opaque"
      label={text(wording.twinZygosityLabel, args)}
      options={ZYGOSITIES.map((value) => ({
        value,
        label: text(zygosityWording(wording, value)),
        disabled: value === 'identical' && identicalUnavailable,
        description: value === 'identical' ? identicalHint : undefined,
      }))}
      hint={identicalHint}
      required
      {...zygosityAnswer}
    />
  );
}

/** The words of the option for each zygosity two twins may have. */
const zygosityWording = (
  wording: FamilyPedigreeWording,
  zygosity: TwinZygosity,
): LocalizedString => {
  switch (zygosity) {
    case 'identical':
      return wording.zygosityIdentical;
    case 'fraternal':
      return wording.zygosityFraternal;
    case 'unknown':
      return wording.zygosityUnknown;
  }
};

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
    allParents.flatMap((link) => [
      linkField(link, 'kind'),
      linkField(link, 'carrier'),
    ]),
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
  const carries = (link: FamilyLink) => {
    const kind = kindOf(link);
    if (kind === 'surrogate') return true;
    if (!mayHaveCarried(kind) || !canCarry(link)) return false;
    const carrier = linkValues[linkField(link, 'carrier')];
    return carrier === undefined
      ? link.isGestationalCarrier === true
      : carrier === true;
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
        const anotherCarrier = parents.find(
          (other) => other.id !== link.id && carries(other),
        );
        // Why a kind of parent is unavailable, for each that is.
        const geneticBlock = canBeGenetic(link)
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
          anotherCarrier &&
            carrierRecordedReason(
              person.id,
              anotherCarrier.source,
              kindAnswers(['surrogate']),
            ),
          !canCarry(link) &&
            sex !== undefined &&
            cannotCarryReason(link.source, sex, kindAnswers(['surrogate'])),
        ];
        return (
          <ParentLinkFields
            key={link.id}
            link={link}
            canBeGenetic={canBeGenetic(link)}
            canCarry={canCarry(link)}
            carries={carries(link)}
            kindReasons={kindReasons}
            reasonContext={reasonContext}
            anotherCarrierId={anotherCarrier?.source}
            personId={person.id}
            personIsYou={isYou(person.id)}
            parentIsYou={isYou(link.source)}
            parentName={displayName(link.source)}
            parentKindLabels={parentKindLabels}
          />
        );
      })}
      <TwinFields person={person} family={draft} displayName={displayName} />
    </section>
  );
}

function ParentLinkFields({
  link,
  canBeGenetic,
  canCarry,
  carries,
  kindReasons,
  reasonContext,
  anotherCarrierId,
  personId,
  personIsYou,
  parentIsYou,
  parentName,
  parentKindLabels,
}: {
  parentKindLabels: Readonly<Record<PedigreeParentKind, string>>;
  link: FamilyLink;
  /** This parent could be a genetic parent alongside the person's others. */
  canBeGenetic: boolean;
  /** This parent could have carried a pregnancy: they are not recorded as
   * male at birth. */
  canCarry: boolean;
  /** This parent carried the pregnancy, as the answers stand. */
  carries: boolean;
  /** Why the kinds of parent that are unavailable are, each naming them. */
  kindReasons: readonly (Reason | undefined | false)[];
  reasonContext: ReasonContext;
  /** Another of the person's parents who carried the pregnancy. */
  anotherCarrierId: string | undefined;
  /** The person the panel describes, this parent's child. */
  personId: string;
  personIsYou: string;
  parentIsYou: string;
  parentName: string;
}) {
  const { wording, text } = usePedigreeWords();
  const intl = useAppIntl();
  const kindField = linkField(link, 'kind');
  const values = useFormValue([kindField], 'opaque');
  const kind = asString(values[kindField]) ?? link.kind;
  const kindUnavailable = (value: string) =>
    (isGeneticKind(value) && !canBeGenetic) ||
    (value === 'surrogate' && (anotherCarrierId !== undefined || !canCarry));
  // The kind recorded, until it is unavailable (`useDerivedAnswer`): it is
  // then shown unchosen, and left as stored unless another is chosen.
  const kindAnswer = useDerivedAnswer({
    name: kindField,
    nameMode: 'opaque',
    derived: link.kind,
    isAvailable: (value) => !kindUnavailable(String(value)),
  });
  // While another parent carried the pregnancy, only "Yes" would record a
  // second carrier: it is unavailable, naming them, and "No" stays.
  const carriedYesReason =
    !carries && anotherCarrierId !== undefined
      ? joinReasons(reasonContext, [
          carrierRecordedReason(personId, anotherCarrierId, [yesAnswer(intl)]),
        ])
      : undefined;
  // Not known shows neither answer chosen, except that while someone else
  // carried them, "No" is the answer worked out (`useDerivedAnswer`): it
  // goes again once nobody else did, unless the participant chose it.
  const carriedAnswer = useDerivedAnswer({
    name: linkField(link, 'carrier'),
    nameMode: 'opaque',
    derived:
      link.isGestationalCarrier ??
      (anotherCarrierId === undefined ? undefined : false),
    isAvailable: (value) => value !== true || carriedYesReason === undefined,
  });

  return (
    <>
      <Field
        component={RadioGroupField}
        name={kindField}
        nameMode="opaque"
        label={text(wording.parentLinkKindLabel, {
          personIsYou,
          parentIsYou,
          parent: parentName,
        })}
        options={PARENT_KINDS.map((value) => ({
          value,
          label: parentKindLabels[value],
          disabled: kindUnavailable(value),
          description: reasonsFor(reasonContext, kindReasons, value),
        }))}
        hint={joinReasons(reasonContext, kindReasons)}
        {...kindAnswer}
      />
      {kind !== 'surrogate' && mayHaveCarried(kind) && canCarry && (
        <Field
          component={BooleanField}
          name={linkField(link, 'carrier')}
          nameMode="opaque"
          label={text(wording.parentCarriedLabel, {
            named: 'true',
            parentIsYou,
            parent: parentName,
          })}
          options={carriedOptions(intl, carriedYesReason)}
          hint={carriedYesReason}
          {...carriedAnswer}
        />
      )}
    </>
  );
}

/** "Yes", as an answer a reason makes unavailable. */
const yesAnswer = (intl: ReturnType<typeof useAppIntl>): UnavailableAnswer => ({
  value: 'true',
  label: intl.formatMessage(booleanFieldMessages.yes),
});

/** The answers to whether a parent carried the pregnancy: "Yes" unavailable,
 * described by `yesUnavailable`, while someone else did. */
const carriedOptions = (
  intl: ReturnType<typeof useAppIntl>,
  yesUnavailable: string | undefined,
) => [
  {
    label: intl.formatMessage(booleanFieldMessages.yes),
    value: true,
    disabled: yesUnavailable !== undefined,
    description: yesUnavailable,
  },
  { label: intl.formatMessage(booleanFieldMessages.no), value: false },
];

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
  const personValues = useFormValue(personQuestions(roleValues));
  const values = useMemo(
    () => ({ ...roleValues, ...personValues }),
    [roleValues, personValues],
  );
  const report = useRef(onDraftChange);
  report.current = onDraftChange;
  useEffect(() => {
    const kindQuestion = KIND_QUESTION[relation];
    report.current({
      details: readOwnDetails(values, config),
      request: readRequest(relation, values, anchor, family),
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
 * not asked.
 */
function childCarrierChoices(
  family: Family,
  anchor: Person,
  childKind: string,
  otherParent: string | undefined,
): string[] {
  if (childKind === 'surrogate') return [];
  return [
    ...(couldCarryPregnancy(anchor.sexAssignedAtBirth) ? [anchor.id] : []),
    ...(otherParent !== undefined &&
    otherParent !== NONE &&
    (otherParent === UNKNOWN ||
      couldCarryPregnancy(family.byId.get(otherParent)?.sexAssignedAtBirth))
      ? [otherParent]
      : []),
  ];
}

function readRequest(
  relation: Relation,
  values: Record<string, FieldValue | undefined>,
  anchor: Person,
  family: Family,
): AddRelativeRequest {
  switch (relation) {
    case 'parent': {
      const partnerId = asString(values[ROLE.partnerId]);
      const partnered = partnerId && partnerId !== NONE ? partnerId : null;
      return {
        relation,
        parentKind:
          (asString(values[ROLE.parentKind]) as PedigreeParentKind) ??
          'biological',
        // Not answered records nothing, told apart from "No".
        carriedPregnancy: asBoolean(values[ROLE.carriedPregnancy]),
        partnerId: partnered,
        partnershipCurrent:
          partnered === null ||
          values[aboutPerson(ROLE.partnershipCurrent, partnered)] !== false,
        alsoParentOf: asStringArray(values[ROLE.alsoParentOf]),
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
        (asString(values[ROLE.childKind]) as PedigreeParentKind | undefined) ??
        'biological';
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
        !childCarrierChoices(family, anchor, childKind, otherParent).includes(
          answer,
        )
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
    : words.text(words.wording.generatedLabelOf, {
        relation: 'owner',
        owner: displayName(anchor.id),
        term: formatRelativeTerm(term, words),
      });
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
    parentKind:
      (asString(values[ROLE.siblingKind]) as
        | (typeof SIBLING_KINDS)[number]
        | undefined) ?? 'biological',
    biologicalParentIds: [
      ROLE.siblingBiologicalParent,
      ROLE.siblingOtherBiologicalParent,
    ].flatMap((question) => asString(values[question]) ?? []),
    twin: asZygosity(values[ROLE.twin]),
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
      return <PartnershipCurrentField />;
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
 * with the parent chosen as their partner (named for them, `aboutPerson`). */
function PartnershipCurrentField({
  name = ROLE.partnershipCurrent,
}: {
  name?: string;
}) {
  const { wording, text } = usePedigreeWords();
  return (
    <Field
      component={BooleanField}
      name={name}
      label={text(wording.stillTogetherLabel, {
        named: 'false',
      })}
      initialValue={true}
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
  const raises =
    parentKind === 'biological' ||
    parentKind === 'adoptive' ||
    parentKind === 'social';

  // A stand-in is never recorded as anyone's partner (ruling 25), so is not
  // offered as the new parent's partner.
  const existingParents = primaryParentsOf(family, anchor.id).filter(
    (parentId) => !isStandIn(family, parentId),
  );
  // One person carried the pregnancy at most; once someone has, the new
  // parent cannot have too.
  const anchorHasCarrier = hasCarrier(family, anchor.id);
  // Nor can a parent recorded as male at birth.
  const canCarry = !anchorHasCarrier && couldCarryPregnancy(sexAssignedAtBirth);
  // A genetic parent provided the egg or the sperm, which another genetic
  // parent may already have. A stand-in gives way to a genetic parent
  // recorded in their place.
  const canBeGeneticParentOf = (personId: string) =>
    geneticParentsPossible([
      ...firmGeneticParentSexes(family, personId),
      sexAssignedAtBirth,
    ]);
  const kindPossible = (kind: string) =>
    isGeneticKind(kind)
      ? canBeGeneticParentOf(anchor.id)
      : kind !== 'surrogate' || canCarry;
  const siblings = siblingsOf(family, anchor.id);
  const fullSiblings = new Set(fullSiblingsOf(family, anchor.id));
  const partnerChoice = asString(values[ROLE.partnerId]);
  // The new parent is the same kind of parent to the siblings chosen.
  const siblingPossible = (siblingId: string) =>
    isGeneticKind(parentKind)
      ? canBeGeneticParentOf(siblingId)
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
    const carrierId = carrierOf(family, personId);
    return carrierId === undefined
      ? undefined
      : carrierRecordedReason(personId, carrierId, answers);
  };
  const kindAnswers = (kinds: readonly PedigreeParentKind[]) =>
    kinds.map((value) => ({ value, label: parentKindLabels[value] }));
  const kindReasons = [
    !canBeGeneticParentOf(anchor.id) &&
      geneticReason(anchor.id, kindAnswers(PARENT_KINDS.filter(isGeneticKind))),
    !canCarry && carrierReason(anchor.id, kindAnswers(['surrogate'])),
    !canCarry &&
      sexAssignedAtBirth !== undefined &&
      !couldCarryPregnancy(sexAssignedAtBirth) &&
      cannotCarryReason(
        undefined,
        sexAssignedAtBirth,
        kindAnswers(['surrogate']),
      ),
  ];
  const kindHint = joinReasons(reasonContext, kindReasons);
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
  // or their kind — are taken back, so the question is asked again, or
  // takes its default again while the participant has not answered it
  // (`useDerivedAnswer`).
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const kindAnswer = useDerivedAnswer({
    name: ROLE.parentKind,
    derived: 'biological',
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
  const asksCarried =
    parentKind !== 'surrogate' &&
    mayHaveCarried(parentKind) &&
    couldCarryPregnancy(sexAssignedAtBirth) &&
    (!anchorHasCarrier || siblingsWithoutCarrier.length > 0);
  const carriedAnswer = useDerivedAnswer({
    name: ROLE.carriedPregnancy,
    derived: undefined,
    isAvailable: () => asksCarried,
  });
  const [onlySibling] = siblingsWithoutCarrier;
  // With nobody left to ask about, because the anchor already has someone
  // recorded as carrying them, the question is shown unavailable, naming
  // them: a child has one carrier at most.
  const carriedUnavailable =
    !asksCarried &&
    parentKind !== 'surrogate' &&
    mayHaveCarried(parentKind) &&
    couldCarryPregnancy(sexAssignedAtBirth) &&
    anchorHasCarrier;
  // Only "Yes" would record a second carrier, so only it is unavailable,
  // and "No" is the answer shown. It is a question of its own, so the
  // answer is never taken for the siblings the question may go on to ask
  // about.
  const carriedYesReason = carriedUnavailable
    ? joinReasons(reasonContext, [carrierReason(anchor.id, [yesAnswer(intl)])])
    : undefined;
  const carriedUnavailableField = carriedUnavailable && (
    <Field
      component={BooleanField}
      name={ROLE.carriedPregnancyUnavailable}
      label={text(wording.parentCarriedLabel, { named: 'false' })}
      options={carriedOptions(intl, carriedYesReason)}
      hint={carriedYesReason}
      initialValue={false}
    />
  );
  const carriedField = asksCarried && (
    <Field
      component={BooleanField}
      name={ROLE.carriedPregnancy}
      label={
        anchorHasCarrier
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
      {...carriedAnswer}
    />
  );

  // The defaults assume the new parent belongs with the anchor's other
  // parents — as their partner, and as the parent of the anchor's full
  // siblings — only where they could have raised the anchor together: never
  // a biological parent alongside an adoptive one, who are rarely partners
  // and whose other children are rarely each other's. A partnership is
  // never assumed for a new biological parent (ruling 25: never assume a
  // partnership between biological parents): the question starts
  // unanswered, and a partnership is recorded only when chosen. Each
  // default follows the kind chosen until the participant answers the
  // question themselves.
  const kindOfParent = (parentId: string) =>
    family.links.find(
      (link) =>
        link.kind !== 'partner' &&
        link.source === parentId &&
        link.target === anchor.id,
    )?.kind;
  const belongsWith = (parentId: string) =>
    !birthAndAdoptive(kindOfParent(parentId), parentKind);
  const [onlyParent] = existingParents;
  const partnerAnswer = useDerivedAnswer({
    name: ROLE.partnerId,
    derived:
      parentKind === 'biological'
        ? undefined
        : raises &&
            existingParents.length === 1 &&
            onlyParent !== undefined &&
            belongsWith(onlyParent)
          ? onlyParent
          : NONE,
  });
  // A sibling the new parent could not be the same kind of parent of is
  // never left chosen.
  const siblingsAnswer = useDerivedAnswer({
    name: ROLE.alsoParentOf,
    derived: siblings.filter(
      (id) =>
        takenOver.includes(id) ||
        (existingParents.every(belongsWith) &&
          fullSiblings.has(id) &&
          siblingPossible(id)),
    ),
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
      {!anchorHasCarrier && carriedField}
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
      {anchorHasCarrier && carriedField}
    </>
  );
}

/** A biological parent and an adoptive parent, in either order. */
const birthAndAdoptive = (first: string | undefined, second: string) =>
  (first === 'biological' && second === 'adoptive') ||
  (first === 'adoptive' && second === 'biological');

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
  const { choices, preferred } = otherParentChoices(family, anchor.id);
  const childKind = asString(values[ROLE.childKind]) ?? 'biological';
  const otherParent = asString(values[ROLE.otherParent]);
  // The other parent assumed is the anchor's only current partner; with
  // nobody to choose from, someone not shown yet; and with several who could
  // be, nobody, so the participant chooses. The other parent of a child
  // conceived with the anchor's donated egg or sperm, or carried by the
  // anchor as a surrogate, is assumed to be someone not shown yet, not the
  // anchor's partner. The default follows the kind of child until the
  // participant answers.
  const donatedOrCarried = childKind === 'donor' || childKind === 'surrogate';
  const otherParentAnswer = useDerivedAnswer({
    name: ROLE.otherParent,
    derived: donatedOrCarried
      ? UNKNOWN
      : (preferred ?? (choices.length === 0 ? UNKNOWN : undefined)),
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
  // Both, until answered, unless it is impossible: the question is then
  // asked (`useDerivedAnswer`).
  const biologicalAnswer = useDerivedAnswer({
    name: biologicalField || undefined,
    derived: 'both',
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
  const carriers = childCarrierChoices(family, anchor, childKind, otherParent);
  // An answer naming someone no longer offered — an other parent since
  // replaced — is taken back, so the question is asked again.
  const carrierAnswer = useDerivedAnswer({
    name: ROLE.carrier,
    derived: undefined,
    isAvailable: (id) =>
      carriers.length > 0 &&
      (id === NONE || (typeof id === 'string' && carriers.includes(id))),
  });

  // Why an answer is unavailable, naming it.
  const childKindReasons = [
    anchor.sexAssignedAtBirth !== undefined &&
      !couldCarryPregnancy(anchor.sexAssignedAtBirth) &&
      cannotCarryReason(anchor.id, anchor.sexAssignedAtBirth, [
        {
          value: 'surrogate',
          label: text(childKindWording(wording, 'surrogate')),
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
          label: text(childKindWording(wording, value)),
          // Someone recorded as male at birth carried nobody.
          disabled:
            value === 'surrogate' &&
            !couldCarryPregnancy(anchor.sexAssignedAtBirth),
          description: reasonsFor(reasonContext, childKindReasons, value),
        }))}
        hint={joinReasons(reasonContext, childKindReasons)}
        required
        initialValue="biological"
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
      {raisedWithOtherParent && (
        <Field
          component={BooleanField}
          name={aboutPerson(ROLE.otherParentBiological, raisedWithOtherParent)}
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
    derived: 'biological',
    isAvailable: (kind) => kind !== 'biological' || !biologicalUnavailable,
  });

  // A sibling is asked who carried the pregnancy, as a child is: each parent
  // the sibling will have, as the answers stand, who could have carried it —
  // the parents chosen, and any unnamed parent added for both of them —
  // offered by the name they are shown by, whatever kind of parent they are.
  const siblingKind = asString(values[ROLE.siblingKind]);
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
    siblingKind === undefined || nothingShared
      ? []
      : possibleCarriers(
          family,
          siblingPlan,
          ids[0] ?? '',
          config.sexAssignedAtBirthAttribute,
        );
  // An answer a later one has taken away is asked again.
  const carrierAnswer = useDerivedAnswer({
    name: ROLE.carrier,
    derived: undefined,
    isAvailable: (id) =>
      carriers.length > 0 &&
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

  // Twins (ruling 16): identical twins have the same genetic parents, so a
  // sibling who would not have all of the anchor's cannot be one. The model
  // records them as twins not known to be identical; the answer is
  // unavailable, saying why, and asked again once taken away.
  const identicalPossible =
    planAdditionUnder(ids, {
      family,
      anchorId: anchor.id,
      details: {},
      request: { ...readSiblingRequest(values), twin: 'identical' },
      sexAttribute: config.sexAssignedAtBirthAttribute,
    }).twins?.[0]?.zygosity === 'identical';
  const identicalHint = identicalPossible
    ? undefined
    : text(wording.unavailableIdenticalTwinNew, {
        ...args,
        answer: text(wording.siblingTwinIdentical),
      });
  const twinAnswer = useDerivedAnswer({
    name: ROLE.twin,
    derived: NONE,
    isAvailable: (answer) => answer !== 'identical' || identicalPossible,
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
          initialValue="both"
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
        initialValue={parents}
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
          label: text(childKindWording(wording, value)),
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
      {carriers.length > 0 && (
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
          {...carrierAnswer}
        />
      )}
      <Field
        component={RadioGroupField}
        name={ROLE.twin}
        label={text(wording.siblingTwinLabel, args)}
        hint={[text(wording.siblingTwinHint), identicalHint]
          .filter((sentence) => sentence !== undefined)
          .join(' ')}
        options={[
          { value: NONE, label: text(wording.siblingTwinNo) },
          {
            value: 'identical',
            label: text(wording.siblingTwinIdentical),
            disabled: !identicalPossible,
            description: identicalHint,
          },
          {
            value: 'fraternal',
            label: text(wording.siblingTwinFraternal),
          },
          {
            value: 'unknown',
            label: text(wording.siblingTwinUnknown),
          },
        ]}
        {...twinAnswer}
      />
    </>
  );
}
