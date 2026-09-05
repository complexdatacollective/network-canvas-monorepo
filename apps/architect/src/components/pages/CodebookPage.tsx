import { useCallback, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Codebook from '~/components/Codebook/Codebook';
import EntityTypeDialog from '~/components/Codebook/EntityTypeDialog';
import UnusedVariablesAlert from '~/components/Codebook/UnusedVariablesAlert';
import PageHeading from '~/components/ProjectNav/PageHeading';
const messages = defineMessages({
  codebook: {
    id: 'architect.pages.codebookPage.codebook',
    defaultMessage: 'Codebook',
    description: 'The title text in components / pages / CodebookPage.',
  },
  overviewOfTheEgoNodeAnd: {
    id: 'architect.pages.codebookPage.overviewOfTheEgoNodeAnd',
    defaultMessage:
      'Overview of the ego, node and edge types, their attributes, and network assets defined in your protocol. Create, edit, and delete types and attributes here. Unused entities can be deleted.',
    description: 'The description text in components / pages / CodebookPage.',
  },
});

type DialogState = {
  entity?: string;
  type?: string;
};

const CodebookPage = () => {
  const intl = useAppIntl();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({});

  const handleOpenEntityDialog = useCallback(
    (entity: string, type?: string) => {
      setDialogState({ entity, type });
      setDialogOpen(true);
    },
    [],
  );

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogState({});
  }, []);

  return (
    <>
      <div className="phone-landscape:px-7 tablet-landscape:px-29 px-5">
        <PageHeading
          title={intl.formatMessage(messages.codebook)}
          description={intl.formatMessage(messages.overviewOfTheEgoNodeAnd)}
        />
        <div className="mx-auto mt-6 w-full max-w-6xl">
          <UnusedVariablesAlert />
          <Codebook onEditEntity={handleOpenEntityDialog} />
        </div>
      </div>
      <EntityTypeDialog
        show={dialogOpen}
        entity={dialogState.entity}
        type={dialogState.type}
        onClose={handleCloseDialog}
      />
    </>
  );
};

export default CodebookPage;
