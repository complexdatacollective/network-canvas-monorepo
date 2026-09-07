import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type FormEvent,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { CodebookSubject } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import {
  codebookEditingMessages,
  missingComparisonTargetMessage,
} from '../codebookMessages.ts';
import { compoundFailureMessage } from '../compoundFailureCopy.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildUpdateVariableRequest,
  type AuxiliaryCodebookSubmitResult,
} from '../editing.ts';
import {
  isValidationWithListValue,
  ruleMapIssue,
  type ValidationMap,
  type ValidationValue,
} from '../variableValidation.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.variableValidation.title',
    defaultMessage: 'Edit validation for {name}',
    description:
      'Heading of the surface where a researcher sets the rules an answer to one attribute must satisfy. name is the researcher’s own name for that attribute.',
  },
  description: {
    id: 'protocolBuilder.variableValidation.description',
    defaultMessage:
      'Configure requirements, limits, and comparisons for this attribute.',
    description:
      'Sentence under the heading naming the three groups of validation rules the surface offers. "Attribute" is a codebook variable.',
  },
  staleAuthoritativeDescription: {
    id: 'protocolBuilder.variableValidation.staleAuthoritativeDescription',
    defaultMessage:
      'Your validation draft has been kept. Saving will apply it to the latest authoritative entity data.',
    description:
      'What happens next after the protocol’s codebook changed elsewhere while this validation surface was open.',
  },
  typeChangedTitle: {
    id: 'protocolBuilder.variableValidation.typeChangedTitle',
    defaultMessage: 'Attribute type changed',
    description:
      'Heading of the warning shown when someone else changed what kind of answer this attribute records while its validation was being edited.',
  },
  typeChangedIssue: {
    id: 'protocolBuilder.variableValidation.typeChangedIssue',
    defaultMessage:
      'The attribute type changed while this validation draft was open.',
    description:
      'Why the validation rules in front of the researcher cannot be saved: the kind of answer the attribute records was changed elsewhere, and these rules were written for the old one.',
  },
  typeChangedDescription: {
    id: 'protocolBuilder.variableValidation.typeChangedDescription',
    defaultMessage:
      'The attribute type changed while this validation draft was open. Your draft is still visible, but it cannot be saved. Close and reopen this editor to configure validation for the new attribute type.',
    description:
      'The same refusal as typeChangedIssue, said at length in the warning above the rules, with what to do about it.',
  },
  failureTitle: {
    id: 'protocolBuilder.variableValidation.failureTitle',
    defaultMessage: 'Could not save validation',
    description:
      'Heading of the alert shown when saving an attribute’s validation rules was refused. The reason follows underneath.',
  },
  attributeMissingIssue: {
    id: 'protocolBuilder.variableValidation.attributeMissingIssue',
    defaultMessage: 'The attribute no longer exists in this entity.',
    description:
      'Why the validation rules in front of the researcher cannot be saved: the attribute they belong to has been deleted from the codebook.',
  },
  attributeUnavailableTitle: {
    id: 'protocolBuilder.variableValidation.attributeUnavailableTitle',
    defaultMessage: 'Attribute unavailable',
    description:
      'Heading of the alert shown in place of the rules when the attribute they belong to has been deleted from the codebook.',
  },
  attributeUnavailableDescription: {
    id: 'protocolBuilder.variableValidation.attributeUnavailableDescription',
    defaultMessage: 'The latest entity data no longer contains this attribute.',
    description:
      'Shown in place of the validation rules when the attribute they belong to has been deleted from the codebook.',
  },
  awaitingAuthoritative: {
    id: 'protocolBuilder.variableValidation.awaitingAuthoritative',
    defaultMessage: 'Waiting for latest data…',
    description:
      'The submit button after the validation rules have been accepted, while the application finishes writing them back into the protocol.',
  },
  submit: {
    id: 'protocolBuilder.variableValidation.submit',
    defaultMessage: 'Save validation',
    description:
      'Button that saves the rules an answer to this attribute must satisfy.',
  },
});

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isValidationValue = (value: unknown): value is ValidationValue =>
  value === null ||
  typeof value === 'boolean' ||
  typeof value === 'number' ||
  typeof value === 'string';

const variableFromDocument = (
  document: Readonly<SectionDoc>,
  variableId: string,
): UnknownRecord | undefined => {
  if (!isRecord(document.variables)) return undefined;
  const variable = document.variables[variableId];
  return isRecord(variable) ? variable : undefined;
};

const validationFromVariable = (
  variable: Readonly<UnknownRecord>,
): ValidationMap => {
  if (!isRecord(variable.validation)) return {};
  const entries: [string, ValidationValue][] = [];
  for (const [ruleKey, value] of Object.entries(variable.validation)) {
    if (isValidationValue(value)) entries.push([ruleKey, value]);
  }
  return Object.fromEntries(entries);
};

const withVariableValidation = (
  document: Readonly<SectionDoc>,
  variableId: string,
  validation: Readonly<ValidationMap>,
): SectionDoc => {
  const variables = isRecord(document.variables)
    ? new Map(Object.entries(document.variables))
    : new Map<string, unknown>();
  const current = variables.get(variableId);
  if (!isRecord(current)) return Object.fromEntries(Object.entries(document));
  variables.set(variableId, {
    ...current,
    validation: Object.fromEntries(Object.entries(validation)),
  });
  return Object.fromEntries([
    ...Object.entries(document),
    ['variables', Object.fromEntries(variables)],
  ]);
};

const missingTargetIssue = (
  validation: Readonly<ValidationMap>,
  allVariables: Readonly<UnknownRecord>,
  intl: IntlShape,
): string | undefined =>
  Object.entries(validation).some(
    ([ruleKey, target]) =>
      isValidationWithListValue(ruleKey) &&
      typeof target === 'string' &&
      !Object.hasOwn(allVariables, target),
  )
    ? intl.formatMessage(missingComparisonTargetMessage)
    : undefined;

export type CodebookVariableValidationRequestMetadata = Readonly<{
  createId(): string;
  description: string;
}>;

export type CodebookVariableValidationEditorProps = Readonly<{
  /** Must change every time the surface opens, even for the same variable. */
  openId: string;
  subject: CodebookSubject;
  variableId: string;
  authoritativeEntityDocument: Readonly<SectionDoc>;
  allSubjectVariables: Readonly<UnknownRecord>;
  requestMetadata: CodebookVariableValidationRequestMetadata;
  readOnly?: boolean;
  /**
   * Sends the compound edit, and may refuse it instead.
   *
   * A host that knows the draft contradicts rules already committed answers
   * `{ status: 'contradiction', message }` rather than a `failed` result: the
   * sentence is already written for the researcher, and the editor shows it
   * verbatim. See `AuxiliaryCodebookContradiction`.
   */
  onSubmitRequest(
    request: CompoundEditRequest,
  ): Promise<AuxiliaryCodebookSubmitResult> | AuxiliaryCodebookSubmitResult;
  onComplete?(result: Extract<CompoundEditResult, { status: 'applied' }>): void;
}>;

/**
 * Dedicated auxiliary surface for one existing variable's validation rules.
 * It never derives an authoritative base from a submission response: only a
 * subsequent `authoritativeEntityDocument` prop reconciles the local draft.
 */
export default function CodebookVariableValidationEditor({
  openId,
  subject,
  variableId,
  authoritativeEntityDocument,
  allSubjectVariables,
  requestMetadata,
  readOnly = false,
  onSubmitRequest,
  onComplete,
}: CodebookVariableValidationEditorProps) {
  const intl = useAppIntl();
  const session = useMemo(
    () =>
      new AuxiliaryCodebookDraftSession(
        authoritativeEntityDocument,
        authoritativeEntityDocument,
      ),
    // The caller's open identity owns reset semantics. Reconstructed protocol
    // documents must not erase a dirty draft while the same surface is open.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [openId],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe.bind(session),
    session.getSnapshot.bind(session),
    session.getSnapshot.bind(session),
  );
  const failureRef = useRef<HTMLDivElement>(null);
  const activeRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (session.receiveAuthoritative(authoritativeEntityDocument)) {
      activeRequestId.current = null;
    }
  }, [authoritativeEntityDocument, session]);

  useEffect(() => {
    if (snapshot.lastFailure !== null) failureRef.current?.focus();
  }, [snapshot.lastFailure]);

  const draftVariable = variableFromDocument(snapshot.draft, variableId);
  const authoritativeVariable = variableFromDocument(
    authoritativeEntityDocument,
    variableId,
  );
  const attributeUnavailable = authoritativeVariable === undefined;
  const variableType =
    draftVariable !== undefined && typeof draftVariable.type === 'string'
      ? draftVariable.type
      : '';
  const authoritativeVariableType =
    authoritativeVariable !== undefined &&
    typeof authoritativeVariable.type === 'string'
      ? authoritativeVariable.type
      : '';
  const attributeTypeChanged =
    !attributeUnavailable &&
    draftVariable !== undefined &&
    variableType !== authoritativeVariableType;
  const validation =
    draftVariable === undefined ? {} : validationFromVariable(draftVariable);
  const variablesForValidation = useMemo(() => {
    if (
      draftVariable === undefined ||
      attributeUnavailable ||
      Object.hasOwn(allSubjectVariables, variableId)
    ) {
      return allSubjectVariables;
    }
    return Object.fromEntries([
      ...Object.entries(allSubjectVariables),
      [variableId, draftVariable],
    ]);
  }, [allSubjectVariables, attributeUnavailable, draftVariable, variableId]);
  const issue =
    attributeUnavailable || draftVariable === undefined
      ? intl.formatMessage(messages.attributeMissingIssue)
      : attributeTypeChanged
        ? intl.formatMessage(messages.typeChangedIssue)
        : (missingTargetIssue(validation, variablesForValidation, intl) ??
          ruleMapIssue(validation, {
            allVariables: Object.fromEntries(
              Object.entries(variablesForValidation),
            ),
            currentVariableId: variableId,
            variableType,
          }));
  const busy = snapshot.status !== 'editing';
  const dirty = session.isDirty();
  const variableName =
    draftVariable !== undefined && typeof draftVariable.name === 'string'
      ? draftVariable.name
      : variableId;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stops at this form: a `Dialog` portals out of the DOM but stays a React
    // descendant, so React would otherwise hand this submit to the form the
    // editor was opened from — a prompt row, or the stage itself — and save
    // that instead. `preventDefault` alone only stops the browser's own
    // navigation, which is not what propagates here.
    event.stopPropagation();
    if (readOnly || busy || !dirty || issue !== undefined) return;
    const requestId = activeRequestId.current ?? requestMetadata.createId();
    activeRequestId.current = requestId;

    try {
      const result = await session.submit((draft, authoritativeDocument) => {
        const variable = variableFromDocument(draft, variableId);
        const nextValidation =
          variable === undefined ? {} : validationFromVariable(variable);
        return buildUpdateVariableRequest({
          requestId,
          description: requestMetadata.description,
          subject,
          authoritativeDocument:
            authoritativeDocument ?? authoritativeEntityDocument,
          variableId,
          draft: { validation: nextValidation },
          replaceProperties: ['validation'],
        });
      }, onSubmitRequest);
      if (
        result.status === 'failed' &&
        (result.reason === 'stale-epoch' ||
          result.reason === 'lease-lost' ||
          result.reason === 'stale-base')
      ) {
        activeRequestId.current = null;
      }
      if (
        result.status === 'applied' &&
        !session.getSnapshot().authoritativeChanged
      ) {
        onComplete?.(result);
      }
    } catch {
      // The auxiliary session preserves the draft and exposes the failure.
    }
  };

  // Opened from a dialog, whose own title is the heading above this one: an
  // `h2` written out here sat beside the dialog's title instead of under it,
  // and every alert this editor raises counted from the dialog and landed
  // beside this title in turn.
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h2'
      : headingTagBelow(enclosingHeadingLevel);

  const saveLabel = intl.formatMessage(
    snapshot.status === 'submitting'
      ? codebookEditingMessages.saving
      : snapshot.status === 'awaiting-authoritative'
        ? messages.awaitingAuthoritative
        : messages.submit,
  );

  return (
    <Surface spacing="md" shadow="md" noContainer>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex flex-col gap-6">
          <div>
            <Heading
              level="h2"
              margin="none"
              // The element only — `level` still carries the type treatment.
              {...(headingTag === 'h2'
                ? {}
                : { render: createElement(headingTag) })}
            >
              {intl.formatMessage(messages.title, { name: variableName })}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.description)}
            </Paragraph>
          </div>

          <EnclosingHeadingLevel level={headingTag}>
            {snapshot.authoritativeChanged &&
              !attributeUnavailable &&
              !attributeTypeChanged && (
                <Alert variant="warning" appearance="soft" density="compact">
                  <AlertTitle>
                    {intl.formatMessage(
                      codebookEditingMessages.staleAuthoritativeTitle,
                    )}
                  </AlertTitle>
                  <AlertDescription>
                    {intl.formatMessage(messages.staleAuthoritativeDescription)}
                  </AlertDescription>
                </Alert>
              )}

            {attributeTypeChanged && (
              <Alert variant="warning" appearance="soft" density="compact">
                <AlertTitle>
                  {intl.formatMessage(messages.typeChangedTitle)}
                </AlertTitle>
                <AlertDescription>
                  {intl.formatMessage(messages.typeChangedDescription)}
                </AlertDescription>
              </Alert>
            )}

            {snapshot.lastFailure !== null && (
              <Alert
                ref={failureRef}
                variant="destructive"
                appearance="soft"
                density="compact"
                tabIndex={-1}
              >
                <AlertTitle>
                  {intl.formatMessage(messages.failureTitle)}
                </AlertTitle>
                <AlertDescription>
                  {compoundFailureMessage(snapshot.lastFailure, intl)}
                </AlertDescription>
              </Alert>
            )}

            {attributeUnavailable || draftVariable === undefined ? (
              <Alert variant="destructive" appearance="soft" density="compact">
                <AlertTitle>
                  {intl.formatMessage(messages.attributeUnavailableTitle)}
                </AlertTitle>
                <AlertDescription>
                  {intl.formatMessage(messages.attributeUnavailableDescription)}
                </AlertDescription>
              </Alert>
            ) : (
              <VariableValidationEditor
                entity={subject.entity}
                variableType={variableType}
                currentVariableId={variableId}
                allVariables={variablesForValidation}
                value={validation}
                onChange={(nextValidation) => {
                  activeRequestId.current = null;
                  session.replaceDraft(
                    withVariableValidation(
                      snapshot.draft,
                      variableId,
                      nextValidation,
                    ),
                  );
                }}
                readOnly={readOnly || busy || attributeTypeChanged}
              />
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="submit"
                color="primary"
                disabled={readOnly || busy || !dirty || issue !== undefined}
              >
                {saveLabel}
              </Button>
            </div>
          </EnclosingHeadingLevel>
        </div>
      </form>
    </Surface>
  );
}
