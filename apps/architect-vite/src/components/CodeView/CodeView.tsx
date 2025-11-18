import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { getFormValues } from "redux-form";

type CodeViewProps = {
	form: string;
	toggleCodeView: () => void;
	show?: boolean;
};

const variants = {
	hide: { translateY: "-100%", transition: { stiffness: 1000 } },
	show: { translateY: "0%" },
};

const CodeView = ({ toggleCodeView, show = false, form }: CodeViewProps) => {
	const code = useSelector(getFormValues(form));

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggleCodeView();
		}
	};

	return createPortal(
		<motion.div className="code-view" variants={variants} initial="hide" animate={show ? "show" : "hide"}>
			<div className="code-view__content">
				<pre>
					<code>{show && JSON.stringify(code, null, 2)}</code>
				</pre>
			</div>
			<div
				className="code-view__controls"
				onClick={toggleCodeView}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
			>
				Close code view
			</div>
		</motion.div>,
		document.body,
	);
};

export default CodeView;
