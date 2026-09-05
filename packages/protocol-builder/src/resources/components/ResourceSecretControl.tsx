import { useRef, useState, type FormEvent } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { useResourceGateway } from '../context.tsx';
import type { ResourceDescriptor } from '../gateway.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import { useResourceAttempt } from './useResourceAttempt.ts';

const NAME_REQUIRED_MESSAGE = 'Enter a name for this key.';
const VALUE_REQUIRED_MESSAGE = 'Enter the value of the key.';

export type ResourceSecretControlProps = Readonly<{
  /**
   * The key that was added, as the field will refer to it. Only the
   * descriptor: the handle promotion needs is the session's, captured where
   * the secret was staged, and no surface here has any use for it.
   */
  onStaged: (descriptor: ResourceDescriptor) => void;
  disabled?: boolean;
}>;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/**
 * Stages secret material — a map provider's API key — without the editor ever
 * holding on to it.
 *
 * The value exists in this control's own state while it is being typed and
 * nowhere else. Staging hands it to the host and clears both inputs; what this
 * control keeps is the asset id, which is what the field stores. The opaque
 * handle promotion needs never travels through the editor at all: the
 * session's gateway captured it as the secret was staged. Nothing here writes
 * the value to the stage draft, renders it once staged, or keeps it for a
 * later call.
 */
export default function ResourceSecretControl({
  onStaged,
  disabled = false,
}: ResourceSecretControlProps) {
  const gateway = useResourceGateway();
  const { busy, failure, retry, run } = useResourceAttempt();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [errors, setErrors] = useState<
    Readonly<{ name?: string; value?: string }>
  >({});
  const [status, setStatus] = useState('');
  // One id per key the researcher is adding, so a retry after an uncertain
  // failure stages that key once rather than minting a second copy of it.
  const requestId = useRef(uuid());

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || busy) return;

    const trimmedName = name.trim();
    const trimmedSecret = secret.trim();
    const nextErrors: { name?: string; value?: string } = {};
    if (trimmedName === '') nextErrors.name = NAME_REQUIRED_MESSAGE;
    if (trimmedSecret === '') nextErrors.value = VALUE_REQUIRED_MESSAGE;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    run(
      () =>
        gateway.stageSecret({
          requestId: requestId.current,
          name: trimmedName,
          value: trimmedSecret,
        }),
      (staged) => {
        // Cleared the moment the host has it: an input still holding the key
        // is the key, on screen and in the page.
        setName('');
        setSecret('');
        requestId.current = uuid();
        setStatus(`${staged.descriptor.name} was added.`);
        onStaged(staged.descriptor);
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <UnconnectedField
        name="staged-secret-name"
        label="Name"
        hint="How this key is listed in your protocol."
        component={InputField}
        value={name}
        onChange={(value: unknown) => setName(asString(value))}
        disabled={disabled}
        errors={errors.name === undefined ? [] : [errors.name]}
        showErrors={errors.name !== undefined}
      />
      <UnconnectedField
        name="staged-secret-value"
        label="Key"
        hint="Pasted from your map provider. It is stored with the protocol and is not shown again here."
        component={InputField}
        type="password"
        autoComplete="off"
        value={secret}
        onChange={(value: unknown) => setSecret(asString(value))}
        disabled={disabled}
        errors={errors.value === undefined ? [] : [errors.value]}
        showErrors={errors.value !== undefined}
      />

      {failure !== undefined && (
        <ResourceFailureNotice
          failure={failure}
          onRetry={retry}
          retryLabel="Try adding the key again"
          busy={busy}
        />
      )}

      <Button
        type="submit"
        color="primary"
        className="self-start"
        disabled={disabled || busy}
      >
        Add API key
      </Button>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </form>
  );
}
