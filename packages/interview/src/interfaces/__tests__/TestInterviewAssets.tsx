import type { ReactNode } from 'react';

import { InterviewQueryClientProvider } from '../../contexts/InterviewQueryClientProvider';
import { ContractProvider } from '../../contract/context';

const noAsset = (assetId: string) =>
  Promise.reject(new Error(`No asset "${assetId}" in this test`));
const noFinish = () => Promise.resolve();

/**
 * What Shell gives a stage for reading protocol assets: the host's asset
 * handler and the interview's query cache. For tests that render a stage or
 * component on its own, with no assets to read.
 */
export function TestInterviewAssets({ children }: { children: ReactNode }) {
  return (
    <ContractProvider onFinish={noFinish} onRequestAsset={noAsset}>
      <InterviewQueryClientProvider protocolKey="test-protocol">
        {children}
      </InterviewQueryClientProvider>
    </ContractProvider>
  );
}
