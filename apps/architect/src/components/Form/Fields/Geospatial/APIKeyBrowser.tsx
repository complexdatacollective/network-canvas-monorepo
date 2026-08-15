import { ArrowRight } from 'lucide-react';
import { useCallback } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type {
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import Assets from '~/components/AssetBrowser/Assets';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { Layout, Section } from '~/components/EditorLayout';
import AppForm from '~/components/Form/AppForm';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import { getAssetManifest } from '~/selectors/protocol';

import { addApiKeyAsset } from '../../../../ducks/modules/protocol/assetManifest';

// Researcher-facing, whole sentences: what is wrong, and what to do about it.
const NAME_REQUIRED_MESSAGE = 'Enter a name for this key.';
const VALUE_REQUIRED_MESSAGE = 'Enter the value of the key.';
const DUPLICATE_NAME_MESSAGE =
  'A key with this name already exists. Choose a different name.';

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
const APIKeyBrowser = ({
  show = true,
  close,
  onSelect = () => {},
  selected = null,
}: APIKeyBrowserProps) => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [preview, handleShowPreview] = useExternalDataPreview();
  const selectAsset = useCallback(
    (assetId: string, created: boolean) => {
      // `Assets` lists the manifest and the create path passes the id it has
      // just dispatched, so a miss is unreachable; falling back to the id
      // keeps the announced sentence whole rather than "API key  selected."
      const asset = getAssetManifest(store.getState())[assetId];
      onSelect({ id: assetId, name: asset?.name ?? assetId, created });
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
      if (!name) fieldErrors.keyName = [NAME_REQUIRED_MESSAGE];
      if (!value) fieldErrors.keyValue = [VALUE_REQUIRED_MESSAGE];

      const isDuplicateName = Object.values(
        getAssetManifest(store.getState()),
      ).some(
        (asset) =>
          asset.type === 'apikey' &&
          asset.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (name && isDuplicateName) {
        fieldErrors.keyName = [DUPLICATE_NAME_MESSAGE];
      }

      if (Object.keys(fieldErrors).length > 0) {
        return { success: false, fieldErrors };
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
      closeDialog={close}
      title="API Key Browser"
      size="workspace"
      footer={
        <Button color="default" onClick={close}>
          Cancel
        </Button>
      }
    >
      <AppForm onSubmit={handleSubmit}>
        <Layout>
          {/*
            `required` on a Section renders a red asterisk beside its heading.
            Neither heading here names a control anyone has to fill in, and a
            false required marker in a dialog about validation is worse than
            none.
          */}
          <Section
            title="Create New API Key"
            layout="vertical"
            required={false}
          >
            <Paragraph className="text-sm text-current/70">
              This key is saved inside your protocol and is included, in plain
              text, in any exported <code>.netcanvas</code> file. Anyone you
              share the exported protocol with can read it, so only use a key
              you are comfortable distributing.
            </Paragraph>
            <ArchitectField
              name="keyName"
              label="API Key Name"
              component={InputField}
              validation={{ required: true }}
              type="text"
              placeholder="Name this key"
            />
            <ArchitectField
              name="keyValue"
              label="API Key Value"
              component={InputField}
              validation={{ required: true }}
              type="text"
              placeholder="Enter an API Key..."
            />
            <div className="pt-4">
              <SubmitButton
                key="save"
                iconPosition="right"
                icon={<ArrowRight />}
              >
                Create Key
              </SubmitButton>
            </div>
          </Section>
          <Section title="Resource Library" layout="vertical" required={false}>
            <Assets
              onSelect={handleSelectAsset}
              selected={selected}
              type="apikey"
              disableDelete
              onPreview={handleShowPreview}
            />
          </Section>
          {preview}
        </Layout>
      </AppForm>
    </Dialog>
  );
};
export default APIKeyBrowser;
