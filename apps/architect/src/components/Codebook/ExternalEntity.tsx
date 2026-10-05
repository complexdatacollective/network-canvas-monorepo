import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Section from '@codaco/fresco-ui/Section';
import Heading from '@codaco/fresco-ui/typography/Heading';
import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';

import EntityIcon from './EntityIcon';
import VariableList from './VariableList';
const messages = defineMessages({
  networkResource: {
    id: 'architect.codebook.externalEntity.networkResource',
    defaultMessage: 'Network resource: {name}',
    description: 'The title text in components / Codebook / ExternalEntity.',
  },
  preview: {
    id: 'architect.codebook.externalEntity.preview',
    defaultMessage: 'Preview',
    description: 'Visible text in components / Codebook / ExternalEntity.',
  },
  download: {
    id: 'architect.codebook.externalEntity.download',
    defaultMessage: 'Download',
    description: 'Visible text in components / Codebook / ExternalEntity.',
  },
  attributes: {
    id: 'architect.codebook.externalEntity.attributes',
    defaultMessage: 'Attributes:',
    description: 'Visible text in components / Codebook / ExternalEntity.',
  },
});

type ExternalEntityProps = {
  name: string;
  id: string;
};

const ExternalEntity = ({ id, name }: ExternalEntityProps) => {
  const intl = useAppIntl();
  const { variables } = useVariablesFromExternalData(id);

  const [preview, handleShowPreview] = useExternalDataPreview();
  const handleDownloadAsset = useExternalDataDownload();

  return (
    <>
      <Section
        title={intl.formatMessage(messages.networkResource, { name: name })}
      >
        <div className="flex items-center gap-5">
          <div className="flex shrink-0 basis-19 items-center justify-center">
            <EntityIcon entity="asset" size="small" />
          </div>
          <div className="me-auto" />
          <Button onClick={() => handleShowPreview(id)} color="primary">
            {intl.formatMessage(messages.preview)}
          </Button>
          <Button onClick={() => handleDownloadAsset(id)} color="info">
            {intl.formatMessage(messages.download)}
          </Button>
        </div>
        {variables.length > 0 && (
          <div className="mt-5">
            <Heading level="h3">
              {intl.formatMessage(messages.attributes)}
            </Heading>
            <VariableList variables={variables} />
          </div>
        )}
      </Section>
      {preview}
    </>
  );
};

export default ExternalEntity;
