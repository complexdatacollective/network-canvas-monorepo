import { useCallback } from 'react';
import { useSearchParams } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Codebook from '~/components/Codebook/Codebook';
import { readCodebookLink } from '~/components/Codebook/codebookLinks';
import UnusedVariablesAlert from '~/components/Codebook/UnusedVariablesAlert';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { pageInsetClasses } from '~/components/ProjectNav/pageInset';
const messages = defineMessages({
  codebook: {
    id: 'architect.pages.codebookPage.codebook',
    defaultMessage: 'Codebook',
    description:
      'Heading of the Codebook page, which lists the ego, node types and edge types of the protocol and their attributes.',
  },
  overviewOfTheEgoNodeAnd: {
    id: 'architect.pages.codebookPage.overviewOfTheEgoNodeAnd',
    defaultMessage:
      'Overview of the ego, node and edge types, their attributes, and network assets defined in your protocol. Create, edit, and delete types and attributes here. Unused entities can be deleted.',
    description:
      'Introductory text under the heading of the Codebook page. Describes what the page shows and that unused types and attributes (codebook variables) can be deleted.',
  },
});

const CodebookPage = () => {
  const intl = useAppIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const link = readCodebookLink(searchParams);

  const handleCloseLink = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return (
    <div className={pageInsetClasses}>
      <PageHeading
        title={intl.formatMessage(messages.codebook)}
        description={intl.formatMessage(messages.overviewOfTheEgoNodeAnd)}
      />
      <div className="mx-auto mt-6 w-full max-w-6xl">
        <UnusedVariablesAlert />
        <Codebook link={link} onLinkClosed={handleCloseLink} />
      </div>
    </div>
  );
};

export default CodebookPage;
