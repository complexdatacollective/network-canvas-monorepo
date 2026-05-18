import useProtocolLoader from '~/hooks/useProtocolLoader';

import ProjectActions from './ProjectNav/ProjectActions';
import ProtocolInfoCard from './ProtocolInfoCard';
import Timeline from './Timeline';

const Protocol = () => {
  useProtocolLoader();
  return (
    <div className="mt-(--space-xl) flex flex-col items-center">
      <ProjectActions showReturnToStart />
      <ProtocolInfoCard />
      <Timeline />
    </div>
  );
};

export default Protocol;
