'use client';

import {
  AnimatePresence,
  motion,
  type Transition,
  useWillChange,
} from 'motion/react';
import { useCallback, useId, useState } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import PassphraseCheckStatus from '../interfaces/Anonymisation/PassphraseCheckStatus';
import { protocolPassphraseLengthRules } from '../interfaces/Anonymisation/passphraseRules';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import { interfaceMessages } from '../interfaces/messages';
import type { NavigationOrientation } from '../Shell';
import { getProtocolStages } from '../store/modules/protocol';
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

type PassphraseOverlayProps = {
  show: boolean;
  /** Whether no passphrase has been chosen yet, so this one becomes it. */
  choosing: boolean;
  onAccepted: () => void;
  onClose: () => void;
};

const PassphraseOverlay = (props: PassphraseOverlayProps) => (
  <FormStoreProvider>
    <PassphraseDialog {...props} />
  </FormStoreProvider>
);

const PassphraseDialog = ({
  show,
  choosing,
  onAccepted,
  onClose,
}: PassphraseOverlayProps) => {
  const intl = useAppIntl();
  const { submitPassphrase } = usePassphrase();
  // Closed mid-check and opened again, the dialog would offer a second
  // passphrase while the first is still being checked.
  const checking = useFormStore((state) => state.isSubmitting);
  const stages = useSelector(getProtocolStages);
  const formId = useId();
  const lengthRules = choosing ? protocolPassphraseLengthRules(stages) : {};

  const onSubmitForm: FormSubmitHandler = async ({ passphrase }) => {
    if (typeof passphrase !== 'string') {
      return {
        success: false,
        formErrors: [createMessageError(messages.submissionFailed)],
      };
    }

    // A passphrase that does not match the one chosen for this interview is
    // turned away here, with the reason under the field.
    if (!(await submitPassphrase(passphrase))) {
      return {
        success: false,
        fieldErrors: {
          passphrase: [createMessageError(messages.passphraseIncorrect)],
        },
      };
    }

    onAccepted();
    return { success: true };
  };

  return (
    <Overlay
      show={show}
      title={intl.formatMessage(
        choosing ? messages.choosePassphrase : messages.enterPassphrase,
      )}
      onClose={onClose}
      dismissible={!checking}
      footer={
        <SubmitButton form={formId}>
          <AppMessage message={messages.submitPassphrase} />
        </SubmitButton>
      }
    >
      <div className="flex flex-col">
        <p>
          <AppMessage
            message={
              choosing ? messages.choosePassphraseHelp : messages.passphraseHelp
            }
          />
        </p>
        <FormWithoutProvider
          id={formId}
          className="mt-6"
          onSubmit={onSubmitForm}
        >
          {/* The passphrase protects this one interview's answers, so a
              password manager must not offer to save it as a site login. */}
          <Field
            component={PasswordField}
            name="passphrase"
            label={intl.formatMessage(messages.passphrase)}
            placeholder={intl.formatMessage(messages.passphrasePlaceholder)}
            required
            autoFocus
            suppressPasswordManager
            {...lengthRules}
          />
          {choosing && (
            <Field
              component={PasswordField}
              name="passphrase-2"
              label={intl.formatMessage(interfaceMessages.confirmPassphrase)}
              placeholder={intl.formatMessage(
                interfaceMessages.reenterPassphrase,
              )}
              required
              suppressPasswordManager
              sameAs="passphrase"
              {...lengthRules}
            />
          )}
        </FormWithoutProvider>
        <PassphraseCheckStatus />
      </div>
    </Overlay>
  );
};
