import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actionCreators, selectors } from "~/ducks/modules/app";

const useAppState = <T,>(key: string, defaultValue: T): [T, (newValue: T) => void] => {
	const propertySelector = useMemo(() => selectors.getProperty(key), [key]);
	const value = useSelector(propertySelector);
	const dispatch = useDispatch();

	const setValue = useCallback(
		(newValue: T) => {
			dispatch(actionCreators.setProperty(key, newValue));
		},
		[dispatch, key],
	);

	useEffect(() => {
		if (value === undefined && value !== defaultValue) {
			setValue(defaultValue);
		}
	}, [value, defaultValue, setValue]);

	return [value, setValue];
};

export default useAppState;
