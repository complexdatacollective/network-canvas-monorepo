import AssetBadge from '../AssetBadge';
import SectionFrame from './SectionFrame';

type DataSourceProps = {
  dataSource?: string | null;
};

const DataSource = ({ dataSource = null }: DataSourceProps) => {
  if (!dataSource) {
    return null;
  }

  return (
    <SectionFrame title="DataSource">
      <AssetBadge id={dataSource} link />
    </SectionFrame>
  );
};

export default DataSource;
