import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { InterviewI18nProvider } from '../i18n/InterviewI18nProvider';
import {
  suppliedInterfaceText,
  TestProtocolLocalization,
} from '../interfaces/__tests__/TestProtocolLocalization';
import StageErrorBoundary from './StageErrorBoundary';

function CrashingTask(): never {
  throw new Error('Failed to initialize WebGL');
}

const meta: Meta<typeof StageErrorBoundary> = {
  title: 'Components/StageErrorBoundary',
  component: StageErrorBoundary,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: <CrashingTask />,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const writeText = fn(async (_text: string) => undefined);

/** The screen a participant sees when a task crashes. */
export const Default: Story = {
  beforeEach() {
    spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'There was an error' }),
    ).toBeInTheDocument();

    const button = canvas.getByRole('button', { name: 'Copy' });
    await userEvent.click(button);

    await waitFor(() => expect(button).toHaveTextContent('Copied'));
    await expect(canvas.getByRole('status')).toHaveTextContent('Copied');
    await expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Failed to initialize WebGL'),
    );
  },
};

const supplied = {
  defaultLocale: 'en',
  locales: ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt-BR', 'zh-Hans', 'zh-Hant'],
};
const interfaceText = suppliedInterfaceText(supplied);

/**
 * The same screen in every language Network Canvas supplies the protocol's
 * interface text in.
 */
export const AllLanguages: Story = {
  parameters: {
    layout: 'padded',
  },
  render: (args) => (
    <div className="flex flex-col gap-8">
      {supplied.locales.map((locale) => (
        <div key={locale} lang={locale}>
          <InterviewI18nProvider>
            <TestProtocolLocalization
              localization={supplied}
              locale={locale}
              interfaceText={interfaceText}
            >
              <StageErrorBoundary>{args.children}</StageErrorBoundary>
            </TestProtocolLocalization>
          </InterviewI18nProvider>
        </div>
      ))}
    </div>
  ),
};
