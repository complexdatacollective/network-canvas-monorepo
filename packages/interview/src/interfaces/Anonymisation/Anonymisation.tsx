'use client';

import { ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FormSubmissionResult,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface, { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import EncryptionBackground from '../../components/EncryptedBackground';
import { submitRegisteredForm } from '../../forms/submitRegisteredForm';
import useBeforeNext from '../../hooks/useBeforeNext';
import { useCelebrate } from '../../hooks/useCelebrate';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import { LocalizedMarkdown } from '../../localization/LocalizedMarkdown';
import { LocalizedText } from '../../localization/LocalizedText';
import type { StageProps } from '../../types';
import { interfaceMessages } from '../messages';
import PassphraseCheckStatus from './PassphraseCheckStatus';
import { passphraseLengthRules } from './passphraseRules';
import { usePassphrase } from './usePassphrase';

type AnonymisationProps = StageProps<'Anonymisation'>;

/** How the passphrase was put in force on this visit to the stage. */
type EnteredHere = 'chosen' | 'verified';

const successMessages = {
  chosen: interfaceMessages.passphraseSet,
  verified: interfaceMessages.passphraseAccepted,
  earlier: interfaceMessages.passphraseAlreadyEntered,
};

function AnonymisationInner(props: AnonymisationProps) {
  const intl = useAppIntl();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const { updateReady } = useReadyForNextStage();
  const {
    stage: { explanationText, validation },
  } = props;
  const { unlocked, passphraseChosen, encryptionUnavailable, unlock } =
    usePassphrase();
  // Set when the check starts rather than when it ends: the key is put in
  // force before the check resolves, and the stage must not first say the
  // passphrase was entered on an earlier visit.
  const [enteredHere, setEnteredHere] = useState<EnteredHere | null>(null);
  // Once a passphrase has been chosen in this interview, this stage only asks
  // for it again: it is checked, not chosen, so it needs no confirmation and
  // the length rules do not apply to it.
  const choosing = !passphraseChosen;
  const lengthRules = choosing ? passphraseLengthRules(validation) : {};
  const celebrate = useCelebrate(alertRef);
  const checking = useRef<Promise<FormSubmissionResult> | null>(null);

  const validateForm = useFormStore((state) => state.validateForm);
  const formStore = useContext(FormStoreContext);

  useEffect(() => {
    if (unlocked) {
      celebrate();
    }
  }, [unlocked, celebrate]);

  // From an effect rather than after the check, so that a check still under
  // way when the participant leaves cannot mark the next stage ready.
  useEffect(() => {
    if (unlocked || encryptionUnavailable) updateReady(true);
  }, [unlocked, encryptionUnavailable, updateReady]);

  useBeforeNext(async (direction) => {
    if (direction === 'backwards') {
      return true;
    }
    if (unlocked || encryptionUnavailable) {
      return true;
    }

    // Validate against the current values rather than reading the
    // render-time isValid, which is stale while a field validation is still
    // in flight and would block a genuinely valid direct-Next attempt.
    const valid = await validateForm();

    if (!valid || !formStore) {
      // requestSubmit (NOT native submit()) so the React onSubmit handler runs
      // and its preventDefault applies — native submit() bypasses it entirely
      // and performs a real GET navigation to `/?passphrase=…`, throwing the
      // participant out of the interview.
      formRef.current?.requestSubmit();
      return false;
    }

    // Leaving waits for the passphrase to be checked, so a rejected one keeps
    // the participant here with the error rather than moving on without it.
    // The form shows the check under way as it does for its own submit.
    return submitRegisteredForm(formStore, { showSubmitting: true });
  });

  const checkPassphrase = useCallback(
    async (candidate: unknown): Promise<FormSubmissionResult> => {
      if (typeof candidate !== 'string') {
        return {
          success: false,
          formErrors: [createMessageError(runtimeMessages.submissionFailed)],
        };
      }

      setEnteredHere(passphraseChosen ? 'verified' : 'chosen');
      const outcome = await unlock(candidate);
      if (outcome === 'incorrect') {
        setEnteredHere(null);
        return {
          success: false,
          fieldErrors: {
            passphrase: [
              createMessageError(runtimeMessages.passphraseIncorrect),
            ],
          },
        };
      }
      if (outcome === 'unavailable') {
        setEnteredHere(null);
        return {
          success: false,
          formErrors: [
            createMessageError(runtimeMessages.protectedAnswersUnavailable),
          ],
        };
      }
      setEnteredHere(outcome);
      return { success: true };
    },
    [passphraseChosen, unlock],
  );

  // The form's submit and the Next button can both ask for the check; while
  // one is under way, the other waits for its result instead of deriving the
  // key a second time.
  const handleSetPassphrase: FormSubmitHandler = useCallback(
    ({ passphrase: candidate }) => {
      if (checking.current) return checking.current;
      const attempt = checkPassphrase(candidate).finally(() => {
        checking.current = null;
      });
      checking.current = attempt;
      return attempt;
    },
    [checkPassphrase],
  );

  return (
    <>
      <EncryptionBackground thresholdPosition={unlocked ? 20 : 100} />
      <ScrollArea className="m-0 size-full">
        <div className="interface mx-auto min-h-full max-w-[80ch] flex-col">
          <MotionSurface
            noContainer
            spacing="lg"
            shadow="lg"
            className="bg-surface/80 max-w-2xl backdrop-blur-xs"
            initial={{
              scale: 0.8,
              opacity: 0,
              y: 50,
            }}
            animate={{
              scale: 1,
              opacity: 1,
              y: 0,
            }}
            transition={{
              type: 'spring',
              damping: 15,
              delay: 0.2,
            }}
          >
            <LocalizedText
              value={explanationText.title}
              render={<Heading level="h1" />}
            />
            <LocalizedMarkdown
              value={explanationText.body}
              allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
            />

            <AnimatePresence mode="popLayout">
              {encryptionUnavailable ? (
                <motion.div key="unavailable">
                  <Alert variant="warning">
                    <AlertDescription>
                      <AppMessage
                        message={runtimeMessages.protectedAnswersUnavailable}
                      />
                    </AlertDescription>
                  </Alert>
                </motion.div>
              ) : unlocked ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <Alert ref={alertRef} variant="success">
                    <AlertDescription>
                      <AppMessage
                        message={successMessages[enteredHere ?? 'earlier']}
                      />
                    </AlertDescription>
                  </Alert>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Surface className="mt-6" spacing="sm" shadow="sm">
                    <FormWithoutProvider
                      onSubmit={handleSetPassphrase}
                      ref={formRef}
                    >
                      {!choosing && (
                        <Paragraph>
                          <AppMessage
                            message={runtimeMessages.enterChosenPassphrase}
                          />
                        </Paragraph>
                      )}
                      <Field
                        component={PasswordField}
                        name="passphrase"
                        placeholder={intl.formatMessage(
                          runtimeMessages.passphrasePlaceholder,
                        )}
                        label={intl.formatMessage(runtimeMessages.passphrase)}
                        required
                        autoFocus
                        suppressPasswordManager
                        {...lengthRules}
                      />
                      {choosing && (
                        <Field
                          component={PasswordField}
                          name="passphrase-2"
                          placeholder={intl.formatMessage(
                            interfaceMessages.reenterPassphrase,
                          )}
                          label={intl.formatMessage(
                            interfaceMessages.confirmPassphrase,
                          )}
                          required
                          sameAs="passphrase"
                          suppressPasswordManager
                          {...lengthRules}
                        />
                      )}
                      <SubmitButton
                        key="submit"
                        aria-label={intl.formatMessage(
                          interfaceMessages.submit,
                        )}
                        type="submit"
                        icon={<ArrowRight />}
                        iconPosition="right"
                      >
                        <AppMessage message={commonMessages.continue} />
                      </SubmitButton>
                      <PassphraseCheckStatus className="mt-4" />
                    </FormWithoutProvider>
                  </Surface>
                </motion.div>
              )}
            </AnimatePresence>
          </MotionSurface>
        </div>
      </ScrollArea>
    </>
  );
}

export default function Anonymisation(props: AnonymisationProps) {
  return (
    <FormStoreProvider>
      <AnonymisationInner {...props} />
    </FormStoreProvider>
  );
}
