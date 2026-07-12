import { useCallback, useState } from 'react';

import Codebook from '~/components/Codebook/Codebook';
import EntityTypeDialog from '~/components/Codebook/EntityTypeDialog';
import UnusedVariablesAlert from '~/components/Codebook/UnusedVariablesAlert';
import { Layout } from '~/components/EditorLayout';
import PageHeading from '~/components/ProjectNav/PageHeading';
import useProtocolLoader from '~/hooks/useProtocolLoader';

type DialogState = {
  entity?: string;
  type?: string;
};

const CodebookPage = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({});

  // Load the protocol based on URL parameters
  useProtocolLoader();

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
      <Layout>
        <PageHeading
          title="Codebook"
          description="Overview of the ego, node and edge types, their variables, and network assets defined in your protocol. Create, edit, and delete types and variables here. Unused entities can be deleted."
        />
        <div className="mx-29 w-full max-w-7xl">
          <UnusedVariablesAlert />
          <Codebook onEditEntity={handleOpenEntityDialog} />
        </div>
      </Layout>
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
