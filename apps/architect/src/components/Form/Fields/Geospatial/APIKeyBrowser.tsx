import { ArrowRight } from 'lucide-react';
import type { ComponentType } from 'react';
import { useCallback } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import Assets from '~/components/AssetBrowser/Assets';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { Layout, Section } from '~/components/EditorLayout';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import { useAppDispatch } from '~/ducks/hooks';

import { addApiKeyAsset } from '../../../../ducks/modules/protocol/assetManifest';
import BasicForm from '../../../BasicForm';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

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
  const formName = 'create-api-key';
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
    (formValues: Record<string, unknown>) => {
      const { keyName, keyValue } = formValues as {
        keyName: string;
        keyValue: string;
      };
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
      <BasicForm form={formName} onSubmit={handleSubmit}>
        <Layout>
          <Section title="Create New API Key" layout="vertical">
            <Paragraph className="text-sm text-current/70">
              This key is saved inside your protocol and is included, in plain
              text, in any exported <code>.netcanvas</code> file. Anyone you
              share the exported protocol with can read it, so only use a key
              you are comfortable distributing.
            </Paragraph>
            <div data-name="API Key Name" />
            <ValidatedField
              label="API Key Name"
              component={FrescoReduxField}
              name="keyName"
              validation={{ required: true }}
              componentProps={{
                fieldComponent: FrescoInputField,
                type: 'text',
                placeholder: 'Name this key',
              }}
            />
            <div data-name="API Key Value" />
            <ValidatedField
              label="API Key Value"
              component={FrescoReduxField}
              name="keyValue"
              validation={{ required: true }}
              componentProps={{
                fieldComponent: FrescoInputField,
                type: 'text',
                placeholder: 'Enter an API Key...',
              }}
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
      </BasicForm>
    </Dialog>
  );
};
export default APIKeyBrowser;
