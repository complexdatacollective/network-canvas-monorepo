'use client';

import type { StageProps } from '~/types';

type NetworkComposerProps = StageProps<'NetworkComposer'>;

const NetworkComposer = (_props: NetworkComposerProps) => {
  return (
    <div
      className="interface h-dvh overflow-hidden"
      data-testid="network-composer"
    />
  );
};

export default NetworkComposer;
