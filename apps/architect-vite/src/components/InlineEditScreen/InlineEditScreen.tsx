import { useCallback } from "react";
import { submit } from "redux-form";
import { Layout } from "~/components/EditorLayout";
import Dialog from "~/components/NewComponents/Dialog";
import { useAppDispatch } from "~/ducks/hooks";
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

	const dispatch = useAppDispatch();

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
			// onCancel={onCancel}
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
