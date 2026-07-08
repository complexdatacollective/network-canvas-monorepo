import { Database, Layers } from 'lucide-react';
import { Link, useLocation } from 'wouter';

import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';

export type View = 'protocols' | 'data';

const HREF: Record<View, string> = { protocols: '/', data: '/data' };

const OPTIONS: SegmentedOption<View>[] = [
  {
    value: 'protocols',
    label: 'Protocols',
    icon: Layers,
    render: <Link href={HREF.protocols} />,
  },
  {
    value: 'data',
    label: 'Data',
    icon: Database,
    render: <Link href={HREF.data} />,
  },
];

function activeView(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

export function ViewSwitcher() {
  const [location] = useLocation();
  const value = activeView(location);

  return (
    <SegmentedSwitcher
      aria-label="Home view"
      size="md"
      variant="glass"
      value={value}
      onValueChange={() => {
        /* Navigation is handled by each segment's <Link href>; navigating here too would double-push the history stack. */
      }}
      options={OPTIONS}
    />
  );
}
