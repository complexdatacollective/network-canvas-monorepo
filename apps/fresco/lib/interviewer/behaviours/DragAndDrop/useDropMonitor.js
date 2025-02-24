import { isEqual, pick } from "es-toolkit";
import { find, get } from "es-toolkit/compat";
import { useCallback, useEffect, useRef, useState } from "react";

import store from "./store";

const defaultProps = ["isOver", "willAccept"];

const getMonitorProps = (state, id, props) => {
	const target = find(state.targets, ["id", id]);

	if (!target) {
		return null;
	}

	const monitorProps = {
		isOver: get(target, "isOver", false),
		willAccept: get(target, "willAccept", false),
	};

	return pick(monitorProps, props);
};

const useDropMonitor = (id, props = defaultProps) => {
	const internalState = useRef();
	const [state, setState] = useState();

	const updateState = (newState) => {
		if (isEqual(internalState.current, newState)) {
			return;
		}
		internalState.current = newState;
		setState(newState);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: unexpected side effects
	const updateMonitorProps = useCallback(() => {
		const status = getMonitorProps(store.getState(), id, props);
		updateState(status);
	}, [id, props]);

	useEffect(() => {
		const unsubscribe = store.subscribe(updateMonitorProps);

		return unsubscribe;
	}, [updateMonitorProps]);

	return state;
};

export default useDropMonitor;
