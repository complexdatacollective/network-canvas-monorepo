import Spinner from "@codaco/fresco-ui/Spinner";
import Heading from "@codaco/fresco-ui/typography/Heading";
import { cx } from "@codaco/fresco-ui/utils/cva";
import { motion } from "motion/react";

type LoadingProps = {
	message?: string;
	className?: string;
	small?: boolean;
};

const Loading = ({ message, className = "", small = false }: LoadingProps) => (
	<motion.div
		className={cx("loading", className)}
		key="loading"
		initial={{ opacity: 0 }}
		animate={{ opacity: 1 }}
		exit={{ opacity: 0 }}
	>
		<Heading level="h4">{message}</Heading>
		<Spinner size={small ? "sm" : "md"} />
	</motion.div>
);

export default Loading;
