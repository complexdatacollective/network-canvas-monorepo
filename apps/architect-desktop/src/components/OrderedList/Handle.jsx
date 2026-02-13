import { Icon } from "@codaco/ui";
import { SortableHandle } from "react-sortable-hoc";

const Handle = (props) => (
	<div className="list-handle" {...props}>
		<Icon name="move" />
	</div>
);

export default SortableHandle(Handle);
