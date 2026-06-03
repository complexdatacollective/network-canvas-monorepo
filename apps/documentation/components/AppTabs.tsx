'use client';

import { Tabs } from '@base-ui/react/tabs';

export type AppTab = { value: string; label: string };

// The tabbed sections and the apps they cover. Each tab's `value` matches the
// slug of the section's child folder that holds that app's articles. Only Build
// and Run are tabbed; every other section renders no tabs.
const APP_TABS: Record<string, AppTab[]> = {
  'build-protocol': [
    { value: 'architect-web', label: 'Architect Web' },
    { value: 'architect-desktop', label: 'Architect Desktop' },
  ],
  'run-interview': [
    { value: 'interviewer', label: 'Interviewer' },
    { value: 'fresco', label: 'Fresco' },
  ],
};

export const appTabsFor = (project: string): AppTab[] | undefined =>
  APP_TABS[project];

export default function AppTabs({
  tabs,
  value,
  onValueChange,
}: {
  tabs: AppTab[];
  value: string | undefined;
  onValueChange: (value: string) => void;
}) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      className="my-2"
    >
      <Tabs.List className="border-border flex items-center gap-6 border-b">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className="text-muted-foreground hover:text-accent aria-selected:border-accent aria-selected:text-accent -mb-px cursor-pointer border-b-2 border-transparent pb-2 text-sm font-semibold transition-colors"
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
