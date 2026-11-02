'use client';

import { Check } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

function OnboardSteps({ steps }: { steps: string[] }) {
  const [currentStep, setCurrentStep] = useQueryState(
    'step',
    parseAsInteger.withDefault(1),
  );

  return (
    <Surface noContainer className="flex shrink-0 flex-col gap-4" spacing="sm">
      {steps.map((step, index) => (
        <button
          key={index}
          type="button"
          // The current step and the ones before it can be revisited; later
          // steps cannot be reached until these are complete.
          disabled={currentStep <= index}
          aria-current={index === currentStep - 1 ? 'step' : undefined}
          className="focusable flex items-center gap-2 rounded-xl text-start enabled:cursor-pointer"
          onClick={() => void setCurrentStep(index + 1)}
        >
          <span
            className={cx(
              'border-primary/6 laptop:size-10 flex size-8 items-center justify-center rounded-full border text-sm font-bold',
              index < currentStep - 1 && 'bg-success border-success text-white',
              index === currentStep - 1 &&
                'border-primary bg-primary text-white',
            )}
          >
            {index < currentStep - 1 ? (
              <Check strokeWidth={3} size={18} />
            ) : (
              index + 1
            )}
          </span>
          <span className="flex flex-col">
            <Heading
              level="h4"
              variant="all-caps"
              render={<span />}
              className="m-0 text-xs"
            >
              {step}
            </Heading>
          </span>
        </button>
      ))}
    </Surface>
  );
}

export default OnboardSteps;
