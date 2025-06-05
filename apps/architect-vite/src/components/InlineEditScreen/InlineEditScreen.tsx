import Button from "@codaco/legacy-ui/components/Button";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { connect } from "react-redux";
import { compose } from "recompose";
import { submit } from "redux-form";
import { Layout } from "~/components/EditorLayout";
import Form from "./Form";

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
	submitForm: (form: string) => void;
	title?: string | null;
	layoutId?: string | null;
	onSubmit: (values: any) => void;
	onCancel: () => void;
	children?: React.ReactNode;
	[key: string]: any;
}

const InlineEditScreen = ({ show = false, form, submitForm, title = null, layoutId = null, onSubmit, onCancel, children = null, ...rest }: InlineEditScreenProps) => {
	const handleSubmit = useCallback(() => {
		submitForm(form);
	}, [form, submitForm]);

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
								<Form
									form={form}
									onSubmit={onSubmit}
									// eslint-disable-next-line react/jsx-props-no-spreading
									{...rest}
								>
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


const mapDispatchToProps = {
	submitForm: submit,
};

export default compose(connect(null, mapDispatchToProps))(InlineEditScreen);
