import { isEqual } from 'es-toolkit';
import {
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import {
  hasSuppliedWording,
  type StageType,
} from '@codaco/protocol-validation';

import {
  sharedWordingFieldName,
  sharedWordingResets,
} from '../../form/sharedWordingDraft.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../../form/stageEditorContext.ts';
import { stageAnswerAt } from '../../form/stageFormHooks.ts';
import { useProtocolLocalization } from '../../localization/ProtocolLocalization.tsx';
import { SHARED_WORDING_PATH } from '../../stageDocument.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { useLatest } from '../../state/useLatest.ts';
import BuilderSection from '../BuilderSection.tsx';
import SharedStageWording from './SharedStageWording.tsx';
import {
  rewordsSharedWording,
  type SharedWordingGroup,
  useSharedStageWording,
} from './sharedWordingState.ts';
import { stageWordingMessages as messages } from './stageWordingMessages.ts';
import { useSuppliedStageWording } from './suppliedStageWording.ts';

const asFieldValue = (value: unknown): FieldValue =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- supplied wording is a language-to-text map, which a localized text field holds as its value
  value as FieldValue;

const NO_PATHS: readonly string[] = Object.freeze([]);

/**
 * Puts each reset whose field is on screen back in the form once the field
 * has gone, and answers with how to stop waiting.
 *
 * A section switching off empties the fields it closes over as they go. The
 * stage's own wording does not mind, as an emptied setting reads as Network
 * Canvas's wording; but a shared word is no setting of the stage's, and its
 * field emptied would read as wording the researcher deleted. So the shared
 * words the section puts back are put back again as each field leaves.
 */
function keepThroughDiscard(
  storeApi: StageFormStoreApi,
  resets: readonly Readonly<{ name: string; value: FieldValue }>[],
): () => void {
  let waiting = resets.filter(({ name }) =>
    storeApi.getState().fields.has(name),
  );
  if (waiting.length === 0) return () => undefined;
  const unsubscribe = storeApi.subscribe(() => {
    const { fields } = storeApi.getState();
    const gone = waiting.filter(({ name }) => !fields.has(name));
    if (gone.length === 0) return;
    waiting = waiting.filter(({ name }) => fields.has(name));
    if (waiting.length === 0) unsubscribe();
    for (const { name, value } of gone) {
      storeApi.getState().setFieldValue(name, value);
    }
  });
  return unsubscribe;
}

type StageWordingSectionProps = Readonly<{
  stageType: StageType;
  /** The dotted paths of the stage's own settings the section shows. */
  paths?: readonly string[];
  /** The fields for those settings. */
  children?: ReactNode;
}>;

/**
 * A stage's "Customize built-in wording" section: the words a participant
 * reads that this stage can word for itself, each starting with Network
 * Canvas's wording, and the words every stage of its kind shares, which the
 * protocol words once (see `SharedStageWording`). The stage and the protocol
 * store only the wording the researcher changes. Where it has both, each is a part of its own
 * that opens and closes. Not shown at all when the stage has neither.
 *
 * Optional. Switched off, the stage reads as Network Canvas words it in every
 * language, including one added later, so switching off puts that wording
 * back, the shared words with it (asking first if the researcher changed any
 * of it). Like every change made in the stage editor, putting it back is part
 * of the stage's draft, saved with the stage and thrown away with it. It starts on when the stage or
 * the shared words already hold wording of the researcher's own, and whenever
 * the protocol has more than one language, so a translation still to be
 * written is in view.
 *
 * Not optional while the default language is one Network Canvas has no
 * wording in: there is nothing to put back, and the researcher writes that
 * wording before the protocol can be downloaded, so it is always shown.
 */
export default function StageWordingSection({
  stageType,
  paths = NO_PATHS,
  children,
}: StageWordingSectionProps) {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const { storeApi, committedFields, applyOwnCommands } = useStageEditorForm();
  const localization = useProtocolLocalization();
  const latestProtocol = useLatest(useProtocolContext());
  const supplied = useSuppliedStageWording(stageType);
  const shared = useSharedStageWording();
  // Ended with the section, so nothing is put in a form that has gone.
  const stopKeeping = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stopKeeping.current?.(), []);

  const differsFromSupplied = useCallback(
    (read: (path: string) => unknown) =>
      supplied !== undefined &&
      paths.some(
        (path) =>
          supplied.has(path) && !isEqual(read(path), supplied.get(path)),
      ),
    [paths, supplied],
  );

  const shouldStartOn = () =>
    (localization?.locales.length ?? 1) > 1 ||
    differsFromSupplied((path) =>
      stageAnswerAt(storeApi.getState(), committedFields, path),
    ) ||
    (localization !== undefined && rewordsSharedWording(shared, localization));
  // Decided once, as the section mounts, but not before the protocol's
  // languages are read: the stage can open a moment before its settings.
  const [startOn, setStartOn] = useState(shouldStartOn);
  const [decided, setDecided] = useState(localization !== undefined);
  useEffect(() => {
    if (decided || localization === undefined) return;
    setStartOn(shouldStartOn());
    setDecided(true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- decided once, when the languages arrive
  }, [decided, localization]);

  const switchOff = useCallback(async () => {
    if (supplied === undefined || localization === undefined) return false;
    const liveValue = (path: string) =>
      stageAnswerAt(storeApi.getState(), committedFields, path);
    // The shared words are put back in the form with the stage's own
    // wording, and saved, as it is, with the stage: hidden by their setting
    // or not, as a hidden stage setting is put back too, and whether or not
    // the form has shown them yet.
    const sharedResets = sharedWordingResets(
      storeApi,
      latestProtocol(),
      shared,
      localization,
    );
    if (
      differsFromSupplied(liveValue) ||
      sharedResets.some(({ changed }) => changed)
    ) {
      const confirmed = await confirm({
        title: intl.formatMessage(messages.switchOffTitle),
        description: intl.formatMessage(messages.switchOffDescription),
        confirmLabel: intl.formatMessage(messages.switchOffConfirm),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return false;
    }

    const resets = paths.flatMap((path) => {
      const value = supplied.get(path);
      return value === undefined || isEqual(liveValue(path), value)
        ? []
        : [{ path, value }];
    });
    // The document first, in one batch, then the controls: a field the
    // section is closing over is parked with its value, and would write the
    // researcher's wording back on save.
    const { refused } = applyOwnCommands(
      resets.map(({ path, value }) => ({
        op: 'set' as const,
        key: path.split('.'),
        value,
      })),
    );
    if (refused) return false;
    const { fields, dormantValues } = storeApi.getState();
    for (const { path, value } of resets) {
      if (!fields.has(path) && !dormantValues.has(path)) continue;
      storeApi.getState().setFieldValue(path, asFieldValue(value));
    }
    for (const { name, value, changed } of sharedResets) {
      if (changed) storeApi.getState().setFieldValue(name, value);
    }
    stopKeeping.current?.();
    stopKeeping.current = keepThroughDiscard(storeApi, sharedResets);
    return true;
  }, [
    applyOwnCommands,
    committedFields,
    confirm,
    differsFromSupplied,
    intl,
    latestProtocol,
    localization,
    paths,
    shared,
    storeApi,
    supplied,
  ]);

  if (paths.length === 0 && shared.length === 0) return null;

  const writtenByResearcher =
    localization !== undefined &&
    !hasSuppliedWording(localization.defaultLocale);

  return (
    <BuilderSection
      // Mounted again once the languages are known, so it reads `startOn`
      // from them.
      key={decided ? 'decided' : 'pending'}
      sectionKey="built-in-wording"
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      optional={
        writtenByResearcher ? undefined : { startOn, switchOff, owns: paths }
      }
    >
      {shared.length === 0 ? (
        children
      ) : paths.length === 0 ? (
        <SharedStageWording groups={shared} />
      ) : (
        <WordingParts paths={paths} shared={shared}>
          {children}
        </WordingParts>
      )}
    </BuilderSection>
  );
}

const SPECIFIC = 'specific';
const SHARED = 'shared';
const CLOSED: readonly string[] = Object.freeze([]);

/** Whether a refusal at `issuePath` is about the setting at `path`. */
const refusesSetting = (issuePath: readonly PropertyKey[], path: string) =>
  path.split('.').every((segment, index) => issuePath[index] === segment);

/**
 * The stage's own words and the shared ones, each a part that opens and
 * closes. Both start closed. Each opens whenever what it holds is refused,
 * and stays open while the refusal stands, so the field that answers for it
 * is on screen beside the refusal. Rendered inside the section, so its headings count from the
 * section's own.
 */
function WordingParts({
  paths,
  shared,
  children,
}: Readonly<{
  paths: readonly string[];
  shared: readonly SharedWordingGroup[];
  children: ReactNode;
}>) {
  const intl = useAppIntl();
  const { storeApi, outline } = useStageEditorForm();
  const headingTag = headingTagBelow(useEnclosingHeadingLevel() ?? 'h3');
  const [open, setOpen] = useState<readonly string[]>(CLOSED);

  const fieldRefused = useSyncExternalStore(storeApi.subscribe, () =>
    paths.some(
      (path) => (storeApi.getState().getFieldErrors(path)?.length ?? 0) > 0,
    ),
  );
  const issues = useSyncExternalStore(
    outline.subscribe,
    outline.getValidationIssues,
    outline.getValidationIssues,
  );
  const issueRefused = issues.some((issue) =>
    paths.some((path) => refusesSetting(issue.path, path)),
  );
  const refused = fieldRefused || issueRefused;
  // A shared word is saved with the stage, so a save it refuses opens the
  // shared part over the field that answers for it, as a refused setting
  // opens the stage's own.
  const sharedFieldRefused = useSyncExternalStore(storeApi.subscribe, () =>
    shared.some(({ group, keys }) =>
      keys.some(
        (key) =>
          (storeApi
            .getState()
            .getFieldErrors(sharedWordingFieldName(group, key))?.length ?? 0) >
          0,
      ),
    ),
  );
  const sharedRefused =
    sharedFieldRefused ||
    issues.some(
      (issue) =>
        issue.path[0] === SHARED_WORDING_PATH &&
        shared.some(({ group }) => issue.path[1] === group),
    );
  // Adjusted during render, as a refusal arrives, rather than in an effect:
  // a part opened a frame late would draw the refused field one frame after
  // the refusal.
  const [seenRefused, setSeenRefused] = useState(false);
  const [seenSharedRefused, setSeenSharedRefused] = useState(false);
  if (seenRefused !== refused || seenSharedRefused !== sharedRefused) {
    const opening = [
      ...(refused && !seenRefused ? [SPECIFIC] : []),
      ...(sharedRefused && !seenSharedRefused ? [SHARED] : []),
    ].filter((part) => !open.includes(part));
    setSeenRefused(refused);
    setSeenSharedRefused(sharedRefused);
    if (opening.length > 0) setOpen([...open, ...opening]);
  }

  const parts = [
    { value: SPECIFIC, title: messages.specificHeading, body: children },
    {
      value: SHARED,
      title: messages.sharedHeading,
      body: <SharedStageWording groups={shared} />,
    },
  ];

  return (
    <>
      {/*
        A closed stage part still owns its settings, which are parked with
        their values and appear when it opens. Named here, inertly, as a
        switched-off section names its own, because the closed part mounts
        none of them.
      */}
      {!open.includes(SPECIFIC) &&
        paths.map((path) => (
          <template key={path} data-owned-field-path={path} />
        ))}
      <Accordion<string>
        multiple
        value={[...open]}
        // Each part stays open while what it holds is refused.
        onValueChange={(next) =>
          setOpen([
            ...next,
            ...(refused && !next.includes(SPECIFIC) ? [SPECIFIC] : []),
            ...(sharedRefused && !next.includes(SHARED) ? [SHARED] : []),
          ])
        }
        className="gap-6"
      >
        {parts.map(({ value, title, body }) => (
          <AccordionItem key={value} value={value}>
            <AccordionHeader render={createElement(headingTag)}>
              <AccordionTrigger>{intl.formatMessage(title)}</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="mt-4">
              {/* Mounted only while open: a closed part is hidden from
                assistive technology, so it must hold nothing focusable. A
                stage field it closes over is parked with its value. */}
              {open.includes(value) && (
                <EnclosingHeadingLevel level={headingTag}>
                  {body}
                </EnclosingHeadingLevel>
              )}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
