import { BaseField } from '@codaco/fresco-ui/form/Field/BaseField';

import StageNameInput from '../fields/StageNameInput.tsx';
import { useStageName } from '../naming/useStageName.ts';

/**
 * The stage's name, as the least a host can draw and still be a host.
 *
 * The package publishes the name's bindings and no title of its own, so a
 * harness that drew nothing here would be testing an editor no researcher can
 * name — and every test that reaches for the name control would have to mount
 * a title for itself. This is that title with nothing else in it: no picture,
 * no interface badge, no documentation link, no heading. Architect's own
 * `StageTitle` draws all of those around the very same bindings, which is the
 * point — what a stage title looks like is the host's.
 *
 * Called ONCE in a harness, because the field is registered under the stage's
 * own `label` key: a test that mounts a title of its own must use a harness
 * that draws none.
 *
 * Rendered from the action slot, which sits after the form element rather than
 * above it as Architect's portal does. The form store does not care — it is
 * React state, and the name participates in the draft, the validation and the
 * save wherever it is drawn — but a test about DOCUMENT order should not read
 * this as what a host's page looks like.
 */
export default function HostStageTitle() {
  const { label, error, id, containerProps, fieldProps, isNewStage } =
    useStageName();

  return (
    <BaseField
      id={id}
      name={fieldProps.name}
      label={label}
      labelHidden
      required
      errors={error === undefined ? undefined : [error]}
      showErrors={error !== undefined}
      containerProps={containerProps}
    >
      <StageNameInput {...fieldProps} autoFocus={isNewStage} />
    </BaseField>
  );
}
