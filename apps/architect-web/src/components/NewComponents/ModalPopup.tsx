import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { type HTMLMotionProps, motion } from "motion/react";

type ModalPopupProps = Omit<BaseDialog.Popup.Props, "render"> &
	Pick<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition">;

export default function ModalPopup({ initial, animate, exit, transition, children, ...props }: ModalPopupProps) {
	return (
		<BaseDialog.Popup
			render={<motion.div initial={initial} animate={animate} exit={exit} transition={transition} />}
			{...props}
		>
			{children}
		</BaseDialog.Popup>
	);
}
