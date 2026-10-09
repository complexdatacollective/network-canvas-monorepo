'use client';

import { motion } from 'motion/react';
import { useCallback, useId, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button from '../../Button';
import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '../../PresentationalText';
import { RenderMarkdown } from '../../RenderMarkdown';
import {
  controlVariants,
  groupSpacingVariants,
  inputControlVariants,
  smallSizeVariants,
  stateVariants,
  textSizeVariants,
} from '../../styles/controlVariants';
import { headingVariants } from '../../typography/Heading';
import { cva, cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';

const messages = defineMessages({
  yes: {
    id: 'frescoUi.booleanField.yes',
    defaultMessage: 'Yes',
    description: 'Default affirmative option of a yes/no field.',
  },
  no: {
    id: 'frescoUi.booleanField.no',
    defaultMessage: 'No',
    description: 'Default negative option of a yes/no field.',
  },
  resetAnswer: {
    id: 'frescoUi.booleanField.resetAnswer',
    defaultMessage: 'Reset answer',
    description: 'Action that clears the answer to a yes/no field.',
  },
});

type BooleanOption = {
  label: PresentationalText;
  value: boolean;
  negative?: boolean;
  /** This answer alone cannot be chosen; the other still can. */
  disabled?: boolean;
  /** Said about this answer alone, such as why it is unavailable: its
   * accessible description, not shown. */
  description?: string;
};

const optionCardOwnVariants = cva({
  base: cx(
    'grid cursor-pointer grid-cols-[auto_1fr] content-start items-start gap-x-4! gap-y-2!',
    'overflow-hidden rounded border-2 border-current/20',
    'bg-input text-input-contrast text-start text-wrap',
    'transition-colors duration-200',
    'focusable',
  ),
  variants: {
    selected: {
      true: 'border-primary',
      false: 'hover:border-current/40',
    },
    state: {
      normal: '',
      disabled: 'pointer-events-none cursor-not-allowed opacity-50',
      readOnly: 'pointer-events-none cursor-default',
      invalid: 'border-destructive',
    },
    negative: {
      true: '',
      false: '',
    },
  },
  compoundVariants: [
    {
      selected: true,
      negative: true,
      className: 'border-destructive',
    },
    {
      selected: true,
      state: 'invalid',
      className: 'border-destructive',
    },
    {
      selected: false,
      state: 'readOnly',
      className: 'opacity-40',
    },
  ],
  defaultVariants: {
    selected: false,
    state: 'normal',
    negative: false,
  },
});

const optionCardVariants = cva({
  composes: [groupSpacingVariants, textSizeVariants, optionCardOwnVariants],
});

const booleanIndicatorOwnVariants = cva({
  base: cx(
    'flex aspect-square shrink-0! items-center justify-center',
    'rounded-full',
    'focusable',
  ),
});

const booleanIndicatorVariants = cva({
  composes: [
    smallSizeVariants,
    controlVariants,
    inputControlVariants,
    stateVariants,
    booleanIndicatorOwnVariants,
  ],
});

const selectionSpring = {
  type: 'spring' as const,
  duration: 0.3,
  bounce: 0.15,
};

type BooleanFieldProps = CreateFormFieldProps<
  boolean,
  'fieldset',
  {
    noReset?: boolean;
    label?: PresentationalText;
    options?: BooleanOption[];
  }
>;

function BooleanIndicator({
  isSelected,
  state,
  negative,
}: {
  isSelected: boolean;
  state?: 'normal' | 'disabled' | 'readOnly' | 'invalid';
  negative?: boolean;
}) {
  return (
    <span aria-hidden className={booleanIndicatorVariants({ state })}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cx(
          'size-full overflow-hidden rounded-full p-[0.1em]',
          negative && isSelected ? 'text-destructive' : 'text-primary',
        )}
      >
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          initial={false}
          animate={{ scale: isSelected ? 1 : 0 }}
          transition={{
            type: 'spring',
            bounce: 0.3,
            duration: isSelected ? 0.3 : 0.15,
          }}
        />
      </svg>
    </span>
  );
}

export default function BooleanField(props: BooleanFieldProps) {
  const intl = useAppIntl();
  const {
    id,
    className,
    value,
    onChange,
    noReset = true,
    label,
    options = [
      { label: intl.formatMessage(messages.yes), value: true },
      { label: intl.formatMessage(messages.no), value: false },
    ],
    disabled,
    readOnly,
    ...rest
  } = props;

  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleSelect = useCallback(
    (optionValue: boolean) => {
      if (readOnly || !onChange) return;
      onChange(optionValue);
    },
    [onChange, readOnly],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const enabledIndices = options
        .map((_opt, i) => i)
        .filter((i) => !disabled && !options[i]?.disabled);

      const currentEnabledIndex = enabledIndices.indexOf(index);
      if (currentEnabledIndex === -1) return;

      let nextIndex: number | undefined;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = currentEnabledIndex + 1;
        nextIndex = enabledIndices[next >= enabledIndices.length ? 0 : next];
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = currentEnabledIndex - 1;
        nextIndex = enabledIndices[prev < 0 ? enabledIndices.length - 1 : prev];
      }

      if (nextIndex !== undefined) {
        optionRefs.current[nextIndex]?.focus();
        const option = options[nextIndex];
        if (option) {
          handleSelect(option.value);
        }
      }
    },
    [options, disabled, handleSelect],
  );

  const groupState = getInputState(props);
  const descriptionIdPrefix = useId();
  // The chosen answer holds the tab stop. With nothing chosen, or when the
  // chosen answer cannot be chosen (a disabled button leaves the tab order),
  // the first answer that can be chosen holds it.
  const firstEnabled = options.findIndex((option) => !option.disabled);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabStop =
    selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : firstEnabled;

  return (
    <div className={cx('flex w-full flex-col gap-2', className)}>
      <fieldset
        id={id}
        {...rest}
        role="radiogroup"
        // Options sit side by side and wrap to a stack only when the container
        // is genuinely too narrow for them. Sizing is intrinsic (no container
        // query), so this also holds inside fit-content ancestors, where a
        // container query can never match (inline-size containment collapses
        // a content-sized container to zero width).
        className="flex w-full flex-row flex-wrap items-stretch gap-2 border-0 p-0 *:min-w-0 *:grow"
        disabled={disabled}
        aria-label={
          label === undefined
            ? rest['aria-label']
            : presentationalTextValue(label)
        }
        aria-labelledby={rest['aria-labelledby']}
        aria-invalid={rest['aria-invalid'] ?? undefined}
        aria-readonly={readOnly || undefined}
        data-readonly={readOnly ? 'true' : undefined}
      >
        {label && (
          <legend className="sr-only" {...presentationalTextProps(label)}>
            {presentationalTextValue(label)}
          </legend>
        )}
        {options.map((option, index) => {
          const isSelected = value === option.value;
          const optionDisabled = Boolean(disabled) || Boolean(option.disabled);
          const descriptionId = `${descriptionIdPrefix}-${index}`;
          const optionState = optionDisabled
            ? 'disabled'
            : readOnly
              ? 'readOnly'
              : groupState === 'invalid'
                ? 'invalid'
                : 'normal';

          return (
            <motion.button
              key={String(option.value)}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-value={String(option.value)}
              data-negative={option.negative ? 'true' : undefined}
              aria-describedby={option.description ? descriptionId : undefined}
              tabIndex={index === tabStop ? 0 : -1}
              className={optionCardVariants({
                selected: isSelected,
                state: optionState,
                negative: option.negative ?? false,
                size: 'md',
              })}
              onClick={() => {
                if (!optionDisabled && !readOnly) {
                  handleSelect(option.value);
                }
              }}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={optionDisabled}
              whileTap={
                optionDisabled || readOnly ? undefined : { scale: 0.98 }
              }
              transition={selectionSpring}
            >
              <BooleanIndicator
                isSelected={isSelected}
                state={optionState}
                negative={option.negative}
              />
              <span
                className={headingVariants({ level: 'label', margin: 'none' })}
                {...presentationalTextProps(option.label)}
              >
                <RenderMarkdown>
                  {presentationalTextValue(option.label)}
                </RenderMarkdown>
              </span>
            </motion.button>
          );
        })}
        {/* Outside the answers, whose content names them, so a description
            is not read as part of the name. */}
        {options.map((option, index) =>
          option.description ? (
            <span
              key={`description-${String(option.value)}`}
              id={`${descriptionIdPrefix}-${index}`}
              className="sr-only"
            >
              {option.description}
            </span>
          ) : null,
        )}
      </fieldset>
      {!noReset && value !== undefined && (
        <Button
          variant="link"
          size="sm"
          onClick={() => onChange?.(undefined)}
          disabled={Boolean(disabled) || Boolean(readOnly)}
        >
          {intl.formatMessage(messages.resetAnswer)}
        </Button>
      )}
    </div>
  );
}
