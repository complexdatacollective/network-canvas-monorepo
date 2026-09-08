import { Database, Layers } from 'lucide-react';
import { Link, useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';

const messages = defineMessages({
  homeView: {
    id: 'interviewer.viewSwitcher.homeView',
    defaultMessage: 'Home view',
    description: 'The aria-label label in Interviewer View Switcher.',
  },
  protocols: {
    id: 'interviewer.viewSwitcher.protocols',
    defaultMessage: 'Protocols',
    description:
      'Home navigation choice for the deck of installed research protocols.',
  },
  data: {
    id: 'interviewer.viewSwitcher.data',
    defaultMessage: 'Data',
    description:
      'Home navigation choice for viewing and managing collected interview records.',
  },
});

export type View = 'protocols' | 'data';

const HREF: Record<View, string> = { protocols: '/', data: '/data' };

function activeView(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

export function ViewSwitcher() {
  const intl = useAppIntl();
  const [location] = useLocation();
  const value = activeView(location);
  const options: SegmentedOption<View>[] = [
    {
      value: 'protocols',
      label: intl.formatMessage(messages.protocols),
      icon: Layers,
      render: <Link href={HREF.protocols} />,
    },
    {
      value: 'data',
      label: intl.formatMessage(messages.data),
      icon: Database,
      render: <Link href={HREF.data} />,
    },
  ];

  return (
    <SegmentedSwitcher
      aria-label={intl.formatMessage(messages.homeView)}
      size="md"
      variant="glass"
      value={value}
      onValueChange={() => {
        /* Navigation is handled by each segment's <Link href>; navigating here too would double-push the history stack. */
      }}
      options={options}
    />
  );
}
