import { combineReducers } from "@reduxjs/toolkit";
import screens, { actionCreators as screenActionCreators } from "./screens";
import status, { selectors as statusSelectors } from "./status";

const ui = combineReducers({
	screens,
	status,
});

export const selectors = {
	...statusSelectors,
};

export const actionCreators = {
	...screenActionCreators,
};

export default ui;
