import { useEditHandlers } from "./useEditHandlers";

// Example of how to use the hook instead of the HOC

// Before (with HOC):
// const EnhancedComponent = withEditHandlers(MyEditableListComponent);

// After (with hook):
const MyEditableListComponent = ({ form, fieldName, ...otherProps }) => {
	const { editField, itemCount, initialValues, handleEditField, handleCancelEditField, handleAddNew, handleUpdate } =
		useEditHandlers({
			form,
			fieldName,
			normalize: (value) => value, // Optional: customize normalization
			template: () => ({ name: "", value: "" }), // Optional: customize template
			onChange: async (value) => {
				// Optional: add custom processing before save
				return value;
			},
		});

	return (
		<div>
			<button onClick={handleAddNew}>Add New Item ({itemCount} existing)</button>

			{editField && (
				<div>
					<h3>Editing: {editField}</h3>
					<pre>{JSON.stringify(initialValues, null, 2)}</pre>
					<button onClick={() => handleUpdate({ name: "Updated", value: "test" })}>Save</button>
					<button onClick={handleCancelEditField}>Cancel</button>
				</div>
			)}

			{/* Your list items here */}
			<div>{/* Render your items and call handleEditField(fieldId) when user wants to edit */}</div>
		</div>
	);
};

export default MyEditableListComponent;
