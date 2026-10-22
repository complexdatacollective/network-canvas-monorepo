import { createElement, type ReactNode } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, AppMessage } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import {
  FinishStageTextRefusal,
  FinishStageTextRefusalTitle,
} from '~/components/FinishStageTextAlert';

import {
  bundleProtocol,
  MissingFinishStageTextError,
  UnresolvedAssetsError,
} from './bundleProtocol';
import { beginExport } from './criticalOperation';
import { preparingTheFileFailedMessage } from './downloadActiveProtocol';
import { deliverToInterviewer, openInterviewerTab } from './interviewerHandoff';
import { reportError } from './reportError';

const messages = defineMessages({
  notSentTitle: {
    id: 'architect.sendToInterviewer.notSentTitle',
    defaultMessage: 'Your protocol wasn’t sent to Interviewer',
    description:
      'Title of the dialog shown when the "Send to Interviewer" button, which opens Interviewer (the app that runs interviews) in a new browser tab and passes it the protocol, did not manage to pass it on.',
  },
  notReached: {
    id: 'architect.sendToInterviewer.notReached',
    defaultMessage:
      'Interviewer didn’t receive it. Check that your browser lets Architect open new tabs, then try again. You can also download the protocol and open the file in Interviewer.',
    description:
      'Body of the dialog shown when Interviewer (the app that runs interviews) could not be opened in a new browser tab, or opened but did not receive the protocol. "Download" means saving the protocol as a .netcanvas file with the Download button.',
  },
  unresolvedAssets: {
    id: 'architect.sendToInterviewer.unresolvedAssets',
    defaultMessage:
      'These resources could not be read, so your protocol was not sent: {assetList}. Add the files again in Resources, then send the protocol.',
    description:
      'Body of the dialog shown when the protocol could not be sent to Interviewer because some of its resources (images, audio, video or other files added to the protocol) could not be read. assetList is a list of the resource names. Resources is the name of the page where they are managed.',
  },
  oK: {
    id: 'architect.sendToInterviewer.oK',
    defaultMessage: 'OK',
    description:
      'Button that closes the dialog explaining why the protocol was not sent to Interviewer.',
  },
});

type OpenDialog = DialogContextType['openDialog'];

const showNotSent = (openDialog: OpenDialog, description: ReactNode) =>
  void openDialog({
    type: 'acknowledge',
    intent: 'destructive',
    title: createElement(AppMessage, { message: messages.notSentTitle }),
    description,
    actions: {
      primary: {
        label: createElement(AppMessage, { message: messages.oK }),
        value: true,
      },
    },
  });

// The file name Interviewer shows while it imports the protocol.
const fileNameFor = (protocol: CurrentProtocol) =>
  `${protocol.name.trim() || 'protocol'}.netcanvas`;

/**
 * Send a protocol to Interviewer: open it in a new tab and pass it the
 * protocol bundled exactly as Download would write it. Interviewer imports it
 * once the researcher has unlocked it.
 *
 * Must be called from the click that asked for it, because the tab is opened
 * before anything is awaited (a browser blocks a tab opened later). The
 * protocol is read and bundled while the tab loads, and handed over as soon as
 * both are done; a protocol that cannot be
 * bundled closes the tab again and is refused for the same reasons a download
 * is. Resolves `true` once Interviewer has received the protocol.
 *
 * `readProtocol` gives the protocol and the library id its resources are
 * stored under, as `downloadActiveProtocol` and `downloadSavedProtocol` read
 * them.
 */
export const sendProtocolToInterviewer = async (
  openDialog: OpenDialog,
  readProtocol: () => Promise<{
    protocol: CurrentProtocol;
    protocolId: string | undefined;
  }>,
): Promise<boolean> => {
  const tab = openInterviewerTab();
  if (!tab) {
    showNotSent(
      openDialog,
      createElement(AppMessage, { message: messages.notReached }),
    );
    return false;
  }

  // Held through delivery, so a service-worker update reload cannot drop the
  // protocol between bundling it and Interviewer receiving it.
  const finishExport = beginExport();
  try {
    const prepared = (async () => {
      const read = await readProtocol();
      const blob = await bundleProtocol(read.protocol, read.protocolId);
      return { protocol: read.protocol, blob };
    })();
    // Listening starts now, while the protocol is still being bundled; see
    // `deliverToInterviewer`. A bundle that fails settles this as not
    // reached, and is explained below instead.
    const delivery = deliverToInterviewer(
      tab,
      prepared.then(({ protocol, blob }) => ({
        blob,
        fileName: fileNameFor(protocol),
      })),
    );

    let protocol: CurrentProtocol;
    try {
      ({ protocol } = await prepared);
    } catch (error) {
      tab.window.close();
      if (error instanceof MissingFinishStageTextError) {
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: createElement(FinishStageTextRefusalTitle),
          description: createElement(FinishStageTextRefusal, {
            problem: error.problem,
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
        return false;
      }
      if (error instanceof UnresolvedAssetsError) {
        showNotSent(
          openDialog,
          createElement(AppErrorMessage, {
            error: createMessageError(messages.unresolvedAssets, {
              assetList: { list: error.assetNames },
            }),
          }),
        );
        return false;
      }
      reportError(error, { operation: 'sendToInterviewer' });
      showNotSent(
        openDialog,
        createElement(AppMessage, { message: preparingTheFileFailedMessage }),
      );
      return false;
    }

    const outcome = await delivery;
    if (outcome !== 'received') {
      showNotSent(
        openDialog,
        createElement(AppMessage, { message: messages.notReached }),
      );
      return false;
    }
    posthog.capture('protocol_sent_to_interviewer', {
      stage_count: protocol.stages?.length ?? 0,
    });
    return true;
  } finally {
    finishExport();
  }
};
