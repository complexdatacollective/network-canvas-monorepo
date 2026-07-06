// requestAnimationFrame pauses while a tab is backgrounded, but the frame clock
// (performance.now() / the rAF timestamp) keeps advancing in real time. The
// first frame after the tab is foregrounded therefore carries a delta of however
// long the tab was hidden — often minutes. Multiplying a per-second velocity by
// that delta teleports a blob/light thousands of pixels in a single step, and the
// once-per-frame edge wrap can only pull it back to one off-screen edge, so the
// background looks empty until everything slowly drifts back on. Capping the
// delta keeps a resumed frame to one modest step, so motion stays continuous
// across background/foreground cycles.
const MAX_FRAME_DELTA_SECONDS = 1 / 30;

export const clampFrameDelta = (deltaSeconds: number): number =>
  Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS);
