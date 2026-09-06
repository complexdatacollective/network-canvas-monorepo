'use client';

import { Tooltip } from '@base-ui/react/tooltip';
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
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import Overlay from './Overlay';

const transition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
  delay: 0.1,
};

export default function PassphrasePrompter() {
  const intl = useAppIntl();
  const { setPassphrase, showPassphrasePrompter, passphraseInvalid } =
    usePassphrase();
  const [showPassphraseOverlay, setShowPassphraseOverlay] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const portalContainer = usePortalContainer();

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

  return (
    <>
      <Tooltip.Provider>
        <Tooltip.Root open={showTooltip} onOpenChange={setShowTooltip}>
          <AnimatePresence>
            {showPassphrasePrompter && (
              <Tooltip.Trigger
                render={
                  <motion.button
                    aria-label={intl.formatMessage(messages.enterPassphrase)}
                    key="lock"
                    layout
                    className="bg-platinum group flex size-[calc(4.8*var(--theme-root-size))] cursor-pointer items-center justify-center rounded-full"
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
                  </motion.button>
                }
              />
            )}
          </AnimatePresence>
          <Tooltip.Portal container={portalContainer ?? undefined}>
            <Tooltip.Positioner sideOffset={5} side="right">
              <Tooltip.Popup
                render={
                  <motion.div
                    key="tooltip"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-surface flex w-96 flex-col justify-center gap-4 rounded-xl p-6 shadow-xl"
                  />
                }
              >
                <div>
                  <AppMessage
                    message={
                      passphraseInvalid
                        ? messages.decryptRetry
                        : messages.passphraseNeeded
                    }
                  />
                </div>
                <Tooltip.Arrow className="fill-surface" />
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
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
