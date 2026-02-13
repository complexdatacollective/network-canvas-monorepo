const friendlyErrorMessage = (message) => (error) => {
	if (error.friendlyMessage) {
		throw error;
	}

	error.friendlyMessage = message;
	throw error;
};

export default friendlyErrorMessage;
