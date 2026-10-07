'use client';

import {
  AnimatePresence,
  motion,
  type Transition,
  useWillChange,
} from 'motion/react';
import { useCallback, useId, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import type { NavigationOrientation } from '../Shell';
import PassphraseOverlay from './PassphraseOverlay';

const transition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
  delay: 0.1,
};

type PassphrasePrompterProps = {
  orientation: NavigationOrientation;
  /** Placement and flex behaviour of the trigger within the navigation bar. */
  className?: string;
};

export default function PassphrasePrompter({
  orientation,
  className,
}: PassphrasePrompterProps) {
  const intl = useAppIntl();
  const { showPassphrasePrompter, passphraseChosen, encryptionUnavailable } =
    usePassphrase();
  // No passphrase can open a refused header, so none is offered, whatever
  // raised the prompter.
  const offerPassphrase = showPassphrasePrompter && !encryptionUnavailable;
  // Whether the open dialog chooses the interview's passphrase or asks for
  // it, fixed when it opens so that it does not change while it closes.
  const [overlay, setOverlay] = useState({ show: false, choosing: false });
  const [showTooltip, setShowTooltip] = useState(false);
  const descriptionId = useId();

  const willChange = useWillChange();

  const closeOverlay = useCallback(
    () => setOverlay((current) => ({ ...current, show: false })),
    [],
  );

  return (
    <>
      <TooltipProvider>
        <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
          <AnimatePresence>
            {offerPassphrase && (
              <TooltipTrigger
                render={
                  <motion.button
                    type="button"
                    aria-label={intl.formatMessage(messages.enterPassphrase)}
                    aria-describedby={descriptionId}
                    key="lock"
                    layout
                    className={cx(
                      'bg-platinum focusable group flex aspect-square cursor-pointer items-center justify-center rounded-full',
                      // Only the length along the bar is stated, so when the
                      // bar shrinks that length the ratio keeps the button
                      // round. Safari can collapse a flex item whose main
                      // size comes from its ratio, so the ratio only ever
                      // derives the cross size.
                      orientation === 'vertical'
                        ? 'h-[calc(4.8*var(--theme-root-size))]'
                        : 'w-[calc(4.8*var(--theme-root-size))]',
                      className,
                    )}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: 1,
                      opacity: 1,
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={transition}
                    style={{ willChange }}
                    onClick={() =>
                      setOverlay({ show: true, choosing: !passphraseChosen })
                    }
                  >
                    <motion.span className="animate-shake scale-90 text-4xl transition-transform group-hover:scale-100">
                      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- Decorative status glyph; the button has a localized accessible name. */}
                      {'🔑'}
                    </motion.span>
                    {/* The tooltip opens only on hover or focus, so screen
                        readers get the same explanation as the button's
                        description. */}
                    <span id={descriptionId} hidden>
                      <AppMessage message={messages.passphraseNeeded} />
                    </span>
                  </motion.button>
                }
              />
            )}
          </AnimatePresence>
          {/* A visual echo of the button's description, so assistive
              technology does not meet the same text twice. */}
          <TooltipContent
            aria-hidden="true"
            side={orientation === 'vertical' ? 'right' : 'top'}
            className="max-w-[min(var(--available-width),var(--container-md))]"
          >
            <AppMessage message={messages.passphraseNeeded} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PassphraseOverlay
        show={overlay.show}
        choosing={overlay.choosing}
        onAccepted={closeOverlay}
        onClose={closeOverlay}
      />
    </>
  );
}
