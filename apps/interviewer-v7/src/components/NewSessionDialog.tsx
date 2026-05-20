import { motion } from 'motion/react';
import { useId } from 'react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { createInitialNetwork } from '@codaco/interview';
import { createSession } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { cardActiveShadow } from './DeckCard';

type NewSessionDialogProps = {
  open: boolean;
  protocol: ProtocolWithCounts;
  onClose: () => void;
  onCreated: (session: StoredSession) => void;
  layoutId?: string;
};

export function NewSessionDialog({
  open,
  protocol,
  onClose,
  onCreated,
  layoutId,
}: NewSessionDialogProps) {
  const formId = useId();

  const popupProps = layoutId ? { layoutId } : {};
  const interviewLabel =
    protocol.sessionCount === 1 ? 'interview' : 'interviews';
  const palette = seedToPatternPalette(protocol.name);

  // Match the deck card's `rounded-[3rem]` (48px) and ACTIVE_DROP_SHADOW with
  // a 6px palette ring so the morph reads as the same surface as the card.
  const popupStyle = {
    borderRadius: 48,
    boxShadow: cardActiveShadow(palette.backgroundTop, 6),
  };

  // The form area + footer don't exist on the source card, so they need an
  // explicit fade-in; otherwise they pop in once the morph completes.
  const enterAfterMorph = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { delay: 0.15, duration: 0.2 },
  };

  return (
    <FormStoreProvider>
      <Modal
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <ModalPopup
          {...popupProps}
          style={popupStyle}
          className="tablet-portrait:w-auto bg-surface-1 fixed top-1/2 left-1/2 flex w-[calc(100%-var(--spacing-base)*8)] max-w-2xl -translate-1/2 flex-col overflow-hidden"
        >
          <div className="relative min-h-[200px] w-full overflow-hidden p-6 pb-8">
            <Pattern
              seed={protocol.name}
              className="absolute inset-0 size-full"
            />
            <motion.div layout="position" className="relative">
              <Heading
                level="h2"
                margin="none"
                className="max-w-[90%] leading-[0.98] font-black tracking-tight text-white"
              >
                {protocol.name}
              </Heading>
              <div className="font-monospace mt-2.5 text-xs text-white/85">
                Schema v{protocol.schemaVersion}
              </div>
            </motion.div>
          </div>

          <div className="font-monospace flex items-center justify-between px-6 pt-4 text-xs">
            <span className="text-text/60">
              Imported <TimeAgo date={protocol.importedAt} />
            </span>
            <span className="text-text/60">
              {protocol.sessionCount} {interviewLabel}
            </span>
          </div>

          {protocol.description ? (
            <p className="text-text/80 px-6 pt-3.5 text-sm leading-[1.45]">
              {protocol.description}
            </p>
          ) : null}

          <motion.div {...enterAfterMorph}>
            <FormWithoutProvider
              id={formId}
              onSubmit={async (values) => {
                const caseId = String(values.caseId ?? '').trim();
                if (!caseId) {
                  return {
                    success: false,
                    fieldErrors: { caseId: ['Case ID is required'] },
                  };
                }
                const session = await createSession({
                  protocolHash: protocol.hash,
                  protocolName: protocol.name,
                  caseId,
                  initialNetwork: createInitialNetwork(),
                });
                onCreated(session);
                return { success: true };
              }}
            >
              <div className="px-6 pt-5">
                <Field
                  name="caseId"
                  label="Case ID"
                  hint="A label used to identify this interview in exports."
                  component={InputField}
                  required="Case ID is required"
                  minLength={1}
                  validateOnChange
                />
              </div>
            </FormWithoutProvider>

            <footer className="phone-landscape:flex-row phone-landscape:justify-end mt-6 flex flex-col gap-2 px-6 pb-6">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton form={formId}>Start interview</SubmitButton>
            </footer>
          </motion.div>
        </ModalPopup>
      </Modal>
    </FormStoreProvider>
  );
}
