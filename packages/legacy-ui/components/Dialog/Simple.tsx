import cx from "classnames";
import { CSSProperties, ReactNode } from "react";
import Modal from "../Modal";

interface SimpleDialogProps {
	children?: ReactNode;
	show?: boolean;
	options?: React.ReactElement[];
	title: string;
	onBlur?: () => void;
	className?: string;
	style?: CSSProperties;
}

/**
 * A relatively unstyled dialog for use in other kinds of modals
 */
const SimpleDialog = ({ 
	children = null, 
	show = false, 
	options = [], 
	title, 
	onBlur = () => {}, 
	className = null, 
	style = {} 
}: SimpleDialogProps) => (
	<Modal show={show} onBlur={onBlur}>
		<div className={cx("dialog", "dialog--simple", className)} style={style}>
			<div className="dialog__main">
				<div className="dialog__main-content">
					<h2 className="dialog__main-title">{title}</h2>
					{children}
				</div>
			</div>
			<footer className="dialog__footer">{options}</footer>
		</div>
	</Modal>
);


export { SimpleDialog };

export default SimpleDialog;
