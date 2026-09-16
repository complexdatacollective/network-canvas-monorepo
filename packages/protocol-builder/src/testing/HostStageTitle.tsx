import StageNameField from '../fields/StageNameField.tsx';
import { useAutoStageName } from '../naming/useAutoStageName.ts';

/**
 * The stage's name, as the least a host can draw and still be a host.
 *
 * The package publishes the name's field and no title of its own, so a harness
 * that drew nothing here would be testing an editor no researcher can name —
 * and every test that reaches for the name control would have to mount a title
 * for itself. This is that title with nothing else in it: no picture, no
 * interface badge, no documentation link, no heading. Architect's own
 * `StageTitle` draws all of those around the very same field, which is the
 * point — what a stage title looks like is the host's.
 *
 * It opts into the proposed name, because Architect does and most of the
 * tests are about that behaviour. A host that wants researchers to name their
 * own stages leaves `useAutoStageName` out and gets an empty box.
 *
 * Called ONCE in a harness, because the field is registered under the stage's
 * own `label` key: a test that mounts a title of its own must use a harness
 * that draws none.
 *
 * Rendered from the header slot, which sits above the form element, exactly
 * where a host's own title goes.
 */
export default function HostStageTitle() {
  const { onBlur } = useAutoStageName();

  return <StageNameField onBlur={onBlur} />;
}
