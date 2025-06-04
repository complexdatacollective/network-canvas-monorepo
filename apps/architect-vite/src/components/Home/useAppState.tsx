import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actionCreators, selectors } from "~/ducks/modules/app";

const useAppState = <T,>(key: string, defaultValue: T): [T, (newValue: T) => void] => {
	const value = useSelector(selectors.getProperty(key));
	const dispatch = useDispatch();

	const setValue = (newValue: T) => {
		dispatch(actionCreators.setProperty(key, newValue));
	};

	useEffect(() => {
		if (value === undefined && value !== defaultValue) {
			setValue(defaultValue);
		}
	}, [value, defaultValue]);

	return [value, setValue];
};

export default useAppState;
