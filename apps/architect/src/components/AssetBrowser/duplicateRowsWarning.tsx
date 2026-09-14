import { createElement } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const messages = defineMessages({
  warningContainsDuplicateRows: {
    id: 'architect.form.autoFileDrop.warningContainsDuplicateRows',
    defaultMessage: 'Warning: {value1} contains duplicate rows',
    description: 'The title text in components / Form / AutoFileDrop.',
  },
  theFileContainsDuplicateDuplicate: {
    id: 'architect.form.autoFileDrop.theFileContainsDuplicateDuplicate',
    defaultMessage:
      'The file contains {count, plural, one {# duplicate row} other {# duplicate rows}}. Duplicate rows will be removed when this roster is used in Fresco.',
    description:
      'Queued warning after importing a network resource. count is the number of duplicate rows detected; Fresco removes these rows when using the roster, not during this Architect import.',
  },
  considerRemovingDuplicatesFromYourCSV: {
    id: 'architect.form.autoFileDrop.considerRemovingDuplicatesFromYourCSV',
    defaultMessage:
      'Consider removing duplicates from your CSV file before importing.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  oK: {
    id: 'architect.assetBrowser.duplicateRowsWarning.oK',
    defaultMessage: 'OK',
    description:
      'The label text in components / AssetBrowser / duplicateRowsWarning.',
  },
});

/**
 * Warn that a roster carries duplicate rows, which Fresco drops when it runs
 * the interview.
 *
 * Shared by every path that brings a file into the protocol, because the
 * warning is about the file rather than about how it arrived. Supplying a
 * missing roster is the same import as adding a new one, and a researcher who
 * repaired one in Resources would otherwise ship an interview whose roster
 * silently loses records — the one case where they had no chance to see it,
 * since the resource they are repairing is the one already in use.
 *
 * Keeps the three `architect.form.autoFileDrop.*` warning ids so the existing
 * translations carry over unchanged; only the button label is new, because
 * `AutoFileDrop` still declares its own for other dialogs and one id must not
 * be defined in two places.
 */
export const warnAboutDuplicateRows = (
  openDialog: DialogContextType['openDialog'],
  {
    fileName,
    duplicateCount,
    finalFocus,
  }: {
    fileName: string;
    duplicateCount: number;
    finalFocus?: () => HTMLElement | null;
  },
): void => {
  if (duplicateCount <= 0) {
    return;
  }

  void openDialog({
    type: 'acknowledge',
    intent: 'warning',
    title: createElement(AppMessage, {
      message: messages.warningContainsDuplicateRows,
      values: { value1: fileName },
    }),
    children: (
      <>
        <Paragraph>
          {createElement(AppMessage, {
            message: messages.theFileContainsDuplicateDuplicate,
            values: { count: duplicateCount },
          })}
        </Paragraph>
        <Paragraph>
          {createElement(AppMessage, {
            message: messages.considerRemovingDuplicatesFromYourCSV,
          })}
        </Paragraph>
      </>
    ),
    actions: {
      primary: {
        label: createElement(AppMessage, { message: messages.oK }),
        value: true,
      },
    },
    ...(finalFocus ? { finalFocus } : {}),
  });
};
