import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Cloud,
  CreditCard,
  GitFork,
  Keyboard,
  LifeBuoy,
  LogOut,
  Mail,
  MessageSquare,
  Plus,
  PlusCircle,
  Settings,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from './Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { PortalContainerProvider } from './PortalContainer';

const meta = {
  title: 'Components/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Open Menu
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>
          <User className="mr-2 size-4" />
          <span>Profile</span>
          <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CreditCard className="mr-2 size-4" />
          <span>Billing</span>
          <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 size-4" />
          <span>Settings</span>
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Keyboard className="mr-2 size-4" />
          <span>Keyboard shortcuts</span>
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Users className="mr-2 size-4" />
          <span>Team</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <UserPlus className="mr-2 size-4" />
          <span>Invite users</span>
          <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <GitFork className="mr-2 size-4" />
          <span>GitHub</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LifeBuoy className="mr-2 size-4" />
          <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Cloud className="mr-2 size-4" />
          <span>API</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="mr-2 size-4" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithCheckboxItems: Story = {
  render: () => {
    const [showStatusBar, setShowStatusBar] = React.useState(true);
    const [showActivityBar, setShowActivityBar] = React.useState(false);
    const [showPanel, setShowPanel] = React.useState(false);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          View Options
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showStatusBar}
              onCheckedChange={setShowStatusBar}
            >
              Status Bar
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showActivityBar}
              onCheckedChange={setShowActivityBar}
              disabled
            >
              Activity Bar
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showPanel}
              onCheckedChange={setShowPanel}
            >
              Panel
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

export const WithRadioGroup: Story = {
  render: () => {
    const [position, setPosition] = React.useState('bottom');

    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Position: {position}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Panel Position</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={position}
              onValueChange={setPosition}
            >
              <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bottom">
                Bottom
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

export const WithGroups: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Actions
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <User className="mr-2 size-4" />
            <span>Profile</span>
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard className="mr-2 size-4" />
            <span>Billing</span>
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 size-4" />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Users className="mr-2 size-4" />
            <span>Team</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <UserPlus className="mr-2 size-4" />
            <span>Invite users</span>
            <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="mr-2 size-4" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithSubmenus: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        File
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem>
          New Tab
          <DropdownMenuShortcut>⌘T</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          New Window
          <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>New Private Window</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserPlus className="mr-2 size-4" />
            <span>Invite users</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>
              <Mail className="mr-2 size-4" />
              <span>Email</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <MessageSquare className="mr-2 size-4" />
              <span>Message</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <PlusCircle className="mr-2 size-4" />
              <span>More...</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Close Window
          <DropdownMenuShortcut>⌘W</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const Positioned: Story = {
  render: () => (
    <div className="flex gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Bottom (Default)
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Top
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Left
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Right
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
};

export const Aligned: Story = {
  render: () => (
    <div className="flex gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Align Start
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Align Center
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Align End
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
};

export const WithInsetItems: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Options
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel inset>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Billing</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const Complex: Story = {
  render: () => {
    const [showBookmarks, setShowBookmarks] = React.useState(true);
    const [showFullUrls, setShowFullUrls] = React.useState(false);
    const [person, setPerson] = React.useState('pedro');

    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>
          Open Complex Menu
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <User className="mr-2 size-4" />
              <span>Profile</span>
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 size-4" />
              <span>Settings</span>
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <Users className="mr-2 size-4" />
              <span>Team</span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserPlus className="mr-2 size-4" />
                <span>Invite users</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <Mail className="mr-2 size-4" />
                  <span>Email</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MessageSquare className="mr-2 size-4" />
                  <span>Message</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <PlusCircle className="mr-2 size-4" />
                  <span>More...</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem>
              <Plus className="mr-2 size-4" />
              <span>New Team</span>
              <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showBookmarks}
            onCheckedChange={setShowBookmarks}
          >
            Show Bookmarks
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showFullUrls}
            onCheckedChange={setShowFullUrls}
          >
            Show Full URLs
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>People</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={person} onValueChange={setPerson}>
              <DropdownMenuRadioItem value="pedro">
                Pedro Duarte
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="colm">
                Colm Tuite
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <LogOut className="mr-2 size-4" />
            <span>Log out</span>
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * The menu in a right-to-left region. Base UI opens a nested menu on the
 * `inline-end` side, which is the left here, so the disclosure chevron has to
 * turn around with it — otherwise it points away from the submenu it opens.
 *
 * The portal container is inside the RTL wrapper on purpose: a menu popup is
 * portalled, and in a real app it inherits the direction from `<html dir>`,
 * which `AppI18nProvider` writes.
 */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <PortalContainerProvider>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            ملف
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuItem>علامة تبويب جديدة</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>دعوة المستخدمين</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>بريد إلكتروني</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </PortalContainerProvider>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'ملف' }));

    const subTrigger = await canvas.findByRole('menuitem', {
      name: 'دعوة المستخدمين',
    });
    const chevron = subTrigger.querySelector('svg.lucide-chevron-right');
    await expect(chevron).not.toBeNull();
    await expect(getComputedStyle(chevron!).rotate).toBe('180deg');

    // And the submenu really does arrive on that side, which is what the
    // chevron is now agreeing with.
    await userEvent.click(subTrigger);
    const submenuItem = await canvas.findByRole('menuitem', {
      name: 'بريد إلكتروني',
    });
    await waitFor(() =>
      expect(submenuItem.getBoundingClientRect().left).toBeLessThan(
        subTrigger.getBoundingClientRect().left,
      ),
    );
  },
};
