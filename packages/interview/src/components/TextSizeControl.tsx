'use client';

import { Popover } from '@base-ui/react/popover';
import { ALargeSmall } from 'lucide-react';
import { useId, useMemo } from 'react';

import { type ButtonProps, IconButton } from '@codaco/fresco-ui/Button';
import {
  ArrowSvg,
  BaseUISharedPopoverContainer,
} from '@codaco/fresco-ui/Popover';
import {
  POPOVER_ARROW_CLASS_NAME,
  POPOVER_ARROW_PADDING,
} from '@codaco/fresco-ui/popoverArrow';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import SegmentedSwitcher from '@codaco/fresco-ui/SegmentedSwitcher';

import { useContentFormat } from '../localization/useContentFormat';

type TextSizeControlProps = {
  /** The sizes to offer, as multipliers of the interview's own text size. */
  scales: readonly number[];
  value: number;
  onChange: (scale: number) => void;
  side: 'top' | 'left' | 'right';
  /** The trigger's look, so it matches the bar's other buttons. */
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  /** Classes for the trigger, so it matches the bar's other buttons. */
  triggerClassName?: string;
};

/**
 * The navigation's text size button and the choice of sizes it opens. The
 * popup is the switcher's track: one pill-shaped surface, bordered once, with
 * the sizes inside it, rather than a switcher drawn inside a padded popover.
 * The button names the choice, so the popup shows no label of its own.
 */
export default function TextSizeControl({
  scales,
  value,
  onChange,
  side,
  triggerVariant = 'text',
  triggerSize = 'xl',
  triggerClassName,
}: TextSizeControlProps) {
  const portalContainer = usePortalContainer();
  const nameId = useId();

  // Each size is named as a percentage, written as the interview's language
  // writes one ("110 %" in French).
  const { formatPercent } = useContentFormat();
  const options = useMemo(
    () =>
      scales.map((scale) => ({
        value: String(scale),
        label: formatPercent(scale),
      })),
    [formatPercent, scales],
  );

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <IconButton
            color="dynamic"
            variant={triggerVariant}
            size={triggerSize}
            icon={<ALargeSmall />}
            className={triggerClassName}
            aria-label="Text size"
            lang="en"
            data-testid="text-size-button"
          />
        }
      />
      <Popover.Portal container={portalContainer ?? undefined}>
        <Popover.Positioner
          className="z-3000"
          side={side}
          align="center"
          sideOffset={10}
          arrowPadding={POPOVER_ARROW_PADDING}
        >
          <Popover.Popup
            aria-labelledby={nameId}
            render={
              <BaseUISharedPopoverContainer
                spacing="none"
                animation="enter"
                className="rounded-full"
                arrow={
                  <Popover.Arrow className={POPOVER_ARROW_CLASS_NAME}>
                    <ArrowSvg />
                  </Popover.Arrow>
                }
              />
            }
          >
            {/* The popup and the choice share an English name, marked as
                English inside an interview in another language. */}
            <span id={nameId} hidden lang="en">
              {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text stays English */}
              {'Text size'}
            </span>
            <SegmentedSwitcher
              variant="plain"
              aria-labelledby={nameId}
              options={options}
              value={String(value)}
              onValueChange={(next) => onChange(Number(next))}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
