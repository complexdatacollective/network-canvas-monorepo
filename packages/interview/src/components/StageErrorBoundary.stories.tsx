import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { AppI18nProvider } from '@codaco/app-i18n/react';

import { interviewCatalogSource } from '../i18n/catalog';
import { interviewLocales } from '../i18n/locales';
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

/** The screen a participant sees when a task crashes. */
export const Default: Story = {
  beforeEach() {
    spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
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
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Failed to initialize WebGL'),
    );
  },
};

/** The same screen in every language the interview ships. */
export const AllLanguages: Story = {
  parameters: {
    layout: 'padded',
  },
  loaders: [
    async () => ({
      catalogs: await Promise.all(
        interviewLocales.map(async ({ locale }) => ({
          locale,
          messages: await interviewCatalogSource.load(locale),
        })),
      ),
    }),
  ],
  render: (args, { loaded }) => {
    const { catalogs } = loaded as {
      catalogs: { locale: string; messages: Record<string, string> }[];
    };
    return (
      <div className="flex flex-col gap-8">
        {catalogs.map(({ locale, messages }) => (
          <div key={locale} lang={locale}>
            <AppI18nProvider
              locale={locale}
              locales={interviewLocales}
              messages={messages}
              manageDocument={false}
            >
              <StageErrorBoundary>{args.children}</StageErrorBoundary>
            </AppI18nProvider>
          </div>
        ))}
      </div>
    );
  },
};
