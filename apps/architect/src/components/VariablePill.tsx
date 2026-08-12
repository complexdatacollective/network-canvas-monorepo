import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControlsWithThen,
  type MotionStyle,
} from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import type {
  ValidationName,
  Variable,
  VariableType,
} from '@codaco/protocol-validation';
import { getColorForType, getIconForType } from '~/config/variables';
import { cx } from '~/utils/cva';

export type VariablePillProps = {
  active?: boolean;
  interactive: boolean;
  label: string;
  type: VariableType;
  validations: ValidationName[];
};

type VariablePillStyle = MotionStyle & {
  '--variable-pill-accent': string;
};

type LabelWidths = {
  collapsedHeight: number;
  collapsedPillWidth: number;
  collapsed: number;
  expanded: number;
};

const DARK_COLOR_SUFFIX = '-dark';
const INTERACTION_SCALE = 1.15;
const WIDTH_SPRING = {
  type: 'spring',
  stiffness: 300,
  damping: 28,
  mass: 1,
} as const;

const VALIDATION_NAMES = [
  'required',
  'requiredAcceptsNull',
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
  'unique',
  'differentFrom',
  'sameAs',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const satisfies readonly ValidationName[];

const VALIDATION_LABELS = {
  required: 'Required',
  requiredAcceptsNull: 'Required, accepting null',
  minLength: 'Minimum length',
  maxLength: 'Maximum length',
  minValue: 'Minimum value',
  maxValue: 'Maximum value',
  minSelected: 'Minimum selections',
  maxSelected: 'Maximum selections',
  unique: 'Unique value',
  differentFrom: 'Different from another variable',
  sameAs: 'Same as another variable',
  greaterThanVariable: 'Greater than another variable',
  lessThanVariable: 'Less than another variable',
  greaterThanOrEqualToVariable: 'Greater than or equal to another variable',
  lessThanOrEqualToVariable: 'Less than or equal to another variable',
} as const satisfies Record<ValidationName, string>;

const getRawColorToken = (color: string) =>
  color.endsWith(DARK_COLOR_SUFFIX)
    ? `${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark`
    : color;

export const getActiveValidationNames = (
  variable: Variable,
): ValidationName[] => {
  const validation = 'validation' in variable ? variable.validation : undefined;

  if (!validation) return [];

  const validationValues = validation as Partial<
    Record<ValidationName, unknown>
  >;

  return VALIDATION_NAMES.filter((name) => {
    const value = validationValues[name];
    return typeof value === 'boolean' ? value : value !== undefined;
  });
};

/** A presentation-only variable reference. Interaction belongs to its parent. */
export const VariablePill = ({
  active = false,
  interactive,
  label,
  type,
  validations,
}: VariablePillProps) => {
  const pillRef = useRef<HTMLDataElement>(null);
  const labelSectionRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const interactionActiveRef = useRef(false);
  const previousActiveRef = useRef(false);
  const labelAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(
    null,
  );
  const labelAnimationVersionRef = useRef(0);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [labelWidths, setLabelWidths] = useState<LabelWidths>();
  const labelWidth = useMotionValue(0);
  const shouldReduceMotion = useReducedMotion();

  const accentColor = getRawColorToken(getColorForType(type));
  const accessibleLabel = `${label}, ${type} variable${validations.length > 0 ? `, ${validations.map((validation) => VALIDATION_LABELS[validation]).join(', ')}` : ''}`;
  const expanded =
    interactive &&
    (focused || hovered || (active && labelWidths !== undefined));
  const animatingLabel = expanded || labelWidths !== undefined;
  const style: VariablePillStyle = {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
  };

  const measureLabelWidths = (): LabelWidths | undefined => {
    const pill = pillRef.current;
    const labelSection = labelSectionRef.current;
    const labelElement = labelRef.current;
    if (!pill || !labelSection || !labelElement) return undefined;

    const clippedLabelWidth = Math.max(
      0,
      labelElement.scrollWidth - labelElement.clientWidth,
    );
    const collapsed = labelSection.offsetWidth;

    return {
      collapsedHeight: pill.offsetHeight,
      collapsedPillWidth: pill.offsetWidth,
      collapsed,
      expanded:
        clippedLabelWidth > 0
          ? Math.ceil(collapsed + clippedLabelWidth) + 1
          : collapsed,
    };
  };

  const animateLabelWidth = (target: number) => {
    const animationVersion = ++labelAnimationVersionRef.current;
    labelAnimationRef.current?.stop();

    if (shouldReduceMotion) {
      labelAnimationRef.current = null;
      labelWidth.jump(target);
      return animationVersion;
    }

    labelAnimationRef.current = animate(labelWidth, target, WIDTH_SPRING);
    return animationVersion;
  };

  const beginInteraction = () => {
    if (interactionActiveRef.current) return;
    interactionActiveRef.current = true;

    const widths = labelWidths ?? measureLabelWidths();
    if (!widths) {
      interactionActiveRef.current = false;
      return;
    }

    if (!labelWidths) {
      labelWidth.jump(widths.collapsed);
      setLabelWidths(widths);
    }

    requestAnimationFrame(() => {
      if (interactionActiveRef.current) {
        animateLabelWidth(widths.expanded);
      }
    });
  };

  const endInteraction = () => {
    interactionActiveRef.current = false;
    if (!labelWidths) return;

    const target = labelWidths.collapsed;
    const animationVersion = animateLabelWidth(target);

    const finishCollapse = () => {
      if (
        interactionActiveRef.current ||
        animationVersion !== labelAnimationVersionRef.current ||
        !labelSectionRef.current
      ) {
        return;
      }

      if (Math.abs(labelWidth.get() - target) >= 0.5) {
        requestAnimationFrame(finishCollapse);
        return;
      }

      labelAnimationRef.current?.stop();
      labelAnimationRef.current = null;
      labelWidth.jump(target);
      setLabelWidths(undefined);
    };

    if (shouldReduceMotion) {
      finishCollapse();
    } else {
      requestAnimationFrame(finishCollapse);
    }
  };

  useLayoutEffect(() => {
    if (active === previousActiveRef.current) return;
    previousActiveRef.current = active;

    if (interactive && active) {
      beginInteraction();
    } else if (!focused && !hovered) {
      endInteraction();
    }
  });

  return (
    <span
      className="relative flex min-h-12 w-fit max-w-full min-w-0"
      style={
        labelWidths
          ? {
              height: labelWidths.collapsedHeight,
              width: labelWidths.collapsedPillWidth,
            }
          : undefined
      }
    >
      <span
        className={cx(
          'flex min-h-12 min-w-0',
          animatingLabel
            ? 'absolute top-0 left-1/2 z-10 -translate-x-1/2'
            : 'w-fit max-w-full',
        )}
      >
        <motion.data
          ref={pillRef}
          animate={{ scale: expanded ? INTERACTION_SCALE : 1 }}
          aria-label={interactive ? accessibleLabel : undefined}
          className={cx(
            'variable-pill font-monospace flex min-h-12 min-w-0 flex-nowrap rounded p-0.5 text-base',
            'effect-shadow-sm cursor-default select-none',
            !animatingLabel && 'w-fit max-w-full',
            interactive
              ? 'focusable variable-pill-effect-border hover:effect-shadow transition-shadow duration-200 ease-out focus-visible:transition-[outline-color,outline-offset,outline-width,box-shadow]'
              : 'bg-(--variable-pill-accent)',
          )}
          initial={false}
          onBlur={
            interactive
              ? () => {
                  setFocused(false);
                  if (!hovered && !active) {
                    endInteraction();
                  }
                }
              : undefined
          }
          onFocus={
            interactive
              ? () => {
                  beginInteraction();
                  setFocused(true);
                }
              : undefined
          }
          onMouseEnter={
            interactive
              ? () => {
                  beginInteraction();
                  setHovered(true);
                }
              : undefined
          }
          onMouseLeave={
            interactive
              ? () => {
                  setHovered(false);
                  if (!focused && !active) {
                    endInteraction();
                  }
                }
              : undefined
          }
          style={style}
          tabIndex={interactive ? 0 : undefined}
          transition={shouldReduceMotion ? { duration: 0 } : WIDTH_SPRING}
          value={label}
        >
          <span
            aria-hidden
            className="text-text bg-surface flex min-h-12 min-w-0 flex-1 overflow-hidden rounded-[inherit]"
          >
            <span className="flex w-12 shrink-0 grow-0 items-center justify-center self-stretch border-r border-white/25 bg-(--variable-pill-accent)">
              <img
                aria-hidden
                alt=""
                className="w-5 opacity-80"
                src={getIconForType(type)}
              />
            </span>

            <motion.span
              ref={labelSectionRef}
              animate={
                labelWidths
                  ? {
                      width: expanded
                        ? labelWidths.expanded
                        : labelWidths.collapsed,
                    }
                  : undefined
              }
              className={cx(
                'flex min-w-0 items-center overflow-hidden py-2 pr-6 pl-4',
                animatingLabel ? 'shrink-0 grow-0' : 'w-fit max-w-full shrink',
              )}
              initial={false}
              style={animatingLabel ? { width: labelWidth } : undefined}
            >
              <span
                ref={labelRef}
                className={cx(
                  'w-full',
                  animatingLabel ? 'whitespace-nowrap' : 'truncate',
                )}
              >
                {label}
              </span>
            </motion.span>
          </span>
          {!interactive && <span className="sr-only">{accessibleLabel}</span>}
        </motion.data>
      </span>
    </span>
  );
};
