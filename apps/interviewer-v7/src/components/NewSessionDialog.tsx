import { motion } from 'motion/react';
import { useId, useRef } from 'react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { createInitialNetwork } from '@codaco/interview';
import { createSession } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { CARD_RADIUS_PX, cardActiveShadow, MORPH_TRANSITION } from './DeckCard';

type NewSessionDialogProps = {
  protocol: ProtocolWithCounts | null;
  onClose: () => void;
  onCreated: (session: StoredSession) => void;
  layoutId?: string;
};

export function NewSessionDialog({
  protocol,
  onClose,
  onCreated,
  layoutId,
}: NewSessionDialogProps) {
  const formId = useId();

  // Keep the last non-null protocol so popup content stays visible during the
  // close animation — when the parent sets `protocol={null}` to start the
  // exit morph, we still need to render the banner/form/footer until the
  // reverse layout animation finishes. Matches fresco-ui's ArrayField pattern
  // (parent always renders the dialog editor; only `open` toggles).
  const lastProtocolRef = useRef<ProtocolWithCounts | null>(protocol);
  if (protocol) lastProtocolRef.current = protocol;
  const display = lastProtocolRef.current;

  if (!display) {
    return (
      <Modal open={false} onOpenChange={() => {}}>
        <></>
      </Modal>
    );
  }

  const popupProps = layoutId ? { layoutId, transition: MORPH_TRANSITION } : {};
  const palette = seedToPatternPalette(display.name);

  // Match the deck card's radius and ACTIVE_DROP_SHADOW with a 6px palette
  // ring so the morph reads as the same surface as the card.
  const popupStyle = {
    borderRadius: CARD_RADIUS_PX,
    boxShadow: cardActiveShadow(palette.backgroundTop, 6),
  };

  // The form area + footer don't exist on the source card, so they animate
  // in from below after the morph settles. Bigger offset + spring gives this
  // a more decisive "the dialog has landed" feel.
  const enterAfterMorph = {
    initial: { opacity: 0, y: 32, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: {
      delay: 0.28,
      type: 'spring' as const,
      stiffness: 260,
      damping: 24,
      mass: 0.9,
    },
  };

  return (
    <FormStoreProvider>
      <Modal
        open={protocol !== null}
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
              seed={display.name}
              className="absolute inset-0 size-full"
            />
            <motion.div
              layoutId={`protocol-banner-${display.hash}`}
              transition={MORPH_TRANSITION}
              className="relative"
            >
              <Heading
                level="h2"
                margin="none"
                className="max-w-[90%] leading-[0.98] font-black tracking-tight text-white"
              >
                {display.name}
              </Heading>
              <div className="font-monospace mt-2.5 text-xs text-white/85">
                Schema v{display.schemaVersion}
              </div>
            </motion.div>
          </div>

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
                  protocolHash: display.hash,
                  protocolName: display.name,
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
