import Icon from "@codaco/legacy-ui/components/Icon";
import cx from "classnames";
import React from "react";
import { components as ReactSelectComponents } from "react-select";

type OptionData = {
	value: string;
	label: string;
	isUsed?: boolean;
	__isWarning__?: boolean;
	__createNewOption__?: string;
	__isNew__?: boolean;
};

type DefaultSelectOptionProps = {
	data: OptionData;
	onDeleteOption?: ((value: string) => void) | null;
};

const DefaultSelectOption = (props: DefaultSelectOptionProps) => {
	const { data, onDeleteOption } = props;
	/* eslint-disable no-underscore-dangle */
	const isWarning = !!data.__isWarning__;
	const showNew = !!data.__createNewOption__ || !!data.__isNew__;
	const showDelete = !isWarning && !data.__isNew__ && !!onDeleteOption && !data.isUsed;
	const label = data.__createNewOption__ ? data.__createNewOption__ : data.label;
	const handleClickDelete = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (onDeleteOption) {
			onDeleteOption(data.value);
		}
	};
	/* eslint-enable */

	const classes = cx("form-fields-select__item", { "form-fields-select__item--warning": isWarning });

	return (
		<ReactSelectComponents.Option
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...props}
			className={classes}
			classNamePrefix="form-fields-select__item"
		>
			{isWarning && (
				<div className="form-fields-select__item-warning">
					<Icon name="warning" />
				</div>
			)}
			{showNew && (
				<div className="form-fields-select__item-add">
					<Icon name="add" />
				</div>
			)}

			<div className="form-fields-select__item-label">{label}</div>

			{showDelete && (
				<div className="form-fields-select__item-delete" onClick={handleClickDelete}>
					<Icon name="delete" />
				</div>
			)}
		</ReactSelectComponents.Option>
	);
};


export default DefaultSelectOption;
