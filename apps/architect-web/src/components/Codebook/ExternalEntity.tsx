import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { Section } from '~/components/EditorLayout';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';
import { Button } from '~/lib/legacy-ui/components';

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
        <div className="flex items-center gap-(--space-md)">
          <div className="flex shrink-0 basis-(--space-3xl) items-center justify-center">
            <EntityIcon entity="asset" size="small" />
          </div>
          <h2 className="my-0 me-auto">{name}</h2>
          <Button onClick={() => handleShowPreview(id)} color="sea-green">
            Preview
          </Button>
          <Button onClick={() => handleDownloadAsset(id)} color="sea-serpent">
            Download
          </Button>
        </div>
        {variables.length > 0 && (
          <div className="mt-(--space-md)">
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
