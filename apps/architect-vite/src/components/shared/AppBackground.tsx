import { BackgroundBlobs } from "@codaco/art";

export default function AppBackground() {
	return (
		<div className="pointer-events-none absolute inset-0 opacity-15">
			<BackgroundBlobs large={2} medium={4} small={0} compositeOperation="screen" filter="blur(10rem)" />
		</div>
	);
}
