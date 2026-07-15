import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ThemeSwitcher from './ThemeSwitcher';

const labels = {
  label: 'Color theme',
  triggerLabel: (theme: 'light' | 'dark' | 'system') => `Color theme: ${theme}`,
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

describe('ThemeSwitcher', () => {
  it('uses the selected theme for its accessible trigger label', () => {
    render(
      <ThemeSwitcher
        labels={labels}
        onThemeChange={vi.fn()}
        theme="dark"
        view="desktop"
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Color theme: dark',
    });
    expect(trigger).toHaveClass('h-16');
    expect(trigger.querySelector('.lucide-moon')).toBeInTheDocument();
  });

  it('renders labelled theme options and reports the selected option', () => {
    const onThemeChange = vi.fn();
    render(
      <ThemeSwitcher
        labels={labels}
        onThemeChange={onThemeChange}
        theme="system"
        view="desktop"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Color theme: system' }),
    );

    const lightOption = screen.getByRole('menuitemradio', { name: 'Light' });
    const darkOption = screen.getByRole('menuitemradio', { name: 'Dark' });
    const systemOption = screen.getByRole('menuitemradio', {
      name: 'System',
    });

    expect(lightOption.querySelector('.lucide-sun')).toBeInTheDocument();
    expect(darkOption.querySelector('.lucide-moon')).toBeInTheDocument();
    expect(systemOption.querySelector('.lucide-sun-moon')).toBeInTheDocument();
    expect(document.querySelector('.lucide-check')).not.toBeInTheDocument();

    fireEvent.click(darkOption);
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });
});
