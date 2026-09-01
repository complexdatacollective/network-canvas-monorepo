import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { shouldShowFieldError } from '@codaco/fresco-ui/form/hooks/useField';
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
import Surface, { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { useTrack } from '../../analytics/useTrack';
import { buildProtocolFieldErrors } from '../../forms/buildProtocolFieldErrors';
import { formValuesToAttributePatch } from '../../forms/formValuesToAttributePatch';
import { submitRegisteredForm } from '../../forms/submitRegisteredForm';
import useProtocolForm from '../../forms/useProtocolForm';
import useBeforeNext from '../../hooks/useBeforeNext';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useScrolledToBottom } from '../../hooks/useScrolledToBottom';
import { useStageSelector } from '../../hooks/useStageSelector';
import { getEgoAttributes } from '../../selectors/session';
import { updateEgo } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { BeforeNextFunction, StageProps } from '../../types';

type EgoFormProps = StageProps<'EgoForm'>;

const EgoFormInner = (props: EgoFormProps) => {
  const { stage } = props;

  const { form, introductionPanel } = stage;

  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const track = useTrack();

  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [interactionCount, setInteractionCount] = useState(0);
  const noteInteraction = useCallback(() => {
    setInteractionCount((count) => count + 1);
  }, []);

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

  // Show nudge after 15s of inactivity. Reset on field changes and on any
  // deliberate interaction with the form.
  // Once the user has scrolled to the bottom, permanently hide the nudge.
  useEffect(() => {
    setNudgeVisible(false);
    if (hasScrolledToBottom) return;
    const timer = setTimeout(() => setNudgeVisible(true), 15000);
    return () => clearTimeout(timer);
  }, [fields, hasScrolledToBottom, interactionCount]);

  const { updateReady: setIsReadyForNext } = useReadyForNextStage();
  const egoAttributes = useStageSelector(getEgoAttributes);

  const {
    fieldComponents,
    coerceValues,
    componentByVariable,
    variableByFieldPath,
  } = useProtocolForm({
    fields: form.fields,
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
      field_details: form.fields.map(
        (f) => componentByVariable[f.variable] ?? 'unknown',
      ),
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
          title: 'Discard changes?',
          description:
            'This form contains invalid data, so it cannot be saved. If you continue it will be reset, and your changes will be lost. Do you want to discard your changes?',
          intent: 'destructive',
          actions: {
            primary: { label: 'Discard changes', value: true },
            cancel: { label: 'Keep changes', value: false },
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
      const coerced = coerceValues(formData);
      const stageFieldIds = form.fields.map((f) => f.variable);
      const patchResult = formValuesToAttributePatch(coerced, stageFieldIds);

      if (!patchResult.success) {
        return {
          success: false,
          formErrors: ['An error occurred while submitting the form.'],
        };
      }

      await dispatch(updateEgo(patchResult.patch)).unwrap();
      track('form_submitted', { form_kind: 'ego' });
      return { success: true };
    },
    [coerceValues, dispatch, form.fields, track],
  );

  useEffect(() => {
    if (!isFormValid) {
      setIsReadyForNext(false);
      return;
    }

    setIsReadyForNext(true);
  }, [isFormValid, setIsReadyForNext]);

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
    // The guidance callout sits BELOW the scroll region rather than floating
    // over it. As an overlay it necessarily covered whatever happened to be at
    // the bottom of the viewport — a question, an option, an error — at every
    // scroll position; reserving space at the end of the content would only
    // have cleared the very bottom. Taking its own row shortens the scroller
    // instead, so there is no position at any viewport size where a question
    // can pass underneath it.
    <div className="flex size-full min-h-0 flex-col">
      <ScrollArea
        className="m-0 min-h-0 w-full flex-1"
        ref={scrollAreaRef}
        // Any deliberate interaction with the form means the participant does
        // not need the nudge right now. Capture on the scroll region only —
        // the callout is a sibling, so its own button is never dismissed out
        // from under the press that activates it. The 15s timer re-arms from
        // here, so it can come back after genuine inactivity.
        onPointerDownCapture={noteInteraction}
        onKeyDownCapture={noteInteraction}
      >
        <div className="interface mx-auto max-w-[80ch] flex-col">
          <Surface spacing="lg" shadow="lg">
            <Heading level="h1">{introductionPanel.title}</Heading>
            <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
              {introductionPanel.text}
            </RenderMarkdown>
          </Surface>
          <Surface spacing="lg" shadow="lg">
            <FormWithoutProvider onSubmit={handleSubmitForm}>
              {fieldComponents}
            </FormWithoutProvider>
          </Surface>
        </div>
        <div ref={sentinelRef} aria-hidden />
      </ScrollArea>
      <AnimatePresence>
        {showScrollNudge && (
          <MotionSurface
            noContainer
            floating
            spacing="xs"
            shadow="xs"
            role="status"
            aria-live="polite"
            className="scroll-nudge mx-auto mt-2 mb-4 flex shrink-0"
            initial={{ y: '100%' }}
            animate={{
              y: 0,
              transition: { type: 'spring', stiffness: 200, damping: 15 },
            }}
            exit={{ y: '200%' }}
          >
            <button
              type="button"
              onClick={scrollToBottom}
              className="flex items-center gap-2"
            >
              <motion.div
                aria-hidden="true"
                animate={{
                  y: [0, 7, 0, 7, 0],
                }}
                transition={{
                  duration: 2,
                  ease: 'easeInOut',
                  repeat: Number.POSITIVE_INFINITY,
                }}
              >
                <ChevronDown size="24" />
              </motion.div>
              <Heading level="label" margin="none">
                Scroll to see more questions
              </Heading>
              <motion.div
                aria-hidden="true"
                animate={{
                  y: [0, 7, 0, 7, 0],
                }}
                transition={{
                  duration: 2,
                  ease: 'easeInOut',
                  repeat: Number.POSITIVE_INFINITY,
                }}
              >
                <ChevronDown size="24" />
              </motion.div>
            </button>
          </MotionSurface>
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
