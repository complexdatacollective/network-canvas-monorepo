import { useCallback, useState } from "react";
import Codebook from "~/components/Codebook/Codebook";
import EntityTypeDialog from "~/components/Codebook/EntityTypeDialog";
import { Layout } from "~/components/EditorLayout";
import PageHeading from "~/components/ProjectNav/PageHeading";
import useProtocolLoader from "~/hooks/useProtocolLoader";

type DialogState = {
	entity?: string;
	type?: string;
};

const CodebookPage = () => {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogState, setDialogState] = useState<DialogState>({});

	// Load the protocol based on URL parameters
	useProtocolLoader();

	const handleOpenEntityDialog = useCallback((entity: string, type?: string) => {
		setDialogState({ entity, type });
		setDialogOpen(true);
	}, []);

	const handleCloseDialog = useCallback(() => {
		setDialogOpen(false);
		setDialogState({});
	}, []);

	return (
		<>
			<Layout>
				<PageHeading
					title="Codebook"
					description="Overview of the node and edge types defined in your protocol. Unused entities can be deleted."
				/>
				<div className="mx-(--space-5xl) w-full max-w-[80rem]">
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
