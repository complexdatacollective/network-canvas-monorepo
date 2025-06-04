import { Icon } from "@codaco/legacy-ui/components";
import type React from "react";

type HandleProps = React.HTMLAttributes<HTMLDivElement>;

const Handle = (props: HandleProps) => (
	<div className="list-handle" {...props}>
		<Icon name="move" />
	</div>
);

export default Handle;
