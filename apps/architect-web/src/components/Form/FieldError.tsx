import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";

type FieldErrorProps = {
	error?: string | null;
	show?: boolean;
	className?: string;
};

const FieldError = ({ error = null, show = false, className }: FieldErrorProps) => (
	<div
		className={cx(
			"flex max-h-0 items-center bg-error p-0 text-error-foreground opacity-0",
			"transition-[opacity,max-height] duration-(--animation-duration-standard) ease-(--animation-easing)",
			"[&_svg]:max-h-(--space-md)",
			show && "max-h-12.5 p-(--space-xs) opacity-100",
			className,
		)}
	>
		<Icon name="warning" /> {error}
	</div>
);

export default FieldError;
