import Button from '@codaco/fresco-ui/Button';
import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { Section } from '~/components/EditorLayout';
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
      <Section layout="vertical" required={false}>
        <div className="flex items-center gap-5">
          <div className="flex shrink-0 basis-19 items-center justify-center">
            <EntityIcon entity="asset" size="small" />
          </div>
          <h2 className="my-0 me-auto">{name}</h2>
          <Button onClick={() => handleShowPreview(id)} color="primary">
            Preview
          </Button>
          <Button onClick={() => handleDownloadAsset(id)} color="info">
            Download
          </Button>
        </div>
        {variables.length > 0 && (
          <div className="mt-5">
            <h3>Variables:</h3>
            <VariableList variables={variables} />
          </div>
        )}
      </Section>
      {preview}
    </>
  );
};

export default ExternalEntity;
