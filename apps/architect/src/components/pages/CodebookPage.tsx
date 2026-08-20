import { useCallback, useState } from 'react';

import Codebook from '~/components/Codebook/Codebook';
import EntityTypeDialog from '~/components/Codebook/EntityTypeDialog';
import UnusedVariablesAlert from '~/components/Codebook/UnusedVariablesAlert';
import { Layout } from '~/components/EditorLayout';
import PageHeading from '~/components/ProjectNav/PageHeading';

type DialogState = {
  entity?: string;
  type?: string;
};

const CodebookPage = () => {
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
      <Layout className="phone-landscape:px-7 tablet-landscape:px-29 px-5">
        <PageHeading
          title="Codebook"
          description="Overview of the ego, node and edge types, their attributes, and network assets defined in your protocol. Create, edit, and delete types and attributes here. Unused entities can be deleted."
        />
        <div className="mx-auto w-full max-w-6xl">
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
