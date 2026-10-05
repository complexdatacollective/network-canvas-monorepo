'use client';

import { useContext, useMemo, type ReactNode } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { getFramingTerms } from '../../../framingTerms';
import { useFramedTerms } from '../../../hooks/useFramedTerms';
import { messages } from '../../../messages';
import { BioTriadConfigContext } from './BioTriadStep';

const WATCHED_FIELDS = [
  'egg-source',
  'sperm-source',
  'carrier-source',
  'new-egg-source.name',
  'new-sperm-source.name',
  'new-carrier.name',
] as const;

function emphasize(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}

type ParentKey = 'egg-source' | 'sperm-source' | 'carrier-source';

const ALL_PARENT_KEYS: ParentKey[] = [
  'egg-source',
  'sperm-source',
  'carrier-source',
];

type ParentEntry = {
  key: ParentKey;
  label: string;
  isNew: boolean;
};

function getNewParentLabel(
  key: ParentKey,
  values: Record<string, unknown>,
  newEggParentLabel: string,
  newSpermParentLabel: string,
  newCarrierLabel: string,
): string {
  const nameMap: Record<ParentKey, string> = {
    'egg-source': 'new-egg-source.name',
    'sperm-source': 'new-sperm-source.name',
    'carrier-source': 'new-carrier.name',
  };

  const fallbackMap: Record<ParentKey, string> = {
    'egg-source': newEggParentLabel,
    'sperm-source': newSpermParentLabel,
    'carrier-source': newCarrierLabel,
  };

  const name = values[nameMap[key]];
  if (typeof name === 'string' && name.length > 0) return name;

  return fallbackMap[key];
}

export function shouldSkipNewParentPartnerships({
  getFieldValue,
}: {
  getFieldValue: (name: string) => unknown;
}) {
  const newCount = ALL_PARENT_KEYS.filter(
    (key) => getFieldValue(key) === 'new',
  ).length;
  const totalParents = ALL_PARENT_KEYS.filter((key) => {
    const val = getFieldValue(key);
    return val !== undefined;
  }).length;
  return newCount === 0 || totalParents < 2;
}

export default function NewParentPartnershipsStep() {
  const intl = useAppIntl();
  const partnershipOptions = [
    { value: 'current', label: intl.formatMessage(messages.currentPartners) },
    { value: 'ex', label: intl.formatMessage(messages.exPartners) },
    { value: 'none', label: intl.formatMessage(messages.neverPartners) },
  ];

  const formValues = useFormValue(WATCHED_FIELDS);
  const { existingNodes } = useContext(BioTriadConfigContext);
  const terms = useFramedTerms() ?? getFramingTerms('gamete', intl);
  const nodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of existingNodes ?? []) {
      map.set(node.value, node.getLabel?.(intl) ?? node.label);
    }
    return map;
  }, [existingNodes, intl]);

  const parents = useMemo<ParentEntry[]>(() => {
    const list: ParentEntry[] = [];

    for (const key of ALL_PARENT_KEYS) {
      const selection = formValues[key] as string | undefined;
      if (!selection) continue;

      if (selection === 'new') {
        list.push({
          key,
          label: getNewParentLabel(
            key,
            formValues,
            terms.newEggParent,
            terms.newSpermParent,
            intl.formatMessage(messages.newCarrier),
          ),
          isNew: true,
        });
      } else if (selection === 'unknown') {
        const fallbackMap: Record<ParentKey, string> = {
          'egg-source': terms.unknownEggParent,
          'sperm-source': terms.unknownSpermParent,
          'carrier-source': intl.formatMessage(messages.unknownCarrier),
        };
        list.push({ key, label: fallbackMap[key], isNew: false });
      } else {
        const label =
          nodeMap.get(selection) ?? intl.formatMessage(messages.unknownPerson);
        list.push({ key, label, isNew: false });
      }
    }

    return list;
  }, [formValues, nodeMap, terms, intl]);

  const pairs = useMemo(() => {
    const result: [ParentEntry, ParentEntry][] = [];
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const a = parents[i]!;
        const b = parents[j]!;
        if (a.isNew || b.isNew) {
          result.push([a, b]);
        }
      }
    }
    return result;
  }, [parents]);

  if (pairs.length === 0) return null;

  return (
    <>
      <div className="mb-8">
        <Paragraph>
          <AppMessage
            message={messages.newPartnershipIntro}
            values={{ strong: emphasize }}
          />
        </Paragraph>
      </div>
      {pairs.map(([a, b]) => (
        <Field
          key={`partnership-${a.key}-${b.key}`}
          name={`partnership-${a.key}-${b.key}`}
          label={
            <AppMessage
              message={messages.arePartners}
              values={{
                people: intl.formatList([a.label, b.label], {
                  type: 'conjunction',
                }),
              }}
            />
          }
          component={RadioGroupField}
          options={partnershipOptions}
          required
        />
      ))}
    </>
  );
}
