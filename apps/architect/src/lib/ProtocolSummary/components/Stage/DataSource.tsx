import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import AssetBadge from '../AssetBadge';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  dataSource: {
    id: 'architect.protocolSummary.stage.dataSource.dataSource',
    defaultMessage: 'DataSource',
    description:
      "Section heading in the printable protocol summary, above the uploaded network data file that supplies a stage's nodes.",
  },
});

type DataSourceProps = {
  dataSource?: string | null;
};

const DataSource = ({ dataSource = null }: DataSourceProps) => {
  const intl = useAppIntl();
  if (!dataSource) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.dataSource)}>
      <AssetBadge id={dataSource} link />
    </SectionFrame>
  );
};

export default DataSource;
