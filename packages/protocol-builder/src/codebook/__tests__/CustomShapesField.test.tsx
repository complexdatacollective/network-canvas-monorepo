import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { isValidNodeShapeSvg } from '@codaco/protocol-validation';

import CustomShapesField from '../components/CustomShapesField.tsx';
import type { CustomShapes, CustomShapeUsage } from '../customShapes.ts';

const HOME_SVG =
  '<svg viewBox="0 0 100 100"><path d="M10 50 L50 10 L90 50 V90 H10 Z" fill="#e04f6d"/><rect id="label-area" x="20" y="55" width="60" height="30" fill="#ffffff"/></svg>';

const svgFile = (name: string, source: string) =>
  new File([source], name, { type: 'image/svg+xml' });

function Harness({
  initial,
  usage,
  onValue,
}: {
  initial?: CustomShapes;
  usage?: Readonly<Record<string, CustomShapeUsage>>;
  onValue: (value: CustomShapes | undefined) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CustomShapesField
      name="customShapes"
      value={value}
      usage={usage}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const fileInput = () => {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
};

describe('CustomShapesField', () => {
  it('adds a shape from an SVG file, named after the file and stored clean', async () => {
    const user = userEvent.setup();
    const values: Array<CustomShapes | undefined> = [];
    render(<Harness onValue={(value) => values.push(value)} />);

    await user.upload(
      fileInput(),
      svgFile(
        'home.svg',
        HOME_SVG.replace('<path', '<script>alert(1)</script><path'),
      ),
    );

    expect(await screen.findByLabelText(/Shape name/)).toHaveValue('home');
    const stored = Object.values(values.at(-1) ?? {});
    expect(stored).toHaveLength(1);
    expect(stored[0]?.svg).not.toContain('script');
    expect(isValidNodeShapeSvg(stored[0]?.svg ?? '')).toBe(true);
    expect(screen.getByText(/was left out: scripts\./)).toBeInTheDocument();
  });

  it('refuses a file that is not an SVG and keeps the value unchanged', async () => {
    const user = userEvent.setup();
    const values: Array<CustomShapes | undefined> = [];
    render(<Harness onValue={(value) => values.push(value)} />);

    await user.upload(fileInput(), svgFile('notes.svg', 'just some words'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"notes.svg" is not an SVG image.',
    );
    expect(values).toEqual([]);
  });

  it('renames a shape and reports a name another shape already has', async () => {
    const user = userEvent.setup();
    const values: Array<CustomShapes | undefined> = [];
    render(
      <Harness
        initial={{
          a: { name: 'Home', svg: HOME_SVG },
          b: { name: 'School', svg: HOME_SVG },
        }}
        onValue={(value) => values.push(value)}
      />,
    );

    const school = screen.getByDisplayValue('School');
    await user.clear(school);
    await user.type(school, 'home');

    expect(values.at(-1)?.b?.name).toBe('home');
    await waitFor(() =>
      expect(
        screen.getAllByText(/Another shape of this node type is already named/)
          .length,
      ).toBeGreaterThan(0),
    );
  });

  it('removes an unused shape and will not remove one that is in use', async () => {
    const user = userEvent.setup();
    const values: Array<CustomShapes | undefined> = [];
    render(
      <Harness
        initial={{
          a: { name: 'Home', svg: HOME_SVG },
          b: { name: 'School', svg: HOME_SVG },
        }}
        usage={{ a: 'default' }}
        onValue={(value) => values.push(value)}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remove shape Home' }),
    ).toBeDisabled();
    expect(screen.getByText(/Used as the default shape\./)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Remove shape School' }),
    );
    expect(values.at(-1)).toEqual({ a: { name: 'Home', svg: HOME_SVG } });
  });
});
