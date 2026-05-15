import useProtocolLoader from '~/hooks/useProtocolLoader';

import ProtocolInfoCard from './ProtocolInfoCard';
import Timeline from './Timeline';

const Protocol = () => {
  useProtocolLoader();
  return (
    <div className="mt-(--space-xl) flex flex-col items-center">
      <ProtocolInfoCard />
      <Timeline />
    </div>
  );
};

export default Protocol;
