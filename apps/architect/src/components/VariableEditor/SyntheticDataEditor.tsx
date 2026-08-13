import { Check, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import type { Variable } from '@codaco/protocol-validation';
import { Layout } from '~/components/EditorLayout';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubject } from '~/selectors/codebook';
import { getProtocol } from '~/selectors/protocol';

import {
  assembleSynthetic,
  collectComposerRenderings,
  SYNTHETIC_ENABLED_FIELD,
  type SyntheticDraftContext,
  validateAssembledVariable,
} from './syntheticDraft';
import SyntheticSection from './SyntheticSection';

type SyntheticDataEditorProps = {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
  uuid: string;
  formId: string;
  onCancelled: () => void;
  onSaved: () => void;
};

function SyntheticDataEditorInner({
  entity,
  type,
  uuid,
  formId,
  onCancelled,
  onSaved,
}: SyntheticDataEditorProps) {
  const dispatch = useAppDispatch();
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const variable = useAppSelector(
    (state) => getVariablesForSubject(state, subject)?.[uuid] ?? null,
  ) as Variable | null;
  // Where in the codebook the variable lives, and every NetworkComposer
  // rendering of it: the record schema judges the descriptor against those
  // stage fields as well as the variable itself (see composerOverlayIssues in
  // syntheticDraft.ts), so the draft context must carry them for the editor
  // to reach the same verdict the saved protocol will.
  const stages = useAppSelector((state) => getProtocol(state)?.stages);
  const composerRenderings = useMemo(
    () => collectComposerRenderings(stages, uuid, entity, type),
    [entity, stages, type, uuid],
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
      composerRenderings,
    };
  }, [variable, composerRenderings]);

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): FormSubmissionResult => {
      if (!context) return { success: false };

      const enabled = Boolean(values[SYNTHETIC_ENABLED_FIELD]);
      const synthetic = enabled
        ? assembleSynthetic(context, values)
        : undefined;

      if (enabled && synthetic === undefined) {
        return {
          success: false,
          formErrors: [
            'Synthetic data generation is on but incomplete. Fill in the remaining values, or turn the section off.',
          ],
        } as FormSubmissionResult;
      }

      const syntheticErrors = validateAssembledVariable(context, synthetic);
      if (syntheticErrors) {
        return { success: false, ...syntheticErrors };
      }

      void dispatch(
        updateVariableByUUID(
          uuid,
          synthetic ? { synthetic } : {},
          ['synthetic'],
          subject,
        ),
      );
      onSaved();
      return { success: true };
    },
    [context, dispatch, onSaved, subject, uuid],
  );

  if (!variable || !context) return null;

  return (
    <FormWithoutProvider
      id={formId}
      className="flex min-h-0 flex-col"
      onSubmit={handleSubmit}
      style={{
        maxHeight:
          'min(calc(100vh - 10rem), calc(var(--available-height) - 3rem))',
      }}
    >
      <ScrollArea
        aria-label="Synthetic data generation settings"
        className="overflow-clip rounded-t"
        viewportClassName="px-8 pt-6 pb-2"
      >
        {variable.type === 'layout' || variable.type === 'location' ? (
          <p>
            Synthetic values for this variable are managed by the interview
            stage that produces them.
          </p>
        ) : (
          <Layout>
            <SyntheticSection context={context} />
          </Layout>
        )}
      </ScrollArea>

      <div className="flex shrink-0 items-center justify-center gap-3 px-8 pt-4 pb-6">
        <Button
          size="sm"
          variant="default"
          icon={<X aria-hidden />}
          onClick={onCancelled}
        >
          Cancel
        </Button>
        <SubmitButton
          form={formId}
          size="sm"
          color="primary"
          icon={<Check aria-hidden />}
        >
          Save Changes
        </SubmitButton>
      </div>
    </FormWithoutProvider>
  );
}

export default function SyntheticDataEditor(props: SyntheticDataEditorProps) {
  return (
    <FormStoreProvider>
      <SyntheticDataEditorInner {...props} />
    </FormStoreProvider>
  );
}
