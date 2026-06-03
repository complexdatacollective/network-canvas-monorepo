'use client';

import { useMemo } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const partnershipOptions = [
  { value: 'current', label: 'Current partners' },
  { value: 'ex', label: 'Ex-partners' },
  { value: 'none', label: 'Never partners' },
];

type ParentEntry = {
  id: string;
  name: string | undefined;
  /** Label used in the partnership question when no name was provided. */
  roleLabel: string;
};

const MAX_ADDITIONAL_PARENTS = 20;

const ADDITIONAL_PARENT_ROLE_LABELS: Record<string, string> = {
  'step-parent': 'your step-parent',
  'adoptive-parent': 'your adoptive parent',
  'raised-me': 'your parent who raised you',
};

const BIO_PARENT_FIELDS = [
  'egg-parent.name',
  'egg-parent.gestationalCarrier',
  'sperm-parent.name',
  'gestational-carrier.name',
  'hasOtherParents',
  'otherParentCount',
  ...Array.from({ length: MAX_ADDITIONAL_PARENTS }, (_, i) => [
    `additional-parent[${String(i)}].name`,
    `additional-parent[${String(i)}].role`,
  ]).flat(),
] as const;

function additionalParentRoleLabel(
  role: string | undefined,
  index: number,
): string {
  const known = role ? ADDITIONAL_PARENT_ROLE_LABELS[role] : undefined;
  return known ?? `your additional parent ${String(index + 1)}`;
}

function getParentLabel(parent: ParentEntry): string {
  return parent.name ? parent.name : parent.roleLabel;
}

export default function ParentPartnershipsStep() {
  const values = useFormValue(BIO_PARENT_FIELDS);

  const parents = useMemo<ParentEntry[]>(() => {
    const list: ParentEntry[] = [
      {
        id: 'egg-parent',
        name: values['egg-parent.name'] as string | undefined,
        roleLabel: 'your egg parent',
      },
      {
        id: 'sperm-parent',
        name: values['sperm-parent.name'] as string | undefined,
        roleLabel: 'your sperm parent',
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
          roleLabel: additionalParentRoleLabel(
            values[`additional-parent[${String(i)}].role`] as
              | string
              | undefined,
            i,
          ),
        });
      }
    }

    return list;
  }, [values]);

  const pairs = useMemo(() => {
    const result: [number, number][] = [];
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        result.push([i, j]);
      }
    }
    return result;
  }, [parents.length]);

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
      {pairs.map(([i, j]) => {
        const parentI = parents[i]!;
        const parentJ = parents[j]!;

        return (
          <Field
            key={`partnership-${parentI.id}-${parentJ.id}`}
            name={`partnership-${parentI.id}-${parentJ.id}`}
            label={`Are ${getParentLabel(parentI)} and ${getParentLabel(parentJ)} partners?`}
            component={RadioGroupField}
            options={partnershipOptions}
            required
          />
        );
      })}
    </>
  );
}
