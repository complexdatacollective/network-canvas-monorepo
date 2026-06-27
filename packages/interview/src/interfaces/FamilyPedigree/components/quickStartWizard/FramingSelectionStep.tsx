'use client';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  FRAMING_AUTHOR_LABELS,
  FRAMING_IDS,
  type FramingId,
} from '@codaco/shared-consts';
import { useFamilyPedigreeStore } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';

type FramingConfig =
  | { mode: 'fixed'; value: FramingId }
  | { mode: 'participantChoice' };

export function shouldSkipFramingSelectionStep(
  framingConfig: FramingConfig,
): boolean {
  return framingConfig.mode !== 'participantChoice';
}

const FRAMING_EXAMPLE: Record<FramingId, string> = {
  gamete:
    "We'll refer to your biological parents as your egg parent and sperm parent.",
  gendered: "We'll refer to your biological parents as your mother and father.",
};

export function FramingSelectionStep() {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const setFraming = useFamilyPedigreeStore((s) => s.setFraming);

  return (
    <>
      <Paragraph>
        Choose the language you'd prefer to use when we ask about your
        biological parents.
      </Paragraph>
      <div className="mt-4 flex flex-col gap-3">
        {FRAMING_IDS.map((id) => {
          const isSelected = framing === id;
          return (
            <label
              key={id}
              className={[
                'flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted/50',
              ].join(' ')}
            >
              <input
                type="radio"
                name="framing"
                value={id}
                checked={isSelected}
                aria-label={FRAMING_AUTHOR_LABELS[id]}
                onChange={() => setFraming(id)}
                className="sr-only"
              />
              <span className="font-semibold">{FRAMING_AUTHOR_LABELS[id]}</span>
              <span className="text-sm opacity-70">{FRAMING_EXAMPLE[id]}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}
