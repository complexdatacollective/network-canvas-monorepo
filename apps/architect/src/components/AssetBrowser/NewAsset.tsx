import AutoFileDrop from '../Form/AutoFileDrop';

type NewAssetProps = {
  type?: string | null;
  onCreate?: (ids: string[]) => void;
  disabled?: boolean;
};

/**
 * Data source, which can be async or json file
 *
 * Value should be assetId
 */
const NewAsset = ({
  type = null,
  onCreate,
  disabled = false,
}: NewAssetProps) => {
  const handleDrop = (ids: string[]) => {
    if (onCreate) {
      onCreate(ids);
    }
  };

  return (
    <AutoFileDrop
      type={type ?? undefined}
      onDrop={handleDrop}
      disabled={disabled}
    />
  );
};

export default NewAsset;
