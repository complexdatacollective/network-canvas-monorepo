'use client';

import { DocSearch } from '@docsearch/react';
import { useLocale } from 'next-intl';

import '@docsearch/css';

import { env } from '~/env.mjs';

const DocSearchComponent = () => {
  const locale = useLocale();

  return (
    <DocSearch
      translations={{
        button: {
          buttonAriaLabel: 'Open search modal',
          buttonText: 'Search documentation',
        },
      }} // TODO: connect this to next-intl
      appId={env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID}
      indexName={env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME}
      apiKey={env.NEXT_PUBLIC_ALGOLIA_API_KEY}
      insights={true}
      placeholder="Search documentation"
      searchParameters={{
        filters: `lang:${locale}`,
      }}
    />
  );
};

export default DocSearchComponent;
