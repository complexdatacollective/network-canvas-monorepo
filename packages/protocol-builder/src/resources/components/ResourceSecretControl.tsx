import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { v4 as uuid } from 'uuid';

import {
  createMessageError,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { normalizeForComparison } from '@codaco/shared-consts';

import { useResourceGateway } from '../context.tsx';
import {
  resourceOk,
  type ResourceDescriptor,
  type ResourceResult,
  type ResourceSecretStorage,
  type StagedSecret,
  type StageSecretRequest,
} from '../gateway.ts';
import { callGateway } from '../gatewayCall.ts';
import { discardAbandonedStaging } from './abandonedStaging.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import { useResourceAttempt } from './useResourceAttempt.ts';

const messages = defineMessages({
  nameRequired: {
    id: 'protocolBuilder.resourceSecret.nameRequired',
    defaultMessage: 'Enter a name for this key.',
    description:
      'Field error shown when a researcher submits an API key without naming it.',
  },
  valueRequired: {
    id: 'protocolBuilder.resourceSecret.valueRequired',
    defaultMessage: 'Enter the value of the key.',
    description:
      'Field error shown when a researcher submits an API key without pasting the key itself.',
  },
  duplicateName: {
    id: 'protocolBuilder.resourceSecret.duplicateName',
    defaultMessage:
      'You already have a key called that. Choose a different name.',
    description:
      'Field error shown when a researcher names an API key the same as one the protocol already holds. Names are how keys are told apart, so two alike cannot be allowed.',
  },
  waitingForNames: {
    id: 'protocolBuilder.resourceSecret.waitingForNames',
    defaultMessage:
      'Waiting for the keys this protocol already has, so this one can be checked against them.',
    description:
      'Why the button that adds an API key is not usable yet. One whole sentence about what the researcher is waiting for: a disabled button with no reason beside it reads as a broken one.',
  },
  nameLabel: {
    id: 'protocolBuilder.resourceSecret.nameLabel',
    defaultMessage: 'Name',
    description: 'Label of the input naming the API key being added.',
  },
  nameHint: {
    id: 'protocolBuilder.resourceSecret.nameHint',
    defaultMessage: 'How this key is listed in your protocol.',
    description:
      'Hint under the input naming the API key being added, saying what the name is for.',
  },
  valueLabel: {
    id: 'protocolBuilder.resourceSecret.valueLabel',
    defaultMessage: 'Key',
    description:
      'Label of the password input holding the API key value itself.',
  },
  plaintextHint: {
    id: 'protocolBuilder.resourceSecret.plaintextHint',
    defaultMessage:
      'Pasted from your map provider. It is saved inside your protocol as plain text, so anyone you give the protocol file to can read it. It is not shown again here.',
    description:
      'Hint under the API key input for a host that writes the key into the protocol file itself. The researcher is deciding whether to put a credential into a file they will share, so the consequence is stated plainly.',
  },
  vaultHint: {
    id: 'protocolBuilder.resourceSecret.vaultHint',
    defaultMessage:
      'Pasted from your map provider. It is kept by the host rather than saved inside your protocol, and is not shown again here.',
    description:
      'Hint under the API key input for a host that keeps the key itself rather than writing it into the protocol file.',
  },
  retry: {
    id: 'protocolBuilder.resourceSecret.retry',
    defaultMessage: 'Try adding the key again',
    description:
      'Button beside a failure notice, which repeats the identical request to add the same API key. Named rather than generic because several parts of the dialog can be failing at once.',
  },
  submit: {
    id: 'protocolBuilder.resourceSecret.submit',
    defaultMessage: 'Add API key',
    description:
      'Button that submits the name and value of a new API key to the host.',
  },
  addedAnnouncement: {
    id: 'protocolBuilder.resourceSecret.addedAnnouncement',
    defaultMessage: '{name} was added.',
    description:
      'Announced to assistive technology once an API key has been added. name is the name the researcher gave it.',
  },
});

/**
 * What the researcher is told about the key before they paste it, chosen by
 * what the host does with it when the stage is saved.
 *
 * Where the key ends up is the whole of what makes this decision consequential
 * — a key written into the protocol file leaves with every copy of that file,
 * and the researcher is the only person who can decide whether that is
 * acceptable for the key in their hand. Saying nothing, as this control did,
 * leaves them deciding without the fact; saying it unconditionally would be
 * telling a host that keeps the value itself that it does not. So the adapter
 * says which it is and each answer is written out whole, ready to translate as
 * the statement it is rather than as a warning glued onto a hint.
 */
const KEY_HINT: Readonly<Record<ResourceSecretStorage, MessageDescriptor>> = {
  plaintext: messages.plaintextHint,
  vault: messages.vaultHint,
};

export type ResourceSecretControlProps = Readonly<{
  /**
   * The key that was added, as the field will refer to it. Only the
   * descriptor: the handle promotion needs is the session's, captured where
   * the secret was staged, and no surface here has any use for it.
   */
  onStaged: (descriptor: ResourceDescriptor) => void;
  /**
   * Reports whether this control is holding work a dismissal would lose.
   *
   * The dialog around it decides what to do about that; nothing here changes
   * because of it. Reported rather than inferred because the draft lives in
   * this control's own state and nowhere the dialog can see.
   */
  onDraftChange?: (hasDraft: boolean) => void;
  /**
   * The names the protocol's keys already go by — committed and staged alike
   * — read at the moment a key is submitted.
   *
   * A name already in use is refused rather than quietly accepted, because
   * every surface that offers a key to a field offers it by its name and
   * nothing else: two keys called "Mapbox" are two identical buttons, and the
   * researcher choosing between them has no way to tell which is which, nor
   * any way to learn that the key they think they just created already
   * existed.
   *
   * Asked for as a call rather than handed over as a list, because a list is
   * only ever a fact about when it was read: the browser around this control
   * reads its own once, when it opens, and anything else in the session may
   * have added a key since. Architect's own key dialog reads the manifest out
   * of the store at submit for exactly this reason. A read that fails refuses
   * the submission and is reported as the failure it is — a key added without
   * the check is the pair of indistinguishable buttons this exists to prevent.
   */
  existingNames?: () => Promise<ResourceResult<readonly string[]>>;
  /**
   * Whether that list is still being read for the first time. Submitting is
   * refused while it is, and the control says why: the check below is about
   * to make the researcher wait for the same read anyway, and a form that
   * looks ready is one they will use before it is.
   */
  existingNamesBusy?: boolean;
  disabled?: boolean;
}>;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const NO_EXISTING_NAMES: readonly string[] = Object.freeze([]);

/** A control with no library behind it has no name to refuse. */
const readNoExistingNames = (): Promise<ResourceResult<readonly string[]>> =>
  Promise.resolve(resourceOk(NO_EXISTING_NAMES));

/**
 * Stages secret material — a map provider's API key — without the editor ever
 * holding on to it.
 *
 * The value exists in this control's own state while it is being typed and
 * nowhere else. Staging hands it to the host and clears both inputs; what this
 * control keeps is the asset id, which is what the field stores. The opaque
 * handle promotion needs never travels through the editor at all: the
 * session's gateway captured it as the secret was staged. Nothing here writes
 * the value to the stage draft or renders it once staged.
 *
 * One submission does outlive its inputs. A call that failed in a way that may
 * mean the host staged the key anyway is kept, request and all, until it is
 * settled — because settling it means making that same call again. The retry
 * offered to the researcher holds the same request for the same reason, and
 * both go the moment the call is decided.
 */
export default function ResourceSecretControl({
  onStaged,
  onDraftChange,
  existingNames = readNoExistingNames,
  existingNamesBusy = false,
  disabled = false,
}: ResourceSecretControlProps) {
  const gateway = useResourceGateway();
  const intl = useAppIntl();
  const { busy, clear, failure, retry, run } = useResourceAttempt();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  /**
   * What is wrong with each input, encoded rather than formatted: an error
   * sits here until the researcher corrects the field, and `FieldErrors`
   * decodes it, so it follows a change of language while it waits.
   */
  const [errors, setErrors] = useState<
    Readonly<{ name?: string; value?: string }>
  >({});
  const [status, setStatus] = useState('');
  const waitingId = useId();
  // One id per key the researcher is adding, so a retry after an uncertain
  // failure stages that key once rather than minting a second copy of it.
  const requestId = useRef(uuid());
  /** Whether the id above has already been sent to the host. */
  const submitted = useRef(false);
  /**
   * The submission whose fate the researcher's client never learned, kept for
   * exactly as long as it is undecided.
   *
   * It carries the key, because settling it is repeating it: the port makes a
   * staging call idempotent under its request id, so the same call is what
   * asks the host "did you keep this?" and is answered with the staged secret
   * if it did.
   */
  const unsettled = useRef<StageSecretRequest | undefined>(undefined);

  // Either input holding anything at all is work the host has never seen: the
  // key is in this control's state and nowhere else, so a dismissal is the
  // whole of what stands between the researcher and losing it. Reported on the
  // way out too, so a dialog that outlives this control is not left believing
  // it still holds a draft.
  const hasDraft = name.trim() !== '' || secret.trim() !== '';
  useEffect(() => {
    onDraftChange?.(hasDraft);
    return () => onDraftChange?.(false);
  }, [hasDraft, onDraftChange]);

  /** Drops what was said about a field the researcher is now correcting. */
  const clearError = (field: 'name' | 'value') => {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  /**
   * Asks the host to drop whatever the abandoned request may have staged.
   *
   * Nothing else can. A descriptor the client never received was never
   * registered in the session's staged set — the session remembers only what a
   * staging call answered with — so a finish sweeping unreferenced staging
   * cannot see it, and only a cancel, which drops everything indiscriminately,
   * would ever reach it. The request id is the one name it has left, and
   * repeating the identical call under it is what turns that name back into a
   * descriptor: an idempotent host hands back exactly what it staged, and it
   * is dropped there and then. A host that staged nothing stages nothing now
   * either — it is the same call — and answers as it would have the first time.
   *
   * Only for a failure that said repeating it may still succeed. A definitive
   * refusal staged nothing, and a call still in flight is disowned by
   * `clear()` below and dropped by its own abandonment.
   */
  const settleAbandonedRequest = () => {
    const request = unsettled.current;
    unsettled.current = undefined;
    if (request === undefined) return;
    if (failure === undefined || !failure.retryable) return;
    void (async () => {
      const repeated = await callGateway(() => gateway.stageSecret(request));
      if (repeated.status !== 'ok') return;
      discardAbandonedStaging(gateway, repeated.data.descriptor);
    })();
  };

  /**
   * Editing after a submission starts a new intent, so it gets a new id.
   *
   * An uncertain failure may mean the host staged the key and lost only its
   * answer. Sending an edited key under the same id would be answered with the
   * first one — the field would name a key the researcher never entered, and
   * the correction would be silently dropped. The stale failure goes with the
   * id: repeating the previous call is no longer what "try again" means. The
   * key that first call may have staged is settled before the id is retired,
   * because retiring the id is what would make it unnameable.
   *
   * A submission still in flight is superseded on exactly the same terms. It
   * is the one case where the researcher can see the value they are replacing
   * and the host has not answered yet, and leaving it alone is what loses the
   * correction: the answer, whenever it came, would clear the inputs and name
   * the key the researcher had already moved off — or offer to repeat it.
   */
  const editing = (field: 'name' | 'value') => {
    clearError(field);
    if (!submitted.current) return;
    submitted.current = false;
    settleAbandonedRequest();
    requestId.current = uuid();
    clear();
  };

  /**
   * Stages the key, once the name has been checked against the library the
   * check's own read returned.
   *
   * Held apart from the submission so the read that precedes it can be an
   * attempt of its own: the researcher is waiting for both, a host that
   * cannot answer the read is a failure they can retry, and a retry has to
   * repeat the check as well as the staging — the name may have been taken in
   * between by whatever answered slowly the first time.
   */
  const stageKey = (trimmedName: string, trimmedSecret: string) => {
    // Held rather than rebuilt per call, so the retry, the reconciliation, and
    // this submission are all provably the same request.
    const request: StageSecretRequest = {
      requestId: requestId.current,
      name: trimmedName,
      value: trimmedSecret,
    };
    unsettled.current = request;
    run(
      () => gateway.stageSecret(request),
      (staged) => {
        // Cleared the moment the host has it: an input still holding the key
        // is the key, on screen and in the page.
        setName('');
        setSecret('');
        submitted.current = false;
        // Decided, so there is nothing left to settle and no reason to go on
        // holding the value it carried.
        unsettled.current = undefined;
        requestId.current = uuid();
        setStatus(
          intl.formatMessage(messages.addedAnnouncement, {
            name: staged.descriptor.name,
          }),
        );
        onStaged(staged.descriptor);
      },
      // The key was staged for a form nobody is watching any more — the
      // researcher edited it into a new intent, or closed the browser. A
      // secret held by the host for a choice that no longer exists is worse
      // than abandoned bytes, so it goes now rather than at the finish.
      (staged: StagedSecret) =>
        discardAbandonedStaging(gateway, staged.descriptor),
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // This form is a form inside another one: the browser holding it is a
    // dialog portalled out of the DOM, but React propagates events along the
    // component tree it was rendered in, so a submit here reaches the stage
    // editor's own form and saves the whole stage. Adding a key is not saving
    // the stage, so the submit stops here.
    event.stopPropagation();
    if (disabled || busy || existingNamesBusy) return;

    const trimmedName = name.trim();
    const trimmedSecret = secret.trim();
    const nextErrors: { name?: string; value?: string } = {};
    if (trimmedName === '') {
      nextErrors.name = createMessageError(messages.nameRequired);
    }
    if (trimmedSecret === '') {
      nextErrors.value = createMessageError(messages.valueRequired);
    }
    setErrors(nextErrors);
    // Reported on the fields rather than as a failure of the call, and before
    // any call is made: nothing is staged, so there is nothing to retry, and
    // the correction belongs where the researcher will make it.
    if (Object.keys(nextErrors).length > 0) return;

    // Set before the check rather than with the staging call, so editing
    // during either disowns this submission: the read below carries the name
    // and value it was started for, and a correction must not be answered
    // with the key it replaced.
    submitted.current = true;
    run(existingNames, (names) => {
      // Asked of the library as it is now, which is the only moment the
      // answer is about: another picker in this session may have staged a key
      // since this browser read its list.
      if (namesAnExistingKey(names, trimmedName)) {
        submitted.current = false;
        setErrors({ name: createMessageError(messages.duplicateName) });
        return;
      }
      stageKey(trimmedName, trimmedSecret);
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <UnconnectedField
        name="staged-secret-name"
        label={intl.formatMessage(messages.nameLabel)}
        hint={intl.formatMessage(messages.nameHint)}
        component={InputField}
        value={name}
        onChange={(value: unknown) => {
          editing('name');
          setName(asString(value));
        }}
        disabled={disabled}
        errors={errors.name === undefined ? [] : [errors.name]}
        showErrors={errors.name !== undefined}
      />
      <UnconnectedField
        name="staged-secret-value"
        label={intl.formatMessage(messages.valueLabel)}
        hint={intl.formatMessage(KEY_HINT[gateway.secretStorage])}
        component={InputField}
        type="password"
        autoComplete="off"
        value={secret}
        onChange={(value: unknown) => {
          editing('value');
          setSecret(asString(value));
        }}
        disabled={disabled}
        errors={errors.value === undefined ? [] : [errors.value]}
        showErrors={errors.value !== undefined}
      />

      {failure !== undefined && (
        <ResourceFailureNotice
          failure={failure}
          onRetry={retry}
          retryLabel={intl.formatMessage(messages.retry)}
          busy={busy}
        />
      )}

      {existingNamesBusy && (
        <Paragraph id={waitingId} intent="smallText" emphasis="muted">
          {intl.formatMessage(messages.waitingForNames)}
        </Paragraph>
      )}

      <Button
        type="submit"
        color="primary"
        className="self-start"
        disabled={disabled || busy || existingNamesBusy}
        {...(existingNamesBusy ? { 'aria-describedby': waitingId } : {})}
      >
        {intl.formatMessage(messages.submit)}
      </Button>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </form>
  );
}

/**
 * Whether a key already goes by this name, asked the way every uniqueness
 * check in this codebase asks it.
 *
 * `normalizeForComparison` is case-insensitive AND Unicode-canonical: two
 * spellings that render identically are the same name, and comparing raw text
 * would let one of each through — leaving the researcher exactly the pair of
 * indistinguishable entries this refusal exists to prevent.
 */
function namesAnExistingKey(
  existingNames: readonly string[],
  name: string,
): boolean {
  const normalized = normalizeForComparison(name);
  return existingNames.some(
    (existing) => normalizeForComparison(existing.trim()) === normalized,
  );
}
