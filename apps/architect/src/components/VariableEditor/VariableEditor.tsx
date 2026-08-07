import { get } from 'es-toolkit/compat';
import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import * as z from 'zod/mini';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { Variable } from '@codaco/protocol-validation';
import { Layout, Section } from '~/components/EditorLayout';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import {
  getVariablesForSubject,
  makeGetVariable,
  makeGetVariableWithEntity,
} from '~/selectors/codebook';
import { validations } from '~/utils/validations';

import {
  assembleSynthetic,
  SYNTHETIC_ENABLED_FIELD,
  type SyntheticDraftContext,
  validateAssembledVariable,
} from './syntheticDraft';
import SyntheticSection from './SyntheticSection';

/**
 * The variable editor's form body, opened from an editable VariablePill.
 *
 * One draft form covers the variable's name and its synthetic metadata; a
 * save is a single atomic `updateVariableByUUID` dispatch that CLAIMS the
 * optional keys (`component`/`options`/`parameters`/`validation`/`synthetic`)
 * so a section turned off deletes its stored data rather than leaving it
 * stale. One dispatch is also one undo step.
 */

/**
 * The optional variable properties the editor claims on save. Claimed keys
 * are deleted and only reinstated when the configuration carries them; `name`
 * is never claimed (merge is correct), and `readOnly`/`encrypted` must stay
 * unclaimed.
 */
const CLAIMED_PROPERTIES = [
  'component',
  'options',
  'parameters',
  'validation',
  'synthetic',
] as const;

export type VariableEditorProps = {
  uuid: string;
  formId: string;
  /** Renders the enlarged-pill header around the connected name field. */
  renderHeader: (nameField: React.ReactNode) => React.ReactNode;
  onSaved: (nextName: string) => void;
  onCancelled: () => void;
  /**
   * Registers the host's close guard: resolves true when closing is allowed
   * (confirming first when the draft is dirty). The host calls it for
   * Escape/backdrop dismissal so every path shares one confirmation.
   */
  registerCloseGuard?: (guard: () => Promise<boolean>) => void;
};

function VariableEditorInner({
  uuid,
  formId,
  renderHeader,
  onSaved,
  onCancelled,
  registerCloseGuard,
}: VariableEditorProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const { isDirty, isSubmitting } = useFormMeta();

  const variable = useAppSelector(
    useMemo(() => makeGetVariable(uuid), [uuid]),
  ) as Variable | null;
  const entityInfo = useAppSelector(
    useMemo(() => makeGetVariableWithEntity(uuid), [uuid]),
  );

  const subject = useMemo(
    () => ({
      entity: entityInfo?.entity ?? 'node',
      type: entityInfo?.entityType ?? undefined,
    }),
    [entityInfo?.entity, entityInfo?.entityType],
  );
  const existingVariables = useAppSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );
  const existingVariableNames = useMemo(
    () =>
      Object.entries(existingVariables ?? {})
        .filter(([variableId]) => variableId !== uuid)
        .map(([, existingVariable]) => get(existingVariable, 'name')),
    [existingVariables, uuid],
  );

  const context: SyntheticDraftContext | null = useMemo(() => {
    if (!variable) return null;
    return {
      variable,
      options:
        'options' in variable && Array.isArray(variable.options)
          ? (variable.options as { label: string; value: string | number }[])
          : [],
      required: Boolean(
        'validation' in variable && variable.validation?.required,
      ),
    };
  }, [variable]);

  /** The name rules, in the order their messages are most useful. */
  const nameError = useCallback(
    (value: unknown): string | undefined => {
      const name = String(value ?? '').trim();
      return (
        validations.required('You must enter a variable name')(name) ??
        validations.uniqueByList(existingVariableNames)(name) ??
        validations.allowedVariableName()(name)
      );
    },
    [existingVariableNames],
  );

  /**
   * Those rules as one live field validation. They run again at submit, so a
   * name that slipped past — an untouched field, say — still cannot be saved.
   */
  const nameValidation = useMemo(
    () => ({
      schema: z.string().check((ctx) => {
        const error = nameError(ctx.value);
        if (error) {
          ctx.issues.push({ code: 'custom', message: error, input: ctx.value });
        }
      }),
      hint: 'A unique name for this variable',
    }),
    [nameError],
  );

  const guardedClose = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    const confirmed = await confirm({
      title: 'Discard changes?',
      description:
        'Your edits to this variable have not been saved and will be lost.',
      confirmLabel: 'Discard changes',
      onConfirm: () => undefined,
    });
    return confirmed === true;
  }, [confirm, isDirty]);

  useEffect(() => {
    registerCloseGuard?.(guardedClose);
  }, [guardedClose, registerCloseGuard]);

  const handleCancel = useCallback(() => {
    void guardedClose().then((allowed) => {
      if (allowed) onCancelled();
    });
  }, [guardedClose, onCancelled]);

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): FormSubmissionResult => {
      if (!variable || !context) return { success: false };

      const name = String(values.name ?? '').trim();
      const error = nameError(name);
      if (error) {
        return {
          success: false,
          fieldErrors: { name: [error] },
        } as FormSubmissionResult;
      }

      const synthetic = values[SYNTHETIC_ENABLED_FIELD]
        ? assembleSynthetic(context, values)
        : undefined;

      // The synthetic controls' bounds are native input attributes, which
      // this form does not enforce; the codebook schema does, and a draft it
      // rejects would be saved as a protocol that no longer validates.
      const syntheticErrors = validateAssembledVariable(context, synthetic);
      if (syntheticErrors) {
        return { success: false, ...syntheticErrors };
      }

      // Every claimed key must be re-supplied when it should survive; the
      // sections this editor does not yet edit pass straight through.
      const configuration: Partial<Variable> = {
        name,
        ...('component' in variable && variable.component !== undefined
          ? { component: variable.component }
          : {}),
        ...('options' in variable && variable.options !== undefined
          ? { options: variable.options }
          : {}),
        ...('parameters' in variable && variable.parameters !== undefined
          ? { parameters: variable.parameters }
          : {}),
        ...('validation' in variable && variable.validation !== undefined
          ? { validation: variable.validation }
          : {}),
        ...(synthetic ? { synthetic } : {}),
      } as Partial<Variable>;

      void dispatch(
        updateVariableByUUID(uuid, configuration, CLAIMED_PROPERTIES),
      );
      onSaved(name);
      return { success: true };
    },
    [context, dispatch, nameError, onSaved, uuid, variable],
  );

  if (!variable || !context) return null;

  const nameField = (
    <Field
      name="name"
      label="Variable name"
      labelHidden
      component={InputField}
      initialValue={variable.name}
      placeholder="Enter a variable name..."
      required
      autoFocus
      // Checked as the author types rather than only on submit: a name
      // colliding with another variable of the same entity is the mistake
      // this editor exists to catch, and a submit-time-only message would
      // leave the pill header looking accepted until then.
      custom={nameValidation}
      validateOnChange
      // Well under the one-second default: this is a short identifier being
      // checked against a list already in memory, and the author is looking
      // straight at the field as they type it.
      validateOnChangeDelay={300}
      className="h-full w-full rounded-l-none! outline-none!"
    />
  );

  return (
    <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
      {renderHeader(nameField)}

      <div className="mt-4 max-h-[55vh] w-full overflow-y-auto">
        <Layout>
          <Section title="Variable type" layout="vertical" required={false}>
            <p>
              This is a {variable.type} variable. Variable type cannot be
              changed after creation. Changes made here affect every stage that
              uses this variable.
            </p>
          </Section>
          <SyntheticSection context={context} />
        </Layout>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <Button
          size="sm"
          variant="default"
          icon={<X aria-hidden />}
          disabled={isSubmitting}
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <SubmitButton
          form={formId}
          size="sm"
          color="primary"
          icon={<Check aria-hidden />}
          // An untouched draft has nothing to save, and offering to save it
          // would put a redundant entry on the undo timeline.
          disabled={!isDirty || isSubmitting}
        >
          Save Changes
        </SubmitButton>
      </div>
    </FormWithoutProvider>
  );
}

export default function VariableEditor(props: VariableEditorProps) {
  return (
    <FormStoreProvider>
      <VariableEditorInner {...props} />
    </FormStoreProvider>
  );
}
