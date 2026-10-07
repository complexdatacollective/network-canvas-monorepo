import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Redo, Undo } from 'lucide-react';
import { useSearchParams } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import DialogPopup from '@codaco/fresco-ui/dialogs/DialogPopup';
import Modal from '@codaco/fresco-ui/Modal';
import { useModalOpener } from '@codaco/fresco-ui/Modal/ModalOpener';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { useProtocolUndoRedo } from '~/hooks/useProtocolUndoRedo';

import TranslationTable from './TranslationTable';
import {
  isTranslationTableOpen,
  wasOpenedFromLanguages,
  withoutTranslationTable,
} from './translationTableLinks';

const messages = defineMessages({
  title: {
    id: 'architect.localization.translationTableDialog.title',
    defaultMessage: 'Translation table',
    description:
      'Title of the dialog, opened from the Languages page, that shows every participant-facing text of a protocol beside its translation into each language.',
  },
  undo: {
    id: 'architect.localization.translationTableDialog.undo',
    defaultMessage: 'Undo',
    description:
      'Accessible name of the button in the toolbar of the translation table that undoes the last change to the protocol.',
  },
  redo: {
    id: 'architect.localization.translationTableDialog.redo',
    defaultMessage: 'Redo',
    description:
      'Accessible name of the button in the toolbar of the translation table that redoes the last change undone.',
  },
});

type FallbackFocus = () => HTMLElement | null;

const TranslationTableSurface = ({
  fallbackFocus,
}: {
  fallbackFocus: FallbackFocus;
}) => {
  const intl = useAppIntl();
  const opener = useModalOpener();
  const { canUndo, canRedo, undo, redo } = useProtocolUndoRedo();

  // The control that opened the table, or, when the table was opened by a
  // link from another page or by its address, somewhere on the page it
  // closes onto.
  const finalFocus = () => {
    const element = opener?.current;
    return element?.isConnected ? element : fallbackFocus();
  };

  return (
    <DialogPopup size="viewport" finalFocus={finalFocus}>
      <TranslationTable
        heading={
          <BaseDialog.Title
            render={
              <Heading level="h2" margin="none" className="me-1 text-lg" />
            }
          >
            {intl.formatMessage(messages.title)}
          </BaseDialog.Title>
        }
        actions={
          <>
            <IconButton
              size="sm"
              variant="text"
              color="dynamic"
              icon={<Undo aria-hidden />}
              aria-label={intl.formatMessage(messages.undo)}
              disabled={!canUndo}
              onClick={undo}
            />
            <IconButton
              size="sm"
              variant="text"
              color="dynamic"
              icon={<Redo aria-hidden />}
              aria-label={intl.formatMessage(messages.redo)}
              disabled={!canRedo}
              onClick={redo}
            />
          </>
        }
        closeButton={<BaseDialog.Close render={<CloseButton size="sm" />} />}
      />
    </DialogPopup>
  );
};

/**
 * The translation table, over the Languages page that owns it. Whether it is
 * open, and which texts it shows, are kept in the page's address, so a link
 * can open it and Back closes it.
 */
const TranslationTableDialog = ({
  fallbackFocus,
}: {
  /** Where focus goes on close when the control that opened it is gone. */
  fallbackFocus: FallbackFocus;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = isTranslationTableOpen(searchParams);

  // Opened from the Languages page, the table has an entry of its own after
  // the page's, which closing goes back past, as Back would. Opened any other
  // way, there is no entry of the page's to go back to, so closing replaces
  // the table's own.
  const close = () => {
    if (wasOpenedFromLanguages(window.history.state)) {
      window.history.back();
      return;
    }
    setSearchParams(withoutTranslationTable, { replace: true });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <TranslationTableSurface fallbackFocus={fallbackFocus} />
    </Modal>
  );
};

export default TranslationTableDialog;
