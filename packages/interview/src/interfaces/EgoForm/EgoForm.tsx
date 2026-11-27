'use client';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { shouldShowFieldError } from '@codaco/fresco-ui/form/hooks/useField';
import { formMessages } from '@codaco/fresco-ui/form/hooks/useForm';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
  selectIsFormDirty,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FlattenedErrors,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { springs } from '@codaco/fresco-ui/motion';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';

import { useTrack } from '../../analytics/useTrack';
import { buildProtocolFieldErrors } from '../../forms/buildProtocolFieldErrors';
import { submitRegisteredForm } from '../../forms/submitRegisteredForm';
import useFormReadyToContinue from '../../forms/useFormReadyToContinue';
import useProtocolForm from '../../forms/useProtocolForm';
import useBeforeNext from '../../hooks/useBeforeNext';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useScrolledToBottom } from '../../hooks/useScrolledToBottom';
import { useStageSelector } from '../../hooks/useStageSelector';
import { interfaceTextMessages } from '../../i18n/interfaceTextMessages';
import { getEgoAttributes } from '../../selectors/session';
import { updateEgo } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { BeforeNextFunction, StageProps } from '../../types';
import { interfaceMessages } from '../messages';
import ScrollDownIcon from './ScrollDownIcon';

type EgoFormProps = StageProps<'EgoForm'>;

const EgoFormInner = (props: EgoFormProps) => {
  const { stage } = props;

  const { form } = stage;

  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const track = useTrack();

  const { isValid: isFormValid } = useFormMeta();
  // A live comparison against the values the fields registered with, not the
  // store's sticky `isDirty`. The sticky flag never returns to false once
  // anything has been typed, so a participant who changed an answer and then
  // put it back was still asked whether to discard changes they no longer had.
  const isFormDirty = useFormStore(selectIsFormDirty);
  const formStoreApi = useContext(FormStoreContext);
  const validateForm = useFormStore((s) => s.validateForm);
  const requestErrorFocus = useFormStore((s) => s.requestErrorFocus);
  const formErrors = useFormStore((s) => s.errors);
  const formErrorsRef = useRef<FlattenedErrors>(formErrors);
  useLayoutEffect(() => {
    formErrorsRef.current = formErrors;
  }, [formErrors]);

  const fields = useFormStore((s) => s.fields);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { hasScrolledToBottom, sentinelRef } =
    useScrolledToBottom(scrollAreaRef);

  // Show the nudge after 15s of inactivity. A field change, or any press,
  // key or scroll inside the form, hides it and restarts the wait. Once the
  // participant has reached the bottom, the nudge never shows again.
  const [nudgeVisible, setNudgeVisible] = useState(false);
  // Mirrors `nudgeVisible` for the event handlers. A scroll fires on every
  // frame, so the wait is restarted without touching React state unless the
  // nudge is actually showing.
  const nudgeVisibleRef = useRef(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const restartNudgeTimer = useCallback(() => {
    clearTimeout(nudgeTimerRef.current);
    if (nudgeVisibleRef.current) {
      nudgeVisibleRef.current = false;
      setNudgeVisible(false);
    }
    if (hasScrolledToBottom) return;
    nudgeTimerRef.current = setTimeout(() => {
      nudgeVisibleRef.current = true;
      setNudgeVisible(true);
    }, 15000);
  }, [hasScrolledToBottom]);

  useEffect(() => {
    restartNudgeTimer();
    return () => clearTimeout(nudgeTimerRef.current);
  }, [fields, restartNudgeTimer]);

  const { updateReady: setIsReadyForNext } = useReadyForNextStage();
  const egoAttributes = useStageSelector(getEgoAttributes);

  const {
    formContent,
    toAttributePatch,
    componentByVariable,
    fieldComponents,
    variableByFieldPath,
  } = useProtocolForm({
    form,
    initialValues: Object.entries(egoAttributes).reduce<
      Record<string, FieldValue>
    >((values, [name, value]) => {
      values[name] = value;
      return values;
    }, {}),
  });

  // Audit sweep: the input control comes from the codebook entry. The shared
  // `FormFieldSchema` has no `component` key of its own, so the previous
  // `'component' in field` test recorded 'unknown' for every field, always.
  useEffect(() => {
    track('form_opened', {
      form_kind: 'ego',
      field_details: fieldComponents,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beforeNext: BeforeNextFunction = async (direction, intent) => {
    // If direction is backwards, and the form is invalid, check if the user
    // wants to proceed anyway (causing the form to be reset)
    if (direction === 'backwards' || intent === 'jump') {
      if (isFormDirty && !isFormValid) {
        const result = await openDialog({
          type: 'choice',
          title: <AppMessage message={interfaceMessages.discardChangesTitle} />,
          description: (
            <AppMessage message={interfaceMessages.discardChangesDescription} />
          ),
          intent: 'destructive',
          actions: {
            primary: {
              label: (
                <AppMessage message={interfaceTextMessages['buttons.yes']} />
              ),
              value: true,
            },
            cancel: {
              label: <AppMessage message={commonMessages.cancel} />,
              value: false,
            },
          },
        });
        if (result) {
          track('form_dismissed_without_save', { form_kind: 'ego' });
        }
        return !!result;
      }

      // if form is valid submit the form and proceed backwards
      if (isFormDirty && isFormValid) {
        if (!formStoreApi || !(await submitRegisteredForm(formStoreApi))) {
          return false;
        }
      }

      return true;
    }

    // Validate form and submit if valid
    const formIsValid = await validateForm();
    if (formIsValid) {
      return formStoreApi ? submitRegisteredForm(formStoreApi) : false;
    }

    const fieldErrorEntries = buildProtocolFieldErrors(
      formErrorsRef.current,
      form.fields,
      componentByVariable,
      variableByFieldPath,
    );
    track('form_validation_failed', {
      form_kind: 'ego',
      field_errors: fieldErrorEntries,
    });

    // Ask the form to move to its first invalid question. The form runs that
    // from a layout effect on the commit that renders these errors, so focus
    // lands on the control itself rather than waiting on a timer with focus
    // parked on the document body.
    requestErrorFocus();

    return false;
  };

  useBeforeNext(beforeNext);

  const handleSubmitForm: FormSubmitHandler = useCallback(
    async (formData: Record<string, FieldValue>) => {
      const patchResult = toAttributePatch(formData);

      if (!patchResult.success) {
        return {
          success: false,
          formErrors: [createMessageError(formMessages.submitFailed)],
        };
      }

      await dispatch(updateEgo(patchResult.patch)).unwrap();
      track('form_submitted', { form_kind: 'ego' });
      return { success: true };
    },
    [dispatch, toAttributePatch, track],
  );

  const isReady = useFormReadyToContinue(hasScrolledToBottom);
  useEffect(() => {
    setIsReadyForNext(isReady);
  }, [isReady, setIsReadyForNext]);

  // Guidance never competes with an error. Once a question has been marked
  // wrong, the error is the thing to read, and a second message asking the
  // participant to keep scrolling is noise at best.
  //
  // Keyed on errors that are actually ON SCREEN, not on the store's error map:
  // every focus-out validates the field it leaves, so a question the
  // participant tabbed through without answering holds an error that nothing
  // renders — and gating on the map would silently retire the guidance for
  // exactly the participant who has not scrolled yet.
  const hasVisibleFieldErrors = useFormStore((s) => {
    for (const [name, field] of s.fields) {
      // `validateOnChange` is off for every protocol-driven field, so an error
      // is shown only once the field is dirty and has been blurred.
      if (shouldShowFieldError(field, s.getFieldErrors(name), false)) {
        return true;
      }
    }
    return false;
  });
  const showScrollNudge =
    nudgeVisible && !hasScrolledToBottom && !hasVisibleFieldErrors;

  const scrollToBottom = useCallback(() => {
    scrollAreaRef.current?.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  return (
    // The guidance callout floats over the bottom of the scroll region rather
    // than taking a row of its own. A row of its own shortened the scroller
    // whenever the callout appeared, which moved the scrollbar and the bottom
    // fade with it. Floating, it covers whatever is at the bottom of the
    // viewport, so it gives way as soon as the participant acts: any press, key
    // or scroll inside the form hides it, and the 15s timer re-arms from there.
    <div className="relative flex size-full min-h-0 flex-col">
      <ScrollArea
        className="m-0 min-h-0 w-full flex-1"
        ref={scrollAreaRef}
        // Capture on the scroll region only — the callout is a sibling, so its
        // own button is never dismissed out from under the press that
        // activates it.
        onPointerDownCapture={restartNudgeTimer}
        onKeyDownCapture={restartNudgeTimer}
        onScroll={restartNudgeTimer}
      >
        <div className="interface mx-auto max-w-[80ch]">
          <Surface spacing="lg" shadow="lg">
            <FormWithoutProvider onSubmit={handleSubmitForm}>
              {formContent}
            </FormWithoutProvider>
          </Surface>
        </div>
        <div ref={sentinelRef} aria-hidden />
      </ScrollArea>
      <AnimatePresence>
        {showScrollNudge && (
          <motion.output
            aria-live="polite"
            // oxlint-disable-next-line tailwindcss/no-unknown-classes -- semantic marker matching e2e scenario ids
            className="scroll-nudge absolute inset-x-0 bottom-4 mx-auto flex w-fit"
            initial={{ y: '100%', opacity: 0 }}
            animate={{
              y: 0,
              opacity: 1,
              transition: springs.bouncy,
            }}
            exit={{ y: '100%', opacity: 0 }}
          >
            <IconButton
              variant="default-inverted"
              color="secondary"
              onClick={scrollToBottom}
              icon={<ScrollDownIcon />}
              // Screen-reader text stays English.
              aria-label="Scroll to see more questions"
              lang="en"
            />
          </motion.output>
        )}
      </AnimatePresence>
    </div>
  );
};

const EgoForm = (props: EgoFormProps) => {
  return (
    <FormStoreProvider>
      <EgoFormInner {...props} />
    </FormStoreProvider>
  );
};

export default EgoForm;
