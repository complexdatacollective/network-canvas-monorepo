import { get } from 'es-toolkit/compat';
import { createElement, useId, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { codebookEditingMessages } from '../../../codebook/codebookMessages.ts';
import {
  documentWithEntityProperties,
  MissingVariableError,
} from '../../../codebook/editing.ts';
import {
  shapeMappingVariables,
  type ShapeMappingDraft,
} from '../../../codebook/shapeMapping.ts';
import { useCodebookSectionWrite } from '../../../codebook/writes.ts';
import { READ_ONLY_MESSAGE } from '../../../form/readOnlyRefusal.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import { NODE_CONFIGURATION_PATHS } from './pedigreeSlots.ts';
import {
  genderIdentitySymbol,
  pedigreeSymbolMapping,
  type PersonSymbolState,
  personSymbolState,
  sexAssignedAtBirthSymbol,
  shapeWithPedigreeSymbols,
} from './personSymbols.ts';

type SymbolAction = 'sexAssignedAtBirth' | 'genderIdentity' | 'oneSymbol';

const asVariableId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** Whether an action would throw away shapes someone chose by hand. */
const replacesHandMadeShapes = (state: PersonSymbolState): boolean =>
  state.kind === 'custom' || state.kind === 'other';

/**
 * Sets the person type's symbols from sex assigned at birth or gender
 * identity in one click, following standard pedigree nomenclature: a circle
 * for female or feminine, a square for male or masculine, a diamond for
 * everyone else.
 *
 * A person's symbol is the person type's codebook shape (`resolveNodeShape`
 * in the interview), not a stage setting, so a click is a CODEBOOK write,
 * taken under the person type's own lock and applied at once — like the
 * codebook editor's own shape changes, and like `EncryptedAttributesSection`.
 * Nothing here touches the stage's draft, so the stage's save and cancel are
 * unaffected by it.
 *
 * What the symbols follow is read from the codebook every render, against
 * the attributes and words in the stage's draft, so a change made in the
 * codebook editor or by a collaborator shows here without anything of this
 * control's own. Overwriting a mapping someone set by hand asks first.
 */
export default function PersonSymbolsControl({
  personSubject,
}: Readonly<{ personSubject: Extract<CodebookSubject, { entity: 'node' }> }>) {
  const intl = useAppIntl();
  const headingId = useId();
  const { readOnly, savedFields } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const writeCodebookSection = useCodebookSectionWrite();
  const { confirm } = useDialog();
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h4'
      : headingTagBelow(enclosingHeadingLevel);

  const sexAttribute = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.sexAssignedAtBirthAttribute),
  );
  const genderAttribute = asVariableId(
    useStageValue(NODE_CONFIGURATION_PATHS.genderIdentityAttribute),
  );
  const genderTerms = useStageValue(
    NODE_CONFIGURATION_PATHS.genderIdentityTerms,
  );
  const savedGenderTerms: unknown = get(
    savedFields,
    NODE_CONFIGURATION_PATHS.genderIdentityTerms,
  );

  /**
   * The words the gender identity symbols were last set from in this editor.
   * The draft's words can move on before the stage is saved, and symbols set
   * from words nobody saved are out of date, not hand-made, once they do.
   */
  const [appliedGenderTerms, setAppliedGenderTerms] = useState<unknown>();
  const [failure, setFailure] = useState<
    Readonly<{ message: string; held: boolean }> | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);
  /** Read when a confirmed action is acted on, not when it was asked for. */
  const writable = useRef(!readOnly);
  writable.current = !readOnly;

  const definition = protocolContext.codebook.node?.[personSubject.type];
  const variables = shapeMappingVariables(definition?.variables);
  const sexVariable =
    sexAttribute === undefined ? undefined : variables[sexAttribute];
  const genderVariable =
    genderAttribute === undefined ? undefined : variables[genderAttribute];
  const canUseSex = sexVariable?.type === 'categorical';
  const canUseGender =
    genderVariable?.type === 'categorical' &&
    (genderVariable.options?.length ?? 0) > 0;

  const state = personSymbolState({
    shape: definition?.shape,
    variables,
    sexAssignedAtBirthAttribute: sexAttribute,
    genderIdentityAttribute: genderAttribute,
    genderTerms,
    earlierGenderTerms: [
      savedGenderTerms,
      ...(appliedGenderTerms === undefined ? [] : [appliedGenderTerms]),
    ],
  });

  const status = (() => {
    switch (state.kind) {
      case 'notMapped':
        return intl.formatMessage(messages.symbolsNotMapped, {
          shape: state.defaultShape,
        });
      case 'sexAssignedAtBirth':
        return intl.formatMessage(messages.symbolsSexAssignedAtBirth);
      case 'genderIdentity':
        return intl.formatMessage(messages.symbolsGenderIdentity);
      case 'genderIdentityOutOfDate':
        return intl.formatMessage(messages.symbolsGenderIdentityOutOfDate);
      case 'custom':
        return intl.formatMessage(
          state.source === 'sexAssignedAtBirth'
            ? messages.symbolsCustomSexAssignedAtBirth
            : messages.symbolsCustomGenderIdentity,
        );
      case 'other':
        return intl.formatMessage(messages.symbolsOther, {
          attributeName: variables[state.variableId]?.name ?? state.variableId,
        });
    }
  })();

  const write = async (action: SymbolAction) => {
    // The words the click was made against, kept as they were: the draft can
    // move while the write waits for the lock.
    const terms = genderTerms;
    setFailure(undefined);
    setBusy(true);
    try {
      const outcome = await writeCodebookSection(
        personSubject,
        (authoritative) => {
          // Built from the attribute as the codebook holds it when the lock is
          // taken, so an option a collaborator added a moment ago is covered.
          const current = shapeMappingVariables(authoritative.variables);
          let mapping: ShapeMappingDraft | undefined;
          if (action !== 'oneSymbol') {
            const variableId =
              action === 'sexAssignedAtBirth' ? sexAttribute : genderAttribute;
            const variable =
              variableId === undefined ? undefined : current[variableId];
            if (variableId === undefined || variable === undefined) {
              throw new MissingVariableError(variableId ?? '');
            }
            mapping = pedigreeSymbolMapping(
              variableId,
              variable,
              action === 'sexAssignedAtBirth'
                ? sexAssignedAtBirthSymbol
                : (value) => genderIdentitySymbol(terms, value),
            );
          }
          return documentWithEntityProperties({
            subject: personSubject,
            authoritativeDocument: authoritative,
            draft: {
              shape: shapeWithPedigreeSymbols(authoritative.shape, mapping),
            },
          });
        },
      );
      if (outcome.status !== 'applied') {
        setFailure({
          message: outcome.message,
          held: outcome.refusal.kind === 'held',
        });
        return;
      }
      if (action === 'genderIdentity') setAppliedGenderTerms(terms);
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: SymbolAction) => {
    if (replacesHandMadeShapes(state)) {
      const confirmed = await confirm({
        title: intl.formatMessage(messages.symbolsReplaceTitle),
        description: intl.formatMessage(messages.symbolsReplaceDescription),
        confirmLabel: intl.formatMessage(messages.symbolsReplaceConfirm),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return;
    }
    if (!writable.current) {
      setFailure({ message: READ_ONLY_MESSAGE, held: true });
      return;
    }
    await write(action);
  };

  const actions: { action: SymbolAction; label: string }[] = [];
  if (state.kind === 'genderIdentityOutOfDate' && canUseGender) {
    actions.push({
      action: 'genderIdentity',
      label: intl.formatMessage(messages.symbolsUpdateGenderIdentity),
    });
  }
  if (canUseSex && state.kind !== 'sexAssignedAtBirth') {
    actions.push({
      action: 'sexAssignedAtBirth',
      label: intl.formatMessage(messages.symbolsUseSexAssignedAtBirth),
    });
  }
  if (
    canUseGender &&
    state.kind !== 'genderIdentity' &&
    state.kind !== 'genderIdentityOutOfDate'
  ) {
    actions.push({
      action: 'genderIdentity',
      label: intl.formatMessage(messages.symbolsUseGenderIdentity),
    });
  }
  if (
    state.kind === 'sexAssignedAtBirth' ||
    state.kind === 'genderIdentity' ||
    state.kind === 'genderIdentityOutOfDate'
  ) {
    actions.push({
      action: 'oneSymbol',
      label: intl.formatMessage(messages.symbolsUseOneSymbol),
    });
  }

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="mb-8 flex flex-col items-start gap-2"
    >
      <Heading
        id={headingId}
        level="h4"
        margin="none"
        {...(headingTag === 'h4' ? {} : { render: createElement(headingTag) })}
      >
        {intl.formatMessage(messages.symbolsTitle)}
      </Heading>
      {/* Live, so the sentence a click changes is read out when it changes. */}
      <Paragraph margin="none" aria-live="polite" aria-atomic="true">
        {status}
      </Paragraph>
      {failure !== undefined && (
        <Alert
          variant={failure.held ? 'warning' : 'destructive'}
          density="compact"
        >
          <AlertDescription>
            {formatMessageError(failure.message, intl) ?? failure.message}
          </AlertDescription>
        </Alert>
      )}
      {!canUseSex && !canUseGender ? (
        <Paragraph margin="none" emphasis="muted" intent="smallText">
          {intl.formatMessage(messages.symbolsNoSource)}
        </Paragraph>
      ) : (
        !readOnly && (
          <div className="flex flex-wrap gap-2">
            {actions.map(({ action, label }) => (
              <Button
                key={label}
                type="button"
                color={
                  state.kind === 'genderIdentityOutOfDate' &&
                  action === 'genderIdentity'
                    ? 'primary'
                    : 'default'
                }
                disabled={busy}
                onClick={() => void run(action)}
              >
                {label}
              </Button>
            ))}
          </div>
        )
      )}
      {busy && (
        <Paragraph role="status" margin="none" emphasis="muted">
          {intl.formatMessage(codebookEditingMessages.saving)}
        </Paragraph>
      )}
      <p className="text-muted text-sm">
        {intl.formatMessage(messages.symbolsHint)}
      </p>
    </div>
  );
}
