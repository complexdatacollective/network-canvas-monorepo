import useProtocolLoader from '~/hooks/useProtocolLoader';

import ProtocolInfoCard from './ProtocolInfoCard';
import TestingMapboxTokenAlert from './TestingMapboxTokenAlert';
import Timeline from './Timeline';

const Protocol = () => {
  useProtocolLoader();
  return (
    <div className="mt-(--space-xl) flex flex-col items-center">
      <ProtocolInfoCard />
      <TestingMapboxTokenAlert />
      <Timeline />
    </div>
  );
};

export default Protocol;
