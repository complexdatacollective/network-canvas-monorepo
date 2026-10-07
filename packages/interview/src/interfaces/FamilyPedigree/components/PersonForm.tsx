'use client';

import { useEffect, useMemo, useRef } from 'react';

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

import { formValuesToAttributePatch } from '../../../forms/formValuesToAttributePatch';
import useProtocolForm from '../../../forms/useProtocolForm';
import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  getValidationContext,
  selectValidationMetadataForVariable,
  validationPropsFor,
} from '../../../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../../../selectors/protocol';
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
  holdsGeneratedLabel,
  isGeneticKind,
  otherGameteSex,
  sexesRuledOut,
  partnersOf,
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
  | { kind: 'add'; relation: Relation; anchor: Person }
  | { kind: 'edit'; person: Person; missing: MissingDetail[] };

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

export type GenderIdentityOption = { value: string | number; label: string };

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
      const value = person.attributes[field.variable];
      if (value !== null && value !== undefined) {
        values[field.variable] = value;
      }
    }
    return values;
  }, [person, formFields]);

  const { fieldComponents, coerceValues } = useProtocolForm({
    fields: formFields,
    subject: { entity: 'node', type: config.personType },
    initialValues: initialResearcherValues,
    currentEntityId: person?.id,
  });

  const handleSubmit: FormSubmitHandler = (values) => {
    const set: PersonDetails = readOwnDetails(values, config);
    // A name the form does not ask is left as it is.
    const unset = [
      ...(asksName ? [config.nameAttribute] : []),
      ...(config.genderIdentity ? [config.genderIdentity.attribute] : []),
      config.sexAssignedAtBirthAttribute,
    ].filter((variable) => !(variable in set));

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
      set[notRecordedAttribute] = recorded;
    }

    if (formFields.length > 0) {
      const patch = formValuesToAttributePatch(
        coerceValues(values),
        formFields.map((field) => field.variable),
      );
      if (patch.success) {
        Object.assign(set, patch.patch.set);
        unset.push(...patch.patch.unset);
      }
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

  const missingLabels =
    mode.kind === 'edit'
      ? mode.missing.map((detail) =>
          typeof detail === 'string'
            ? intl.formatMessage(BUILT_IN_DETAIL_LABELS[detail])
            : (formFields.find((field) => field.variable === detail.variable)
                ?.prompt ?? detail.variable),
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
            <AppMessage message={messages.aboutThisPerson} />
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
              <AppMessage message={messages.moreAboutThisPerson} />
            </Heading>
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
  const name = asString(values[config.nameAttribute])?.trim();
  if (name) details[config.nameAttribute] = name;
  if (config.genderIdentity) {
    const gender = asOption(values[config.genderIdentity.attribute]);
    if (gender !== undefined && gender !== '') {
      details[config.genderIdentity.attribute] = [gender];
    }
  }
  const sex = asString(values[config.sexAssignedAtBirthAttribute]);
  if (sex) details[config.sexAssignedAtBirthAttribute] = [sex];
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
      return {
        relation,
        sharedParentIds: shared.filter((id) => id !== UNKNOWN),
        sharesUnshown:
          placeholders === 'eggParent' || placeholders === 'spermParent'
            ? placeholders
            : placeholders === 'both'
              ? 'both'
              : shared.includes(UNKNOWN)
                ? 'other'
                : 'none',
        parentKind:
          (asString(values[ROLE.siblingKind]) as
            | (typeof CHILD_KINDS)[number]
            | undefined) ?? 'biological',
      };
    }
  }
}

function RelationshipFields({
  relation,
  anchor,
  family,
  displayName,
  config,
  framing,
}: {
  relation: Relation;
  anchor: Person;
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
          family={family}
          displayName={displayName}
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
  const anchorHasCarrier = family.links.some(
    (link) =>
      link.kind !== 'partner' &&
      link.target === anchor.id &&
      link.isGestationalCarrier,
  );
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
      : parentKind !== 'surrogate' ||
        !family.links.some(
          (link) =>
            link.kind !== 'partner' &&
            link.target === siblingId &&
            link.isGestationalCarrier,
        );
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
      {parentKind === 'biological' && canCarry && (
        <Field
          component={BooleanField}
          name={ROLE.carriedPregnancy}
          label={intl.formatMessage(messages.carriedPregnancyLabel)}
        />
      )}
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
          initialValue={
            existingParents.length === 1 ? existingParents[0] : NONE
          }
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
          initialValue={siblings.filter((id) => fullSiblings.has(id))}
        />
      )}
    </>
  );
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
  family,
  displayName,
  framing,
}: {
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
  framing: FramingId;
}) {
  const intl = useAppIntl();
  const values = useFormValue([ROLE.sharedParents, ROLE.siblingKind]);
  const parents = primaryParentsOf(family, anchor.id);
  const args = {
    isYou: anchor.isEgo ? 'true' : 'false',
    name: displayName(anchor.id),
  };

  // The sibling can be the biological child of the parents they share only
  // when those parents could have given one egg and one sperm. Someone with
  // no parents is given an egg parent and a sperm parent, who always could;
  // a second parent not yet shown gave the other gamete when the known one
  // gave one.
  const sexOf = (id: string) => family.byId.get(id)?.sexAssignedAtBirth;
  const knownLink = family.links.find(
    (link) =>
      link.target === anchor.id &&
      link.kind !== 'partner' &&
      link.source === parents[0],
  );
  const shared = asStringArray(values[ROLE.sharedParents]);
  const biologicalPossible =
    parents.length === 0 ||
    geneticParentsPossible(
      shared.map((id) =>
        id !== UNKNOWN
          ? sexOf(id)
          : knownLink && isGeneticKind(knownLink.kind)
            ? otherGameteSex(sexOf(knownLink.source))
            : undefined,
      ),
    );
  // Choosing parents can make a biological child impossible; the question
  // is then asked again.
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const biologicalImpossible =
    asString(values[ROLE.siblingKind]) === 'biological' && !biologicalPossible;
  useEffect(() => {
    if (biologicalImpossible) setFieldValue(ROLE.siblingKind, undefined);
  }, [biologicalImpossible, setFieldValue]);

  // Someone with no parents is given an egg parent and a sperm parent,
  // unnamed; the sibling may share both or one of them. A parent not yet
  // shown can be shared too, and is added for both.
  const sharedField =
    parents.length === 0 ? (
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
    </>
  );
}
