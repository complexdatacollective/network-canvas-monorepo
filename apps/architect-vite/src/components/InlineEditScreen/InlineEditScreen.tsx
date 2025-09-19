import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { submit } from "redux-form";
import Dialog from "~/components/NewComponents/Dialog";
import { Layout } from "~/components/EditorLayout";
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

	return (
		<Dialog
			open={show}
			onOpenChange={(open) => {
				if (!open) {
					onCancel();
				}
			}}
			title={title || undefined}
			onConfirm={handleSubmit}
			confirmText="Save and Close"
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
