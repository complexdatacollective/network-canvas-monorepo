import { isEqual } from 'es-toolkit';
import {
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
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
  suppliedInterfaceText,
} from '@codaco/protocol-validation';

import {
  sharedWordingFieldName,
  sharedWordingInForm,
} from '../../form/sharedWordingDraft.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../../form/stageEditorContext.ts';
import { stageAnswerAt } from '../../form/stageFormHooks.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { useProtocolLocalization } from '../../localization/ProtocolLocalization.tsx';
import { SHARED_WORDING_PATH } from '../../stageDocument.ts';
import BuilderSection from '../BuilderSection.tsx';
import SharedStageWording from './SharedStageWording.tsx';
import {
  sharedWordingChanges,
  type SharedWordingGroup,
  type SharedWordingWrites,
  useSharedStageWording,
  useSharedWordingWrites,
  useWriteSharedWording,
} from './sharedWordingState.ts';
import { stageWordingMessages as messages } from './stageWordingMessages.ts';
import { useSuppliedStageWording } from './suppliedStageWording.ts';

const asFieldValue = (value: unknown): FieldValue =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- supplied wording is a language-to-text map, which a localized text field holds as its value
  value as FieldValue;

const NO_PATHS: readonly string[] = Object.freeze([]);

/**
 * The shared words held with the stage (those the protocol does not hold yet)
 * that the form holds something other than Network Canvas's wording for, each
 * with that wording to put back.
 */
const pendingWordingChanges = (
  storeApi: StageFormStoreApi,
  groups: readonly SharedWordingGroup[],
  localization: ProtocolLocalization,
) =>
  groups.flatMap(({ group, keys, entries }) =>
    keys.flatMap((key) => {
      if (entries.some(([held]) => held === key)) return [];
      const inForm = sharedWordingInForm(storeApi, group, key);
      const supplied = suppliedInterfaceText(group, key, localization);
      return inForm === undefined ||
        supplied === undefined ||
        isEqual(inForm.value, supplied)
        ? []
        : [{ name: sharedWordingFieldName(group, key), value: supplied }];
    }),
  );

type StageWordingSectionProps = Readonly<{
  stageType: StageType;
  /** The dotted paths of the stage's own settings the section shows. */
  paths?: readonly string[];
  /** The fields for those settings. */
  children?: ReactNode;
}>;

/**
 * A stage's "Customize built-in wording" section: the words a participant
 * reads that this stage holds, each starting with Network Canvas's wording,
 * and the words every stage of its kind shares, which the protocol holds once
 * (see `SharedStageWording`). Where it has both, each is a part of its own
 * that opens and closes. Not shown at all when the stage has neither.
 *
 * Optional. Switched off, the stage holds Network Canvas's wording in every
 * language, which follows the protocol as languages are added or removed, so
 * switching off puts that wording back, the shared words with it (asking
 * first if the researcher changed any of it). It starts on when the stage or
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
  const { storeApi, committedFields, applyOwnCommands, reportRefusedWrite } =
    useStageEditorForm();
  const localization = useProtocolLocalization();
  const supplied = useSuppliedStageWording(stageType);
  const shared = useSharedStageWording();
  const writeShared = useWriteSharedWording();
  const sharedWrites = useSharedWordingWrites(shared);

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
    (localization !== undefined &&
      sharedWordingChanges(shared, localization).length > 0);
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
    // A shared word written as its field was left, by the same press that
    // reached this switch, counts: decided from what it will hold, and not
    // landing after the reset.
    const sharedChanges = sharedWordingChanges(
      await sharedWrites.settle(),
      localization,
    );
    // Those held with the stage are put back in the form, with the stage's
    // own wording, and are saved, as it is, with the stage.
    const pendingChanges = pendingWordingChanges(
      storeApi,
      shared,
      localization,
    );
    const stayOn = () => {
      sharedWrites.resume();
      return false;
    };
    if (
      differsFromSupplied(liveValue) ||
      sharedChanges.length > 0 ||
      pendingChanges.length > 0
    ) {
      const confirmed = await confirm({
        title: intl.formatMessage(messages.switchOffTitle),
        description: intl.formatMessage(
          sharedChanges.length > 0
            ? messages.switchOffSharedDescription
            : messages.switchOffDescription,
        ),
        confirmLabel: intl.formatMessage(messages.switchOffConfirm),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return stayOn();
    }

    // The shared words first, since they are written at once and can be
    // refused: a section that stayed on over a refusal has lost nothing.
    if (sharedChanges.length > 0) {
      const outcome = await writeShared(sharedChanges);
      if (outcome.status !== 'applied') {
        reportRefusedWrite(outcome.message);
        return stayOn();
      }
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
    if (refused) return stayOn();
    const { fields, dormantValues } = storeApi.getState();
    for (const { path, value } of resets) {
      if (!fields.has(path) && !dormantValues.has(path)) continue;
      storeApi.getState().setFieldValue(path, asFieldValue(value));
    }
    for (const { name, value } of pendingChanges) {
      storeApi.getState().setFieldValue(name, asFieldValue(value));
    }
    return true;
  }, [
    applyOwnCommands,
    committedFields,
    confirm,
    differsFromSupplied,
    intl,
    localization,
    paths,
    reportRefusedWrite,
    shared,
    sharedWrites,
    storeApi,
    supplied,
    writeShared,
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
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      optional={
        writtenByResearcher ? undefined : { startOn, switchOff, owns: paths }
      }
    >
      {shared.length === 0 ? (
        children
      ) : paths.length === 0 ? (
        <SharedStageWording groups={shared} writes={sharedWrites} />
      ) : (
        <WordingParts paths={paths} shared={shared} writes={sharedWrites}>
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
 * closes. Both start closed. The stage's own part opens whenever one of its
 * settings is refused, so the field that answers for it is on screen beside
 * the refusal. Rendered inside the section, so its headings count from the
 * section's own.
 */
function WordingParts({
  paths,
  shared,
  writes,
  children,
}: Readonly<{
  paths: readonly string[];
  shared: readonly SharedWordingGroup[];
  writes: SharedWordingWrites;
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
  // A shared word held with the stage is saved with it, so a save it refuses
  // opens the shared part over the field that answers for it, as a refused
  // setting opens the stage's own.
  const sharedRefused = issues.some(
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
      body: <SharedStageWording groups={shared} writes={writes} />,
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
        // The stage's own part stays open while one of its settings is refused.
        onValueChange={(next) =>
          setOpen(
            refused && !next.includes(SPECIFIC) ? [...next, SPECIFIC] : next,
          )
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
