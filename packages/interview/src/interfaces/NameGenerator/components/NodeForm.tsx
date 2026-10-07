'use client';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Form from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type {
  FormSubmissionResult,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import Icon, { type InterviewerIconName } from '@codaco/fresco-ui/Icon';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { Form as TForm } from '@codaco/protocol-validation';
import {
  type EntityAttributesProperty,
  type EntityPrimaryKey,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { useTrack } from '../../../analytics/useTrack';
import {
  actionCircleVariants,
  actionIconClass,
  actionPlusBadgeVariants,
  actionPlusIconClass,
} from '../../../components/actionButtonVariants';
import PassphraseRecovery from '../../../components/PassphraseRecovery';
import { useCurrentStep } from '../../../contexts/CurrentStepContext';
import { formValuesToAttributePatch } from '../../../forms/formValuesToAttributePatch';
import useProtocolForm from '../../../forms/useProtocolForm';
import { savingNeedsPassphrase } from '../../../forms/useValidationNetwork';
import { writeSubmissionResult } from '../../../forms/writeSubmissionResult';
import { useCelebrate } from '../../../hooks/useCelebrate';
import { useStageSelector } from '../../../hooks/useStageSelector';
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import { getNodeIconName } from '../../../selectors/name-generator';
import { getCodebookVariablesForSubjectType } from '../../../selectors/protocol';
import { getPromptAdditionalAttributes } from '../../../selectors/session';
import type { AttributePatch } from '../../../store/entityAttributePatch';
import { updateNode as updateNodeAction } from '../../../store/modules/session';
import { useAppDispatch } from '../../../store/store';
import PassphraseNotice from '../../Anonymisation/PassphraseNotice';
import { usePassphrase } from '../../Anonymisation/usePassphrase';
import { useProtectedFormValues } from '../../Anonymisation/useProtectedFormValues';
import { interfaceMessages } from '../../messages';

type NodeFormProps = {
  selectedNode: NcNode | null;
  form: TForm;
  disabled: boolean;
  onClose: () => void;
  addNode: (
    attributes: NcNode[EntityAttributesProperty],
  ) => Promise<FormSubmissionResult>;
};

/**
 * Tells the dialog whether the form inside it is submitting. The form's store
 * lives inside the dialog, so that each opening starts afresh, which leaves
 * the dialog's own controls outside it.
 */
function SubmittingObserver({
  onChange,
}: {
  onChange: (submitting: boolean) => void;
}) {
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  useLayoutEffect(() => {
    onChange(isSubmitting);
    return () => onChange(false);
  }, [isSubmitting, onChange]);
  return null;
}

const NodeForm = (props: NodeFormProps) => {
  const intl = useAppIntl();
  const { selectedNode, form, disabled, onClose, addNode } = props;

  const newNodeAttributes = useStageSelector(getPromptAdditionalAttributes);
  const icon = useStageSelector(getNodeIconName);
  const variables = useStageSelector(getCodebookVariablesForSubjectType);

  const [show, setShow] = useState(false);
  // Leaving would be read as not saving while the save still lands, and a
  // second submission would add the person twice, so neither is offered until
  // the submission settles.
  const [submitting, setSubmitting] = useState(false);

  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();
  const track = useTrack();

  const circleRef = useRef<HTMLDivElement>(null);
  const celebrate = useCelebrate(circleRef, { particles: true });

  const updateNode = useCallback(
    (payload: {
      nodeId: NcNode[EntityPrimaryKey];
      newModelData?: Record<string, unknown>;
      attributePatch: AttributePatch;
    }) => dispatch(updateNodeAction({ ...payload, currentStep })),
    [dispatch, currentStep],
  );

  // When a selected node is passed in, we are editing an existing node.
  // We need to show the form and populate it with the node's data. Compared
  // during render rather than in an effect, so the form opens in the same
  // frame the node is handed to it.
  // Seeded `null`, not `selectedNode`: the effect this replaces ran on mount,
  // so a NodeForm mounted with a node already selected opened straight into
  // the edit form. Seeding the current value would skip that first run and
  // leave such a mount showing a closed dialog.
  const [openedForNode, setOpenedForNode] = useState<NcNode | null>(null);
  if (openedForNode !== selectedNode) {
    setOpenedForNode(selectedNode);
    if (selectedNode) {
      setShow(true);
    }
  }

  const previousShowRef = useRef(false);
  useEffect(() => {
    if (show && !previousShowRef.current) {
      track(
        'node_form_opened',
        selectedNode ? { node_id: selectedNode[entityPrimaryKeyProperty] } : {},
      );
    }
    previousShowRef.current = show;
  }, [show, selectedNode, track]);

  const handleClose = useCallback(() => {
    track(
      'node_form_dismissed_without_save',
      selectedNode ? { node_id: selectedNode[entityPrimaryKeyProperty] } : {},
    );
    setShow(false);
    onClose();
  }, [onClose, selectedNode, track]);

  const variants = {
    initial: { opacity: 0, y: '100%' },
    animate: {
      opacity: 1,
      y: 0,
    },
  };

  // An edited person's encrypted answers are decrypted before the form opens.
  // Once their form has been shown, a passphrase that cannot read them only
  // hides it, keeping what was entered until it can be shown, and saved,
  // again; before then, the form does not open.
  const editing = useProtectedFormValues(selectedNode, form.fields, variables);
  const selectedNodeId = selectedNode?.[entityPrimaryKeyProperty];
  const [shownFor, setShownFor] = useState<string>();
  if (show && editing.status === 'ready' && shownFor !== selectedNodeId) {
    setShownFor(selectedNodeId);
  }
  if (!show && shownFor !== undefined) {
    setShownFor(undefined);
  }
  const editingShown =
    selectedNodeId !== undefined && shownFor === selectedNodeId;
  const editingHidden = editingShown && editing.status !== 'ready';
  const editingLocked =
    selectedNode !== null && editing.status === 'locked' && !editingShown;
  useEffect(() => {
    if (!editingLocked) return;
    setShow(false);
    onClose();
  }, [editingLocked, onClose]);

  const initialValues =
    selectedNode && editing.status === 'ready' ? editing.values : undefined;

  const { isEnabled } = usePassphrase();
  const offersPassphrase = savingNeedsPassphrase(
    variables,
    form.fields.map((field) => field.variable),
    isEnabled,
    selectedNodeId,
  );

  const { fieldComponents, coerceValues } = useProtocolForm({
    fields: form.fields,
    autoFocus: true,
    initialValues,
    currentEntityId: selectedNode?.[entityPrimaryKeyProperty],
  });

  const handleSubmit: FormSubmitHandler = useCallback(
    async (values) => {
      const patchResult = formValuesToAttributePatch(
        coerceValues(values),
        form.fields.map((field) => field.variable),
        initialValues ?? {},
      );

      if (!patchResult.success) {
        return {
          success: false,
          formErrors: [createMessageError(runtimeMessages.submissionFailed)],
        };
      }

      const isNewNode = !selectedNode;

      const saved = isNewNode
        ? await addNode({ ...newNodeAttributes, ...patchResult.patch.set })
        : writeSubmissionResult(
            await updateNode({
              nodeId: selectedNode[entityPrimaryKeyProperty],
              attributePatch: patchResult.patch,
            }),
          );
      if (!saved.success) return saved;

      setShow(false);
      onClose();

      if (isNewNode) {
        celebrate();
      }

      return { success: true };
    },
    [
      coerceValues,
      form.fields,
      initialValues,
      selectedNode,
      addNode,
      newNodeAttributes,
      updateNode,
      onClose,
      celebrate,
    ],
  );

  return (
    <>
      <div className="pointer-events-none absolute right-0 bottom-0 z-10 h-48 w-xl bg-[radial-gradient(ellipse_at_bottom_right,oklch(from_var(--background)_calc(l-0.1)_c_h),transparent_70%)]" />
      <AnimatePresence>
        <motion.div
          key="add-button"
          className="absolute right-12 bottom-4 z-20"
          variants={variants}
        >
          <button
            type="button"
            onClick={() => setShow(true)}
            disabled={disabled}
            aria-label={intl.formatMessage(runtimeMessages.addPerson)}
            className="focusable relative aspect-square size-28 rounded-full"
          >
            <motion.div
              ref={circleRef}
              data-toggle-circle
              className={cx(
                actionCircleVariants(),
                'relative aspect-square size-28 transition-[background-color,filter] duration-300',
                disabled ? 'cursor-not-allowed saturate-0' : 'cursor-pointer',
              )}
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <motion.div className="flex h-full items-center justify-center">
                <Icon
                  name={icon as InterviewerIconName}
                  className={actionIconClass}
                />
              </motion.div>
            </motion.div>
            <motion.div className={actionPlusBadgeVariants()}>
              <Plus className={actionPlusIconClass} />
            </motion.div>
          </button>
        </motion.div>
      </AnimatePresence>
      <Dialog
        open={show && (editing.status === 'ready' || editingShown)}
        title={form.title}
        closeDialog={handleClose}
        dismissible={!submitting}
        footer={
          <Button
            key="submit"
            type="submit"
            form="node-form"
            aria-label={intl.formatMessage(interfaceMessages.finished)}
            color="primary"
            disabled={submitting || editingHidden}
          >
            {intl.formatMessage(interfaceMessages.finished)}
          </Button>
        }
      >
        <Form
          id="node-form"
          onSubmit={handleSubmit}
          className="phone-landscape:min-w-sm desktop:min-w-md w-full"
        >
          <SubmittingObserver onChange={setSubmitting} />
          {offersPassphrase && <PassphraseRecovery />}
          {editingHidden && (
            <PassphraseNotice
              status={editing.status === 'pending' ? 'pending' : 'locked'}
            />
          )}
          <div hidden={editingHidden} className="contents">
            {fieldComponents}
          </div>
        </Form>
      </Dialog>
    </>
  );
};

export default NodeForm;
