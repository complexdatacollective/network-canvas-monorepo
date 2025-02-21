import { compose } from "@reduxjs/toolkit";
import Scroller from "~/lib/ui/components/Scroller";

const scrollable = (WrappedComponent) => {
	const Scrollable = (props) => {
		const { onScroll } = props;

		return (
			<Scroller onScroll={onScroll}>
				<WrappedComponent {...props} />
			</Scroller>
		);
	};

	return Scrollable;
};

const composedScrollable = compose(scrollable);

export default composedScrollable;
