'use client';

import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FramingId } from '@codaco/shared-consts';
import { useFamilyPedigreeStore } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';

type FramingConfig =
  | { mode: 'fixed'; value: FramingId }
  | { mode: 'participantChoice' };

export function shouldSkipFramingSelectionStep(
  framingConfig: FramingConfig,
): boolean {
  return framingConfig.mode !== 'participantChoice';
}

const FRAMING_OPTIONS = [
  {
    value: 'gamete' as const,
    label: 'Egg parent & sperm parent',
    description:
      "We'll talk about the person whose egg you came from and the person whose sperm you came from.",
  },
  {
    value: 'gendered' as const,
    label: 'Mother & father',
    description:
      "We'll talk about your biological mother and biological father.",
  },
];

export function FramingSelectionStep() {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const setFraming = useFamilyPedigreeStore((s) => s.setFraming);

  return (
    <>
      <Paragraph>
        How would you like us to refer to the people you&apos;re biologically
        related to?
      </Paragraph>
      <RichSelectGroupField
        options={FRAMING_OPTIONS}
        value={framing ?? undefined}
        onChange={(value) => {
          if (value === 'gamete' || value === 'gendered') {
            setFraming(value);
          }
        }}
      />
    </>
  );
}
