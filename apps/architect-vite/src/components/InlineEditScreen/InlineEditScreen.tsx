import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { submit } from "redux-form";
import Dialog from "~/components/Dialog/Dialog";
import { Layout } from "~/components/EditorLayout";
import Button from "~/lib/legacy-ui/components/Button";
import Form from "./Form";
import { useBodyScrollLock } from "./useBodyScrollLock";

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

	const footer = (
		<div className="inline-edit-screen__controls">
			<Button onClick={onCancel} color="platinum">
				Cancel
			</Button>
			<Button onClick={handleSubmit} type="submit" icon="arrow-right" iconPosition="right">
				Save and Close
			</Button>
		</div>
	);

	return (
		<Dialog
			show={show}
			onClose={onCancel}
			className="inline-edit-dialog"
			header={title ? <h2>{title}</h2> : null}
			footer={footer}
		>
			<Layout>
				{/* @ts-expect-error - reduxForm enhanced component typing issue */}
				<Form form={form} onSubmit={onSubmit} initialValues={initialValues}>
					{children}
				</Form>
			</Layout>
		</Dialog>
	);
};

export default InlineEditScreen;
