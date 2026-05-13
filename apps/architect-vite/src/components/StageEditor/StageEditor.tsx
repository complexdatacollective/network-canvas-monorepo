import { Popover } from "@base-ui/react/popover";
import { type CurrentProtocol, type Stage, type StageType, validateProtocol } from "@codaco/protocol-validation";
import { omit } from "es-toolkit/compat";
import { Settings } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { getFormValues, isDirty as isFormDirty, isInvalid } from "redux-form";
import { v1 as uuid } from "uuid";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import Editor from "~/components/Editor";
import Issues from "~/components/Issues";
import Switch from "~/components/NewComponents/Switch";
import Tooltip from "~/components/NewComponents/Tooltip";
import { launchPreview } from "~/components/PreviewHost/launchPreview";
import { useAppDispatch } from "~/ducks/hooks";
import { getPreviewUseSyntheticData, setPreviewUseSyntheticData } from "~/ducks/modules/app";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { actionCreators as stageActions } from "~/ducks/modules/protocol/stages";
import type { RootState } from "~/ducks/store";
import { Button } from "~/lib/legacy-ui/components";
import { getProtocol, getStage, getStageIndex } from "~/selectors/protocol";
import { ensureError } from "~/utils/ensureError";
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
 * Builds a protocol with the current wip stage inserted or updated.
 * Allows for validating and previewing the protocol with the current stage changes.
 * If inserting a new stage (i.e., stageId is null), generates a temporary ID for the stage for validation/preview purposes.
 */
function buildProtocolWithStage(
	protocol: CurrentProtocol,
	stage: Stage,
	stageId: string | null,
	insertAtIndex?: number,
): CurrentProtocol {
	// For new stages, generate a temp ID for validation/preview
	const stageWithId = stageId ? stage : { ...stage, id: uuid() };

	return {
		...protocol,
		stages: stageId
			? protocol.stages.map((s) => (s.id === stageId ? stageWithId : s))
			: [
					...protocol.stages.slice(0, insertAtIndex ?? protocol.stages.length),
					stageWithId,
					...protocol.stages.slice(insertAtIndex ?? protocol.stages.length),
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
	const isStageInvalid = useSelector((state: RootState) => isInvalid(formName)(state));

	// Preview state
	const [isOpeningPreview, setIsOpeningPreview] = useState(false);
	const useSyntheticData = useSelector(getPreviewUseSyntheticData);

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
		const previewProtocol = buildProtocolWithStage(protocol, normalizedStage, id, insertAtIndex);

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

		const startStage = stageIndex !== -1 ? stageIndex : (insertAtIndex ?? protocol.stages.length);
		setIsOpeningPreview(true);
		try {
			await launchPreview({ protocol: previewProtocol, startStage, useSyntheticData });
		} catch (error) {
			dispatch(
				dialogActions.openDialog({
					type: "Error",
					title: "Preview Failed",
					message: error instanceof Error ? error.message : "Failed to open preview",
				}),
			);
		} finally {
			setIsOpeningPreview(false);
		}
	}, [protocol, stageIndex, dispatch, formValues, id, insertAtIndex, useSyntheticData]);
	const sections = useMemo(() => getInterface(interfaceType).sections, [interfaceType]);

	const renderSections = (sectionsList: readonly SectionComponent[]) =>
		sectionsList.map((SectionComponent: SectionComponent, sectionIndex: number) => {
			const sectionKey = `${interfaceType}-${sectionIndex}`;
			return <SectionComponent key={sectionKey} form={formName} stagePath={stagePath} interfaceType={interfaceType} />;
		});

	const previewOptions = (
		<Popover.Root>
			<Popover.Trigger
				render={
					<button type="button" aria-label="Preview options" className="rounded-md p-2 hover:bg-input-active">
						<Settings className="size-4" />
					</button>
				}
			/>
			<Popover.Portal>
				<Popover.Positioner side="top" sideOffset={8}>
					<Popover.Popup className="rounded-md bg-surface-accent p-3 text-surface-accent-foreground shadow-lg">
						<label className="flex items-center gap-3">
							<Switch
								checked={useSyntheticData}
								onCheckedChange={(checked) => dispatch(setPreviewUseSyntheticData(checked))}
							/>
							<span className="text-sm">Start preview with example data</span>
						</label>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);

	const previewButton = (
		<span key="preview" className="inline-flex items-center gap-1">
			{previewOptions}
			<Button onClick={handlePreview} color="barbie-pink" disabled={isOpeningPreview || isStageInvalid}>
				{isOpeningPreview ? "Opening preview…" : "Preview"}
			</Button>
		</span>
	);

	return (
		<Editor initialValues={initialValues} onSubmit={onSubmit} form={formName}>
			<div className="relative flex flex-col h-dvh">
				<div className="overflow-auto flex flex-col items-center basis-auto">
					<StageHeading />
					<div className="flex flex-col gap-10 mb-32">{renderSections(sections)}</div>
				</div>
				<Issues />
				<ControlBar
					secondaryButtons={[
						<Button key="cancel" onClick={handleCancel} color="platinum">
							Cancel
						</Button>,
					]}
					buttons={[
						isStageInvalid ? (
							<Tooltip
								key="preview"
								content="Previewing this stage requires valid stage configuration. Fix the errors on this stage to enable previewing."
							>
								{previewButton}
							</Tooltip>
						) : (
							previewButton
						),
						...(hasUnsavedChanges
							? [
									<Button key="submit" type="submit" color="sea-green" iconPosition="right" icon="arrow-right">
										Finished Editing
									</Button>,
								]
							: []),
					]}
				/>
			</div>
		</Editor>
	);
};

export default StageEditor;
