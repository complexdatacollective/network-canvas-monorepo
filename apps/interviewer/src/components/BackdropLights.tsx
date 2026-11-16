import { BackgroundLights } from '@codaco/art';
import { usePageActive } from '@codaco/fresco-ui/pageActivity';

// The lights drift only while the window is in front of the user. A browser
// keeps animating a window that is on screen but not focused, so an installed
// Interviewer left open beside another app would otherwise drift them at full
// frame rate with nobody looking.
export function BackdropLights() {
  const pageActive = usePageActive();
  return (
    <BackgroundLights
      large={0}
      medium={4}
      small={0}
      blendMode="color-dodge"
      speedFactor={30}
      paused={!pageActive}
    />
  );
}
