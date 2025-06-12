import Button from "@codaco/legacy-ui/components/Button";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDispatch } from "react-redux";
import { submit } from "redux-form";
import { Layout } from "~/components/EditorLayout";
import Form from "./Form";
import { useBodyScrollLock } from "./useBodyScrollLock";

const screenVariants = {
	visible: {
		scale: 1,
		opacity: 1,
		transition: {
			when: "beforeChildren",
		},
	},
	hidden: {
		scale: 0.8,
		opacity: 0,
	},
};

const item = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 },
};

interface InlineEditScreenProps {
	show?: boolean;
	form: string;
	title?: string | null;
	onSubmit: (values: unknown) => void;
	onCancel: () => void;
	children?: React.ReactNode;
	initialValues?: Record<string, unknown>;
}

const InlineEditScreen = ({
	show = false,
	form,
	title = null,
	onSubmit,
	onCancel,
	children = null,
	initialValues,
}: InlineEditScreenProps) => {

	// Prevent scrolling of the body when the inline edit screen is open
	useBodyScrollLock(show);

	const dispatch = useDispatch();

	const handleSubmit = useCallback(() => {
		dispatch(submit(form));
	}, [form, dispatch]);

	return createPortal(
		<AnimatePresence>
			{show && (
				<div className="inline-edit-screen" onClick={(e) => e.stopPropagation()}>
					<motion.div
						className="inline-edit-screen__container"
						variants={screenVariants}
						initial="hidden"
						animate="visible"
						exit="hidden"
					>
						<motion.div variants={item} className="inline-edit-screen__header">
							<h2>{title}</h2>
						</motion.div>
						<motion.div variants={item} className="inline-edit-screen__content">
							<Layout>
								{/* @ts-expect-error - reduxForm enhanced component typing issue */}
								<Form form={form} onSubmit={onSubmit} initialValues={initialValues} key={`${form}-${JSON.stringify(initialValues)}`}>
									{children}
								</Form>
							</Layout>
						</motion.div>
						<motion.div variants={item} className="inline-edit-screen__controls">
							<Button onClick={onCancel} color="platinum">
								Cancel
							</Button>
							<Button onClick={handleSubmit} type="submit" icon="arrow-right" iconPosition="right">
								Save and Close
							</Button>
						</motion.div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
};

export default InlineEditScreen;
