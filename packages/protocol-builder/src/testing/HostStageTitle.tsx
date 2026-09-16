import StageNameField from '../fields/StageNameField.tsx';
import { useAutoStageName } from '../naming/useAutoStageName.ts';

/**
 * The stage's name, as the least a host can draw and still be a host: no
 * picture, no badge, no documentation link, no heading. Architect's own
 * `StageTitle` draws all of those around the very same field.
 *
 * It opts into the proposed name because Architect does, and most tests here
 * are about that. A test that mounts a title of its own passes its own
 * `header` instead.
 */
export default function HostStageTitle() {
  const { onBlur } = useAutoStageName();

  return <StageNameField onBlur={onBlur} />;
}
