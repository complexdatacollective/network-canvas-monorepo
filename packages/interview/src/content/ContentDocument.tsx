'use client';

import { Fragment, type ReactNode, useMemo, useState } from 'react';

import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import { logicInputsFor } from '@codaco/network-query';
import {
  type LocalizedString,
  logicBlocksIn,
  readContentDocument,
} from '@codaco/protocol-validation';

import { useDynamicValueSources } from '../dynamicValues/DynamicValueScope';
import { LocalizedMarkdown } from '../localization/LocalizedMarkdown';
import { useResolveLocalizedSource } from '../localization/ProtocolLocalizationProvider';
import { NO_SOURCES, shownBlocks, withSharedDefinitions } from './shownBlocks';

/** Plain English for screen readers: how the questions shown have changed. */
const changeAnnouncement = (added: number, removed: number): string =>
  [
    added === 1 && 'A new question is shown.',
    added > 1 && `${added} new questions are shown.`,
    removed === 1 && 'A question is no longer shown.',
    removed > 1 && `${removed} questions are no longer shown.`,
  ]
    .filter(Boolean)
    .join(' ');

type Announcement = Readonly<{ message: string; count: number }>;

/**
 * Tells screen reader users when logic shows or hides questions as they
 * answer, which a sighted participant sees happen on the screen. Every
 * change is announced, even one worded as the last: the message is drawn
 * afresh each time, and a status region reads out what is added to it. A
 * change of language shows that language's form, whose questions may
 * differ; logic shows and hides nothing then, so nothing is announced.
 */
function QuestionChanges({
  fieldIds,
  locale,
}: {
  fieldIds: readonly string[];
  locale: string;
}) {
  const [previous, setPrevious] = useState({ fieldIds, locale });
  const [announcement, setAnnouncement] = useState<Announcement>({
    message: '',
    count: 0,
  });

  if (previous.fieldIds !== fieldIds || previous.locale !== locale) {
    setPrevious({ fieldIds, locale });
    if (previous.locale === locale) {
      const before = new Set(previous.fieldIds);
      const now = new Set(fieldIds);
      const added = fieldIds.filter((id) => !before.has(id)).length;
      const removed = previous.fieldIds.filter((id) => !now.has(id)).length;
      if (added > 0 || removed > 0) {
        setAnnouncement(({ count }) => ({
          message: changeAnnouncement(added, removed),
          count: count + 1,
        }));
      }
    }
  }

  return (
    <div role="status" className="sr-only" lang="en">
      <span key={announcement.count}>{announcement.message}</span>
    </div>
  );
}

type ContentDocumentProps = Readonly<{
  /** Text of several lines: one document per language. */
  value: LocalizedString;
  allowedElements?: readonly string[];
  blockImages?: MarkdownBlockImages;
  /**
   * Draws a form's field, by its id. Only a form's text places fields.
   * `first` marks the field shown first when the document was first drawn,
   * which a form that takes the focus gives it to.
   */
  renderField?: (
    fieldId: string,
    placement: Readonly<{ first: boolean }>,
  ) => ReactNode;
}>;

/**
 * Text of several lines as the participant reads it, in the interview's
 * language: its markdown, with the values it shows; each logic block as the
 * version that the values and conditions here choose, read again as they
 * change (a form's answers as they are given); and, in a form, its fields
 * where the text places them. The one renderer for every such text.
 */
export function ContentDocument({
  value,
  allowedElements,
  blockImages,
  renderField,
}: ContentDocumentProps) {
  const resolveSource = useResolveLocalizedSource();
  const sources = useDynamicValueSources();
  const { text, locale } = resolveSource(value);
  const { nodes } = readContentDocument(text);
  const hasLogic = useMemo(() => logicBlocksIn(nodes).length > 0, [nodes]);

  const blocks = useMemo(
    () =>
      withSharedDefinitions(
        shownBlocks(nodes, logicInputsFor(sources ?? NO_SOURCES, locale)),
        locale,
      ),
    [nodes, sources, locale],
  );
  const fieldIds = useMemo(
    () =>
      blocks.flatMap((block) =>
        block.kind === 'field' ? [block.fieldId] : [],
      ),
    [blocks],
  );
  const [firstField] = useState(() => fieldIds[0]);

  return (
    <>
      {blocks.map((block) =>
        block.kind === 'field' ? (
          <Fragment key={`field:${block.fieldId}`}>
            {renderField?.(block.fieldId, {
              first: block.fieldId === firstField,
            })}
          </Fragment>
        ) : (
          <LocalizedMarkdown
            key={`text:${block.key}`}
            value={block.value}
            {...(allowedElements !== undefined && {
              allowedElements: [...allowedElements],
            })}
            {...(blockImages !== undefined && { blockImages })}
          />
        ),
      )}
      {renderField !== undefined && hasLogic && (
        <QuestionChanges fieldIds={fieldIds} locale={locale} />
      )}
    </>
  );
}
