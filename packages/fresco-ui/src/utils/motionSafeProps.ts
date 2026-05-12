// Base UI's render callback types the spread props as `HTMLAttributes<…>`, so
// the gesture/animation handler names below resolve to DOM event signatures
// (`DragEventHandler`, `AnimationEventHandler`, etc.). framer-motion redeclares
// those same prop names with PanInfo/variant-callback signatures. Spreading the
// callback's props onto a `motion.*` component therefore produces a structural
// type collision on every shared name, even though Base UI never actually
// forwards values for them at runtime.
//
// `motionSafeProps` strips the conflicting keys so the remainder is assignable
// to motion's props without casts. Keep this list aligned with motion's
// gesture/animation handler surface.
const COLLIDING_KEYS = [
	"onDrag",
	"onDragStart",
	"onDragEnd",
	"onDragOver",
	"onDragEnter",
	"onDragLeave",
	"onDragExit",
	"onPan",
	"onPanStart",
	"onPanEnd",
	"onPanSessionStart",
	"onAnimationStart",
	"onAnimationEnd",
	"onAnimationComplete",
	"onAnimationIteration",
	"onTransitionEnd",
] as const;

type CollidingKey = (typeof COLLIDING_KEYS)[number];

export function motionSafeProps<T extends object>(props: T): Omit<T, CollidingKey | "hidden"> {
	const result: Record<string, unknown> = {};
	for (const key in props) {
		if (key === "hidden") continue;
		if ((COLLIDING_KEYS as readonly string[]).includes(key)) continue;
		result[key] = (props as Record<string, unknown>)[key];
	}
	return result as Omit<T, CollidingKey | "hidden">;
}
