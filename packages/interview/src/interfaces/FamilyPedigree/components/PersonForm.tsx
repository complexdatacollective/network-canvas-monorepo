'use client';

import { useMemo } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import Heading from '@codaco/fresco-ui/typography/Heading';
import {
  PEDIGREE_GENDER_IDENTITIES,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
  type FormField,
  type PedigreeParentKind,
  type PedigreeRelationshipKind,
} from '@codaco/protocol-validation';

import { formValuesToAttributePatch } from '../../../forms/formValuesToAttributePatch';
import useProtocolForm from '../../../forms/useProtocolForm';
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
  fullSiblingsOf,
  partnersOf,
  primaryParentsOf,
  siblingsOf,
} from '../model';
import {
  BUILT_IN_DETAIL_LABELS,
  CHILD_KIND_LABELS,
  GENDER_IDENTITY_LABELS,
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
  otherParent: 'pedigreeOtherParent',
  childKind: 'pedigreeChildKind',
  carrier: 'pedigreeCarrier',
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

type PersonFormProps = {
  formId: string;
  mode: PersonFormMode;
  family: Family;
  config: PedigreeConfig;
  formFields: FormField[];
  displayName: (personId: string) => string;
  onSubmit: (result: PersonFormResult) => void;
};

const asString = (value: FieldValue | undefined) =>
  typeof value === 'string' ? value : undefined;
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
  formFields,
  displayName,
  onSubmit,
}: PersonFormProps) {
  const intl = useAppIntl();
  const person = mode.kind === 'edit' ? mode.person : undefined;
  const isEgo = person?.isEgo ?? false;

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
    // A participant may not know everything about a relative: a required
    // answer left empty is flagged on the family tree instead of blocking.
    deferRequired: true,
  });

  const handleSubmit: FormSubmitHandler = (values) => {
    const set: PersonDetails = {};
    const unset: string[] = [];

    const name = asString(values[config.nameVariable])?.trim();
    if (name) set[config.nameVariable] = name;
    else unset.push(config.nameVariable);

    const gender = asString(values[config.genderIdentityVariable]);
    if (gender) set[config.genderIdentityVariable] = [gender];
    else unset.push(config.genderIdentityVariable);

    const sex = asString(values[config.sexAssignedAtBirthVariable]);
    if (sex) set[config.sexAssignedAtBirthVariable] = [sex];
    else unset.push(config.sexAssignedAtBirthVariable);

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

  const genderOptions = PEDIGREE_GENDER_IDENTITIES.map((value) => ({
    value,
    label: intl.formatMessage(GENDER_IDENTITY_LABELS[value]),
  }));
  const sexOptions = PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
    value,
    label: intl.formatMessage(SEX_ASSIGNED_AT_BIRTH_LABELS[value]),
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
          <Field
            component={InputField}
            name={config.nameVariable}
            nameMode="opaque"
            label={intl.formatMessage(
              isEgo ? messages.yourNameLabel : messages.nameLabel,
            )}
            hint={isEgo ? undefined : intl.formatMessage(messages.nameHint)}
            initialValue={person?.name}
            autoComplete="off"
          />
          <Field
            component={RadioGroupField}
            name={config.genderIdentityVariable}
            nameMode="opaque"
            label={intl.formatMessage(messages.genderIdentityLabel)}
            options={genderOptions}
            initialValue={person?.genderIdentity}
          />
          <Field
            component={RadioGroupField}
            name={config.sexAssignedAtBirthVariable}
            nameMode="opaque"
            label={intl.formatMessage(messages.sexAssignedAtBirthLabel)}
            options={sexOptions}
            initialValue={person?.sexAssignedAtBirth}
          />
        </section>
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
            />
          </section>
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
  personIsYou,
  parentIsYou,
  parentName,
}: {
  link: FamilyLink;
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
        }))}
        initialValue={link.kind}
      />
      {kind === 'biological' && (
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

function readRequest(
  relation: Relation,
  values: Record<string, FieldValue>,
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
      const carrier = asString(values[ROLE.carrier]);
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
        carrier:
          carrier === 'anchor' || carrier === 'otherParent' ? carrier : null,
      };
    }
    case 'sibling': {
      const shared = asStringArray(values[ROLE.sharedParents]);
      return {
        relation,
        sharedParentIds:
          shared.length > 0 ? shared : primaryParentsOf(family, anchor.id),
      };
    }
  }
}

function RelationshipFields({
  relation,
  anchor,
  family,
  displayName,
}: {
  relation: Relation;
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
}) {
  switch (relation) {
    case 'parent':
      return (
        <ParentFields
          anchor={anchor}
          family={family}
          displayName={displayName}
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
}: {
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
}) {
  const intl = useAppIntl();
  const values = useFormValue([ROLE.parentKind, ROLE.partnerId]);
  const parentKind = asString(values[ROLE.parentKind]) ?? 'biological';
  const raises =
    parentKind === 'biological' ||
    parentKind === 'adoptive' ||
    parentKind === 'social';

  const existingParents = primaryParentsOf(family, anchor.id);
  const siblings = siblingsOf(family, anchor.id);
  const fullSiblings = new Set(fullSiblingsOf(family, anchor.id));
  const partnerChoice = asString(values[ROLE.partnerId]);

  return (
    <>
      <Field
        component={RadioGroupField}
        name={ROLE.parentKind}
        label={intl.formatMessage(messages.parentKindLabel)}
        options={PARENT_KINDS.map((value) => ({
          value,
          label: intl.formatMessage(PARENT_KIND_LABELS[value]),
        }))}
        initialValue="biological"
      />
      {parentKind === 'biological' && (
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
  const values = useFormValue([ROLE.childKind, ROLE.otherParent]);
  const partners = partnersOf(family, anchor.id);
  const childKind = asString(values[ROLE.childKind]) ?? 'biological';
  const otherParent = asString(values[ROLE.otherParent]);
  const hasOtherParent = otherParent !== undefined && otherParent !== NONE;

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
        initialValue="biological"
      />
      {childKind === 'biological' && (
        <Field
          component={RadioGroupField}
          name={ROLE.carrier}
          label={intl.formatMessage(messages.carrierLabel)}
          options={[
            { value: 'anchor', label: displayName(anchor.id) },
            ...(hasOtherParent
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
            { value: NONE, label: intl.formatMessage(messages.carrierUnknown) },
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
}: {
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
}) {
  const intl = useAppIntl();
  const parents = primaryParentsOf(family, anchor.id);

  if (parents.length === 0) {
    return (
      <p className="text-text/80">
        <AppMessage message={messages.placeholderParentsNote} />
      </p>
    );
  }

  return (
    <Field
      component={CheckboxGroupField}
      name={ROLE.sharedParents}
      label={intl.formatMessage(messages.sharedParentsLabel)}
      options={parents.map((id) => ({ value: id, label: displayName(id) }))}
      initialValue={parents}
    />
  );
}
