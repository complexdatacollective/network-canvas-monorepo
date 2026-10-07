'use client';

import {
  AnimatePresence,
  motion,
  type Transition,
  useWillChange,
} from 'motion/react';
import { useCallback, useEffect, useId, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
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
import Overlay from './Overlay';

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
  const { setPassphrase, showPassphrasePrompter, passphraseInvalid } =
    usePassphrase();
  const [showPassphraseOverlay, setShowPassphraseOverlay] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const descriptionId = useId();

  const willChange = useWillChange();

  const handleSetPassphrase = useCallback(
    (passphrase: string) => {
      if (!passphrase) {
        return;
      }
      setPassphrase(passphrase);
      setShowPassphraseOverlay(false);
    },
    [setPassphrase],
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (passphraseInvalid) {
      timeout = setTimeout(() => {
        setShowTooltip(true);
      }, 500);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [passphraseInvalid]);

  const promptMessage = passphraseInvalid
    ? messages.decryptRetry
    : messages.passphraseNeeded;

  return (
    <>
      <TooltipProvider>
        <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
          <AnimatePresence>
            {showPassphrasePrompter && (
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
                    onClick={() => setShowPassphraseOverlay(true)}
                  >
                    <motion.span className="animate-shake scale-90 text-4xl transition-transform group-hover:scale-100">
                      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- Decorative status glyph; the button has a localized accessible name. */}
                      {passphraseInvalid ? '⚠️' : '🔑'}
                    </motion.span>
                    {/* The tooltip opens only on hover or after a failed
                        attempt, so screen readers get the same explanation as
                        the button's description. */}
                    <span id={descriptionId} hidden>
                      <AppMessage message={promptMessage} />
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
            <AppMessage message={promptMessage} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PassphraseOverlay
        handleSubmit={handleSetPassphrase}
        show={showPassphraseOverlay}
        onClose={() => setShowPassphraseOverlay(false)}
      />
    </>
  );
}

const PassphraseOverlay = ({
  handleSubmit,
  show,
  onClose,
}: {
  handleSubmit: (passphrase: string) => void;
  show: boolean;
  onClose: () => void;
}) => {
  const intl = useAppIntl();
  const { passphraseInvalid } = usePassphrase();
  const formId = useId();

  const onSubmitForm = (values: unknown) => {
    const fields = values as { passphrase: string };
    handleSubmit(fields.passphrase);
    return { success: true };
  };

  return (
    <FormStoreProvider>
      <Overlay
        show={show}
        title={intl.formatMessage(messages.enterPassphrase)}
        onClose={onClose}
        footer={
          <SubmitButton form={formId}>
            <AppMessage message={messages.submitPassphrase} />
          </SubmitButton>
        }
      >
        <div className="flex flex-col">
          {passphraseInvalid && (
            <p className="bg-accent/50 rounded p-6 text-white">
              <AppMessage message={messages.decryptFailed} />
            </p>
          )}
          <p>
            <AppMessage message={messages.passphraseHelp} />
          </p>
          <FormWithoutProvider
            id={formId}
            className="mt-6"
            onSubmit={onSubmitForm}
          >
            <Field
              component={InputField}
              name="passphrase"
              label={intl.formatMessage(messages.passphrase)}
              placeholder={intl.formatMessage(messages.passphrasePlaceholder)}
              required
              autoFocus
            />
          </FormWithoutProvider>
        </div>
      </Overlay>
    </FormStoreProvider>
  );
};
