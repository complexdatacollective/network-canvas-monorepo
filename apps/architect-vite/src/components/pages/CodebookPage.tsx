import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import Codebook from "~/components/Codebook/Codebook";
import EntityTypeDialog from "~/components/Codebook/EntityTypeDialog";
import { Layout } from "~/components/EditorLayout";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { Button } from "~/lib/legacy-ui/components";

type DialogState = {
	entity?: string;
	type?: string;
};

const CodebookPage = () => {
	const [, setLocation] = useLocation();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogState, setDialogState] = useState<DialogState>({});

	// Load the protocol based on URL parameters
	useProtocolLoader();

	const handleGoBack = () => {
		setLocation("/protocol");
	};

	const handleOpenEntityDialog = useCallback((entity: string, type?: string) => {
		setDialogState({ entity, type });
		setDialogOpen(true);
	}, []);

	const handleCloseDialog = useCallback(() => {
		setDialogOpen(false);
		setDialogState({});
	}, []);

	return (
		<div className="relative flex flex-col h-dvh">
			<div className="flex-1 overflow-y-auto">
				<Layout>
					<div className="stage-heading">
						<h1 className="screen-heading">Codebook</h1>
						<p>
							Below you can find an overview of the node and edge types that you have defined while creating your
							interview. Entities that are unused may be deleted.
						</p>
					</div>
					<Codebook onEditEntity={handleOpenEntityDialog} />
				</Layout>
			</div>
			<div className="flex p-6 bg-cyber-grape w-full shrink-0">
				<Button onClick={handleGoBack} color="platinum">
					Go Back
				</Button>
			</div>
			<EntityTypeDialog
				show={dialogOpen}
				entity={dialogState.entity}
				type={dialogState.type}
				onClose={handleCloseDialog}
			/>
		</div>
	);
};

export default CodebookPage;
