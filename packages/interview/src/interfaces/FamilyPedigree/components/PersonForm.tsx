'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
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
  /** Relationships to take away (edit only). */
  linkRemovals?: string[];
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
  otherParent: 'pedigreeOtherParent',
  childKind: 'pedigreeChildKind',
  carrier: 'pedigreeCarrier',
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

type PersonFormProps = {
  formId: string;
  mode: PersonFormMode;
  family: Family;
  config: PedigreeConfig;
  formFields: FormField[];
  displayName: (personId: string) => string;
  /** Edit only: ask whether the person has siblings, and children. */
  askAbout?: { siblings: boolean; children: boolean };
  /** Add only: called with the person being added whenever the answers
   * that decide how they are drawn change. */
  onDraftChange?: (draft: PersonDraft) => void;
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
  askAbout,
  onDraftChange,
  onSubmit,
}: PersonFormProps) {
  const intl = useAppIntl();
  const person = mode.kind === 'edit' ? mode.person : undefined;
  // Relationships marked for removal, taken away on saving.
  const [removedLinks, setRemovedLinks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setLinkRemoved = (linkId: string, removed: boolean) =>
    setRemovedLinks((current) => {
      const next = new Set(current);
      if (removed) next.add(linkId);
      else next.delete(linkId);
      return next;
    });
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
  });

  const handleSubmit: FormSubmitHandler = (values) => {
    const set: PersonDetails = readOwnDetails(values, config);
    const unset = [
      config.nameVariable,
      config.genderIdentityVariable,
      config.sexAssignedAtBirthVariable,
    ].filter((variable) => !(variable in set));

    // "No" and "Don't know" are recorded; "Yes" leaves the question to the
    // siblings or children the participant goes on to add.
    const notRecordedVariable = config.relativesNotRecordedVariable;
    if (
      person &&
      notRecordedVariable &&
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
      set[notRecordedVariable] = recorded;
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
          ? readLinkUpdates(
              existingLinksOf(family, mode.person.id),
              values,
            ).filter((update) => !removedLinks.has(update.linkId))
          : undefined,
      linkRemovals: mode.kind === 'edit' ? [...removedLinks] : undefined,
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
            required
            initialValue={person?.genderIdentity}
          />
          <Field
            component={RadioGroupField}
            name={config.sexAssignedAtBirthVariable}
            nameMode="opaque"
            label={intl.formatMessage(messages.sexAssignedAtBirthLabel)}
            options={sexOptions}
            required
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
            removedLinks={removedLinks}
            onLinkRemovedChange={setLinkRemoved}
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
  askAbout: { siblings: boolean; children: boolean };
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
          initialValue={initial(RELATIVES_NOT_RECORDED.siblings)}
        />
      )}
      {askAbout.children && (
        <Field
          component={RadioGroupField}
          name={ROLE.hasChildren}
          label={intl.formatMessage(messages.hasChildrenQuestion, args)}
          options={options}
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
  removedLinks,
  onLinkRemovedChange,
}: {
  person: Person;
  family: Family;
  displayName: (personId: string) => string;
  removedLinks: ReadonlySet<string>;
  onLinkRemovedChange: (linkId: string, removed: boolean) => void;
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
  const carries = (link: FamilyLink) => {
    const kind = asString(linkValues[linkField(link, 'kind')]) ?? link.kind;
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
          <RemovableRelationship
            key={link.id}
            otherIsYou={isYou(partnerId)}
            otherName={displayName(partnerId)}
            removed={removedLinks.has(link.id)}
            onRemovedChange={(removed) => onLinkRemovedChange(link.id, removed)}
          >
            <Field
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
          </RemovableRelationship>
        );
      })}
      {parents.map((link) => (
        <RemovableRelationship
          key={link.id}
          otherIsYou={isYou(link.source)}
          otherName={displayName(link.source)}
          removed={removedLinks.has(link.id)}
          onRemovedChange={(removed) => onLinkRemovedChange(link.id, removed)}
        >
          <ParentLinkFields
            link={link}
            canCarry={canCarry(link)}
            carries={carries(link)}
            anotherCarries={parents.some(
              (other) => other.id !== link.id && carries(other),
            )}
            personIsYou={isYou(person.id)}
            parentIsYou={isYou(link.source)}
            parentName={displayName(link.source)}
          />
        </RemovableRelationship>
      ))}
    </section>
  );
}

/**
 * One of the person's relationships, with a button to take it away on saving.
 * Marked for removal, its questions give way to a note and a button to keep
 * it; focus follows to whichever button replaces the one pressed.
 */
function RemovableRelationship({
  otherIsYou,
  otherName,
  removed,
  onRemovedChange,
  children,
}: {
  otherIsYou: string;
  otherName: string;
  removed: boolean;
  onRemovedChange: (removed: boolean) => void;
  children: React.ReactNode;
}) {
  const intl = useAppIntl();
  const removeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const wasRemoved = useRef(removed);
  useEffect(() => {
    if (wasRemoved.current !== removed) {
      (removed ? keepRef : removeRef).current?.focus();
    }
    wasRemoved.current = removed;
  }, [removed]);
  const args = { otherIsYou, name: otherName };

  if (removed) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p>{intl.formatMessage(messages.relationshipWillBeRemoved, args)}</p>
        <Button
          ref={keepRef}
          type="button"
          variant="link"
          onClick={() => onRemovedChange(false)}
        >
          <AppMessage message={messages.undoRemoveRelationship} />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {children}
      <Button
        ref={removeRef}
        type="button"
        variant="link"
        className="mb-6 self-start [--link:var(--destructive)]"
        onClick={() => onRemovedChange(true)}
      >
        {intl.formatMessage(messages.removeRelationship, args)}
      </Button>
    </div>
  );
}

function ParentLinkFields({
  link,
  canCarry,
  carries,
  anotherCarries,
  personIsYou,
  parentIsYou,
  parentName,
}: {
  link: FamilyLink;
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
          disabled: value === 'surrogate' && (anotherCarries || !canCarry),
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

/** The interface's own details about the person: name, gender identity and
 * sex assigned at birth, where given. */
function readOwnDetails(
  values: Record<string, FieldValue | undefined>,
  config: PedigreeConfig,
): PersonDetails {
  const details: PersonDetails = {};
  const name = asString(values[config.nameVariable])?.trim();
  if (name) details[config.nameVariable] = name;
  const gender = asString(values[config.genderIdentityVariable]);
  if (gender) details[config.genderIdentityVariable] = [gender];
  const sex = asString(values[config.sexAssignedAtBirthVariable]);
  if (sex) details[config.sexAssignedAtBirthVariable] = [sex];
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
    config.nameVariable,
    config.genderIdentityVariable,
    config.sexAssignedAtBirthVariable,
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
      const carrier =
        (answer === 'anchor' || answer === 'otherParent') && carrierCould
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
        carrier,
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
  config,
}: {
  relation: Relation;
  anchor: Person;
  family: Family;
  displayName: (personId: string) => string;
  config: PedigreeConfig;
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
  const values = useFormValue([ROLE.parentKind, ROLE.partnerId]);
  const sexAssignedAtBirth = asString(
    useFormValue([config.sexAssignedAtBirthVariable], 'opaque')[
      config.sexAssignedAtBirthVariable
    ],
  );
  const parentKind = asString(values[ROLE.parentKind]) ?? 'biological';
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
          disabled: value === 'surrogate' && !canCarry,
        }))}
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
  // Neither parent is offered as having carried the pregnancy if recorded as
  // male at birth; an unknown other parent might have.
  const anchorCanCarry = couldCarryPregnancy(anchor.sexAssignedAtBirth);
  const otherParentCanCarry =
    hasOtherParent &&
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
        initialValue="biological"
      />
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
