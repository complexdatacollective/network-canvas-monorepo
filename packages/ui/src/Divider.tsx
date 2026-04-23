import { cx } from "./utils";

export const Divider = ({ className }: { className?: string }) => (
	<hr className={cx("mx-auto w-full rounded-full border-[1.5px] border-foreground", className)} />
);
