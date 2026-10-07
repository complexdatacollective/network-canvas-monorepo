import { get } from 'es-toolkit/compat';
import { useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
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

/** The three answers the choice offers. */
type SymbolChoice = 'sexAssignedAtBirth' | 'genderIdentity' | 'codebook';

const asVariableId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const isSymbolChoice = (value: unknown): value is SymbolChoice =>
  value === 'sexAssignedAtBirth' ||
  value === 'genderIdentity' ||
  value === 'codebook';

/** Which answer the codebook's shape amounts to. */
const choiceFor = (state: PersonSymbolState): SymbolChoice => {
  if (state.kind === 'sexAssignedAtBirth') return 'sexAssignedAtBirth';
  if (
    state.kind === 'genderIdentity' ||
    state.kind === 'genderIdentityOutOfDate'
  ) {
    return 'genderIdentity';
  }
  return 'codebook';
};

/**
 * What the person type's symbols are drawn from: sex assigned at birth or
 * gender identity, following standard pedigree nomenclature (a circle for
 * female or feminine, a square for male or masculine, a diamond for everyone
 * else), or whatever the codebook says.
 *
 * One choice whose selected answer is what the codebook's shape amounts to
 * (`personSymbolState`), read every render, so a change made in the codebook
 * editor or by a collaborator moves it without anything of this control's
 * own. "Set in the codebook" is the answer for no mapping, a mapping of
 * either attribute set differently by hand, and a mapping of another
 * attribute, and its description says which.
 *
 * A person's symbol is the person type's codebook shape (`resolveNodeShape`
 * in the interview), not a stage setting, so choosing an answer is a CODEBOOK
 * write, taken under the person type's own lock and applied at once — like
 * the codebook editor's own shape changes, and like
 * `EncryptedAttributesSection`. Nothing here touches the stage's draft, so
 * the stage's save and cancel are unaffected by it.
 *
 * - Sex assigned at birth, or gender identity, writes a mapping of every
 *   option of that attribute with a diamond default.
 * - Set in the codebook, chosen over one of those, removes the mapping and
 *   keeps the default. Over anything else it is already the answer.
 * - Replacing a mapping someone set by hand asks first.
 * - Gender identity symbols left behind by changed options or words stay
 *   selected; a note under the label says so, with the one action that
 *   updates them.
 */
export default function PersonSymbolsControl({
  personSubject,
}: Readonly<{ personSubject: Extract<CodebookSubject, { entity: 'node' }> }>) {
  const intl = useAppIntl();
  const { readOnly, savedFields } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const writeCodebookSection = useCodebookSectionWrite();
  const { confirm } = useDialog();

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
  /** The answer being written, shown as chosen until the write settles. */
  const [pending, setPending] = useState<SymbolChoice | undefined>();
  const [failure, setFailure] = useState<
    Readonly<{ message: string; held: boolean }> | undefined
  >(undefined);
  /** Read when a confirmed choice is acted on, not when it was asked for. */
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
  const detected = choiceFor(state);

  // What "Set in the codebook" draws: the mapping that is not one of the
  // other two answers, or — over one of them — the default that choosing it
  // leaves everyone with.
  const codebookDescription = (() => {
    switch (state.kind) {
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
      case 'notMapped':
        return intl.formatMessage(messages.symbolsNotMapped, {
          shape: state.defaultShape,
        });
      default: {
        const stored: unknown = definition?.shape.default;
        return intl.formatMessage(messages.symbolsNotMapped, {
          shape: typeof stored === 'string' ? stored : 'circle',
        });
      }
    }
  })();

  const options: RichSelectOption[] = [
    {
      value: 'sexAssignedAtBirth',
      label: intl.formatMessage(messages.symbolsSexAssignedAtBirthLabel),
      description: intl.formatMessage(
        messages.symbolsSexAssignedAtBirthDescription,
      ),
      disabled: !canUseSex,
    },
    ...(canUseGender
      ? [
          {
            value: 'genderIdentity',
            label: intl.formatMessage(messages.symbolsGenderIdentityLabel),
            description: intl.formatMessage(
              messages.symbolsGenderIdentityDescription,
            ),
          },
        ]
      : []),
    {
      value: 'codebook',
      label: intl.formatMessage(messages.symbolsCodebookLabel),
      description: codebookDescription,
    },
  ];

  const write = async (choice: SymbolChoice) => {
    // The words the choice was made against, kept as they were: the draft can
    // move while the write waits for the lock.
    const terms = genderTerms;
    setFailure(undefined);
    setPending(choice);
    try {
      const outcome = await writeCodebookSection(
        personSubject,
        (authoritative) => {
          // Built from the attribute as the codebook holds it when the lock is
          // taken, so an option a collaborator added a moment ago is covered.
          const current = shapeMappingVariables(authoritative.variables);
          let mapping: ShapeMappingDraft | undefined;
          if (choice !== 'codebook') {
            const variableId =
              choice === 'sexAssignedAtBirth' ? sexAttribute : genderAttribute;
            const variable =
              variableId === undefined ? undefined : current[variableId];
            if (variableId === undefined || variable === undefined) {
              throw new MissingVariableError(variableId ?? '');
            }
            mapping = pedigreeSymbolMapping(
              variableId,
              variable,
              choice === 'sexAssignedAtBirth'
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
      if (choice === 'genderIdentity') setAppliedGenderTerms(terms);
    } finally {
      setPending(undefined);
    }
  };

  const choose = async (choice: SymbolChoice) => {
    if (
      (state.kind === 'custom' || state.kind === 'other') &&
      choice !== 'codebook'
    ) {
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
    await write(choice);
  };

  const busy = pending !== undefined;

  const hint = (
    <>
      {state.kind === 'genderIdentityOutOfDate' && (
        <span className="text-warning mb-1 block">
          {intl.formatMessage(messages.symbolsGenderIdentityOutOfDate)}{' '}
          {!readOnly && canUseGender && (
            <Button
              type="button"
              variant="link"
              color="dynamic"
              size="sm"
              disabled={busy}
              onClick={() => void write('genderIdentity')}
            >
              {intl.formatMessage(messages.symbolsUpdateGenderIdentity)}
            </Button>
          )}
        </span>
      )}
      {!canUseSex && !canUseGender && (
        <span className="mb-1 block">
          {intl.formatMessage(messages.symbolsNoSource)}
        </span>
      )}
      <span className="block">{intl.formatMessage(messages.symbolsHint)}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <UnconnectedField
        name="pedigree-symbols"
        label={intl.formatMessage(messages.symbolsLabel)}
        hint={hint}
        component={RichSelectGroupField}
        options={options}
        value={pending ?? detected}
        disabled={readOnly || busy}
        onChange={(next) => {
          // Choosing the answer already held writes nothing: the out-of-date
          // note carries the one action that rewrites it.
          if (!isSymbolChoice(next) || next === detected) return;
          void choose(next);
        }}
      />
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
      {busy && (
        <Paragraph role="status" margin="none" emphasis="muted">
          {intl.formatMessage(codebookEditingMessages.saving)}
        </Paragraph>
      )}
    </div>
  );
}
