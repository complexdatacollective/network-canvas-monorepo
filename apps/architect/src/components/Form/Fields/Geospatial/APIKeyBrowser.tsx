import { ArrowRight } from 'lucide-react';
import { useCallback, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Section from '@codaco/fresco-ui/Section';
import { normalizeForComparison } from '@codaco/shared-consts';
import Assets from '~/components/AssetBrowser/Assets';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { useNestedDraftDialog } from '~/components/DialogForm/useNestedDraftDialog';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import { getProtocolLockState } from '~/ducks/modules/app';
import { getAssetManifest } from '~/selectors/protocol';
import { refusedCommitError } from '~/utils/protocolLockMessages';

import { addApiKeyAsset } from '../../../../ducks/modules/protocol/assetManifest';
const messages = defineMessages({
  aPIKeyBrowser: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.aPIKeyBrowser',
    defaultMessage: 'API Key Browser',
    description:
      'The title text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  createAPIKey: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.createAPIKey',
    defaultMessage: 'Create API key',
    description:
      'The title text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  thisKeyIsSavedInsideYour: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.thisKeyIsSavedInsideYour',
    defaultMessage:
      'This key is saved inside your protocol and included as plain text in exported <code>.netcanvas</code> files, so only use a key you are comfortable distributing.',
    description:
      'Visible text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  keyName: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.keyName',
    defaultMessage: 'Key name',
    description:
      'The label text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  nameThisKey: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.nameThisKey',
    defaultMessage: 'Name this key',
    description:
      'The placeholder text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  keyValue: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.keyValue',
    defaultMessage: 'Key value',
    description:
      'The label text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  enterAnAPIKey: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.enterAnAPIKey',
    defaultMessage: 'Enter an API Key...',
    description:
      'The placeholder text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  createKey: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.createKey',
    defaultMessage: 'Create Key',
    description:
      'Visible text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  savedAPIKeys: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.savedAPIKeys',
    defaultMessage: 'Saved API keys',
    description:
      'The title text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
  selectAnAPIKeyAlreadyStored: {
    id: 'architect.form.fields.geospatial.aPIKeyBrowser.selectAnAPIKeyAlreadyStored',
    defaultMessage: 'Select an API key already stored in this protocol.',
    description:
      'The description text in components / Form / Fields / Geospatial / APIKeyBrowser.',
  },
});

// Researcher-facing, whole sentences: what is wrong, and what to do about it.
const NAME_REQUIRED_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.form.fields.geospatial.apikeybrowser.nameRequiredMessage',
    defaultMessage: 'Enter a name for this key.',
    description:
      'Researcher-facing status or validation message. Context: components/Form/Fields/Geospatial/APIKeyBrowser.tsx.',
  },
}).message;
const VALUE_REQUIRED_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.form.fields.geospatial.apikeybrowser.valueRequiredMessage',
    defaultMessage: 'Enter the value of the key.',
    description:
      'Researcher-facing status or validation message. Context: components/Form/Fields/Geospatial/APIKeyBrowser.tsx.',
  },
}).message;
const DUPLICATE_NAME_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.form.fields.geospatial.apikeybrowser.duplicateNameMessage',
    defaultMessage:
      'A key with this name already exists. Choose a different name.',
    description:
      'Researcher-facing status or validation message. Context: components/Form/Fields/Geospatial/APIKeyBrowser.tsx.',
  },
}).message;

// Creating a key writes the protocol's own `assetManifest`, so it is a
// persistence gate and has to ask the question every other one asks
// (`getProtocolOwnedHere`). #1396 gave the sibling write — dropping a resource
// file — exactly this refusal; this path was rewritten by #1394 from a base
// that predated it and never gained one, so a tab that cannot save was still
// told "API key X created and selected." before the key was discarded on
// reclaim. The wording itself comes from `protocolLockMessages`, which is the
// only place any lock refusal is phrased — this surface used to hand-roll its
// own pair of sentences, which is exactly the drift that module exists to
// prevent.

/**
 * What leaving this dialog with a key actually did, so the caller can say so
 * out loud. Both routes report through it — creating a key and picking an
 * existing card — because a caller told only about creations has no way to
 * retire the sentence it wrote: its status region would go on asserting "API
 * key Alpha created and selected." while the field beside it holds Beta.
 */
export type APIKeySelection = {
  id: string;
  /** The name as STORED, read back from the manifest rather than the form. */
  name: string;
  created: boolean;
};

type APIKeyBrowserProps = {
  show?: boolean;
  type?: string | null;
  selected?: string | null;
  onSelect?: (selection: APIKeySelection) => void;
  onCancel?: () => void;
  close: () => void;
};

const APIKeyBrowserBody = ({
  show = true,
  close,
  onSelect = () => {},
  selected = null,
}: APIKeyBrowserProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [preview, handleShowPreview] = useExternalDataPreview();
  /**
   * A half-typed key is unsaved work like any other nested editor's, and
   * exactly as invisible: it lives in this dialog's own field store, in neither
   * the editing buffer nor the stage draft. Until this registration existed,
   * every guard that could destroy it — browser Back, a refresh, a read-only
   * demotion, a cross-tab reclaim — read "pristine" and took it without a word
   * (#1387 closed the same gap for `DialogForm` and the rule builder; #1394
   * rewrote this dialog's submit from a base that predated all of it).
   *
   * Registered through the shared hook rather than by becoming a `DialogForm`:
   * this is a BROWSER, not an editor. It is workspace-sized, its create form is
   * one of two sections (the Resource Library below it is not part of the
   * form at all), and it has two ways out holding a key — creating one and
   * picking an existing card. A `DialogForm` would put "Create Key" in the
   * footer, where it would read as acting on the library as well.
   */
  const { requestClose } = useNestedDraftDialog({ open: show, onClose: close });
  const selectAsset = useCallback(
    (assetId: string, created: boolean) => {
      // `Assets` lists the manifest and the create path passes the id it has
      // just dispatched, so a miss is unreachable; falling back to the id
      // keeps the announced sentence whole rather than "API key  selected."
      const asset = getAssetManifest(store.getState())[assetId];
      onSelect({ id: assetId, name: asset?.name ?? assetId, created });
      // The raw close, not `requestClose`: leaving with a key is what this
      // dialog is FOR, and a confirmation here would ask about work the
      // researcher has just had applied.
      close();
    },
    [onSelect, close, store],
  );
  // Wrapped rather than passed to `Assets` directly: its `onSelect` is a
  // one-argument contract, and a second argument arriving from a future change
  // must not be able to turn a plain selection into a "created" one.
  const handleSelectAsset = useCallback(
    (assetId: string) => selectAsset(assetId, false),
    [selectAsset],
  );
  /**
   * Creating a key SELECTS it and closes the dialog, exactly as picking an
   * existing card does. That is what makes a repeated submission structurally
   * impossible: this used to be fire-and-forget, so every further activation
   * of "Create Key" minted another asset with the same name and the same
   * value, distinguishable only by uuid — and the Resource Library here
   * cannot delete them (`disableDelete` below).
   *
   * A name already in use is a hard error rather than a quiet re-selection:
   * the researcher has no other way to learn that the key they think they just
   * created already existed. The manifest is read from the store at submit
   * time, so the check sees whatever the protocol holds now rather than
   * whatever it held when this dialog rendered.
   */
  const handleSubmit = useCallback(
    (formValues: Record<string, FieldValue>): FormSubmissionResult => {
      const { keyName, keyValue } = formValues;
      const name = typeof keyName === 'string' ? keyName.trim() : '';
      const value = typeof keyValue === 'string' ? keyValue.trim() : '';

      // Field-level `required` already rejects blank and whitespace-only
      // input before this runs (`isUnanswered`); this is the backstop that
      // keeps the handler total, so no path can mint a nameless key.
      const fieldErrors: Record<string, string[]> = {};
      if (!name)
        fieldErrors.keyName = [createMessageError(NAME_REQUIRED_MESSAGE)];
      if (!value)
        fieldErrors.keyValue = [createMessageError(VALUE_REQUIRED_MESSAGE)];

      // `normalizeForComparison`, the one question every uniqueness check in
      // Architect asks: case-insensitive AND Unicode-canonical. Comparing raw
      // case here let two spellings of the same key name through, and the
      // researcher has no way to tell the resulting cards apart.
      const normalizedName = normalizeForComparison(name);
      const isDuplicateName = Object.values(
        getAssetManifest(store.getState()),
      ).some(
        (asset) =>
          asset.type === 'apikey' &&
          normalizeForComparison(asset.name.trim()) === normalizedName,
      );
      if (name && isDuplicateName) {
        fieldErrors.keyName = [createMessageError(DUPLICATE_NAME_MESSAGE)];
      }

      if (Object.keys(fieldErrors).length > 0) {
        return { success: false, fieldErrors };
      }

      // Asked after the shape checks, so a blank form still reports what is
      // blank, and before the dispatch, so nothing is written that can never
      // be saved. Reported on `keyName` because that is the error channel this
      // dialog actually renders and `focusFirstError` can reach — a form-level
      // error would be refused in silence here, which is the defect, not the
      // fix.
      const refusal = refusedCommitError(
        getProtocolLockState(store.getState()),
        'api-key',
      );
      if (refusal) {
        return { success: false, fieldErrors: { keyName: [refusal] } };
      }

      const action = addApiKeyAsset(name, value);
      dispatch(action);
      selectAsset(action.payload.id, true);
      return { success: true };
    },
    [dispatch, store, selectAsset],
  );
  return (
    <Dialog
      open={show}
      closeDialog={requestClose}
      title={intl.formatMessage(messages.aPIKeyBrowser)}
      size="workspace"
      footer={
        <Button color="default" onClick={requestClose}>
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
      }
    >
      <FormWithoutProvider onSubmit={handleSubmit}>
        <Section
          title={intl.formatMessage(messages.createAPIKey)}
          description={
            <>
              {intl.formatMessage(messages.thisKeyIsSavedInsideYour, {
                code: (chunks) => <code>{chunks}</code>,
              })}
            </>
          }
        >
          <ArchitectField
            name="keyName"
            label={intl.formatMessage(messages.keyName)}
            component={InputField}
            validation={{ required: true }}
            type="text"
            placeholder={intl.formatMessage(messages.nameThisKey)}
          />
          <ArchitectField
            name="keyValue"
            label={intl.formatMessage(messages.keyValue)}
            component={InputField}
            validation={{ required: true }}
            type="text"
            placeholder={intl.formatMessage(messages.enterAnAPIKey)}
          />
          <div className="pt-4">
            <SubmitButton key="save" iconPosition="right" icon={<ArrowRight />}>
              {intl.formatMessage(messages.createKey)}
            </SubmitButton>
          </div>
        </Section>
        <Section
          title={intl.formatMessage(messages.savedAPIKeys)}
          description={intl.formatMessage(messages.selectAnAPIKeyAlreadyStored)}
        >
          <Assets
            onSelect={handleSelectAsset}
            selected={selected}
            type="apikey"
            disableDelete
            onPreview={handleShowPreview}
          />
        </Section>
        {preview}
      </FormWithoutProvider>
    </Dialog>
  );
};

/**
 * The field store is a PARENT of the dialog rather than a child of it (the
 * arrangement `FormWithoutProvider` is documented for, and the one `DialogForm`
 * uses): the routes that dismiss this dialog — the footer Cancel, the close
 * button, Escape, a backdrop click — all live outside the `<form>` element, and
 * they have to be able to ask whether the fields inside it hold anything.
 *
 * Which means the store now outlives a close, so it is remounted as the dialog
 * OPENS — the same `key` bump, for the same reason, as `NewVariableWindow`.
 * `Modal`'s exit animation normally unmounts the form and resets the store on
 * the way out, but a close followed by another open before that exit finishes
 * cancels the removal, and the next visit's fields then re-register over the
 * previous one's parked values. Here that would mean a key the researcher had
 * just confirmed discarding coming back, in a form they expect to be empty.
 * Bumped on open rather than on close so the entering dialog is the fresh one
 * and a close still animates out.
 */
const APIKeyBrowser = ({ show = true, ...props }: APIKeyBrowserProps) => {
  const [wasShown, setWasShown] = useState(show);
  const [openCount, setOpenCount] = useState(0);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setOpenCount((count) => count + 1);
    }
  }

  return (
    <FormStoreProvider key={openCount}>
      <APIKeyBrowserBody show={show} {...props} />
    </FormStoreProvider>
  );
};

export default APIKeyBrowser;
