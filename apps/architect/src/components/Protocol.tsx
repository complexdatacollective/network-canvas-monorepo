import useProtocolLoader from '~/hooks/useProtocolLoader';

import ProtocolInfoCard from './ProtocolInfoCard';
import TestingMapboxTokenAlert from './TestingMapboxTokenAlert';
import Timeline from './Timeline';
import VariableRoleConflictsAlert from './VariableRoleConflictsAlert';

const Protocol = () => {
  useProtocolLoader();
  return (
    <div className="mt-10 flex flex-col items-center">
      <TestingMapboxTokenAlert />
      <VariableRoleConflictsAlert />
      <ProtocolInfoCard />
      <Timeline />
    </div>
  );
};

export default Protocol;
