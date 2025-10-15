import { Switch as BaseSwitch } from "@base-ui-components/react/switch";
import classNames from "classnames";

type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root>;

export default function Switch({ className, ...rest }: SwitchProps) {
	const mergedClasses = classNames(
		className,
		"relative flex h-6 w-10 rounded-full bg-input -outline-offset-1 transition-[background-position] duration-[125ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] before:absolute before:rounded-full before:outline-offset-2 before:outline-accent focus-visible:before:inset-0 focus-visible:before:outline focus-visible:before:outline-2 data-[checked]:bg-input-active",
	);
	return (
		<BaseSwitch.Root className={mergedClasses} {...rest}>
			<BaseSwitch.Thumb className="aspect-square h-full rounded-full bg-input-foreground transition-transform duration-150 data-[checked]:translate-x-4 scale-90" />
		</BaseSwitch.Root>
	);
}
