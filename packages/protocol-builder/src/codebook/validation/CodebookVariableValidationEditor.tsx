import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type FormEvent,
} from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { CodebookSubject } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import {
  AuxiliaryCodebookDraftSession,
  buildUpdateVariableRequest,
  type AuxiliaryCodebookDraftFailure,
} from '../editing.ts';
import {
  isValidationWithListValue,
  ruleMapIssue,
  type ValidationMap,
  type ValidationValue,
} from '../variableValidation.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

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

const failureMessage = (failure: AuxiliaryCodebookDraftFailure): string => {
  if (failure.kind === 'error') return failure.message;
  if (failure.result.status === 'failed') return failure.result.message;
  const blocker = failure.result.blockedSections[0];
  if (blocker?.holder !== undefined) {
    return `${blocker.holder.displayName} is currently editing a section needed for this change.`;
  }
  return 'A section needed for this change is currently being edited.';
};

const missingTargetIssue = (
  validation: Readonly<ValidationMap>,
  allVariables: Readonly<UnknownRecord>,
): string | undefined =>
  Object.entries(validation).some(
    ([ruleKey, target]) =>
      isValidationWithListValue(ruleKey) &&
      typeof target === 'string' &&
      !Object.hasOwn(allVariables, target),
  )
    ? 'The selected comparison attribute no longer exists.'
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
  onSubmitRequest(
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult> | CompoundEditResult;
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
    activeRequestId.current = null;
    session.receiveAuthoritative(authoritativeEntityDocument);
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
      ? 'The attribute no longer exists in this entity.'
      : (missingTargetIssue(validation, variablesForValidation) ??
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
      if (result.status === 'applied') onComplete?.(result);
    } catch {
      // The auxiliary session preserves the draft and exposes the failure.
    }
  };

  const saveLabel =
    snapshot.status === 'submitting'
      ? 'Saving…'
      : snapshot.status === 'awaiting-authoritative'
        ? 'Waiting for latest data…'
        : 'Save validation';

  return (
    <Surface spacing="md" shadow="md" noContainer>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex flex-col gap-6">
          <div>
            <Heading level="h2" margin="none">
              Edit validation for {variableName}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              Configure requirements, limits, and comparisons for this
              attribute.
            </Paragraph>
          </div>

          {snapshot.authoritativeChanged && !attributeUnavailable && (
            <Alert variant="warning" appearance="soft" density="compact">
              <AlertTitle>Newer codebook data is available</AlertTitle>
              <AlertDescription>
                Your validation draft has been kept. Saving will apply it to the
                latest authoritative entity data.
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
              <AlertTitle>Could not save validation</AlertTitle>
              <AlertDescription>
                {failureMessage(snapshot.lastFailure)}
              </AlertDescription>
            </Alert>
          )}

          {attributeUnavailable || draftVariable === undefined ? (
            <Alert variant="destructive" appearance="soft" density="compact">
              <AlertTitle>Attribute unavailable</AlertTitle>
              <AlertDescription>
                The latest entity data no longer contains this attribute.
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
              readOnly={readOnly || busy}
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
        </div>
      </form>
    </Surface>
  );
}
