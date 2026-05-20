import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle,
  Info,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from './Alert';
import Heading from './typography/Heading';
import { UnorderedList } from './typography/UnorderedList';

const iconMap = {
  default: undefined,
  info: Info,
  checkCircle: CheckCircle,
  alertCircle: AlertCircle,
  alertTriangle: AlertTriangle,
  bell: Bell,
  none: false as const,
};

const meta = {
  title: 'Components/Alert',
  component: Alert,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'info', 'success', 'warning', 'destructive'],
      description: 'The visual style variant of the alert',
    },
    icon: {
      control: 'select',
      options: Object.keys(iconMap),
      mapping: iconMap,
      description: 'Custom icon to display. Use "none" to hide icon entirely.',
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'default',
  },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the CLI.
      </AlertDescription>
    </Alert>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="default">
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>
          This is a default alert without any specific semantic meaning.
        </AlertDescription>
      </Alert>

      <Alert variant="info">
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>
          This alert provides helpful information to the user.
        </AlertDescription>
      </Alert>

      <Alert variant="success">
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>
          Your changes have been saved successfully!
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>
          Please review your changes before proceeding.
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          An error occurred while processing your request.
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const WithCustomIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info" icon={Bell}>
        <AlertTitle>Custom Icon</AlertTitle>
        <AlertDescription>
          You can override the default icon with any Lucide icon.
        </AlertDescription>
      </Alert>

      <Alert variant="success" icon={CheckCircle}>
        <AlertTitle>Using CheckCircle</AlertTitle>
        <AlertDescription>
          This success alert uses a custom CheckCircle icon.
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const WithoutIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info" icon={false}>
        <AlertTitle>No Icon</AlertTitle>
        <AlertDescription>
          Set icon to false to hide the icon completely.
        </AlertDescription>
      </Alert>

      <Alert variant="warning" icon={false}>
        <AlertTitle>Warning Without Icon</AlertTitle>
        <AlertDescription>This works with any variant.</AlertDescription>
      </Alert>
    </div>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <AlertTitle>Quick info message</AlertTitle>
      </Alert>

      <Alert variant="success">
        <AlertTitle>Changes saved</AlertTitle>
      </Alert>
    </div>
  ),
};

export const DescriptionOnly: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <AlertDescription>
          A simple alert with just a description, no title.
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertDescription>
          Please check your internet connection and try again.
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const LongContent: Story = {
  render: () => (
    <Alert variant="info">
      <AlertTitle>Important Update</AlertTitle>
      <AlertDescription>
        We&apos;ve made significant changes to our terms of service. Please take
        a moment to review the updated terms. Your continued use of our service
        constitutes acceptance of these changes. If you have any questions or
        concerns, please don&apos;t hesitate to contact our support team.
        We&apos;re here to help you understand these changes and ensure your
        experience remains positive.
      </AlertDescription>
    </Alert>
  ),
};

export const WithLinks: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <AlertTitle>New Feature Available</AlertTitle>
        <AlertDescription>
          We&apos;ve added a new export feature.{' '}
          <a href="https://example.com/learn" className="font-medium underline">
            Learn more
          </a>{' '}
          about how to use it.
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertTitle>Action Required</AlertTitle>
        <AlertDescription>
          Your subscription expires soon.{' '}
          <a href="https://example.com/renew" className="font-medium underline">
            Renew now
          </a>{' '}
          to avoid interruption.
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const RealWorldExamples: Story = {
  name: 'Real-World Examples',
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <AlertTitle>Interview in Progress</AlertTitle>
        <AlertDescription>
          The participant has not yet completed the interview. Data will be
          automatically saved as they progress.
        </AlertDescription>
      </Alert>

      <Alert variant="success">
        <AlertTitle>Export Complete</AlertTitle>
        <AlertDescription>
          Your network data has been successfully exported. Check your downloads
          folder for the CSV file.
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertTitle>Unsaved Changes</AlertTitle>
        <AlertDescription>
          You have unsaved changes to this protocol. Make sure to save before
          navigating away.
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertTitle>Upload Failed</AlertTitle>
        <AlertDescription>
          There was an error uploading your protocol file. Please check the file
          format and try again.
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const IconAlignment: Story = {
  name: 'Icon Alignment',
  parameters: {
    docs: {
      description: {
        story:
          'The leading icon must align with the first line of whichever child renders first — `AlertTitle` (a heading) or `AlertDescription` (a paragraph) — without per-variant magic-number offsets. The icon wrapper is sized to one line-height (`h-lh`) of the inherited text and centres the icon vertically within that slot, so alignment stays correct regardless of which child comes first or what mix of children is rendered.',
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <AlertTitle>Title only</AlertTitle>
      </Alert>

      <Alert variant="info">
        <AlertDescription>
          Description only — icon should align with the first line of this
          paragraph, not float above it.
        </AlertDescription>
      </Alert>

      <Alert variant="info">
        <AlertTitle>Title and description</AlertTitle>
        <AlertDescription>Icon aligns with the title line.</AlertDescription>
      </Alert>

      <Alert variant="info">
        <AlertDescription>
          Multi-line description with no title. The icon should sit on the first
          line — even when the body wraps onto several lines because the alert
          is narrow, the icon stays anchored to the top of the first line of
          text and does not drift downward.
        </AlertDescription>
      </Alert>

      <Alert variant="info">
        <p className="m-0">
          Raw paragraph (no AlertDescription wrapper) — icon should still align
          with this line.
        </p>
      </Alert>
    </div>
  ),
};

export const AccessibilityDemo: Story = {
  name: 'Accessibility Features',
  parameters: {
    docs: {
      description: {
        story:
          'Live-region semantics are derived from the variant. Destructive alerts use `role="alert"` (implicit `aria-live="assertive"` + `aria-atomic="true"`) and interrupt the screen reader immediately. Every other variant uses `role="status"` (implicit `aria-live="polite"`), which waits for the user to be idle. A visually-hidden context prefix (e.g. "Error:", "Warning:") is announced before the content so screen-reader users get the variant meaning that sighted users get from colour + icon. The icon itself is `aria-hidden` so it isn\'t re-announced.',
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border p-4">
        <Heading level="h3" margin="none" className="mb-2 text-base">
          Live-region semantics by variant
        </Heading>
        <UnorderedList className="space-y-1 text-sm">
          <li>
            <strong>destructive</strong> → <code>{'role="alert"'}</code>{' '}
            (implicit <code>aria-live=&quot;assertive&quot;</code>) — interrupts
            the user immediately for errors that need attention now
          </li>
          <li>
            <strong>info / success / warning / default</strong> →{' '}
            <code>{'role="status"'}</code> (implicit{' '}
            <code>aria-live=&quot;polite&quot;</code>) — announced when the
            screen reader is idle
          </li>
          <li>
            A visually-hidden{' '}
            <code>
              &lt;span className=&quot;sr-only&quot;&gt;Error:&lt;/span&gt;
            </code>{' '}
            prefix is rendered before the content so screen-reader users hear
            the variant&apos;s meaning (no <code>aria-label</code> override,
            which would have masked the visible content)
          </li>
          <li>
            <code>{'aria-hidden="true"'}</code> on the icon prevents redundant
            announcements
          </li>
          <li>
            <code>aria-live</code> and <code>aria-atomic</code> are <em>not</em>{' '}
            set explicitly — the role implies them, and setting both can confuse
            some screen readers
          </li>
        </UnorderedList>
      </div>

      <Alert variant="destructive">
        <AlertTitle>Critical error</AlertTitle>
        <AlertDescription>
          Announced as &ldquo;Error: Critical error. …&rdquo; immediately,
          interrupting whatever the screen reader was reading.
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>
          Announced as &ldquo;Warning: Heads up. …&rdquo; when the user pauses.
        </AlertDescription>
      </Alert>

      <Alert variant="info">
        <AlertTitle>Informational</AlertTitle>
        <AlertDescription>
          Announced as &ldquo;Information: Informational. …&rdquo; politely.
        </AlertDescription>
      </Alert>

      <Alert variant="success">
        <AlertTitle>All done</AlertTitle>
        <AlertDescription>
          Announced as &ldquo;Success: All done. …&rdquo; politely.
        </AlertDescription>
      </Alert>
    </div>
  ),
};
