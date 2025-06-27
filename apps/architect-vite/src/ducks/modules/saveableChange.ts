// Simple replacement for saveableChange since session was removed
// In the new web-based architecture, changes are automatically saved to Redux/localStorage

export const saveableChange = <T extends (...args: any[]) => any>(actionCreator: T): T => {
	// For now, just return the action creator as-is
	// In a more sophisticated implementation, this could handle save state tracking
	return actionCreator;
};

export const checkChanged = (state: any) => {
	// Placeholder for change checking
	// In the new architecture, this could check against stored state if needed
	return false;
};
