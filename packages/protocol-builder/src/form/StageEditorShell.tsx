import { LayoutGroup } from 'motion/react';
import {
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import FormErrorsList from '@codaco/fresco-ui/form/FormErrors';
import { useForm } from '@codaco/fresco-ui/form/hooks/useForm';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { StageEditorController } from '../controller.ts';
import {
  InvalidProtocolDraftError,
  type ProtocolBuilderSnapshot,
  type StageFormDraft,
} from '../session.ts';
import { SectionOutlineStore } from './outlineStore.ts';
import SectionOutline from './SectionOutline.tsx';
import {
  type DormantField,
  stageDraftFromSubmission,
} from './stageDraftFromSubmission.ts';
import {
  StageEditorFormContext,
  type StageFormStoreApi,
} from './stageEditorContext.ts';

/**
 * What a host needs to render its own action chrome for the editor.
 *
 * The package owns the form and knows whether it can be submitted; the host
 * owns where the buttons live and what else sits beside them. `formId` is the
 * whole contract for a submit control rendered outside the form element.
 */
export type StageEditorActionContext = Readonly<{
  controller: StageEditorController;
  formId: string;
  readOnly: boolean;
}>;

export type StageEditorShellProps = Readonly<{
  controller: StageEditorController;
  /** The host's action chrome. Receives the controller and the form id. */
  actions?: (context: StageEditorActionContext) => ReactNode;
  children: ReactNode;
  className?: string;
}>;

/**
 * The one form every stage editor is built inside.
 *
 * Every named editor composes sections into this shell, and the shell owns
 * everything a stage editor does regardless of which stage it is editing:
 * one form store, the section outline, the submit that flushes the form into
 * the session, and a slot where the host puts its own buttons.
 *
 * The store provider is keyed by the stage being edited because Fresco forms
 * have no reinitialise: opening a different stage is a different form.
 */
export default function StageEditorShell(props: StageEditorShellProps) {
  const { identity } = props.controller.snapshot.editedSection;

  return (
    <FormStoreProvider key={`${identity.type}:${identity.id}`}>
      <StageEditorFormBody {...props} />
    </FormStoreProvider>
  );
}

function StageEditorFormBody({
  controller,
  actions,
  children,
  className,
}: StageEditorShellProps) {
  const storeApi = useContext(FormStoreContext);
  const formRef = useRef<HTMLFormElement>(null);
  const [submitFailed, setSubmitFailed] = useState(false);
  const outline = useMemo(() => new SectionOutlineStore(), []);
  const { snapshot, formId } = controller;
  const readOnly = snapshot.access.mode !== 'editable';
  const committedFields = useCommittedFields(snapshot);

  const handleSubmit = useCallback<FormSubmitHandler>(
    async (values) => {
      if (storeApi === undefined) {
        return { success: false, formErrors: [UNAVAILABLE_MESSAGE] };
      }
      if (readOnly) {
        return { success: false, formErrors: [READ_ONLY_MESSAGE] };
      }

      controller.changeFields((current) =>
        stageDraftFromSubmission({
          currentFields: current,
          submittedValues: values as Record<string, FieldValue>,
          dormantFields: dormantFieldsOf(storeApi),
        }),
      );

      try {
        await controller.finish();
        setSubmitFailed(false);
        return { success: true };
      } catch (error) {
        setSubmitFailed(true);
        return {
          success: false,
          formErrors:
            error instanceof InvalidProtocolDraftError
              ? error.issues.map((issue) => issue.message)
              : [failureMessage(error)],
        };
      }
    },
    [controller, readOnly, storeApi],
  );

  const { formProps, formErrors } = useForm({
    onSubmit: handleSubmit,
    onSubmitInvalid: (errors) => {
      setSubmitFailed(true);
      // Scoped to this form's own markup: an item dialog open over the editor
      // renders the same field names, and an unscoped search can hand this
      // form's failed submit a control belonging to the dialog above it.
      focusFirstError(errors, formRef.current);
    },
  });

  const layoutGroupId = useId();
  const context = useMemo(
    () =>
      storeApi === undefined
        ? null
        : {
            formId,
            controller,
            storeApi,
            committedFields,
            identity: snapshot.editedSection.identity,
            readOnly,
            outline,
            submitFailed,
          },
    [
      committedFields,
      controller,
      formId,
      outline,
      readOnly,
      snapshot.editedSection.identity,
      storeApi,
      submitFailed,
    ],
  );

  if (context === null) return null;

  return (
    <StageEditorFormContext value={context}>
      <div className={cx('@container flex w-full flex-col gap-6', className)}>
        <div className="grid grid-cols-1 gap-6 @min-[60rem]:grid-cols-[16rem_minmax(0,1fr)] @min-[60rem]:gap-10">
          <SectionOutline />
          <form
            id={formId}
            ref={formRef}
            noValidate // The form reports its own problems; the browser's differ.
            onSubmit={formProps.onSubmit}
            className="flex min-w-0 flex-col"
          >
            <LayoutGroup id={layoutGroupId}>
              {formErrors && (
                <FormErrorsList key="form-errors" errors={formErrors} />
              )}
              {children}
            </LayoutGroup>
          </form>
        </div>
        {actions?.({ controller, formId, readOnly })}
      </div>
    </StageEditorFormContext>
  );
}

/**
 * The draft as it was last agreed with the host, held steady while the
 * researcher works.
 *
 * Every field seeds its `initialValue` from this, and `initialValue` is what
 * the form compares against to decide a field is dirty — so it has to be the
 * saved state, not a live mirror of what is being typed. It moves only when
 * nothing local is outstanding, which is exactly when the session's draft IS
 * the agreed one.
 */
function useCommittedFields(snapshot: ProtocolBuilderSnapshot): StageFormDraft {
  const committed = useRef(snapshot.editedSection.fields);
  if (snapshot.pendingCommands.length === 0) {
    committed.current = snapshot.editedSection.fields;
  }
  return committed.current;
}

const READ_ONLY_MESSAGE =
  'This stage is read-only, so your changes were not saved. Take over editing and try again.';

const UNAVAILABLE_MESSAGE =
  'This stage could not be saved because its form is no longer available. Reopen the stage and try again.';

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'This stage could not be saved. Wait a moment and try again.';
}

/**
 * Every field the form is holding but not showing, as the store parked it.
 *
 * The submitted values cover only mounted fields, so without this a value
 * hidden behind a collapsed group would look identical to one that was
 * deliberately thrown away.
 */
function dormantFieldsOf(storeApi: StageFormStoreApi): DormantField[] {
  return [...storeApi.getState().dormantValues].map(([name, field]) => ({
    name,
    ...(field.path === undefined ? {} : { path: field.path }),
    value: field.value,
  }));
}
