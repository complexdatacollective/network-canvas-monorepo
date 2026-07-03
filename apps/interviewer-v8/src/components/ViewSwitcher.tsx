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
  const [location, navigate] = useLocation();
  const value = activeView(location);

  return (
    <SegmentedSwitcher
      aria-label="Home view"
      size="lg"
      value={value}
      onValueChange={(next) => navigate(HREF[next])}
      options={OPTIONS}
    />
  );
}
