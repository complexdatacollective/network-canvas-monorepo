import { type CurrentProtocol, type Stage, type StageType, validateProtocol } from "@codaco/protocol-validation";
import { omit } from "es-toolkit/compat";
import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { getFormValues, isDirty as isFormDirty } from "redux-form";
import { v1 as uuid } from "uuid";
import { useLocation } from "wouter";
import Editor from "~/components/Editor";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import { buildCleanProtocol } from "~/ducks/modules/protocol/utils/buildCleanProtocol";
import type { RootState } from "~/ducks/store";
import { Button } from "~/lib/legacy-ui/components";
import { getProtocol, getStage, getStageIndex } from "~/selectors/protocol";
import { ensureError } from "~/utils/ensureError";
import { getProgressText, type UploadProgress, uploadProtocolForPreview } from "~/utils/preview/uploadPreview";
import { formName } from "./configuration";
import type { SectionComponent } from "./Interfaces";
import { getInterface } from "./Interfaces";
import StageHeading from "./StageHeading";

type StageEditorProps = {
	id?: string | null;
	insertAtIndex?: number;
	type?: string;
};

/**
 * Builds a clean protocol with the current wip stage inserted or updated.
 * Allows for validating and previewing the protocol with the current stage changes.
 * If inserting a new stage (i.e., stageId is null), generates a temporary ID for the stage for validation/preview purposes.
 */
function buildCleanProtocolWithStage(
	protocol: CurrentProtocol,
	stage: Stage,
	stageId: string | null,
	insertAtIndex?: number,
): CurrentProtocol {
	const cleanProtocol = buildCleanProtocol(protocol);

	// For new stages, generate a temp ID for validation/preview
	const stageWithId = stageId ? stage : { ...stage, id: uuid() };

	return {
		...cleanProtocol,
		stages: stageId
			? cleanProtocol.stages.map((s) => (s.id === stageId ? stageWithId : s))
			: [
					...cleanProtocol.stages.slice(0, insertAtIndex ?? cleanProtocol.stages.length),
					stageWithId,
					...cleanProtocol.stages.slice(insertAtIndex ?? cleanProtocol.stages.length),
				],
	};
}

const StageEditor = (props: StageEditorProps) => {
	const { id = null, type, insertAtIndex } = props;

	const dispatch = useAppDispatch();
	const [, setLocation] = useLocation();

	// Get stage metadata from Redux state
	const stage = useSelector((state: RootState) => getStage(state, id || ""));
	const stageIndex = useSelector((state: RootState) => getStageIndex(state, id || ""));
	const protocol = useSelector(getProtocol);
	const stagePath = stageIndex !== -1 ? `stages[${stageIndex}]` : null;
	const interfaceType = (stage?.type || type || "Information") as StageType;
	const template = getInterface(interfaceType).template || {};
	const initialValues = stage || { ...template, type: interfaceType };

	// Get form state
	const hasUnsavedChanges = useSelector((state: RootState) => isFormDirty(formName)(state));
	const formValues = useSelector((state: RootState) => getFormValues(formName)(state)) as Stage | undefined;

	// Preview state
	const [isUploadingPreview, setIsUploadingPreview] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

	// Handle form submission
	const onSubmit = useCallback(
		(stageData: Record<string, unknown>) => {
			const normalizedStage = omit(stageData, "_modified") as Stage;

			if (id) {
				dispatch(stageActions.updateStage(id, normalizedStage));
			} else {
				dispatch(stageActions.createStage({ options: normalizedStage, index: insertAtIndex }));
			}

			setLocation("/protocol");
		},
		[id, insertAtIndex, setLocation, dispatch],
	);

	// Cancel handler with unsaved changes confirmation
	const handleCancel = useCallback((): boolean => {
		if (!hasUnsavedChanges) {
			setLocation("/protocol");
			return true;
		}

		// Show confirmation dialog for unsaved changes
		dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Unsaved Changes",
				message: "You have unsaved changes. Are you sure you want to leave without saving?",
				confirmLabel: "Leave Without Saving",
				onConfirm: () => {
					setLocation("/protocol");
				},
			}),
		);
		return false;
	}, [hasUnsavedChanges, setLocation, dispatch]);

	const handlePreview = useCallback(async () => {
		if (!protocol || !formValues) {
			dispatch(
				dialogActions.openDialog({
					type: "Error",
					title: "Preview Error",
					message: "No protocol loaded",
				}),
			);
			return;
		}

		const normalizedStage = omit(formValues, ["_modified"]) as Stage;
		const previewProtocol = buildCleanProtocolWithStage(protocol, normalizedStage, id, insertAtIndex);

		// Validate the protocol before previewing
		const validationResult = await validateProtocol(previewProtocol);
		if (!validationResult.success) {
			dispatch(
				dialogActions.openDialog({
					type: "Error",
					title: "Cannot Preview",
					message: ensureError(validationResult.error).message,
				}),
			);
			return;
		}

		setIsUploadingPreview(true);
		setUploadProgress(null);

		try {
			const startStage = stageIndex !== -1 ? stageIndex : (insertAtIndex ?? protocol.stages.length);
			const { previewUrl } = await uploadProtocolForPreview(previewProtocol, startStage, setUploadProgress);
			window.open(previewUrl, "_blank", "noopener,noreferrer");
		} catch (error) {
			dispatch(
				dialogActions.openDialog({
					type: "Error",
					title: "Preview Failed",
					message: error instanceof Error ? error.message : "Failed to upload protocol for preview",
				}),
			);
		} finally {
			setIsUploadingPreview(false);
			setUploadProgress(null);
		}
	}, [protocol, stageIndex, dispatch, formValues, id, insertAtIndex]);
	const sections = useMemo(() => getInterface(interfaceType).sections, [interfaceType]);

	const renderSections = (sectionsList: readonly SectionComponent[]) =>
		sectionsList.map((SectionComponent: SectionComponent, sectionIndex: number) => {
			const sectionKey = `${interfaceType}-${sectionIndex}`;
			return <SectionComponent key={sectionKey} form={formName} stagePath={stagePath} interfaceType={interfaceType} />;
		});

	return (
		<Editor initialValues={initialValues} onSubmit={onSubmit} form={formName}>
			<div className="relative flex flex-col h-dvh">
				<div className="overflow-auto flex flex-col items-center basis-auto">
					<StageHeading />
					<div className="flex flex-col gap-10 mb-32">{renderSections(sections)}</div>
				</div>
				<div className="p-4 bg-surface-accent z-panel shrink-0 grow-0">
					<div className="flex justify-between items-center max-w-6xl mx-auto">
						<Button key="cancel" onClick={handleCancel} color="platinum">
							Cancel
						</Button>
						<div className="flex gap-2">
							<Button key="preview" onClick={handlePreview} color="barbie-pink" disabled={isUploadingPreview}>
								{isUploadingPreview ? getProgressText(uploadProgress) : "Preview"}
							</Button>
							{hasUnsavedChanges && (
								<Button type="submit" color="sea-green" iconPosition="right" icon="arrow-right">
									Finished Editing
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		</Editor>
	);
};

export default StageEditor;
