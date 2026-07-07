'use client';

import { useMemo } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import RadioMatrixField from '@codaco/fresco-ui/form/fields/RadioMatrixField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FRAMING_TERMS } from '@codaco/shared-consts';
import { useFramedTerms } from '~/interfaces/FamilyPedigree/hooks/useFramedTerms';

const partnershipOptions = [
  { value: 'current', label: 'Current partner' },
  { value: 'ex', label: 'Ex-partner' },
  { value: 'none', label: "Not a partner or Don't know" },
];

type ParentEntry = {
  id: string;
  name: string | undefined;
  /** Label used in the partnership question when no name was provided. */
  roleLabel: string;
};

const MAX_ADDITIONAL_PARENTS = 20;

const BIO_PARENT_FIELDS = [
  'egg-parent.name',
  'egg-parent.gestationalCarrier',
  'sperm-parent.name',
  'gestational-carrier.name',
  'hasOtherParents',
  'otherParentCount',
  ...Array.from({ length: MAX_ADDITIONAL_PARENTS }, (_, i) => [
    `additional-parent[${String(i)}].name`,
  ]).flat(),
] as const;

function getParentLabel(parent: ParentEntry): string {
  return parent.name ? parent.name : parent.roleLabel;
}

export default function ParentPartnershipsStep() {
  const values = useFormValue(BIO_PARENT_FIELDS);
  const terms = useFramedTerms() ?? FRAMING_TERMS.gamete;

  const parents = useMemo<ParentEntry[]>(() => {
    const list: ParentEntry[] = [
      {
        id: 'egg-parent',
        name: values['egg-parent.name'] as string | undefined,
        roleLabel: terms.yourEggParent,
      },
      {
        id: 'sperm-parent',
        name: values['sperm-parent.name'] as string | undefined,
        roleLabel: terms.yourSpermParent,
      },
    ];

    if (values['egg-parent.gestationalCarrier'] === false) {
      list.push({
        id: 'gestational-carrier',
        name: values['gestational-carrier.name'] as string | undefined,
        roleLabel: 'your gestational carrier',
      });
    }

    if (values.hasOtherParents === true) {
      const count = Number(values.otherParentCount ?? 0);
      for (let i = 0; i < count; i++) {
        list.push({
          id: `additional-parent-${String(i)}`,
          name: values[`additional-parent[${String(i)}].name`] as
            | string
            | undefined,
          // Additional parents always require a name, so this fallback is a
          // safety net rather than something the participant normally sees.
          roleLabel: 'your additional parent',
        });
      }
    }

    return list;
  }, [values, terms]);

  if (parents.length < 2) return null;

  return (
    <>
      <Paragraph>
        We now want to ask about partnerships between the parents you named.
      </Paragraph>
      <Paragraph>
        Partnership means current and past romantic relationships, but{' '}
        <strong>not co-parenting</strong> (where two people raised a child
        together but were never romantically involved).
      </Paragraph>
      <hr />
      <FieldNamespace prefix="partnerships">
        {parents.map((focal, index) => {
          // Each focal parent is asked about every parent listed below it, so
          // each pair is covered exactly once.
          const candidates = parents.slice(index + 1);
          if (candidates.length === 0) return null;

          return (
            <Field
              key={focal.id}
              name={focal.id}
              label={`Please indicate which of these people are partners of **${getParentLabel(focal)}**.`}
              hint="If either person is deceased, please answer based on whether they were partners while both were alive."
              component={RadioMatrixField}
              rows={candidates.map((parent) => ({
                id: parent.id,
                label: getParentLabel(parent),
              }))}
              options={partnershipOptions}
              defaultOption="none"
            />
          );
        })}
      </FieldNamespace>
    </>
  );
}
