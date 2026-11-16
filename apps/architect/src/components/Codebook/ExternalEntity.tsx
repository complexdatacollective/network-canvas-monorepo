import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
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
    description:
      'Heading of a section on the Codebook page for one network resource (an uploaded file of nodes or edges). name is the resource name.',
  },
  preview: {
    id: 'architect.codebook.externalEntity.preview',
    defaultMessage: 'Preview',
    description:
      'Button on a network resource section of the Codebook page that opens a preview of the resource file. Preview is a verb.',
  },
  download: {
    id: 'architect.codebook.externalEntity.download',
    defaultMessage: 'Download',
    description:
      'Button on a network resource section of the Codebook page that downloads the resource file. Download is a verb.',
  },
  attributes: {
    id: 'architect.codebook.externalEntity.attributes',
    defaultMessage: 'Attributes:',
    description:
      'Heading above the list of attributes (variable names found as columns in the file) of a network resource on the Codebook page.',
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
