import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
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
      <div className="bg-surface-3 mx-auto my-(--space-xl) overflow-hidden rounded p-(--space-xl)">
        <div className="flex items-center">
          <div className="grow-0 basis-(--space-5xl)">
            <EntityIcon entity="asset" />
          </div>
          <div className="ps-(--space-lg)">
            <h2>{name}</h2>
          </div>
          <div className="flex-1 ps-(--space-xl)" />
          <div className="flex grow-0 gap-(--space-sm)">
            <Button onClick={() => handleShowPreview(id)} color="sea-green">
              Preview
            </Button>
            <Button onClick={() => handleDownloadAsset(id)} color="sea-serpent">
              Download
            </Button>
          </div>
        </div>
        {variables.length > 0 && (
          <div>
            <h3>Variables:</h3>
            <VariableList variables={variables} />
          </div>
        )}
      </div>
      {preview}
    </>
  );
};

export default ExternalEntity;
