'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import RadioMatrixField from '@codaco/fresco-ui/form/fields/RadioMatrixField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const partnershipOptions = [
  { value: 'current', label: 'Current partner' },
  { value: 'ex', label: 'Ex-partner' },
  { value: 'none', label: 'Not a partner' },
];

/**
 * Supplies the possessive used to label a parent who was left unnamed
 * ("your egg parent" vs "Linda's egg parent"). Defaults to "your" for the ego
 * quick start; the define-parents wizard overrides it with the focal person's
 * possessive when the focal person is not the interviewee.
 */
const PartnershipSubjectContext = createContext<{ possessive: string }>({
  possessive: 'your',
});

export function PartnershipSubjectProvider({
  possessive,
  children,
}: {
  possessive: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ possessive }), [possessive]);
  return (
    <PartnershipSubjectContext.Provider value={value}>
      {children}
    </PartnershipSubjectContext.Provider>
  );
}

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
  const { possessive } = useContext(PartnershipSubjectContext);

  const parents = useMemo<ParentEntry[]>(() => {
    const list: ParentEntry[] = [
      {
        id: 'egg-parent',
        name: values['egg-parent.name'] as string | undefined,
        roleLabel: `${possessive} egg parent`,
      },
      {
        id: 'sperm-parent',
        name: values['sperm-parent.name'] as string | undefined,
        roleLabel: `${possessive} sperm parent`,
      },
    ];

    if (values['egg-parent.gestationalCarrier'] === false) {
      list.push({
        id: 'gestational-carrier',
        name: values['gestational-carrier.name'] as string | undefined,
        roleLabel: `${possessive} gestational carrier`,
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
          roleLabel: `${possessive} additional parent`,
        });
      }
    }

    return list;
  }, [values, possessive]);

  if (parents.length < 2) return null;

  return (
    <>
      <div className="mb-8">
        <Paragraph>
          We now want to ask about relationships between the parents you named.
          This includes current and past romantic partnerships, but{' '}
          <strong>not co-parenting partnerships</strong> where the parents were
          never romantically involved.
        </Paragraph>
        <Paragraph>
          If either parent is <strong>deceased</strong>, please answer based on
          whether they were partners while both were alive.
        </Paragraph>
      </div>
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
              label={`Which of these people are or were partners of ${getParentLabel(focal)}?`}
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
