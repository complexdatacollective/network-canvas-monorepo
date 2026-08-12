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
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FlattenedErrors,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import Surface, { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { useTrack } from '../../analytics/useTrack';
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

  const { isDirty: isFormDirty, isValid: isFormValid } = useFormMeta();
  const formStoreApi = useContext(FormStoreContext);
  const validateForm = useFormStore((s) => s.validateForm);
  const formErrors = useFormStore((s) => s.errors);
  const formErrorsRef = useRef<FlattenedErrors>(formErrors);
  useLayoutEffect(() => {
    formErrorsRef.current = formErrors;
  }, [formErrors]);

  const fields = useFormStore((s) => s.fields);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { hasScrolledToBottom, sentinelRef } =
    useScrolledToBottom(scrollAreaRef);

  // Show nudge after 15s of inactivity. Reset on field changes.
  // Once the user has scrolled to the bottom, permanently hide the nudge.
  useEffect(() => {
    setNudgeVisible(false);
    if (hasScrolledToBottom) return;
    const timer = setTimeout(() => setNudgeVisible(true), 15000);
    return () => clearTimeout(timer);
  }, [fields, hasScrolledToBottom]);

  const { updateReady: setIsReadyForNext } = useReadyForNextStage();
  const egoAttributes = useStageSelector(getEgoAttributes);

  const { fieldComponents, coerceValues, componentByVariable } =
    useProtocolForm({
      fields: form.fields,
      initialValues: Object.entries(egoAttributes).reduce<
        Record<string, FieldValue>
      >((values, [name, value]) => {
        if (value !== null) {
          values[name] = value;
        }
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

    const fieldErrorEntries: Array<{
      field_index: number;
      component: string;
      message: string;
    }> = [];
    const fieldErrors = formErrorsRef.current?.fieldErrors;
    if (fieldErrors) {
      for (const [name, messages] of Object.entries(fieldErrors)) {
        if (!Array.isArray(messages) || messages.length === 0) continue;
        const idx = form.fields.findIndex((f) => f.variable === name);
        if (idx === -1) continue;
        const component = componentByVariable[name] ?? 'unknown';
        for (const message of messages) {
          fieldErrorEntries.push({ field_index: idx, component, message });
        }
      }
    }
    track('form_validation_failed', {
      form_kind: 'ego',
      field_errors: fieldErrorEntries,
    });

    // Scroll to the first validation error after a tick so the store
    // update has propagated to React and error elements are rendered.
    setTimeout(() => {
      focusFirstError(formErrorsRef.current);
    }, 0);

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

  const showScrollNudge = nudgeVisible && !hasScrolledToBottom;

  const scrollToBottom = useCallback(() => {
    scrollAreaRef.current?.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  return (
    <>
      <ScrollArea className="m-0 size-full" ref={scrollAreaRef}>
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
            className="scroll-nudge absolute bottom-4 left-1/2 z-10 flex translate-x-[-50%]"
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
    </>
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
