import { motion } from "motion/react";
import type { ReactNode } from "react";

type PanelsProps = {
	children?: ReactNode;
};

const Panels = ({ children = null }: PanelsProps) => (
	<motion.div
		className="h-(--datepicker-panel-height) overflow-hidden bg-surface-1"
		initial={{ scaleY: 0, opacity: 0 }}
		animate={{ scaleY: 1, opacity: 1 }}
		exit={{ scaleY: 0, opacity: 0 }}
		style={{ originX: 0, originY: 0 }}
		transition={{ duration: 0.2, type: "tween" }}
		layout
	>
		<motion.div className="relative h-(--datepicker-panel-height)" layout>
			{children}
		</motion.div>
	</motion.div>
);

export default Panels;
