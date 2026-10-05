import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { DataTableSkeleton } from '@codaco/fresco-ui/DataTable/DataTableSkeleton';
import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import { getServerIntl } from '~/i18n/server';
import { requirePageAuth } from '~/lib/auth/guards';
import { requireAppNotExpired } from '~/queries/appSettings';

import ProtocolsTable from '../_components/ProtocolsTable/ProtocolsTable';
import UpdateUploadThingTokenAlert from '../_components/UpdateUploadThingTokenAlert';

const messages = defineMessages({
  protocols: {
    id: 'fresco.protocols.page.protocols',
    defaultMessage: 'Protocols',
    description: 'Researcher-facing protocols / page: Protocols',
  },
  uploadAndManageYourInterviewProtocols: {
    id: 'fresco.protocols.page.uploadAndManageYourInterviewProtocols',
    defaultMessage: 'Upload and manage your interview protocols.',
    description:
      'Researcher-facing protocols / page: Upload and manage your interview protocols.',
  },
});

export default async function ProtocolsPage() {
  const intl = await getServerIntl();

  return (
    <>
      <PageHeader
        headerText={intl.formatMessage(messages.protocols)}
        subHeaderText={intl.formatMessage(
          messages.uploadAndManageYourInterviewProtocols,
        )}
        data-testid="protocols-page-header"
      />
      <Suspense
        fallback={
          <ResponsiveContainer
            maxWidth="6xl"
            baseSize="content"
            container={false}
          >
            <DataTableSkeleton
              columnCount={4}
              searchableColumnCount={1}
              headerItemsCount={1}
            />
          </ResponsiveContainer>
        }
      >
        <AuthenticatedProtocols />
      </Suspense>
    </>
  );
}

async function AuthenticatedProtocols() {
  await requireAppNotExpired();
  await requirePageAuth();
  return (
    <>
      <Suspense fallback={null}>
        <UpdateUploadThingTokenAlert />
      </Suspense>
      <ResponsiveContainer maxWidth="6xl" baseSize="content" container={false}>
        <ProtocolsTable />
      </ResponsiveContainer>
    </>
  );
}
