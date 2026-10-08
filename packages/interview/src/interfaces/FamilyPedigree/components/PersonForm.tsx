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
import { RELATIVES_NOT_RECORDED } from '../completeness';
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
  couldCarryPregnancy,
  fullSiblingsOf,
  geneticParentSexes,
  geneticParentsPossible,
  hasCarrier,
  holdsGeneratedLabel,
  isGeneticKind,
  openGeneticParentSlots,
  sexesRuledOut,
  partnersOf,
  planAdditionUnder,
  possibleCarriers,
  primaryParentsOf,
  siblingsOf,
} from '../model';
import {
  BUILT_IN_DETAIL_LABELS,
  CHILD_KIND_LABELS,
  PARENT_KIND_LABELS,
  SEX_ASSIGNED_AT_BIRTH_LABELS,
} from '../options';

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
};

/** The person being added, as the form stands: shown in the family before
 * the participant confirms them. */
export type PersonDraft = {
  details: PersonDetails;
  request: AddRelativeRequest;
};

export type LinkUpdate = {
  linkId: string;
  kind: PedigreeRelationshipKind;
  isGestationalCarrier: boolean;
  isCurrentPartner: boolean;
};

// Names of the relationship questions. They are not attributes: the answers
// decide which links are created.
const ROLE = {
  parentKind: 'pedigreeParentKind',
  carriedPregnancy: 'pedigreeCarriedPregnancy',
  partnerId: 'pedigreePartnerId',
  partnershipCurrent: 'pedigreePartnershipCurrent',
  alsoParentOf: 'pedigreeAlsoParentOf',
  sharedParents: 'pedigreeSharedParents',
  sharedParentCount: 'pedigreeSharedParentCount',
  siblingKind: 'pedigreeSiblingKind',
  otherParent: 'pedigreeOtherParent',
  childKind: 'pedigreeChildKind',
  carrier: 'pedigreeCarrier',
  biologicalParent: 'pedigreeBiologicalParent',
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
const CHILD_KINDS = ['biological', 'adoptive', 'social'] as const;

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
  formFields: FormField[];
  /** The stage's record of who holds a label it saved as their name, by
   * person id. Labels are given afresh, so a typed name may repeat one. */
  generatedLabels: Readonly<Record<string, string>>;
  /** Each encrypted name the stage has decrypted, by person id. */
  decryptedNames: ReadonlyMap<string, string>;
  displayName: (personId: string) => string;
  /** Edit only: ask whether the person has siblings, and children. */
  askAbout?: { siblings: boolean; children: boolean; required: boolean };
  /** Add only: called with the person being added whenever the answers
   * that decide how they are drawn change. */
  onDraftChange?: (draft: PersonDraft) => void;
  onSubmit: (result: PersonFormResult) => void;
};

const asString = (value: FieldValue | undefined) =>
  typeof value === 'string' ? value : undefined;
const asOption = (value: FieldValue | undefined) =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;
const asStringArray = (value: FieldValue | undefined) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

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

    onSubmit({
      set,
      unset,
      request:
        mode.kind === 'add'
          ? readRequest(mode.relation, values, mode.anchor, family)
          : undefined,
      linkUpdates:
        mode.kind === 'edit'
          ? readLinkUpdates(existingLinksOf(family, mode.person.id), values)
          : undefined,
    });
    return { success: true };
  };

  // A person recorded as a parent cannot be given a sex at birth that
  // contradicts it; the hint says how to choose one anyway.
  const ruledOut = person ? sexesRuledOut(family, person.id) : new Set();
  const sexOptions = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
    value,
    label: intl.formatMessage(SEX_ASSIGNED_AT_BIRTH_LABELS[value]),
    disabled: ruledOut.has(value),
  }));

  // A researcher's question, in the interview's language, names the detail
  // still missing; the attribute's own name stands in without one.
  const fieldPromptText = (variable: string) => {
    const prompt = formFields.find(
      (field) => field.variable === variable,
    )?.prompt;
    return prompt === undefined ? variable : resolve(prompt).text;
  };

  const missingLabels =
    mode.kind === 'edit'
      ? mode.missing.map((detail) =>
          typeof detail === 'string'
            ? intl.formatMessage(BUILT_IN_DETAIL_LABELS[detail])
            : fieldPromptText(detail.variable),
        )
      : [];

  return (
    <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
      <div className="flex flex-col gap-8">
        {missingLabels.length > 0 && (
          <Alert variant="warning">
            <AppMessage
              message={messages.missingDetailsList}
              values={{
                details: intl.formatList(missingLabels, {
                  type: 'conjunction',
                }),
              }}
            />
          </Alert>
        )}
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
            hint={
              ruledOut.size > 0
                ? intl.formatMessage(messages.sexRuledOutHint, {
                    isYou: isEgo ? 'true' : 'false',
                  })
                : undefined
            }
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
  askAbout: { siblings: boolean; children: boolean; required: boolean };
  displayName: (personId: string) => string;
}) {
  const intl = useAppIntl();
  const args = {
    isYou: person.isEgo ? 'true' : 'false',
    name: displayName(person.id),
  };
  const options = [
    { value: 'yes', label: intl.formatMessage(messages.hasRelativesYes) },
    { value: 'no', label: intl.formatMessage(messages.no) },
    { value: 'unknown', label: intl.formatMessage(messages.dontKnow) },
  ];
  const initial = (
    group: (typeof RELATIVES_NOT_RECORDED)[keyof typeof RELATIVES_NOT_RECORDED],
  ) => {
    if (person.relativesNotRecorded.includes(group.none)) return 'no';
    if (person.relativesNotRecorded.includes(group.unknown)) return 'unknown';
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
          initialValue={initial(RELATIVES_NOT_RECORDED.siblings)}
        />
      )}
      {askAbout.children && (
        <Field
          component={RadioGroupField}
          name={ROLE.hasChildren}
          label={intl.formatMessage(messages.hasChildrenQuestion, args)}
          options={options}
          required={askAbout.required}
          initialValue={initial(RELATIVES_NOT_RECORDED.children)}
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

function readLinkUpdates(
  links: ReturnType<typeof existingLinksOf>,
  values: Record<string, FieldValue>,
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
    const kind =
      (asString(values[linkField(link, 'kind')]) as
        | PedigreeParentKind
        | undefined) ?? link.kind;
    const isGestationalCarrier =
      kind === 'surrogate' ||
      (kind === 'biological' && values[linkField(link, 'carrier')] === true);
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

function ExistingRelationshipFields({
  person,
  family,
  displayName,
}: {
  person: Person;
  family: Family;
  displayName: (personId: string) => string;
}) {
  const intl = useAppIntl();
  const { partnerships, parents } = existingLinksOf(family, person.id);
  // Who carried the pregnancy, as the answers stand: one parent at most, so
  // while one does, the others are not asked and cannot be a surrogate.
  const linkValues = useFormValue(
    parents.flatMap((link) => [
      linkField(link, 'kind'),
      linkField(link, 'carrier'),
    ]),
    'opaque',
  );
  const canCarry = (link: FamilyLink) =>
    couldCarryPregnancy(family.byId.get(link.source)?.sexAssignedAtBirth);
  const kindOf = (link: FamilyLink) =>
    asString(linkValues[linkField(link, 'kind')]) ?? link.kind;
  // Whether the parent could be a genetic parent alongside the others who
  // are, as the answers stand.
  const canBeGenetic = (link: FamilyLink) =>
    geneticParentsPossible(
      parents
        .filter((other) => other.id !== link.id && isGeneticKind(kindOf(other)))
        .map((other) => family.byId.get(other.source)?.sexAssignedAtBirth)
        .concat(family.byId.get(link.source)?.sexAssignedAtBirth),
    );
  const carries = (link: FamilyLink) => {
    const kind = kindOf(link);
    if (kind === 'surrogate') return true;
    if (kind !== 'biological' || !canCarry(link)) return false;
    const carrier = linkValues[linkField(link, 'carrier')];
    return carrier === undefined ? link.isGestationalCarrier : carrier === true;
  };
  if (partnerships.length === 0 && parents.length === 0) return null;

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
      {parents.map((link) => (
        <ParentLinkFields
          key={link.id}
          link={link}
          canBeGenetic={canBeGenetic(link)}
          canCarry={canCarry(link)}
          carries={carries(link)}
          anotherCarries={parents.some(
            (other) => other.id !== link.id && carries(other),
          )}
          personIsYou={isYou(person.id)}
          parentIsYou={isYou(link.source)}
          parentName={displayName(link.source)}
        />
      ))}
    </section>
  );
}

function ParentLinkFields({
  link,
  canBeGenetic,
  canCarry,
  carries,
  anotherCarries,
  personIsYou,
  parentIsYou,
  parentName,
}: {
  link: FamilyLink;
  /** This parent could be a genetic parent alongside the person's others. */
  canBeGenetic: boolean;
  /** This parent could have carried a pregnancy: they are not recorded as
   * male at birth. */
  canCarry: boolean;
  /** This parent carried the pregnancy, as the answers stand. */
  carries: boolean;
  /** Another of the person's parents did. */
  anotherCarries: boolean;
  personIsYou: string;
  parentIsYou: string;
  parentName: string;
}) {
  const intl = useAppIntl();
  const kindField = linkField(link, 'kind');
  const values = useFormValue([kindField], 'opaque');
  const kind = asString(values[kindField]) ?? link.kind;

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
          label: intl.formatMessage(PARENT_KIND_LABELS[value]),
          disabled:
            (isGeneticKind(value) && !canBeGenetic) ||
            (value === 'surrogate' && (anotherCarries || !canCarry)),
        }))}
        initialValue={link.kind}
      />
      {kind === 'biological' && canCarry && (carries || !anotherCarries) && (
        <Field
          component={BooleanField}
          name={linkField(link, 'carrier')}
          nameMode="opaque"
          label={intl.formatMessage(messages.parentCarriedLabel, {
            parentIsYou,
            parent: parentName,
          })}
          initialValue={link.isGestationalCarrier}
        />
      )}
    </>
  );
}

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
  const values = useFormValue([
    config.nameAttribute,
    ...(config.genderIdentity ? [config.genderIdentity.attribute] : []),
    config.sexAssignedAtBirthAttribute,
    ...Object.values(ROLE),
  ]);
  const report = useRef(onDraftChange);
  report.current = onDraftChange;
  useEffect(() => {
    report.current({
      details: readOwnDetails(values, config),
      request: readRequest(relation, values, anchor, family),
    });
  }, [values, config, relation, anchor, family]);
  return null;
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
      return {
        relation,
        parentKind:
          (asString(values[ROLE.parentKind]) as PedigreeParentKind) ??
          'biological',
        carriedPregnancy: values[ROLE.carriedPregnancy] === true,
        partnerId: partnerId && partnerId !== NONE ? partnerId : null,
        partnershipCurrent: values[ROLE.partnershipCurrent] !== false,
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
      // The carrier answer outlives a change of other parent, perhaps to one
      // recorded as male at birth, who could not have carried the pregnancy.
      const answer = asString(values[ROLE.carrier]);
      const carrierId =
        answer === 'anchor'
          ? anchor.id
          : answer === 'otherParent'
            ? otherParent
            : undefined;
      const carrierCould =
        carrierId === UNKNOWN ||
        couldCarryPregnancy(
          carrierId && family.byId.get(carrierId)?.sexAssignedAtBirth,
        );
      const biologicalAnswer = asString(values[ROLE.biologicalParent]);
      const biologicalParent =
        biologicalAnswer === 'anchor' || biologicalAnswer === 'otherParent'
          ? biologicalAnswer
          : 'both';
      // Only a biological parent carried the pregnancy, in this form.
      const carrierBiological =
        biologicalParent === 'both' || biologicalParent === answer;
      const carrier =
        (answer === 'anchor' || answer === 'otherParent') &&
        carrierCould &&
        carrierBiological
          ? answer
          : null;
      return {
        relation,
        otherParent:
          otherParent === UNKNOWN
            ? 'unknown'
            : otherParent && otherParent !== NONE
              ? otherParent
              : null,
        parentKind:
          (asString(values[ROLE.childKind]) as
            | (typeof CHILD_KINDS)[number]
            | undefined) ?? 'biological',
        biologicalParent,
        carrier,
      };
    }
    case 'sibling': {
      const shared = asStringArray(values[ROLE.sharedParents]);
      const placeholders = asString(values[ROLE.sharedParentCount]);
      // The model records the carrier only while the answers still make them
      // one of the sibling's parents who could have carried the pregnancy.
      const carrier = asString(values[ROLE.carrier]);
      return {
        relation,
        sharedParentIds: shared.filter((id) => id !== UNKNOWN),
        sharesUnshown:
          placeholders === 'eggParent' || placeholders === 'spermParent'
            ? placeholders
            : // With no parents to choose from, and no choice of which
              // unnamed parent to share, the sibling shares both.
              placeholders === 'both' || shared.length === 0
              ? 'both'
              : shared.includes(UNKNOWN)
                ? 'other'
                : 'none',
        parentKind:
          (asString(values[ROLE.siblingKind]) as
            | (typeof CHILD_KINDS)[number]
            | undefined) ?? 'biological',
        carrier: carrier && carrier !== NONE ? carrier : null,
      };
    }
  }
}

function RelationshipFields({
  relation,
  anchor,
  ids,
  family,
  displayName,
  config,
  framing,
}: {
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

function PartnershipCurrentField() {
  const intl = useAppIntl();
  return (
    <Field
      component={BooleanField}
      name={ROLE.partnershipCurrent}
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
}: {
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

  const existingParents = primaryParentsOf(family, anchor.id);
  // One person carried the pregnancy at most; once someone has, the new
  // parent cannot have too.
  const anchorHasCarrier = hasCarrier(family, anchor.id);
  // Nor can a parent recorded as male at birth.
  const canCarry = !anchorHasCarrier && couldCarryPregnancy(sexAssignedAtBirth);
  // A genetic parent provided the egg or the sperm, which another genetic
  // parent may already have.
  const canBeGeneticParentOf = (personId: string) =>
    geneticParentsPossible([
      ...geneticParentSexes(family, personId),
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

  // A new biological parent who could have carried a pregnancy is asked
  // whether they did for everyone they are added as a parent of who has
  // nobody recorded as carrying theirs: one question, whose answer is
  // recorded for each of them. It is about the anchor while the anchor has
  // nobody, and otherwise about the siblings chosen who have nobody. While
  // nobody is left to ask about, an answer given is taken back.
  const siblingsWithoutCarrier = keptSiblings.filter(
    (id) => !hasCarrier(family, id),
  );
  const asksCarried =
    parentKind === 'biological' &&
    couldCarryPregnancy(sexAssignedAtBirth) &&
    (!anchorHasCarrier || siblingsWithoutCarrier.length > 0);
  const carriedAnswered = values[ROLE.carriedPregnancy] !== undefined;
  useEffect(() => {
    if (!asksCarried && carriedAnswered) {
      setFieldValue(ROLE.carriedPregnancy, undefined);
    }
  }, [asksCarried, carriedAnswered, setFieldValue]);
  const [onlySibling] = siblingsWithoutCarrier;
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
  // and whose other children are rarely each other's. Each default follows
  // the kind chosen until the participant answers the question themselves.
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
    raises &&
      existingParents.length === 1 &&
      onlyParent !== undefined &&
      belongsWith(onlyParent)
      ? onlyParent
      : NONE,
  );
  const siblingsDefault = useDefaultUntilAnswered(
    ROLE.alsoParentOf,
    values[ROLE.alsoParentOf],
    existingParents.every(belongsWith)
      ? siblings.filter((id) => fullSiblings.has(id) && siblingPossible(id))
      : [],
  );

  return (
    <>
      <Field
        component={RadioGroupField}
        name={ROLE.parentKind}
        label={intl.formatMessage(messages.parentKindLabel)}
        options={PARENT_KINDS.map((value) => ({
          value,
          label: intl.formatMessage(PARENT_KIND_LABELS[value]),
          disabled: !kindPossible(value),
        }))}
        required
        initialValue="biological"
      />
      {!anchorHasCarrier && carriedField}
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
            { value: NONE, label: intl.formatMessage(messages.no) },
          ]}
          initialValue={partnerDefault.initial}
          {...partnerDefault.answering}
        />
      )}
      {raises && partnerChoice !== undefined && partnerChoice !== NONE && (
        <PartnershipCurrentField />
      )}
      {siblings.length > 0 && (
        <Field
          component={CheckboxGroupField}
          name={ROLE.alsoParentOf}
          label={intl.formatMessage(messages.alsoParentOfLabel)}
          options={siblings.map((id) => ({
            value: id,
            label: displayName(id),
            disabled: !siblingPossible(id),
          }))}
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
function useDefaultUntilAnswered<Answer extends string | string[]>(
  name: string,
  answer: FieldValue | undefined,
  defaultAnswer: Answer,
) {
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const key = JSON.stringify(defaultAnswer);
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
}: {
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
}) {
  const intl = useAppIntl();
  const values = useFormValue([
    ROLE.childKind,
    ROLE.otherParent,
    ROLE.biologicalParent,
  ]);
  const partners = partnersOf(family, anchor.id);
  const childKind = asString(values[ROLE.childKind]) ?? 'biological';
  const otherParent = asString(values[ROLE.otherParent]);
  const hasOtherParent = otherParent !== undefined && otherParent !== NONE;
  // With a partner as the other parent of a biological child, either or
  // both of them may be its biological parents. Someone not yet in the
  // family is added as its other biological parent.
  const otherPartner =
    childKind === 'biological' && hasOtherParent && otherParent !== UNKNOWN
      ? otherParent
      : undefined;
  // Both, only when one could have provided the egg and the other the
  // sperm.
  const bothPossible =
    otherPartner === undefined ||
    geneticParentsPossible([
      anchor.sexAssignedAtBirth,
      family.byId.get(otherPartner)?.sexAssignedAtBirth,
    ]);
  const biologicalParent = otherPartner
    ? asString(values[ROLE.biologicalParent])
    : 'both';
  // Choosing another parent can make "both" impossible; the question is
  // then asked again.
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const bothImpossible = biologicalParent === 'both' && !bothPossible;
  useEffect(() => {
    if (bothImpossible) setFieldValue(ROLE.biologicalParent, undefined);
  }, [bothImpossible, setFieldValue]);
  // Only a biological parent is offered as having carried the pregnancy,
  // and not one recorded as male at birth; an unknown other parent might
  // have.
  const isBiological = (parent: 'anchor' | 'otherParent') =>
    biologicalParent === undefined ||
    biologicalParent === 'both' ||
    biologicalParent === parent;
  const anchorCanCarry =
    isBiological('anchor') && couldCarryPregnancy(anchor.sexAssignedAtBirth);
  const otherParentCanCarry =
    hasOtherParent &&
    isBiological('otherParent') &&
    (otherParent === UNKNOWN ||
      couldCarryPregnancy(family.byId.get(otherParent)?.sexAssignedAtBirth));

  return (
    <>
      <Field
        component={RadioGroupField}
        name={ROLE.otherParent}
        label={intl.formatMessage(messages.otherParentLabel)}
        options={[
          ...partners.map((id) => ({ value: id, label: displayName(id) })),
          {
            value: UNKNOWN,
            label: intl.formatMessage(messages.otherParentUnknown),
          },
          { value: NONE, label: intl.formatMessage(messages.otherParentNone) },
        ]}
        initialValue={partners[0] ?? UNKNOWN}
      />
      <Field
        component={RadioGroupField}
        name={ROLE.childKind}
        label={intl.formatMessage(messages.childKindLabel)}
        options={CHILD_KINDS.map((value) => ({
          value,
          label: intl.formatMessage(CHILD_KIND_LABELS[value]),
        }))}
        required
        initialValue="biological"
      />
      {otherPartner && (
        <Field
          component={RadioGroupField}
          name={ROLE.biologicalParent}
          label={intl.formatMessage(messages.biologicalParentLabel)}
          hint={intl.formatMessage(messages.biologicalParentHint)}
          options={[
            {
              value: 'both',
              label: intl.formatMessage(messages.biologicalParentBoth, {
                firstIsYou: anchor.isEgo ? 'true' : 'false',
                first: displayName(anchor.id),
                second: displayName(otherPartner),
              }),
              disabled: !bothPossible,
            },
            { value: 'anchor', label: displayName(anchor.id) },
            { value: 'otherParent', label: displayName(otherPartner) },
          ]}
          required
          initialValue="both"
        />
      )}
      {childKind === 'biological' &&
        (anchorCanCarry || otherParentCanCarry) && (
          <Field
            component={RadioGroupField}
            name={ROLE.carrier}
            label={intl.formatMessage(messages.carrierLabel)}
            options={[
              ...(anchorCanCarry
                ? [{ value: 'anchor', label: displayName(anchor.id) }]
                : []),
              ...(otherParentCanCarry
                ? [
                    {
                      value: 'otherParent',
                      label:
                        otherParent === UNKNOWN
                          ? intl.formatMessage(messages.otherParentUnknown)
                          : displayName(otherParent),
                    },
                  ]
                : []),
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
    ROLE.carrier,
  ]);
  const parents = primaryParentsOf(family, anchor.id);
  const args = {
    isYou: anchor.isEgo ? 'true' : 'false',
    name: displayName(anchor.id),
  };

  // The sibling can be the biological child of the parents they share only
  // when those parents could have given one egg and one sperm. Someone with
  // no parents is given two, who always could; a second parent not yet shown
  // gave the gamete the anchor's genetic parents have not, when that follows
  // (`openGeneticParentSlots`, as the plan adds them).
  const sexOf = (id: string) => family.byId.get(id)?.sexAssignedAtBirth;
  const knownLink = family.links.find(
    (link) =>
      link.target === anchor.id &&
      link.kind !== 'partner' &&
      link.source === parents[0],
  );
  const open = openGeneticParentSlots(family, anchor.id);
  const unshownSex =
    knownLink?.kind !== 'adoptive' && open.length === 1 ? open[0] : undefined;
  const shared = asStringArray(values[ROLE.sharedParents]);
  const biologicalPossible =
    parents.length === 0 ||
    geneticParentsPossible(
      shared.map((id) => (id !== UNKNOWN ? sexOf(id) : unshownSex)),
    );
  // Choosing parents can make a biological child impossible; the question
  // is then asked again.
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const biologicalImpossible =
    asString(values[ROLE.siblingKind]) === 'biological' && !biologicalPossible;
  useEffect(() => {
    if (biologicalImpossible) setFieldValue(ROLE.siblingKind, undefined);
  }, [biologicalImpossible, setFieldValue]);

  // A biological sibling is asked who carried the pregnancy, as a child is:
  // each parent the sibling will have, as the answers stand, who could have
  // carried it — the parents chosen, and any unnamed parent added for both
  // of them — offered by the name they are shown by.
  const carriers =
    asString(values[ROLE.siblingKind]) === 'biological'
      ? possibleCarriers(
          family,
          planAdditionUnder(ids, {
            family,
            anchorId: anchor.id,
            details: {},
            request: readRequest('sibling', values, anchor, family),
            sexAttribute: config.sexAssignedAtBirthAttribute,
          }),
          ids[0] ?? '',
          config.sexAssignedAtBirthAttribute,
        )
      : [];
  // An answer a later one has taken away is asked again.
  const carrier = asString(values[ROLE.carrier]);
  const carrierImpossible =
    carrier !== undefined && carrier !== NONE && !carriers.includes(carrier);
  useEffect(() => {
    if (carrierImpossible) setFieldValue(ROLE.carrier, undefined);
  }, [carrierImpossible, setFieldValue]);
  // An unnamed parent added for both of them is the anchor's second parent,
  // offered in the words the question about shared parents used, or one of
  // the two given to someone with no parents, shown by how they are related.
  const carrierLabel = (id: string) =>
    family.byId.has(id) || parents.length !== 1
      ? displayName(id)
      : intl.formatMessage(messages.sharedParentUnshown, args);

  // Someone with no parents is given an egg parent and a sperm parent,
  // unnamed; the sibling may share both or one of them. Someone whose egg or
  // sperm came from a donor already has that genetic parent, so the parents
  // they are given are not an egg parent and a sperm parent, and the sibling
  // shares both. A parent not yet shown can be shared too, and is added for
  // both.
  const sharedField =
    parents.length === 0 && open.length < 2 ? null : parents.length === 0 ? (
      <Field
        component={RadioGroupField}
        name={ROLE.sharedParentCount}
        label={intl.formatMessage(messages.sharedParentCountLabel, args)}
        hint={intl.formatMessage(messages.placeholderParentsNote, { framing })}
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
    ) : (
      <Field
        component={CheckboxGroupField}
        name={ROLE.sharedParents}
        label={intl.formatMessage(messages.sharedParentCountLabel, args)}
        options={[
          ...parents.map((id) => ({ value: id, label: displayName(id) })),
          ...(parents.length < 2
            ? [
                {
                  value: UNKNOWN,
                  label: intl.formatMessage(messages.sharedParentUnshown, args),
                },
              ]
            : []),
        ]}
        required
        initialValue={parents.length < 2 ? [...parents, UNKNOWN] : parents}
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
        options={CHILD_KINDS.map((value) => ({
          value,
          label: intl.formatMessage(CHILD_KIND_LABELS[value]),
          disabled: value === 'biological' && !biologicalPossible,
        }))}
        required
        initialValue="biological"
      />
      {carriers.length > 0 && (
        <Field
          component={RadioGroupField}
          name={ROLE.carrier}
          label={intl.formatMessage(messages.carrierLabel)}
          options={[
            ...carriers.map((id) => ({ value: id, label: carrierLabel(id) })),
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
