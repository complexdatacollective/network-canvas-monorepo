import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';

import FinishStageTextAlert from './FinishStageTextAlert';
import LanguageChooserAlert from './Localization/LanguageChooserAlert';
import LocalizationAlert from './Localization/LocalizationAlert';
import ProtocolInfoCard from './ProtocolInfoCard';
import { routeFocusTargetProps } from './RouteFocus';
import TestingMapboxTokenAlert from './TestingMapboxTokenAlert';
import Timeline from './Timeline';
import VariableRoleConflictsAlert from './VariableRoleConflictsAlert';
const messages = defineMessages({
  stages: {
    id: 'architect.protocol.stages',
    defaultMessage: 'Stages',
    description: 'Visible text in components / Protocol.',
  },
});

const Protocol = () => {
  const intl = useAppIntl();
  return (
    <div className="mt-10 flex flex-col items-center">
      {/*
       * This route's visible identity is the editable protocol card and the
       * stage timeline, neither of which is a heading — so the page carried no
       * `<h1>` at all, and a keyboard user arriving from a stage editor or a
       * breadcrumb had nothing to land on but the top of the document. Named
       * after this route's own nav item.
       */}
      <Heading level="h1" className="sr-only" {...routeFocusTargetProps}>
        {intl.formatMessage(messages.stages)}
      </Heading>
      {/*
       * The notes stack in one block-level column, so their margins collapse
       * to the Alert's own gap between neighbours. The column ends as far
       * above the card as it starts below the toolbar's visible edge (the
       * toolbar's own padding supplies the rest above), and renders nothing
       * when no note shows, leaving the card where it was.
       */}
      <div className="mb-15 w-full max-w-3xl empty:hidden">
        <FinishStageTextAlert />
        <TestingMapboxTokenAlert />
        <VariableRoleConflictsAlert />
        <LocalizationAlert />
        <LanguageChooserAlert />
      </div>
      <ProtocolInfoCard />
      <Timeline />
    </div>
  );
};

export default Protocol;
