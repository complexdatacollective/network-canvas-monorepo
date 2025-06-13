import { useState } from "react";
import { useLocation } from "wouter";
import Dialog from "./Dialog";
import Button from "@codaco/legacy-ui/components/Button";

type NewTypeDialogProps = {
	show?: boolean;
	entityType: "node" | "edge";
	onComplete?: () => void;
	onCancel?: () => void;
};

// Helper function to get protocol ID from URL
const getProtocolId = () => {
	const urlPath = window.location.pathname;
	return urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
};

const NewTypeDialog = ({ 
	show = false, 
	entityType, 
	onComplete = () => {}, 
	onCancel = () => {} 
}: NewTypeDialogProps) => {
	const [, setLocation] = useLocation();

	const handleCreateNewType = () => {
		const protocolId = getProtocolId();
		if (protocolId) {
			onComplete();
			setLocation(`/protocol/${protocolId}/codebook/${entityType}/new`);
		}
	};

	const buttons = [
		<Button key="cancel" onClick={onCancel} color="platinum">
			Cancel
		</Button>,
		<Button key="create" onClick={handleCreateNewType} iconPosition="right" icon="arrow-right">
			Create New {entityType === "node" ? "Node" : "Edge"} Type
		</Button>,
	];

	return (
		<Dialog
			show={show}
			onClose={onCancel}
			className="new-type-dialog"
			header={<h2>Create New {entityType === "node" ? "Node" : "Edge"} Type</h2>}
			footer={<div className="flex gap-2 justify-end">{buttons}</div>}
		>
			<div className="p-4">
				<p>
					You are about to create a new {entityType} type. This will open the type editor where you can 
					define the name, color, and variables for this {entityType} type.
				</p>
			</div>
		</Dialog>
	);
};

export default NewTypeDialog;