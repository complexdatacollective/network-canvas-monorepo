import Button from '@codaco/fresco-ui/Button';
import Section from '@codaco/fresco-ui/Section';
import Heading from '@codaco/fresco-ui/typography/Heading';
import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';

import EntityIcon from './EntityIcon';
import VariableList from './VariableList';
type ExternalEntityProps = {
  name: string;
  id: string;
};

const ExternalEntity = ({ id, name }: ExternalEntityProps) => {
  const { variables } = useVariablesFromExternalData(id);

  const [preview, handleShowPreview] = useExternalDataPreview();
  const handleDownloadAsset = useExternalDataDownload();

  return (
    <>
      <Section title={`Network resource: ${name}`}>
        <div className="flex items-center gap-5">
          <div className="flex shrink-0 basis-19 items-center justify-center">
            <EntityIcon entity="asset" size="small" />
          </div>
          <div className="me-auto" />
          <Button onClick={() => handleShowPreview(id)} color="primary">
            Preview
          </Button>
          <Button onClick={() => handleDownloadAsset(id)} color="info">
            Download
          </Button>
        </div>
        {variables.length > 0 && (
          <div className="mt-5">
            <Heading level="h3">Attributes:</Heading>
            <VariableList variables={variables} />
          </div>
        )}
      </Section>
      {preview}
    </>
  );
};

export default ExternalEntity;
