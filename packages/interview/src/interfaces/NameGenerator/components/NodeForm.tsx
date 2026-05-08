import Button from "@codaco/fresco-ui/Button";
import Dialog from "@codaco/fresco-ui/dialogs/Dialog";
import Form from "@codaco/fresco-ui/form/Form";
import type { FormSubmitHandler } from "@codaco/fresco-ui/form/store/types";
import Icon, { type InterviewerIconName } from "@codaco/fresco-ui/Icon";
import { cx } from "@codaco/fresco-ui/utils/cva";
import type { Form as TForm } from "@codaco/protocol-validation";
import {
	type EntityAttributesProperty,
	type EntityPrimaryKey,
	entityAttributesProperty,
	entityPrimaryKeyProperty,
	type NcNode,
	type VariableValue,
} from "@codaco/shared-consts";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTrack } from "../../../analytics/useTrack";
import {
	actionCircleVariants,
	actionIconClass,
	actionPlusBadgeVariants,
	actionPlusIconClass,
} from "../../../components/actionButtonVariants";
import { useCurrentStep } from "../../../contexts/CurrentStepContext";
import useProtocolForm from "../../../forms/useProtocolForm";
import { useCelebrate } from "../../../hooks/useCelebrate";
import { useStageSelector } from "../../../hooks/useStageSelector";
import { getNodeIconName } from "../../../selectors/name-generator";
import { getPromptAdditionalAttributes } from "../../../selectors/session";
import { updateNode as updateNodeAction } from "../../../store/modules/session";
import { useAppDispatch } from "../../../store/store";

type NodeFormProps = {
	selectedNode: NcNode | null;
	form: TForm;
	disabled: boolean;
	onClose: () => void;
	addNode: (attributes: NcNode[EntityAttributesProperty]) => void;
};

const NodeForm = (props: NodeFormProps) => {
	const { selectedNode, form, disabled, onClose, addNode } = props;

	const newNodeAttributes = useStageSelector(getPromptAdditionalAttributes);
	const icon = useStageSelector(getNodeIconName);

	const [show, setShow] = useState(false);

	const dispatch = useAppDispatch();
	const { currentStep } = useCurrentStep();
	const track = useTrack();

	const circleRef = useRef<HTMLDivElement>(null);
	const celebrate = useCelebrate(circleRef, { particles: true });

	const updateNode = useCallback(
		(payload: {
			nodeId: NcNode[EntityPrimaryKey];
			newModelData?: Record<string, unknown>;
			newAttributeData: NcNode[EntityAttributesProperty];
		}) => dispatch(updateNodeAction({ ...payload, currentStep })),
		[dispatch, currentStep],
	);

	// When a selected node is passed in, we are editing an existing node.
	// We need to show the form and populate it with the node's data.
	useEffect(() => {
		if (selectedNode) {
			setShow(true);
		}
	}, [selectedNode]);

	const previousShowRef = useRef(false);
	useEffect(() => {
		if (show && !previousShowRef.current) {
			track("node_form_opened", {
				...(selectedNode ? { node_id: selectedNode[entityPrimaryKeyProperty] } : {}),
			});
		}
		previousShowRef.current = show;
	}, [show, selectedNode, track]);

	const handleClose = useCallback(() => {
		track("node_form_dismissed_without_save", {
			...(selectedNode ? { node_id: selectedNode[entityPrimaryKeyProperty] } : {}),
		});
		setShow(false);
		onClose();
	}, [onClose, selectedNode, track]);

	const variants = {
		initial: { opacity: 0, y: "100%" },
		animate: {
			opacity: 1,
			y: 0,
		},
	};

	// Convert null values to undefined for form compatibility
	const initialValues = selectedNode?.[entityAttributesProperty]
		? Object.fromEntries(
				Object.entries(selectedNode[entityAttributesProperty]).map(([key, value]) => [key, value ?? undefined]),
			)
		: undefined;

	const { fieldComponents } = useProtocolForm({
		fields: form.fields,
		autoFocus: true,
		initialValues,
		currentEntityId: selectedNode?.[entityPrimaryKeyProperty],
	});

	// Handle form submission
	const handleSubmit: FormSubmitHandler = useCallback(
		(values) => {
			const variableValues = values as Record<string, VariableValue>;
			const isNewNode = !selectedNode;

			if (isNewNode) {
				addNode({ ...newNodeAttributes, ...variableValues });
			} else {
				const selectedUID = selectedNode[entityPrimaryKeyProperty];
				void updateNode({
					nodeId: selectedUID,
					newAttributeData: variableValues,
				});
			}

			setShow(false);
			onClose();

			if (isNewNode) {
				celebrate();
			}

			return { success: true as const };
		},
		[selectedNode, addNode, newNodeAttributes, updateNode, onClose, celebrate],
	);

	return (
		<>
			<div className="pointer-events-none absolute right-0 bottom-0 z-10 h-48 w-xl bg-[radial-gradient(ellipse_at_bottom_right,oklch(from_var(--background)_calc(l-0.1)_c_h),transparent_70%)]" />
			<AnimatePresence>
				<motion.div key="add-button" className="absolute right-12 bottom-4 z-20" variants={variants}>
					<button
						type="button"
						onClick={() => setShow(true)}
						disabled={disabled}
						aria-label="Add a person"
						className="focusable relative aspect-square size-28 rounded-full"
					>
						<motion.div
							ref={circleRef}
							data-toggle-circle
							className={cx(
								actionCircleVariants(),
								"relative aspect-square size-28 transition-[background-color,filter] duration-300",
								disabled ? "cursor-not-allowed saturate-0" : "cursor-pointer",
							)}
							style={{ backgroundColor: "var(--primary)" }}
						>
							<motion.div className="h-full">
								<Icon name={icon as InterviewerIconName} className={actionIconClass} />
							</motion.div>
						</motion.div>
						<motion.div className={actionPlusBadgeVariants()}>
							<Plus className={actionPlusIconClass} />
						</motion.div>
					</button>
				</motion.div>
			</AnimatePresence>
			<Dialog
				open={show}
				title={form.title}
				closeDialog={handleClose}
				footer={
					<Button key="submit" type="submit" form="node-form" aria-label="Finished" color="primary">
						Finished
					</Button>
				}
			>
				<Form id="node-form" onSubmit={handleSubmit} className="w-full">
					{fieldComponents}
				</Form>
			</Dialog>
		</>
	);
};

export default NodeForm;
