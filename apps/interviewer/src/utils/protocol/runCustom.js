/* eslint-disable */

/* unused proof of concept for loading custom code */

import createReactClass from "create-react-class";
import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { DropZone, NodeList } from "../../components/";
import { PromptSwiper } from "../../containers/";
import { actionCreators as modalActions } from "../../ducks/modules/modals";
import { actionCreators as sessionsActions } from "../../ducks/modules/sessions";

const actions = {
	network: sessionsActions,
	modal: modalActions,
};

const selectors = {};

const elements = {
	PromptSwiper,
	NodeList,
	DropZone,
};

const environment = {
	React,
	createReactClass,
	bindActionCreators,
	connect,
};

const api = {
	actions,
	selectors,
	elements,
};

export default (protocol) => new Function("environment", "api", protocol)(environment, api);
