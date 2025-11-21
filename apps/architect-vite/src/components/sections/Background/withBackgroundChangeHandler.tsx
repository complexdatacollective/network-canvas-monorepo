import { connect } from "react-redux";
import { compose, withHandlers, withState } from "recompose";
import { change, formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";

type OwnProps = {
	form: string;
};

type StateProps = {
	useImage: boolean;
};

type DispatchProps = {
	changeForm: typeof change;
};

type WithStateProps = StateProps &
	DispatchProps &
	OwnProps & {
		setUseImage: (useImage: boolean) => void;
	};

const withBackgroundChangeHandlerState = connect<StateProps, DispatchProps, OwnProps, RootState>(
	(state, { form }) => ({
		useImage: !!formValueSelector(form)(state, "background.image"),
	}),
	{ changeForm: change },
);

const withBackgroundChangeHandlerEnabled = withState<
	StateProps & DispatchProps & OwnProps,
	boolean,
	"useImage",
	"setUseImage"
>("useImage", "setUseImage", ({ useImage }) => !!useImage);

const withBackgroundChangeHandlers = withHandlers<WithStateProps, { handleChooseBackgroundType: () => void }>({
	handleChooseBackgroundType:
		({ setUseImage, useImage, form, changeForm }) =>
		() => {
			if (useImage) {
				changeForm(form, "background.image", null);
			} else {
				changeForm(form, "background.concentricCircles", null);
				changeForm(form, "background.skewedTowardCenter", null);
			}

			setUseImage(!useImage);
		},
});

const withBackgroundChangeHandler = compose(
	withBackgroundChangeHandlerState,
	withBackgroundChangeHandlerEnabled,
	withBackgroundChangeHandlers,
);

export default withBackgroundChangeHandler;
