import { SortableHandle } from "react-sortable-hoc";
import { Icon } from "~/lib/legacy-ui/components";

const Handle = (props) => (
	<div
		className="list-handle"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		<Icon name="move" />
	</div>
);

export default SortableHandle(Handle);
