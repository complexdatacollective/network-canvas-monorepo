import { surfaceVariants } from "../layout/Surface";
import ModalPopup from "../Modal/ModalPopup";
import { cx } from "../utils/cva";

export default function DialogPopup({ children, className, ...props }: React.ComponentProps<typeof ModalPopup>) {
	return (
		<ModalPopup
			className={cx(
				surfaceVariants({
					level: 0,
					spacing: "none",
				}),
				"tablet-portrait:w-auto w-[calc(100%-var(--spacing-base)*8)] max-w-2xl shadow-2xl",
				"fixed top-1/2 left-1/2 -translate-1/2",
				"flex max-h-[calc(100vh-var(--spacing-base)*10)] flex-col",
				className,
			)}
			{...props}
		>
			{children}
		</ModalPopup>
	);
}
