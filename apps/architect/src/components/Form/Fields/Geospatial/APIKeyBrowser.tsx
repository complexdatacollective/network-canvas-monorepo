import { ArrowRight } from 'lucide-react';
import { useCallback } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import Assets from '~/components/AssetBrowser/Assets';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { Layout, Section } from '~/components/EditorLayout';
import AppForm from '~/components/Form/AppForm';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppDispatch } from '~/ducks/hooks';

import { addApiKeyAsset } from '../../../../ducks/modules/protocol/assetManifest';

type APIKeyBrowserProps = {
  show?: boolean;
  type?: string | null;
  selected?: string | null;
  onSelect?: (assetId: string) => void;
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
  const [preview, handleShowPreview] = useExternalDataPreview();
  const handleSelectAsset = useCallback(
    (assetId: string) => {
      onSelect(assetId);
      close();
    },
    [onSelect, close],
  );
  const handleSubmit = useCallback(
    (formValues: Record<string, FieldValue>) => {
      const { keyName, keyValue } = formValues;
      if (typeof keyName !== 'string' || typeof keyValue !== 'string') return;
      dispatch(addApiKeyAsset(keyName, keyValue));
    },
    [dispatch],
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
          <Section title="Create New API Key" layout="vertical">
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
              <Button
                key="save"
                type="submit"
                iconPosition="right"
                icon={<ArrowRight />}
                color="primary"
              >
                Create Key
              </Button>
            </div>
          </Section>
          <Section title="Resource Library" layout="vertical">
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
