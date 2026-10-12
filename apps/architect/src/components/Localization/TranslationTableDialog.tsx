import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useContext } from 'react';
import { useSearchParams } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import DialogPopup from '@codaco/fresco-ui/dialogs/DialogPopup';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import Modal from '@codaco/fresco-ui/Modal';
import { useModalOpener } from '@codaco/fresco-ui/Modal/ModalOpener';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { useNestedDraftDialog } from '~/components/DialogForm/useNestedDraftDialog';

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
});

type FallbackFocus = () => HTMLElement | null;

const TranslationTableSurface = ({
  fallbackFocus,
  onSaved,
  onCancel,
}: {
  fallbackFocus: FallbackFocus;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const intl = useAppIntl();
  const opener = useModalOpener();

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
        onSaved={onSaved}
        onCancel={onCancel}
      />
    </DialogPopup>
  );
};

/**
 * The modal and the form it holds. Only its own buttons close it: Save, once
 * every change is in the protocol, and Cancel, which asks first when there
 * are changes it would lose. Escape and a press outside it do nothing, and
 * Back, a refresh or a protocol lock ask as they do for any open editor.
 */
const TranslationTableModal = ({
  open,
  close,
  fallbackFocus,
}: {
  open: boolean;
  close: () => void;
  fallbackFocus: FallbackFocus;
}) => {
  const formStore = useContext(FormStoreContext);
  // Closed by going back, as Back would close it. What guards Back asks then
  // whether the table holds unsaved changes, so a discard the researcher has
  // just confirmed is made first, or they would be asked about it again.
  const discardAndClose = () => {
    const state = formStore?.getState();
    state?.rebaseToDocument(state.getFormValues());
    close();
  };
  const { requestClose } = useNestedDraftDialog({
    open,
    onClose: discardAndClose,
  });

  return (
    <Modal
      open={open}
      dismissible={false}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <TranslationTableSurface
        fallbackFocus={fallbackFocus}
        onSaved={close}
        onCancel={requestClose}
      />
    </Modal>
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
    <FormStoreProvider>
      <TranslationTableModal
        open={open}
        close={close}
        fallbackFocus={fallbackFocus}
      />
    </FormStoreProvider>
  );
};

export default TranslationTableDialog;
