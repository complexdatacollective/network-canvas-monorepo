import { createElement, type ReactNode, useCallback, useId } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Toggle from '@codaco/fresco-ui/Toggle';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ExternalLink from '~/components/ExternalLink';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { pageInsetClasses } from '~/components/ProjectNav/pageInset';
import ReviewSparklesIcon from '~/components/ProtocolReview/ReviewSparklesIcon';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  disableProtocolReview,
  enableProtocolReview,
} from '~/ducks/modules/activeProtocol';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import {
  getIsProtocolReviewEnabled,
  getProtocolReviewStudyDetailsDraft,
} from '~/selectors/protocol';
import { documentationLinks } from '~/utils/documentationLinks';

const messages = defineMessages({
  title: {
    id: 'architect.pages.experimentsPage.title',
    defaultMessage: 'Experimental features',
    description:
      'Title of the page where a researcher turns on experimental features for their protocol.',
  },
  description: {
    id: 'architect.pages.experimentsPage.description',
    defaultMessage:
      'These are features that we are still evaluating and that we don’t think are ready for everyday use yet. They may change or be removed at short notice. If you use one of these experimental features, please give us feedback on the <forum>community forum</forum>.',
    description:
      'Introduction under the title of the experimental features page. The tag around "community forum" makes it a link to the Network Canvas community forum; keep the tag around the words that name the forum.',
  },
  notice: {
    id: 'architect.pages.experimentsPage.notice',
    defaultMessage:
      'The implementation of an experimental feature may change between versions of Architect, Interviewer, or Fresco, and is not subject to <versioning>protocol schema versioning</versioning>.',
    description:
      'Information notice on the experimental features page. The tag around "protocol schema versioning" makes it a link to the documentation about protocol schema versions; keep the tag around those words.',
  },
  reviewTitle: {
    id: 'architect.pages.experimentsPage.reviewTitle',
    defaultMessage: 'Automated Protocol Review',
    description:
      'Name of an experimental feature, shown as the heading of its card on the experimental features page and as the accessible name of the switch that turns it on or off.',
  },
  reviewDescription: {
    id: 'architect.pages.experimentsPage.reviewDescription',
    defaultMessage:
      'Provides automatically generated review feedback for your protocol, using an LLM. Looks for problems with structure, wording, and burden, and suggests fixes that you can choose to apply. Requires an internet connection.',
    description:
      'Description of the Automated Protocol Review experimental feature, under its heading on the experimental features page. "LLM" means a large language model, an AI text generator.',
  },
  noOthers: {
    id: 'architect.pages.experimentsPage.noOthers',
    defaultMessage: 'There are no other experimental features at the moment.',
    description:
      'Closing line at the bottom of the experimental features page, shown because the Automated Protocol Review card is the only experimental feature.',
  },
  turnOffTitle: {
    id: 'architect.pages.experimentsPage.turnOffTitle',
    defaultMessage: 'Turn off Automated Protocol Review?',
    description:
      'Title of the confirmation dialog shown when a researcher turns off Automated Protocol Review while study details are saved in their protocol.',
  },
  turnOffDescription: {
    id: 'architect.pages.experimentsPage.turnOffDescription',
    defaultMessage:
      'The study details saved in this protocol for Automated Protocol Review will be removed.',
    description:
      'Explanation in the confirmation dialog shown when a researcher turns off Automated Protocol Review. The study details are the research questions, population and other facts about the study that they gave the review.',
  },
  turnOffConfirm: {
    id: 'architect.pages.experimentsPage.turnOffConfirm',
    defaultMessage: 'Turn off and remove details',
    description:
      'Label of the button that confirms turning off Automated Protocol Review and removing the study details saved in the protocol.',
  },
});

const renderForum = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.communityForum}>{chunks}</ExternalLink>
);

const renderVersioning = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.protocolSchema}>{chunks}</ExternalLink>
);

const ExperimentsPage = () => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const headingId = useId();
  const readOnly = useProtocolAccessMode() === 'read-only';
  const reviewEnabled = useAppSelector(getIsProtocolReviewEnabled);
  const draft = useAppSelector(getProtocolReviewStudyDetailsDraft);
  // Any study details at all, finished or not, are lost when it is turned off.
  const hasStudyContext =
    draft.researchQuestions.length > 0 ||
    draft.population !== '' ||
    draft.administration !== null ||
    draft.synopsis !== '';

  const handleReviewChange = useCallback(
    async (checked: boolean) => {
      if (checked) {
        dispatch(enableProtocolReview());
        return;
      }

      // Turning it off removes the study details with it, so say so first.
      if (hasStudyContext) {
        const confirmed = await openDialog({
          type: 'choice',
          intent: 'warning',
          title: createElement(AppMessage, { message: messages.turnOffTitle }),
          description: createElement(AppMessage, {
            message: messages.turnOffDescription,
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, {
                message: messages.turnOffConfirm,
              }),
              value: true,
            },
            cancel: {
              label: createElement(AppMessage, {
                message: commonMessages.cancel,
              }),
              value: false,
            },
          },
        });
        if (confirmed !== true) return;
      }

      dispatch(disableProtocolReview());
    },
    [dispatch, hasStudyContext, openDialog],
  );

  return (
    <div className={pageInsetClasses}>
      <PageHeading
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description, {
          forum: renderForum,
        })}
      />
      <div className="mx-auto my-10 flex w-full max-w-4xl flex-col gap-6">
        <Alert variant="info">
          <AlertDescription>
            {intl.formatMessage(messages.notice, {
              versioning: renderVersioning,
            })}
          </AlertDescription>
        </Alert>
        <Surface spacing="lg" className="flex items-start gap-6">
          <ReviewSparklesIcon
            className="mt-1 size-8 shrink-0"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Heading level="h2" id={headingId}>
              {intl.formatMessage(messages.reviewTitle)}
            </Heading>
            <Paragraph margin="none">
              {intl.formatMessage(messages.reviewDescription)}
            </Paragraph>
          </div>
          <Toggle
            aria-labelledby={headingId}
            checked={reviewEnabled}
            disabled={readOnly}
            onCheckedChange={handleReviewChange}
            className="mt-1 shrink-0"
          />
        </Surface>
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(messages.noOthers)}
        </Paragraph>
      </div>
    </div>
  );
};

export default ExperimentsPage;
