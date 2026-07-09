import type React from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';

import withAssetMeta from './withAssetMeta';
type APIKeyProps = {
  meta?: {
    value?: string;
    name?: string;
  };
};

const APIKey = ({ meta = { value: '' } }: APIKeyProps) => (
  <Heading level="h1" className="wrap-break-word">
    {meta.value}
  </Heading>
);

export default withAssetMeta(APIKey) as React.ComponentType<unknown>;
