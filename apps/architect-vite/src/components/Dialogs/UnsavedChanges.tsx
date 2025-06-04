const UnsavedChanges = (options: any) => ({
	type: "Warning",
	title: "Unsaved changes will be lost",
	message: <p>Your protocol has changes that have not yet been saved. Continuing will discard these changes!</p>,
	...options,
});

export default UnsavedChanges;
