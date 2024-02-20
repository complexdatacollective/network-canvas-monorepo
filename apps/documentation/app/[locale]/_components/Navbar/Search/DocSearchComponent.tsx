'use client';

import { DocSearch } from '@docsearch/react';
import '@docsearch/css';
import { env } from '@/env.mjs';
import { useLocale } from 'next-intl';

const DocSearchComponent = () => {
  const locale = useLocale();

  return (
    <DocSearch
      appId={env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID}
      indexName={env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME}
      apiKey={env.NEXT_PUBLIC_ALGOLIA_API_KEY}
      insights={true}
      searchParameters={{
        filters: `lang:${locale}`,
      }}
    />
  );
};

export default DocSearchComponent;
