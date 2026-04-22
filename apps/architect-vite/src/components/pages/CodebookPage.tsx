import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import Codebook from "~/components/Codebook/Codebook";
import EntityTypeDialog from "~/components/Codebook/EntityTypeDialog";
import AppBackground from "~/components/shared/AppBackground";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

type DialogState = {
	entity?: string;
	type?: string;
};

const CodebookPage = () => {
	useProtocolLoader();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogState, setDialogState] = useState<DialogState>({});

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
			<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
				<ProtocolHeader
					protocolName={protocolName}
					subsection="Codebook"
					actions={<SubRouteNav active="codebook" />}
					onLogoClick={() => navigate("/protocol")}
				/>
				<main className="flex-1 overflow-auto">
					<div className="mx-auto max-w-5xl px-6 py-8">
						<Card padding="lg">
							<Codebook onEditEntity={handleOpenEntityDialog} />
						</Card>
					</div>
				</main>
				<EntityTypeDialog
					show={dialogOpen}
					entity={dialogState.entity}
					type={dialogState.type}
					onClose={handleCloseDialog}
				/>
			</div>
			<AppBackground />
		</>
	);
};

export default CodebookPage;
