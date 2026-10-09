'use client';

import {
  type MouseEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type {
  FormSubmissionResult,
  FormSubmitHandler,
  ValidationContext,
} from '@codaco/fresco-ui/form/store/types';
import Heading from '@codaco/fresco-ui/typography/Heading';
import {
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type FormField,
  type FramingId,
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
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import { useResolveLocalizedString } from '../../../localization/ProtocolLocalizationProvider';
import {
  getValidationContext,
  selectValidationMetadataForVariable,
  validationPropsFor,
} from '../../../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../../../selectors/protocol';
import { readOwnProperty, writeOwnProperty } from '../../../utils/ownProperty';
import { interfaceMessages } from '../../messages';
import { RELATIVES_NOT_RECORDED } from '../completeness';
import { parentTermFrom } from '../kinship';
import { messages } from '../messages';
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
  BUILT_IN_DETAIL_LABELS,
  CHILD_KIND_LABELS,
  type OwnedOptionLabels,
} from '../options';
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

/** Which relatives to ask about, whether they must be answered, and which
 * the participant has already said "Yes — I'll add them" to. */
export type AskAbout = {
  siblings: boolean;
  children: boolean;
  required: boolean;
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
  askAbout,
  onDraftChange,
  onSubmit,
}: PersonFormProps) {
  const intl = useAppIntl();
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
              intl.formatMessage(messages.sharedParentsNotSibling, {
                isYou: mode.anchor.isEgo ? 'true' : 'false',
                name: displayName(mode.anchor.id),
                chosen: intl.formatList(
                  request.sharedParentIds.map((id) =>
                    intl.formatMessage(messages.listedName, {
                      name: siblingParentLabel(
                        intl,
                        family,
                        mode.anchor,
                        id,
                        displayName,
                        framing,
                      ),
                    }),
                  ),
                  { type: 'conjunction' },
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
          formErrors: [createMessageError(runtimeMessages.submissionFailed)],
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
    intl,
    family,
    displayName,
    sexLabels: optionLabels.sexAssignedAtBirth,
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
                label: intl.formatMessage(BUILT_IN_DETAIL_LABELS[detail]),
              }
            : {
                name: detail.variable,
                label: fieldPromptText(detail.variable),
              },
        )
      : [];

  return (
    <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
      <div className="flex flex-col gap-8">
        <MissingDetailsNotice questions={missingQuestions} />
        <section className="flex flex-col">
          <Heading level="h3" margin="none" className="mb-4">
            <AppMessage
              message={messages.aboutThisPerson}
              values={{ isYou: isEgo ? 'true' : 'false' }}
            />
          </Heading>
          {asksName && (
            <Field
              component={InputField}
              name={config.nameAttribute}
              nameMode="opaque"
              label={intl.formatMessage(messages.nameLabel)}
              hint={intl.formatMessage(messages.nameHint)}
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
              label={intl.formatMessage(messages.genderIdentityLabel)}
              options={genderIdentityOptions}
              required
              initialValue={person?.genderIdentity}
            />
          )}
          <Field
            component={RadioGroupField}
            name={config.sexAssignedAtBirthAttribute}
            nameMode="opaque"
            label={intl.formatMessage(messages.sexAssignedAtBirthLabel)}
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
            <Heading level="h3" margin="none" className="mb-4">
              <AppMessage message={messages.relationshipSection} />
            </Heading>
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
            <Heading level="h3" margin="none" className="mb-4">
              <AppMessage
                message={messages.moreAboutThisPerson}
                values={{ isYou: isEgo ? 'true' : 'false' }}
              />
            </Heading>
            <PassphraseEntry needed={passphraseNeeded} />
            {fieldComponents}
          </section>
        )}
      </div>
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
  const intl = useAppIntl();
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
      <AppMessage
        message={messages.missingDetailsList}
        values={{
          details: intl.formatList(labels, { type: 'conjunction' }),
        }}
      />
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
  const intl = useAppIntl();
  const args = {
    isYou: person.isEgo ? 'true' : 'false',
    name: displayName(person.id),
  };
  const options = [
    { value: 'yes', label: intl.formatMessage(messages.hasRelativesYes) },
    { value: 'no', label: intl.formatMessage(interfaceMessages.no) },
    { value: 'unknown', label: intl.formatMessage(messages.dontKnow) },
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
      <Heading level="h3" margin="none" className="mb-4">
        <AppMessage message={messages.familySection} />
      </Heading>
      {askAbout.siblings && (
        <Field
          component={RadioGroupField}
          name={ROLE.hasSiblings}
          label={intl.formatMessage(messages.hasSiblingsQuestion, args)}
          options={options}
          required={askAbout.required}
          initialValue={initial('siblings')}
        />
      )}
      {askAbout.children && (
        <Field
          component={RadioGroupField}
          name={ROLE.hasChildren}
          label={intl.formatMessage(messages.hasChildrenQuestion, args)}
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
  const intl = useAppIntl();
  const candidates = twinCandidatesOf(family, person.id);
  const current = twinsOf(family, person.id);
  const values = useFormValue([ROLE.twins], 'opaque');
  const chosen = asStringArray(values[ROLE.twins]);
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
        label={intl.formatMessage(messages.twinsLabel, {
          isYou: isYou(person.id) ? 'true' : 'false',
          name: displayName(person.id),
        })}
        hint={intl.formatMessage(messages.twinsHint)}
        options={candidates.map((id) => ({
          value: id,
          label: displayName(id),
        }))}
        // Everyone in their twin set, so a set recorded with a pair missing
        // is made whole when saved.
        initialValue={twinSetOf(family, person.id).filter(
          (id) => id !== person.id,
        )}
      />
      {chosen
        .filter((twinId) => candidates.includes(twinId))
        .map((twinId) => {
          const recorded = current.find((each) => each.twinId === twinId);
          // Identical twins have the same genetic parents. Twins recorded as
          // identical whose parents differ (saved before every change kept
          // that) are shown as the family records them after the next
          // change: not known to be identical (`planStandIns`).
          const identicalUnavailable = !identicalTwinsPossible(
            family,
            person.id,
            twinId,
          );
          const recordedZygosity =
            recorded?.zygosity === 'identical' && identicalUnavailable
              ? 'unknown'
              : recorded?.zygosity;
          const args = {
            who: who(twinId),
            name: displayName(person.id),
            twin: displayName(twinId),
          };
          const identicalHint = identicalUnavailable
            ? intl.formatMessage(messages.unavailableIdenticalTwin, {
                ...args,
                answer: intl.formatMessage(messages.listedName, {
                  name: intl.formatMessage(ZYGOSITY_LABELS.identical),
                }),
              })
            : undefined;
          return (
            <Field
              key={twinId}
              component={RadioGroupField}
              name={twinZygosityField(twinId)}
              nameMode="opaque"
              label={intl.formatMessage(messages.twinZygosityLabel, args)}
              options={ZYGOSITIES.map((value) => ({
                value,
                label: intl.formatMessage(ZYGOSITY_LABELS[value]),
                disabled: value === 'identical' && identicalUnavailable,
                description: value === 'identical' ? identicalHint : undefined,
              }))}
              hint={identicalHint}
              required
              initialValue={recordedZygosity}
            />
          );
        })}
    </>
  );
}

const ZYGOSITY_LABELS = {
  identical: messages.zygosityIdentical,
  fraternal: messages.zygosityFraternal,
  unknown: messages.zygosityUnknown,
} as const;

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
  const intl = useAppIntl();
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
      <Heading level="h3" margin="none" className="mb-4">
        <AppMessage message={messages.relationshipsSection} />
      </Heading>
      {partnerships.map((link) => {
        const partnerId = link.source === person.id ? link.target : link.source;
        return (
          <Field
            key={link.id}
            component={BooleanField}
            name={linkField(link, 'current')}
            nameMode="opaque"
            label={intl.formatMessage(messages.stillTogetherLabel, {
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
  const intl = useAppIntl();
  const kindField = linkField(link, 'kind');
  const values = useFormValue([kindField], 'opaque');
  const kind = asString(values[kindField]) ?? link.kind;
  // While another parent carried the pregnancy, only "Yes" would record a
  // second carrier: it is unavailable, naming them, and "No" stays.
  const carriedYesReason =
    !carries && anotherCarrierId !== undefined
      ? joinReasons(reasonContext, [
          carrierRecordedReason(personId, anotherCarrierId, [yesAnswer(intl)]),
        ])
      : undefined;

  return (
    <>
      <Field
        component={RadioGroupField}
        name={kindField}
        nameMode="opaque"
        label={intl.formatMessage(messages.parentLinkKindLabel, {
          personIsYou,
          parentIsYou,
          parent: parentName,
        })}
        options={PARENT_KINDS.map((value) => ({
          value,
          label: parentKindLabels[value],
          disabled:
            (isGeneticKind(value) && !canBeGenetic) ||
            (value === 'surrogate' &&
              (anotherCarrierId !== undefined || !canCarry)),
          description: reasonsFor(reasonContext, kindReasons, value),
        }))}
        hint={joinReasons(reasonContext, kindReasons)}
        initialValue={link.kind}
      />
      {kind !== 'surrogate' && mayHaveCarried(kind) && canCarry && (
        <Field
          component={BooleanField}
          name={linkField(link, 'carrier')}
          nameMode="opaque"
          label={intl.formatMessage(messages.parentCarriedLabel, {
            parentIsYou,
            parent: parentName,
          })}
          options={carriedOptions(intl, carriedYesReason)}
          hint={carriedYesReason}
          // Not known shows neither answer chosen, except that someone else
          // having carried them leaves only "No".
          initialValue={
            link.isGestationalCarrier ??
            (anotherCarrierId === undefined ? undefined : false)
          }
        />
      )}
    </>
  );
}

/** "Yes", as an answer a reason makes unavailable. */
const yesAnswer = (intl: ReturnType<typeof useAppIntl>): UnavailableAnswer => ({
  value: 'true',
  label: intl.formatMessage(interfaceMessages.yes),
});

/** The answers to whether a parent carried the pregnancy: "Yes" unavailable,
 * described by `yesUnavailable`, while someone else did. */
const carriedOptions = (
  intl: ReturnType<typeof useAppIntl>,
  yesUnavailable: string | undefined,
) => [
  {
    label: intl.formatMessage(interfaceMessages.yes),
    value: true,
    disabled: yesUnavailable !== undefined,
    description: yesUnavailable,
  },
  { label: intl.formatMessage(interfaceMessages.no), value: false },
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
  intl: ReturnType<typeof useAppIntl>,
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
    : intl.formatMessage(messages.relativeOf, {
        owner: displayName(anchor.id),
        term,
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
  const intl = useAppIntl();
  return (
    <Field
      component={BooleanField}
      name={name}
      label={intl.formatMessage(messages.partnershipCurrentLabel)}
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
      ? intl.formatMessage(messages.standInPlaceTaken, {
          anchorIsYou: anchor.isEgo ? 'true' : 'false',
          anchor: displayName(anchor.id),
          count: takenOver.length,
          names: intl.formatList(
            takenOver.map((id) =>
              intl.formatMessage(messages.listedName, {
                name: displayName(id),
              }),
            ),
            { type: 'conjunction' },
          ),
        })
      : undefined,
  ]
    .filter((sentence) => sentence !== undefined)
    .join(' ');

  // Answers made impossible by a later one — the new parent's sex at birth,
  // or their kind — are taken back, so the question is asked again.
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const kindImpossible = chosenKind !== undefined && !kindPossible(chosenKind);
  useEffect(() => {
    if (kindImpossible) setFieldValue(ROLE.parentKind, undefined);
  }, [kindImpossible, setFieldValue]);
  const keptSiblings = chosenSiblings.filter(siblingPossible);
  const siblingsDropped = keptSiblings.length < chosenSiblings.length;
  const keptRef = useRef(keptSiblings);
  keptRef.current = keptSiblings;
  useEffect(() => {
    if (siblingsDropped) setFieldValue(ROLE.alsoParentOf, keptRef.current);
  }, [siblingsDropped, setFieldValue]);

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
  const carriedAnswered = values[ROLE.carriedPregnancy] !== undefined;
  useEffect(() => {
    if (!asksCarried && carriedAnswered) {
      setFieldValue(ROLE.carriedPregnancy, undefined);
    }
  }, [asksCarried, carriedAnswered, setFieldValue]);
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
      label={intl.formatMessage(messages.carriedPregnancyLabel)}
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
          ? intl.formatMessage(messages.carriedSiblingsPregnancyLabel, {
              count: siblingsWithoutCarrier.length,
              isYou:
                onlySibling !== undefined && family.byId.get(onlySibling)?.isEgo
                  ? 'true'
                  : 'false',
              name: onlySibling === undefined ? '' : displayName(onlySibling),
            })
          : intl.formatMessage(messages.carriedPregnancyLabel)
      }
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
  const partnerDefault = useDefaultUntilAnswered(
    ROLE.partnerId,
    partnerChoice,
    parentKind === 'biological'
      ? undefined
      : raises &&
          existingParents.length === 1 &&
          onlyParent !== undefined &&
          belongsWith(onlyParent)
        ? onlyParent
        : NONE,
  );
  const siblingsDefault = useDefaultUntilAnswered(
    ROLE.alsoParentOf,
    values[ROLE.alsoParentOf],
    siblings.filter(
      (id) =>
        takenOver.includes(id) ||
        (existingParents.every(belongsWith) &&
          fullSiblings.has(id) &&
          siblingPossible(id)),
    ),
  );
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
        label={intl.formatMessage(messages.parentKindLabel)}
        options={PARENT_KINDS.map((value) => ({
          value,
          label: parentKindLabels[value],
          disabled: !kindPossible(value),
          description: reasonsFor(reasonContext, kindReasons, value),
        }))}
        hint={kindHint}
        required
        initialValue="biological"
      />
      {!anchorHasCarrier && carriedField}
      {carriedUnavailableField}
      {raises && existingParents.length > 0 && (
        <Field
          component={RadioGroupField}
          name={ROLE.partnerId}
          label={intl.formatMessage(messages.parentPartnerLabel)}
          options={[
            ...existingParents.map((id) => ({
              value: id,
              label: displayName(id),
            })),
            { value: NONE, label: intl.formatMessage(interfaceMessages.no) },
          ]}
          initialValue={partnerDefault.initial}
          {...partnerDefault.answering}
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
          label={intl.formatMessage(messages.alsoParentOfLabel)}
          options={siblings.map((id) => ({
            value: id,
            label: displayName(id),
            disabled: !siblingPossible(id) || takenOver.includes(id),
          }))}
          hint={siblingsHint || undefined}
          initialValue={siblingsDefault.initial}
          {...siblingsDefault.answering}
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

/** Whether an event on a question's options was aimed at one that can be
 * chosen: the option itself, or its label. */
const choosesOption = (target: EventTarget) => {
  if (!(target instanceof Element)) return false;
  const selector = '[role="radio"], [role="checkbox"]';
  const option =
    target.closest(selector) ??
    target.closest('label')?.querySelector(selector);
  return (
    option !== null &&
    option !== undefined &&
    option.getAttribute('aria-disabled') !== 'true' &&
    !option.hasAttribute('data-disabled') &&
    !option.matches(':disabled')
  );
};

/**
 * Keeps a question's answer at its default while the default changes with
 * earlier answers, until the participant answers it themselves. Choosing an
 * option, with the pointer or the keyboard, is an answer even when it is the
 * option already chosen, as is any change to the answer not made here; once
 * answered, the answer is theirs and is left alone. Returns the default the
 * question starts with, and the handlers that notice the participant
 * answering, for the question's options.
 */
function useDefaultUntilAnswered<Answer extends string | string[] | undefined>(
  name: string,
  answer: FieldValue | undefined,
  defaultAnswer: Answer,
) {
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  // No default is kept as no answer.
  const key = defaultAnswer === undefined ? '' : JSON.stringify(defaultAnswer);
  const [initial] = useState(defaultAnswer);
  // The default the answer was last given, and whether the participant has
  // since answered otherwise.
  const given = useRef(key);
  const answered = useRef(false);
  const answerKey = answer === undefined ? undefined : JSON.stringify(answer);
  useEffect(() => {
    if (answerKey !== undefined && answerKey !== given.current) {
      answered.current = true;
    }
  }, [answerKey]);
  const followDefault = useEffectEvent((nextKey: string) => {
    if (answered.current || given.current === nextKey) return;
    given.current = nextKey;
    setFieldValue(name, defaultAnswer);
  });
  useEffect(() => followDefault(key), [key]);
  // Choosing an option from the keyboard (Space on the option focused)
  // clicks it, as the pointer does; moving to another with the arrow keys
  // changes the answer.
  const answering = {
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (choosesOption(event.target)) answered.current = true;
    },
  };
  return { initial, answering };
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
  const intl = useAppIntl();
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
  const otherParentDefault = useDefaultUntilAnswered(
    ROLE.otherParent,
    otherParent,
    donatedOrCarried
      ? UNKNOWN
      : (preferred ?? (choices.length === 0 ? UNKNOWN : undefined)),
  );
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
  const biologicalValues = useFormValue(
    biologicalField ? [biologicalField] : [],
  );
  // Both, only when one could have provided the egg and the other the
  // sperm.
  const bothPossible =
    otherPartner === undefined ||
    geneticParentsPossible([
      anchor.sexAssignedAtBirth,
      family.byId.get(otherPartner)?.sexAssignedAtBirth,
    ]);
  const biologicalParent = biologicalField
    ? asString(biologicalValues[biologicalField])
    : 'both';
  // Choosing another parent can make "both" impossible; the question is
  // then asked again.
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const bothImpossible = biologicalParent === 'both' && !bothPossible;
  useEffect(() => {
    if (bothImpossible && biologicalField) {
      setFieldValue(biologicalField, undefined);
    }
  }, [bothImpossible, biologicalField, setFieldValue]);
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

  // Why an answer is unavailable, naming it.
  const childKindReasons = [
    anchor.sexAssignedAtBirth !== undefined &&
      !couldCarryPregnancy(anchor.sexAssignedAtBirth) &&
      cannotCarryReason(anchor.id, anchor.sexAssignedAtBirth, [
        {
          value: 'surrogate',
          label: intl.formatMessage(CHILD_KIND_LABELS.surrogate),
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
          label: intl.formatMessage(messages.biologicalParentBoth, {
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
        label={intl.formatMessage(messages.otherParentLabel)}
        options={[
          ...choices.map((id) => ({ value: id, label: displayName(id) })),
          {
            value: UNKNOWN,
            label: intl.formatMessage(messages.otherParentUnknown),
          },
          { value: NONE, label: intl.formatMessage(messages.otherParentNone) },
        ]}
        required
        initialValue={otherParentDefault.initial}
        {...otherParentDefault.answering}
      />
      <Field
        component={RadioGroupField}
        name={ROLE.childKind}
        label={intl.formatMessage(messages.childKindLabel)}
        options={CHILD_KINDS.map((value) => ({
          value,
          label: intl.formatMessage(CHILD_KIND_LABELS[value]),
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
          label={intl.formatMessage(messages.biologicalParentLabel)}
          hint={[
            intl.formatMessage(messages.biologicalParentHint),
            joinReasons(reasonContext, bothReasons),
          ]
            .filter((sentence) => sentence !== undefined)
            .join(' ')}
          options={[
            {
              value: 'both',
              label: intl.formatMessage(messages.biologicalParentBoth, {
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
          initialValue="both"
        />
      )}
      {raisedWithOtherParent && (
        <Field
          component={BooleanField}
          name={aboutPerson(ROLE.otherParentBiological, raisedWithOtherParent)}
          label={intl.formatMessage(messages.otherParentBiologicalLabel, {
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
          label={intl.formatMessage(messages.carrierLabel)}
          options={[
            ...carriers.map((id) => ({
              value: id,
              label:
                id === UNKNOWN
                  ? intl.formatMessage(messages.otherParentUnknown)
                  : displayName(id),
            })),
            {
              value: NONE,
              label: intl.formatMessage(messages.carrierUnknown),
            },
          ]}
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
  const intl = useAppIntl();
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
    siblingParentLabel(intl, family, anchor, id, displayName, framing);

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
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const biologicalImpossible =
    asString(values[ROLE.siblingKind]) === 'biological' &&
    biologicalUnavailable;
  useEffect(() => {
    if (biologicalImpossible) setFieldValue(ROLE.siblingKind, undefined);
  }, [biologicalImpossible, setFieldValue]);

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
  const carrier = asString(values[ROLE.carrier]);
  const carrierImpossible =
    carrier !== undefined && carrier !== NONE && !carriers.includes(carrier);
  useEffect(() => {
    if (carrierImpossible) setFieldValue(ROLE.carrier, undefined);
  }, [carrierImpossible, setFieldValue]);
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
  const secondAnswer = asString(values[ROLE.siblingOtherBiologicalParent]);
  const firstStale = firstAnswer !== undefined && firstNamed === undefined;
  const secondStale =
    secondAnswer !== undefined &&
    (!second.asked || !second.candidates.includes(secondAnswer));
  useEffect(() => {
    if (firstStale) setFieldValue(ROLE.siblingBiologicalParent, undefined);
  }, [firstStale, setFieldValue]);
  useEffect(() => {
    if (secondStale) {
      setFieldValue(ROLE.siblingOtherBiologicalParent, undefined);
    }
  }, [secondStale, setFieldValue]);

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
    : intl.formatMessage(messages.unavailableIdenticalTwinNew, {
        ...args,
        answer: intl.formatMessage(messages.listedName, {
          name: intl.formatMessage(messages.siblingTwinIdentical),
        }),
      });
  const identicalImpossible =
    asString(values[ROLE.twin]) === 'identical' && !identicalPossible;
  useEffect(() => {
    if (identicalImpossible) setFieldValue(ROLE.twin, undefined);
  }, [identicalImpossible, setFieldValue]);

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
        label={intl.formatMessage(messages.sharedDonorsLabel, {
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
          label={intl.formatMessage(messages.sharedParentCountLabel, args)}
          hint={intl.formatMessage(messages.placeholderParentsNote, {
            framing,
            shared: asString(values[ROLE.sharedParentCount]) ?? 'both',
          })}
          options={[
            {
              value: 'both',
              label: intl.formatMessage(messages.sharedParentCountBoth),
            },
            {
              value: 'eggParent',
              label: intl.formatMessage(messages.sharedParentEggOnly, {
                framing,
              }),
            },
            {
              value: 'spermParent',
              label: intl.formatMessage(messages.sharedParentSpermOnly, {
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
            label={intl.formatMessage(messages.sharedSurrogateLabel, args)}
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
        label={intl.formatMessage(messages.sharedParentCountLabel, args)}
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
        label={intl.formatMessage(messages.siblingKindLabel)}
        hint={intl.formatMessage(messages.siblingKindHint, args)}
        options={SIBLING_KINDS.map((value) => ({
          value,
          label: intl.formatMessage(CHILD_KIND_LABELS[value]),
          disabled: value === 'biological' && biologicalUnavailable,
        }))}
        required
        initialValue="biological"
      />
      {first.asked && (
        <Field
          component={RadioGroupField}
          name={ROLE.siblingBiologicalParent}
          label={intl.formatMessage(messages.siblingBiologicalParentLabel)}
          options={first.candidates.map((id) => ({
            value: id,
            label: parentLabel(id),
          }))}
          required
        />
      )}
      {second.asked && (
        <Field
          component={RadioGroupField}
          name={ROLE.siblingOtherBiologicalParent}
          label={intl.formatMessage(messages.siblingOtherBiologicalParentLabel)}
          options={second.candidates.map((id) => ({
            value: id,
            label: parentLabel(id),
          }))}
          required
        />
      )}
      {carriers.length > 0 && (
        <Field
          component={RadioGroupField}
          name={ROLE.carrier}
          label={intl.formatMessage(messages.carrierLabel)}
          options={[
            ...carriers.map((id) => ({ value: id, label: parentLabel(id) })),
            {
              value: NONE,
              label: intl.formatMessage(messages.carrierUnknown),
            },
          ]}
        />
      )}
      <Field
        component={RadioGroupField}
        name={ROLE.twin}
        label={intl.formatMessage(messages.siblingTwinLabel, args)}
        hint={[intl.formatMessage(messages.siblingTwinHint), identicalHint]
          .filter((sentence) => sentence !== undefined)
          .join(' ')}
        options={[
          { value: NONE, label: intl.formatMessage(messages.siblingTwinNo) },
          {
            value: 'identical',
            label: intl.formatMessage(messages.siblingTwinIdentical),
            disabled: !identicalPossible,
            description: identicalHint,
          },
          {
            value: 'fraternal',
            label: intl.formatMessage(messages.siblingTwinFraternal),
          },
          {
            value: 'unknown',
            label: intl.formatMessage(messages.siblingTwinUnknown),
          },
        ]}
        initialValue={NONE}
      />
    </>
  );
}
