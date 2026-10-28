'use client';
import {
  forwardRef,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import {
  createMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { formMessages } from '@codaco/fresco-ui/form/hooks/useForm';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
  selectIsFormDirty,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FormSubmissionResult,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import type { TitlelessForm } from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import type { FormKind } from '../../analytics/events';
import { useTrack } from '../../analytics/useTrack';
import {
  buildProtocolFieldErrors,
  type ProtocolFieldErrorEntry,
} from '../../forms/buildProtocolFieldErrors';
import QuestionFlow from '../../forms/QuestionFlow';
import { submitRegisteredForm } from '../../forms/submitRegisteredForm';
import useFormReadyToContinue from '../../forms/useFormReadyToContinue';
import useProtocolForm from '../../forms/useProtocolForm';
import useBeforeNext from '../../hooks/useBeforeNext';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useScrolledToBottom } from '../../hooks/useScrolledToBottom';
import type { Subject } from '../../selectors/forms';
import { makeGetCodebookVariablesForNodeType } from '../../selectors/protocol';
import type { AttributePatch } from '../../store/entityAttributePatch';
import type { BeforeNextFunction, Direction } from '../../types';
import { usePassphrase } from '../Anonymisation/usePassphrase';
import { useProtectedFormValues } from '../Anonymisation/useProtectedFormValues';
import discardChangesDialog, {
  failedCheckReason,
} from '../discardChangesDialog';
import { interfaceMessages } from '../messages';
import JoinedSlides from './JoinedSlides';

type SlidesFormAnalyticsProps = {
  form_kind: FormKind;
};

type SlidesFormProps<T extends NcNode | NcEdge = NcNode | NcEdge> = {
  form: TitlelessForm;
  items: T[];
  subject: Subject;
  /**
   * Saves the slide's answers. A refused save must resolve to a failed result,
   * which keeps the slide and its answers in place with the error shown.
   */
  updateItem: (
    id: string,
    attributePatch: AttributePatch,
  ) => Promise<FormSubmissionResult>;
  moveForward: () => void | Promise<void>;
  renderHeader: (item: T) => ReactNode;
  /**
   * Where the header is joined to the form: `top` (the default) above it;
   * `start` beside it on the reading-start side while the stage is wider than
   * it is tall, and above it otherwise (see JoinedSlides).
   */
  headerPlacement?: 'top' | 'start';
};

type SlideHandle = {
  validate: () => Promise<boolean>;
  submit: () => Promise<boolean>;
  isDirty: () => boolean;
  /**
   * Why answers that failed their checks cannot be saved, for the warning
   * before leaving.
   */
  unsavedReason: () => MessageDescriptor;
  /**
   * Ask the slide's form to move to its first invalid question. The form does
   * that from a layout effect on the commit that renders the errors, so this
   * returns before focus moves — deliberately: calling it synchronously after
   * `validate()` would otherwise focus before the error render is committed
   * and lose the focus to that commit's own restoration.
   */
  requestErrorFocus: () => void;
  getFieldErrors: () => ProtocolFieldErrorEntry[];
};

type SlideContentProps = {
  item: NcNode | NcEdge;
  form: TitlelessForm;
  subject: Subject;
  submitButton: ReactNode;
  onUpdate: SlidesFormProps['updateItem'];
  onReadyChange: (ready: boolean) => void;
  /** Moves on once a chosen option leaves nothing in the form to answer. */
  onComplete: () => void;
  /** The slide was reached by the one before it moving on by itself. */
  focusFirst: boolean;
  form_kind: FormKind;
  /**
   * JoinedSlides lays the slide's answers out and owns the scroll area, the
   * header and the card. The slide renders the form alone, and reads how far
   * it has been scrolled from here.
   */
  scrollAreaRef: RefObject<HTMLElement | null>;
  /**
   * False until the answers can be given. Until then the card may not yet be
   * as tall as the answers, so how far they have been scrolled is judged only
   * from then.
   */
  live: boolean;
};

type SlideFormProps = SlideContentProps & {
  initialValues: Record<string, FieldValue>;
  unavailableVariables: readonly string[];
};

const SlideContentInner = forwardRef<SlideHandle, SlideFormProps>(
  function SlideContentInner(
    {
      item,
      form,
      subject,
      submitButton,
      onUpdate,
      onReadyChange,
      onComplete,
      focusFirst,
      form_kind,
      scrollAreaRef,
      live,
      initialValues,
      unavailableVariables,
    },
    ref,
  ) {
    const track = useTrack();
    const id = item[entityPrimaryKeyProperty];

    const {
      fieldComponents,
      toAttributePatch,
      componentByVariable,
      variableByFieldPath,
      passphraseNeeded,
    } = useProtocolForm({
      fields: form.fields,
      autoFocus: false,
      initialValues,
      subject,
      currentEntityId: id,
      unavailableVariables,
    });

    const handleSubmit: FormSubmitHandler = async (values) => {
      const patchResult = toAttributePatch(values);

      if (!patchResult.success) {
        return {
          success: false,
          formErrors: [createMessageError(formMessages.submitFailed)],
        };
      }

      const saved = await onUpdate(id, patchResult.patch);
      if (!saved.success) return saved;

      track('form_submitted', {
        form_kind,
        ...(form_kind === 'alter' || form_kind === 'alter_edge'
          ? { entity_id: id }
          : {}),
      });
      return { success: true };
    };

    const storeApi = useContext(FormStoreContext);
    const formErrors = useFormStore((s) => s.errors);
    const formErrorsRef = useRef(formErrors);
    useLayoutEffect(() => {
      formErrorsRef.current = formErrors;
    }, [formErrors]);

    const { hasScrolledToBottom, sentinelRef } = useScrolledToBottom(
      scrollAreaRef,
      { paused: !live },
    );

    const isReady = useFormReadyToContinue(hasScrolledToBottom);
    useEffect(() => {
      onReadyChange(isReady);
    }, [isReady, onReadyChange]);

    useEffect(() => {
      track('form_opened', {
        form_kind,
        field_details: form.fields.map(
          (f) => componentByVariable[f.variable] ?? 'unknown',
        ),
        ...(form_kind === 'alter' || form_kind === 'alter_edge'
          ? { entity_id: id }
          : {}),
      });
      // Fire once per slide mount (item id change → new mount via key prop in
      // parent AnimatePresence). Track is stable; deps include only the data
      // snapshot we want to capture at mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      validate: async () =>
        storeApi ? storeApi.getState().validateForm() : false,
      submit: async () => (storeApi ? submitRegisteredForm(storeApi) : false),
      // A live comparison against the values the fields registered with, not
      // the store's sticky `isDirty`. The sticky flag never returns to false
      // once anything has been typed, so a participant who changed an answer
      // and then put it back was still asked whether to discard changes they
      // no longer had.
      isDirty: () =>
        storeApi ? selectIsFormDirty(storeApi.getState()) : false,
      unsavedReason: () => failedCheckReason(passphraseNeeded),
      requestErrorFocus: () => storeApi?.getState().requestErrorFocus(),
      getFieldErrors: () =>
        buildProtocolFieldErrors(
          formErrorsRef.current,
          form.fields,
          componentByVariable,
          variableByFieldPath,
        ),
    }));

    return (
      <>
        <FormWithoutProvider
          onSubmit={handleSubmit}
          className="[&_.form-field-container]:break-inside-avoid"
        >
          {/* Wrap fields so the last field's :last-child match isn't broken by the hidden submit button. */}
          <QuestionFlow onComplete={onComplete} focusFirst={focusFirst}>
            {fieldComponents}
          </QuestionFlow>
          {submitButton}
        </FormWithoutProvider>
        <div ref={sentinelRef} aria-hidden />
      </>
    );
  },
);

/**
 * Stands in for a slide whose answers are protected by the interview
 * passphrase while that passphrase is not in force (or its answers are still
 * being decrypted), so nothing can be entered that could not be saved.
 */
const ProtectedSlide = forwardRef<
  SlideHandle,
  {
    reason: 'pending' | 'locked';
    onReadyChange: (ready: boolean) => void;
  }
>(function ProtectedSlide({ reason, onReadyChange }, ref) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const { lockedNotice } = usePassphrase();

  useEffect(() => {
    onReadyChange(false);
  }, [onReadyChange]);

  useImperativeHandle(ref, () => ({
    validate: async () => false,
    submit: async () => false,
    isDirty: () => false,
    unsavedReason: () => failedCheckReason(reason === 'locked'),
    requestErrorFocus: () => noticeRef.current?.focus(),
    getFieldErrors: () => [],
  }));

  const notice = reason !== 'pending' && (
    <Alert
      ref={noticeRef}
      tabIndex={-1}
      variant="info"
      className="tablet-portrait:min-w-lg focusable max-w-2xl"
    >
      <AlertDescription>
        <AppMessage message={lockedNotice} />
      </AlertDescription>
    </Alert>
  );

  return notice || null;
});

const NO_VARIABLES = {};

const SlideContent = forwardRef<SlideHandle, SlideContentProps>(
  function SlideContent(props, ref) {
    const { item, form, subject } = props;
    const getNodeVariables = useSelector(makeGetCodebookVariablesForNodeType);
    const variables =
      subject.entity === 'node' && subject.type
        ? getNodeVariables(subject.type)
        : NO_VARIABLES;
    const protectedValues = useProtectedFormValues(
      item,
      form.fields,
      variables,
    );

    if (protectedValues.status === 'pending') {
      return (
        <ProtectedSlide
          ref={ref}
          reason="pending"
          onReadyChange={props.onReadyChange}
        />
      );
    }

    if (protectedValues.status === 'locked') {
      return (
        <ProtectedSlide
          ref={ref}
          reason="locked"
          onReadyChange={props.onReadyChange}
        />
      );
    }

    return (
      <FormStoreProvider>
        <SlideContentInner
          ref={ref}
          {...props}
          initialValues={protectedValues.values}
          unavailableVariables={protectedValues.unavailable}
        />
      </FormStoreProvider>
    );
  },
);

export default function SlidesForm({
  items = [],
  subject,
  updateItem,
  moveForward,
  renderHeader,
  headerPlacement = 'top',
  form,
  form_kind,
}: SlidesFormProps & SlidesFormAnalyticsProps) {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const track = useTrack();

  const slideRef = useRef<SlideHandle | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const previousIndexRef = useRef(0);

  useEffect(() => {
    if (activeIndex !== previousIndexRef.current) {
      track('slides_form_slide_advanced', {
        slide_index: activeIndex,
        total_slides: items.length,
      });
      previousIndexRef.current = activeIndex;
    }
  }, [activeIndex, items.length, track]);

  const slideCallbackRef = useCallback((handle: SlideHandle | null) => {
    if (handle !== null) {
      slideRef.current = handle;
    }
  }, []);

  const { updateReady: setIsReadyForNext } = useReadyForNextStage();

  const [slideReady, setSlideReady] = useState(false);

  const [pendingDirection, setPendingDirection] = useState<Direction | null>(
    null,
  );

  // A new slide starts unready. Compared during render rather than in an
  // effect, so the new slide is never shown while the previous slide's
  // readiness still stands; the effect below is the one that reports it.
  const [readySlideIndex, setReadySlideIndex] = useState(activeIndex);
  if (readySlideIndex !== activeIndex) {
    setReadySlideIndex(activeIndex);
    setSlideReady(false);
  }

  useEffect(() => {
    setIsReadyForNext(slideReady);
  }, [setIsReadyForNext, slideReady]);

  // A slide already on its way to another one, or out of the stage, ignores
  // a second request to move: Next pressed while a completed form is moving
  // on by itself (or the other way round) would otherwise save and pass the
  // slide after it too.
  const navigating = useRef(false);
  // The arrival of the first item and each change from one item to the next
  // run on their own timeline; Next and Back wait for it to reach the point
  // where the answers can be given.
  const changing = useRef(true);
  const movingOnByItself = useRef(false);
  // The slide a completed form moved on to, which takes the focus: the
  // answer that had it left with the slide before.
  const [focusedSlide, setFocusedSlide] = useState<number | null>(null);

  const shownIndex = useRef(activeIndex);
  useLayoutEffect(() => {
    shownIndex.current = activeIndex;
  }, [activeIndex]);

  const moveOn = (index: number) => {
    // A slide still leaving after Next was pressed does not move on again.
    if (navigating.current || changing.current || index !== shownIndex.current)
      return;
    movingOnByItself.current = true;
    void Promise.resolve(moveForward()).finally(() => {
      movingOnByItself.current = false;
    });
  };

  const beforeNext: BeforeNextFunction = async (direction, intent) => {
    if (navigating.current || changing.current) return false;
    navigating.current = true;
    try {
      return await moveSlides(direction, intent);
    } finally {
      navigating.current = false;
    }
  };

  const moveSlides: BeforeNextFunction = async (direction, intent) => {
    if (items.length === 0) {
      return true;
    }

    setPendingDirection(direction);

    if (intent === 'jump') {
      const formIsValid = await slideRef.current?.validate();

      if (formIsValid) {
        return (await slideRef.current?.submit()) ?? false;
      }

      if (!slideRef.current?.isDirty()) {
        return true;
      }

      const discarded = await confirm({
        ...discardChangesDialog(slideRef.current?.unsavedReason()),
        onConfirm: () => {
          track('form_dismissed_without_save', { form_kind });
        },
      });

      return discarded === true;
    }

    if (direction === 'backwards') {
      // Every slide, the first included, is saved or its changes discarded
      // with the participant's agreement before going back.
      const formIsValid = await slideRef.current?.validate();

      if (formIsValid) {
        const submitted = await slideRef.current?.submit();
        if (!submitted) {
          return false;
        }
      } else if (slideRef.current?.isDirty()) {
        const discarded = await confirm({
          ...discardChangesDialog(slideRef.current?.unsavedReason()),
          onConfirm: () => {
            track('form_dismissed_without_save', { form_kind });
          },
        });
        if (discarded !== true) {
          return false;
        }
      }

      // Back from the first slide leaves the stage.
      if (activeIndex === 0) {
        return true;
      }

      setFocusedSlide(null);
      changing.current = true;
      setActiveIndex((prev) => prev - 1);
      return false;
    }

    // Forward direction
    const formIsValid = await slideRef.current?.validate();

    if (!formIsValid) {
      const errs = slideRef.current?.getFieldErrors?.() ?? [];
      track('form_validation_failed', { form_kind, field_errors: errs });
      slideRef.current?.requestErrorFocus();
      return false;
    }

    const submitted = await slideRef.current?.submit();
    if (!submitted) {
      return false;
    }

    if (activeIndex >= items.length - 1) {
      return true;
    }

    setFocusedSlide(movingOnByItself.current ? activeIndex + 1 : null);
    changing.current = true;
    setActiveIndex((prev) => prev + 1);
    return false;
  };

  useBeforeNext(beforeNext);

  const handleEnterSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    await moveForward();
    e.preventDefault();
  };

  const currentItem = items[activeIndex];

  if (!currentItem) {
    return null;
  }

  const renderSlide = (
    index: number,
    scrollAreaRef: RefObject<HTMLElement | null>,
    live: boolean,
  ) => {
    const item = items[index];
    if (!item) return null;
    return (
      <SlideContent
        ref={slideCallbackRef}
        item={item}
        form={form}
        subject={subject}
        onUpdate={updateItem}
        onReadyChange={setSlideReady}
        onComplete={() => moveOn(index)}
        // The answers take the focus once they can be given.
        focusFirst={focusedSlide === index && live}
        submitButton={
          <button
            type="submit"
            key="submit"
            aria-label={intl.formatMessage(interfaceMessages.submit)}
            hidden
            onClick={handleEnterSubmit}
          />
        }
        form_kind={form_kind}
        scrollAreaRef={scrollAreaRef}
        live={live}
      />
    );
  };

  return (
    <div className="flex w-full flex-auto overflow-hidden">
      <JoinedSlides
        index={activeIndex}
        direction={pendingDirection}
        placement={headerPlacement}
        renderHeader={(index) => {
          const item = items[index];
          return item ? renderHeader(item) : null;
        }}
        renderAnswers={renderSlide}
        onSettled={() => {
          changing.current = false;
        }}
      />
    </div>
  );
}
