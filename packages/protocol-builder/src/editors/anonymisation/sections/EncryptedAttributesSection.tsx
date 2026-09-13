import { useMemo, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  createMessageError,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { VariableTypes } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { codebookEditingMessages } from '../../../codebook/codebookMessages.ts';
import { documentWithUpdatedVariable } from '../../../codebook/editing.ts';
import { useCodebookSectionWrite } from '../../../codebook/writes.ts';
import { READ_ONLY_MESSAGE } from '../../../form/readOnlyRefusal.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { anonymisationMessages } from './anonymisationMessages.ts';

/**
 * Encryption protects TEXT only.
 *
 * The interview encrypts string values; a number or a date flagged encrypted
 * would be written to the database in the clear, and the researcher would have
 * been told otherwise. So only text attributes are offered — and an attribute
 * that stops being text stops being offered, which is why this list is read
 * from the codebook every render rather than remembered.
 */
const TEXT = VariableTypes.text;

type NodeTypeView = Readonly<{
  typeId: string;
  name: string;
  options: readonly Readonly<{ value: string; label: string }>[];
  encrypted: readonly string[];
  /** Whether the type protects anything at all, which is what its switch says. */
  hasEncrypted: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every attribute of one type carrying the flag, read from the AUTHORITATIVE
 * document rather than from the view the researcher clicked.
 *
 * The sweep is written against what the codebook holds at the moment the lock
 * is taken, so an attribute a collaborator encrypted while the confirmation
 * was on screen is cleared too — the researcher has just said no attribute of
 * this type should be encrypted, and leaving that one would contradict the
 * switch they are looking at.
 */
const encryptedVariableIds = (document: SectionDoc): readonly string[] => {
  const variables = document.variables;
  if (!isRecord(variables)) return [];
  return Object.entries(variables).flatMap(([id, variable]) =>
    isRecord(variable) && variable.encrypted === true ? [id] : [],
  );
};

/**
 * One type's text attributes, behind a switch of its own.
 *
 * A switch rather than a heading, because "no attribute of this type is
 * encrypted" is a decision a researcher makes about a whole type and would
 * otherwise be a study's worth of clicks, one box at a time. Switching it off
 * is what runs the sweep — see `EncryptedAttributesSection` — and switching it
 * on only opens the panel: choosing nothing yet is not a change to the
 * codebook.
 *
 * A plain `Section` rather than the package's `BuilderSection`, because
 * `encrypted` is a property of a CODEBOOK attribute and not a stage field:
 * there are no form values under this panel for a capability's own discard to
 * throw away, and the write it makes is immediate and outside the stage's
 * save.
 */
function NodeTypeAttributes({
  view,
  switchGeneration,
  disabled,
  onChange,
  onRequestOpenChange,
}: Readonly<{
  view: NodeTypeView;
  /**
   * Bumped to re-seed this type's switch from the codebook, and nothing else.
   *
   * `Section` takes `defaultOpen` as an initial value and ignores later ones,
   * which is right for a panel the researcher opened — an ordinary re-render
   * must not close one they opened over a type that protects nothing yet. It
   * is wrong for a change a COLLABORATOR made: an attribute they encrypted
   * would sit behind a switch saying the type protects nothing, with the only
   * affordance that could clear it behind that switch, and a type they cleared
   * would leave the switch standing over nothing.
   */
  switchGeneration: number;
  disabled: boolean;
  onChange: (next: readonly unknown[]) => void;
  onRequestOpenChange: (open: boolean) => Promise<boolean>;
}>) {
  const intl = useAppIntl();

  return (
    <Section
      key={switchGeneration}
      title={view.name}
      description={intl.formatMessage(
        anonymisationMessages.typeSwitchDescription,
      )}
      disabled={disabled}
      toggleable
      // Open on a type that already protects something, which is also the one
      // state where a stranded flag on a retyped attribute is visible: the
      // switch stands on, and switching it off is what takes the flag away.
      defaultOpen={view.hasEncrypted}
      onOpenChange={onRequestOpenChange}
    >
      {view.options.length === 0 ? (
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(anonymisationMessages.noTextAttributes)}
        </Paragraph>
      ) : (
        <UnconnectedField<typeof CheckboxGroupField>
          name={`encrypted-attributes-${view.typeId}`}
          component={CheckboxGroupField}
          // Named for the type as well, and hidden: the section's own heading
          // says the type once for a reader who can see it, and a screen
          // reader meeting the group on its own has to be told which type's
          // attributes these are.
          label={intl.formatMessage(anonymisationMessages.attributeGroupLabel, {
            typeName: view.name,
          })}
          labelHidden
          options={[...view.options]}
          value={[...view.encrypted]}
          disabled={disabled}
          onChange={(next) => onChange(next ?? [])}
        />
      )}
    </Section>
  );
}

/**
 * Which attributes the participant's passphrase protects.
 *
 * `encrypted` is a property of a CODEBOOK attribute, not of this stage: it
 * decides how the interview stores that attribute wherever it is collected,
 * and it outlives any stage that happens to switch it on. So a change here is
 * a codebook edit, taken under the codebook section's own lock and committed
 * at once — not part of this stage's save, and unaffected by cancelling it.
 * The section is composed into this editor because this is where a researcher
 * goes looking for it.
 *
 * Nothing here is mirrored locally. The list, the checkboxes and their state
 * are read from the authoritative codebook every render, so a type or an
 * attribute a collaborator changes — including one that stops being text —
 * is reflected here without this section issuing anything of its own. Each
 * type's switch is the one thing a component underneath holds state for, and
 * it is re-seeded from the codebook whenever a collaborator moves what the
 * type protects; see `switchGenerations` below.
 *
 * Each type is a switch of its own, and switching one off un-encrypts every
 * attribute of that type at once, as Architect's does: saying "this type is
 * not protected after all" is otherwise a study's worth of clicks, one box at
 * a time, each its own codebook write. The loss is real, so it is confirmed
 * first.
 */
export default function EncryptedAttributesSection() {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const writeCodebookSection = useCodebookSectionWrite();
  /**
   * What was announced last, encoded rather than formatted: an announcement
   * stays in its live region until another replaces it, so a sentence resolved
   * when the choice was made would be the one thing left in the old language
   * after the reader changes it.
   */
  const [announcement, setAnnouncement] = useState('');
  /**
   * Why the last change was refused, encoded for the same reason, and in which
   * register to say it: a section somebody else is holding is not a fault —
   * the change is fine and lands once they are finished — so it is a notice
   * rather than an error, exactly as every other codebook writer says it.
   */
  const [failure, setFailure] = useState<
    Readonly<{ message: string; held: boolean }> | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);
  const { confirm } = useDialog();
  /**
   * Whether this researcher may still write, at the moment a decision is acted
   * on rather than at the moment it was asked for.
   *
   * The sweep waits on a confirmation the researcher answers in their own
   * time, and the lock can go in that window. The stage's read-only state does
   * not reach the codebook — `encrypted` lives in a codebook section with a
   * lock of its own, which a host grants a spectating editor — so nothing
   * downstream would refuse the write. A deferred create asks the same
   * question of its own slot (`useCreateAttributeForSlot`'s `liveTarget`).
   */
  const writable = useRef(!readOnly);
  writable.current = !readOnly;

  const nodeTypes = useMemo<readonly NodeTypeView[]>(() => {
    const definitions = protocolContext.codebook.node ?? {};
    return Object.entries(definitions)
      .map(([typeId, definition]): NodeTypeView => {
        const all = Object.entries(definition.variables ?? {});
        const variables = all.filter(([, variable]) => variable.type === TEXT);
        return {
          typeId,
          name: definition.name,
          options: variables
            .map(([value, variable]) => ({ value, label: variable.name }))
            .toSorted((left, right) => left.label.localeCompare(right.label)),
          encrypted: variables
            .filter(([, variable]) => variable.encrypted === true)
            .map(([value]) => value),
          hasEncrypted: all.some(([, variable]) => variable.encrypted === true),
        };
      })
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }, [protocolContext]);

  /**
   * How many times each type's switch has been re-seeded from the codebook.
   *
   * A switch is a projection of the authoritative document — "this type
   * protects something" — but `Section` holds `open` itself and takes
   * `defaultOpen` only as it mounts, so once mounted it stops following the
   * codebook. Re-mounting the one type whose protection moved is what puts it
   * back, and it is done only for a move this section did not make: re-seeding
   * under a gesture in progress takes the panel away mid-edit, and a
   * researcher who opened a type that protects nothing yet must keep the empty
   * panel they opened.
   */
  const [switchGenerations, setSwitchGenerations] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  /** What each type's switch was last seeded from. */
  const seenProtection = useRef(new Map<string, boolean>());
  /**
   * What this section's own write will leave each type protecting.
   *
   * The codebook moving because this section wrote to it is not news to the
   * researcher: re-seeding on it would close the panel the moment they untick
   * the last attribute, mid-edit, over a section they still have open.
   */
  const askedProtection = useRef(new Map<string, boolean>());
  /** How many writes of this section's own are waiting or in flight. */
  const pending = useRef(0);

  // Adjusted during render rather than in an effect: a collaborator's change
  // is the codebook moving under the editor, and showing the switch it
  // replaced for a frame first is showing the researcher something untrue.
  const reseeded: string[] = [];
  for (const view of nodeTypes) {
    const seen = seenProtection.current.get(view.typeId);
    if (seen === view.hasEncrypted) continue;
    seenProtection.current.set(view.typeId, view.hasEncrypted);
    const ours = askedProtection.current.get(view.typeId) === view.hasEncrypted;
    askedProtection.current.delete(view.typeId);
    // A type met for the first time is seeded by mounting, not by re-mounting.
    if (seen === undefined || ours || pending.current > 0) continue;
    reseeded.push(view.typeId);
  }
  if (reseeded.length > 0) {
    setSwitchGenerations((generations) => {
      const next = new Map(generations);
      for (const typeId of reseeded) {
        next.set(typeId, (next.get(typeId) ?? 0) + 1);
      }
      return next;
    });
  }

  const setEncrypted = async (
    view: NodeTypeView,
    variableId: string,
    encrypted: boolean,
  ) => {
    const subject: CodebookSubject = { entity: 'node', type: view.typeId };
    const label =
      view.options.find((option) => option.value === variableId)?.label ??
      variableId;

    setFailure(undefined);
    setBusy(true);
    pending.current += 1;
    try {
      const outcome = await writeCodebookSection(subject, (authoritative) => {
        const next = documentWithUpdatedVariable({
          subject,
          authoritativeDocument: authoritative,
          variableId,
          // Switching encryption off REMOVES the property rather than storing
          // `false`: absence is how the protocol schema spells "not
          // encrypted", and a stored `false` would go on saying something
          // about an attribute nobody is protecting.
          draft: encrypted ? { encrypted: true } : {},
          replaceProperties: ['encrypted'],
        });
        // Read off the document being written rather than predicted from the
        // checkbox: unticking the last TEXT attribute leaves the type
        // protecting whatever a stranded flag elsewhere in it still protects.
        askedProtection.current.set(
          view.typeId,
          encryptedVariableIds(next).length > 0,
        );
        return next;
      });
      if (outcome.status !== 'applied') {
        // Nothing landed, so the codebook has not moved and the marker would
        // otherwise swallow the next change a collaborator makes.
        askedProtection.current.delete(view.typeId);
        setFailure({
          message: outcome.message,
          held: outcome.refusal.kind === 'held',
        });
        return;
      }
      setAnnouncement(
        createMessageError(
          encrypted
            ? anonymisationMessages.encryptedAnnouncement
            : anonymisationMessages.notEncryptedAnnouncement,
          { attributeName: label },
        ),
      );
    } finally {
      pending.current -= 1;
      setBusy(false);
    }
  };

  /**
   * Un-encrypts every attribute of one type, in ONE write.
   *
   * One write rather than one per attribute: the whole sweep is a single
   * decision, and a lock taken and released per attribute would let a
   * collaborator's own edit land in the middle of it — leaving a type half
   * protected, which is neither of the two states the switch can show.
   */
  const clearType = async (view: NodeTypeView): Promise<boolean> => {
    const subject: CodebookSubject = { entity: 'node', type: view.typeId };
    setFailure(undefined);
    setBusy(true);
    pending.current += 1;
    try {
      const outcome = await writeCodebookSection(subject, (authoritative) => {
        askedProtection.current.set(view.typeId, false);
        return encryptedVariableIds(authoritative).reduce(
          (document, variableId) =>
            documentWithUpdatedVariable({
              subject,
              authoritativeDocument: document,
              variableId,
              draft: {},
              replaceProperties: ['encrypted'],
            }),
          authoritative,
        );
      });
      if (outcome.status !== 'applied') {
        askedProtection.current.delete(view.typeId);
        setFailure({
          message: outcome.message,
          held: outcome.refusal.kind === 'held',
        });
        return false;
      }
      setAnnouncement(
        createMessageError(anonymisationMessages.clearedTypeAnnouncement, {
          typeName: view.name,
        }),
      );
      return true;
    } finally {
      pending.current -= 1;
      setBusy(false);
    }
  };

  /**
   * What one type's switch does.
   *
   * Switching ON only opens the panel: a type nobody has ticked anything for
   * has nothing to write. Switching OFF is the sweep, confirmed first because
   * it un-encrypts attributes the researcher may not be looking at — and
   * refused writes leave the switch where the researcher left it, over the
   * attributes that are still protected.
   */
  const requestOpenChange = async (
    view: NodeTypeView,
    open: boolean,
  ): Promise<boolean> => {
    if (open || !view.hasEncrypted) return true;
    const confirmed = await confirm({
      title: intl.formatMessage(anonymisationMessages.clearTypeConfirmTitle),
      description: intl.formatMessage(
        anonymisationMessages.clearTypeConfirmDescription,
        { typeName: view.name },
      ),
      confirmLabel: intl.formatMessage(
        anonymisationMessages.clearTypeConfirmLabel,
      ),
      cancelLabel: intl.formatMessage(commonMessages.cancel),
      intent: 'warning',
      onConfirm: () => undefined,
    });
    if (confirmed !== true) return false;
    if (!writable.current) {
      // Said rather than silently refused. Every other way this section
      // declines a change puts a sentence above it, and a switch that simply
      // sprang back would be the one refusal the researcher is left to guess
      // at — over a type they had just been asked to confirm.
      setFailure({ message: READ_ONLY_MESSAGE, held: true });
      return false;
    }
    return clearType(view);
  };

  const handleChange = (view: NodeTypeView, next: readonly unknown[]) => {
    const chosen = new Set(
      next.filter((value): value is string => typeof value === 'string'),
    );
    const current = new Set(view.encrypted);
    for (const { value } of view.options) {
      if (chosen.has(value) === current.has(value)) continue;
      void setEncrypted(view, value, chosen.has(value));
    }
  };

  return (
    <BuilderSection
      title={intl.formatMessage(anonymisationMessages.encryptedAttributesTitle)}
      description={intl.formatMessage(
        anonymisationMessages.encryptedAttributesDescription,
      )}
    >
      <Alert variant="info" density="compact">
        <AlertDescription>
          {intl.formatMessage(anonymisationMessages.storageNotice)}
        </AlertDescription>
      </Alert>

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

      {nodeTypes.length === 0 && (
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(anonymisationMessages.noTypesEmptyState)}
        </Paragraph>
      )}

      {nodeTypes.map((view) => (
        <NodeTypeAttributes
          key={view.typeId}
          view={view}
          switchGeneration={switchGenerations.get(view.typeId) ?? 0}
          disabled={readOnly || busy}
          onChange={(next) => handleChange(view, next)}
          onRequestOpenChange={(open) => requestOpenChange(view, open)}
        />
      ))}

      {/* Every checkbox above is disabled while a codebook write is in flight,
          so a tick made in that window reaches nothing. Saying the section is
          saving is what keeps that from being silent: without it a researcher
          ticks a second attribute, watches the box refuse to move, and is told
          neither why nor that a change is already on its way. A live region
          rather than an `aria-busy` one: `aria-busy` tells a screen reader to
          hold an announcement back until it clears, and this sentence is only
          ever on screen while it would not. */}
      {busy && (
        <Paragraph role="status" margin="none" emphasis="muted">
          {intl.formatMessage(codebookEditingMessages.saving)}
        </Paragraph>
      )}

      {/* Mounted with the section rather than with the message, so the first
          announcement updates a region that was already there. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {formatMessageError(announcement, intl) ?? announcement}
      </span>
    </BuilderSection>
  );
}
