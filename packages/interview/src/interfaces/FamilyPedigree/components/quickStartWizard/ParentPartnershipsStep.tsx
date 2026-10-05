'use client';

import { useMemo, type ReactNode } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import RadioMatrixField from '@codaco/fresco-ui/form/fields/RadioMatrixField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { getFramingTerms } from '../../framingTerms';
import { useFramedTerms } from '../../hooks/useFramedTerms';
import { messages } from '../../messages';

function emphasize(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
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
  const intl = useAppIntl();
  const partnershipOptions = [
    { value: 'current', label: intl.formatMessage(messages.currentPartner) },
    { value: 'ex', label: intl.formatMessage(messages.exPartner) },
    { value: 'none', label: intl.formatMessage(messages.notPartnerUnknown) },
  ];

  const values = useFormValue(BIO_PARENT_FIELDS);
  const terms = useFramedTerms() ?? getFramingTerms('gamete', intl);

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
        roleLabel: intl.formatMessage(messages.yourCarrier),
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
          roleLabel: intl.formatMessage(messages.yourAdditionalParent),
        });
      }
    }

    return list;
  }, [values, terms, intl]);

  if (parents.length < 2) return null;

  return (
    <>
      <Paragraph>
        <AppMessage message={messages.partnershipIntro} />
      </Paragraph>
      <Paragraph>
        <AppMessage
          message={messages.partnershipDefinition}
          values={{ strong: emphasize }}
        />
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
              label={
                <AppMessage
                  message={messages.partnersOf}
                  values={{
                    name: getParentLabel(focal),
                    strong: emphasize,
                  }}
                />
              }
              hint={intl.formatMessage(messages.deceasedPartnerHint)}
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
