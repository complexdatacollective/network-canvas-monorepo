import { Switch as BaseSwitch } from "@base-ui-components/react/switch";

type SwitchProps = React.ComponentProps<typeof BaseSwitch.Root>;

export default function Switch(props: SwitchProps) {
	return (
		<BaseSwitch.Root
			className="relative flex h-6 w-10 rounded-full  bg-input outline-1 -outline-offset-1 outline-input transition-[background-position] duration-[125ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] before:absolute before:rounded-full before:outline-offset-2 before:outline-accent focus-visible:before:inset-0 focus-visible:before:outline focus-visible:before:outline-2  "
			{...props}
		>
			<BaseSwitch.Thumb className="aspect-square h-full rounded-full bg-charcoal transition-transform duration-150 data-[checked]:translate-x-4 data-[checked]:bg-primary" />
		</BaseSwitch.Root>
	);
}
