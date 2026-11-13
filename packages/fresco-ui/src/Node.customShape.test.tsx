import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { isValidNodeShapeSvg } from '@codaco/protocol-validation';

import Node, { resolveNodeShapeReference } from './Node';
import { NodeShapeArtwork } from './node/NodeShapeArtwork';

const houseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--node-color)"/><stop offset="1" stop-color="var(--node-color-dark)"/></linearGradient><clipPath id="clip"><rect width="100" height="100"/></clipPath></defs><path d="M50 4 L95 42 L95 96 L5 96 L5 42 Z" fill="url(#shade)" clip-path="url('#clip')" stroke-width="2"/><use href="#roof"/><rect id="label-area" x="16" y="46" width="68" height="40" fill="#ffffff"/></svg>`;

const wideSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect x="4" y="6" width="152" height="68" rx="22" fill="currentColor"/><rect id="label-area" x="18" y="14" width="124" height="52" fill="currentColor"/></svg>`;

const plainSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#123456"/></svg>`;

const hostileSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><foreignObject width="10" height="10"><div>hi</div></foreignObject><image href="https://evil.example/x.png" width="10" height="10"/><a href="javascript:alert(3)"><path d="M0 0h1v1z"/></a><use xlink:href="https://evil.example/s.svg#a"/><path d="M0 0h10v10H0z" onclick="alert(4)" fill="url(https://evil.example/f)" style="fill:url(javascript:alert(5))"/><rect width="5" height="5" data-safe="1"/></svg>`;

const renderNode = (svg: string, label = 'Robin') =>
  render(<Node label={label} shape={{ svg }} />);

const artworkOf = (node: HTMLElement) =>
  node.querySelector('svg[data-node-shape-artwork]');

describe('Node custom shapes', () => {
  it('uses fixtures the schema accepts', () => {
    expect(isValidNodeShapeSvg(houseSvg)).toBe(true);
    expect(isValidNodeShapeSvg(wideSvg)).toBe(true);
    expect(isValidNodeShapeSvg(plainSvg)).toBe(true);
    expect(isValidNodeShapeSvg(hostileSvg)).toBe(false);
  });

  it('draws the artwork as a fitted, hidden svg', () => {
    renderNode(houseSvg);
    const node = screen.getByRole('button', { name: 'Robin' });
    const artwork = artworkOf(node);

    expect(artwork).not.toBeNull();
    expect(artwork).toHaveAttribute('viewBox', '0 0 100 100');
    expect(artwork).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(artwork).toHaveAttribute('aria-hidden', 'true');
    expect(artwork).toHaveAttribute('focusable', 'false');
    expect(artwork).toHaveClass('pointer-events-none', 'absolute', 'inset-0');
    expect(artwork?.querySelectorAll('linearGradient')).toHaveLength(1);
    expect(artwork?.querySelectorAll('stop')).toHaveLength(2);
    expect(artwork?.querySelector('path')).toHaveAttribute('stroke-width', '2');
    // The label area is a placement, never painted.
    expect(artwork?.querySelectorAll('rect')).toHaveLength(1);
    expect(artwork?.querySelector('#label-area')).toBeNull();
  });

  it('carries the square shape radius and no gradient', () => {
    renderNode(houseSvg);
    const node = screen.getByRole('button', { name: 'Robin' });
    const shapeLayer = artworkOf(node)?.parentElement;

    expect(node).toHaveClass('rounded');
    expect(node).not.toHaveClass('rounded-full');
    expect(shapeLayer).toHaveClass('rounded-[inherit]');
    expect(shapeLayer?.className).not.toContain('linear-gradient');
  });

  it('defines the colour tokens on the svg', () => {
    renderNode(houseSvg);
    const artwork = artworkOf(screen.getByRole('button', { name: 'Robin' }));
    if (!(artwork instanceof SVGElement)) throw new Error('No artwork');

    expect(artwork.style.getPropertyValue('--node-color')).toBe('var(--base)');
    expect(artwork.style.getPropertyValue('--node-color-dark')).toBe(
      'var(--dark)',
    );
    for (let n = 1; n <= 8; n += 1) {
      expect(artwork.style.getPropertyValue(`--node-color-seq-${n}`)).toBe(
        `var(--node-${n})`,
      );
    }
    expect(artwork.style.color).toBe('var(--base)');
  });

  it('namespaces ids and rewrites every reference to them', () => {
    renderNode(houseSvg);
    const artwork = artworkOf(screen.getByRole('button', { name: 'Robin' }));
    const gradient = artwork?.querySelector('linearGradient');
    const clip = artwork?.querySelector('clipPath');
    const path = artwork?.querySelector('path');
    const use = artwork?.querySelector('use');

    const gradientId = gradient?.getAttribute('id') ?? '';
    const clipId = clip?.getAttribute('id') ?? '';
    expect(gradientId).toMatch(/^node-shape-[A-Za-z0-9_-]+-shade$/);
    expect(clipId).toMatch(/^node-shape-[A-Za-z0-9_-]+-clip$/);
    expect(path).toHaveAttribute('fill', `url(#${gradientId})`);
    expect(path).toHaveAttribute('clip-path', `url(#${clipId})`);
    expect(use).toHaveAttribute(
      'href',
      `#${gradientId.replace(/shade$/, 'roof')}`,
    );
  });

  it('gives two nodes with the same artwork distinct ids', () => {
    render(
      <>
        <Node label="One" shape={{ svg: houseSvg }} />
        <Node label="Two" shape={{ svg: houseSvg }} />
      </>,
    );
    const ids = [...document.querySelectorAll('svg [id]')].map((element) =>
      element.getAttribute('id'),
    );

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    const one = artworkOf(screen.getByRole('button', { name: 'One' }));
    const two = artworkOf(screen.getByRole('button', { name: 'Two' }));
    expect(one?.querySelector('path')?.getAttribute('fill')).not.toBe(
      two?.querySelector('path')?.getAttribute('fill'),
    );
  });

  it('never puts unsafe content from a hostile file into the DOM', () => {
    const { container } = renderNode(hostileSvg);
    const artwork = artworkOf(screen.getByRole('button', { name: 'Robin' }));

    // The safe parts did render, so the checks below look at real output.
    expect(artwork?.querySelectorAll('path')).toHaveLength(1);
    expect(artwork?.querySelectorAll('rect')).toHaveLength(1);

    expect(
      container.querySelector('script, foreignObject, image, a, div svg div'),
    ).toBeNull();
    for (const element of container.querySelectorAll('svg *, svg')) {
      for (const { name, value } of element.attributes) {
        expect(name.startsWith('on')).toBe(false);
        expect(value).not.toMatch(/javascript:|evil\.example/);
      }
    }
    expect(container.innerHTML).not.toContain('alert');
  });

  it('renders only allow-listed elements and attributes from a parsed tree', () => {
    const { container } = render(
      <NodeShapeArtwork
        idPrefix="p-"
        shape={{
          viewBox: { x: 0, y: 0, width: 10, height: 10 },
          labelArea: { x: 0, y: 0, width: 1, height: 1 },
          children: [
            { tag: 'script', attributes: {}, children: ['alert(1)'] },
            { tag: 'foreignObject', attributes: {}, children: [] },
            {
              tag: 'path',
              attributes: {
                d: 'M0 0h1v1z',
                onclick: 'alert(2)',
                fill: 'url(https://evil.example/f)',
                stroke: 'url(#ok)',
                style: 'fill:red',
                mask: 'javascript:alert(3)',
              },
              children: ['stray text'],
            },
            {
              tag: 'use',
              attributes: { href: 'https://evil.example/s.svg#a' },
              children: [],
            },
            {
              tag: 'rect',
              attributes: { href: '#ok', width: '1', height: '1' },
              children: [],
            },
          ],
        }}
      />,
    );
    const svg = container.querySelector('svg');

    expect(container.querySelector('script, foreignObject')).toBeNull();
    const path = svg?.querySelector('path');
    expect(path).toHaveAttribute('d', 'M0 0h1v1z');
    expect(path).toHaveAttribute('stroke', 'url(#p-ok)');
    expect(path).not.toHaveAttribute('onclick');
    expect(path).not.toHaveAttribute('fill');
    expect(path).not.toHaveAttribute('style');
    expect(path).not.toHaveAttribute('mask');
    expect(path?.textContent).toBe('');
    expect(svg?.querySelector('use')).not.toHaveAttribute('href');
    // `href` is only meaningful on use and gradients.
    expect(svg?.querySelector('rect')).not.toHaveAttribute('href');
  });

  it('places the label over the label area in its colour', () => {
    renderNode(houseSvg);
    const node = screen.getByRole('button', { name: 'Robin' });
    const labelArea = node.querySelector<HTMLElement>('[data-node-label-area]');

    expect(labelArea).toHaveStyle({
      left: '16%',
      top: '46%',
      width: '68%',
      height: '40%',
      color: '#ffffff',
    });
    expect(labelArea).toHaveClass('absolute');
    expect(labelArea).toContainElement(screen.getByText('Robin'));
    expect(screen.getByText('Robin')).toHaveClass('w-full!', 'max-h-full');
  });

  it('fits a wide picture into the square before placing the label', () => {
    renderNode(wideSvg);
    const labelArea = screen
      .getByRole('button', { name: 'Robin' })
      .querySelector<HTMLElement>('[data-node-label-area]');
    const percent = (value: string | undefined) =>
      Number.parseFloat(value ?? '');

    // 160 wide fits the box; 100 tall is centred with 18.75% above it.
    expect(percent(labelArea?.style.left)).toBeCloseTo(11.25);
    expect(percent(labelArea?.style.top)).toBeCloseTo(27.5);
    expect(percent(labelArea?.style.width)).toBeCloseTo(77.5);
    expect(percent(labelArea?.style.height)).toBeCloseTo(32.5);
    // `currentColor` is the node colour, not the root's white text.
    expect(labelArea?.style.color).toBe('var(--base)');
  });

  it('uses the central region and the theme text colour without a label area', () => {
    renderNode(plainSvg);
    const labelArea = screen
      .getByRole('button', { name: 'Robin' })
      .querySelector<HTMLElement>('[data-node-label-area]');

    expect(labelArea).toHaveStyle({
      left: '10%',
      top: '20%',
      width: '80%',
      height: '60%',
    });
    expect(labelArea?.style.color).toBe('var(--text)');
    expect(
      artworkOf(screen.getByRole('button', { name: 'Robin' }))?.querySelector(
        'path',
      ),
    ).toHaveAttribute('fill', '#123456');
  });

  it('keeps the spinner inside the label area while loading', () => {
    render(<Node label="Robin" loading shape={{ svg: houseSvg }} />);
    const labelArea = screen
      .getByRole('button', { name: 'Robin' })
      .querySelector('[data-node-label-area]');

    expect(labelArea?.querySelector('.animate-spin')).not.toBeNull();
  });

  it('draws artwork that cannot be parsed as a circle', () => {
    renderNode('<svg viewBox="0 0 10 10"><path d="M0 0"');
    const node = screen.getByRole('button', { name: 'Robin' });

    expect(artworkOf(node)).toBeNull();
    expect(node.querySelector('[data-node-label-area]')).toBeNull();
    expect(node).toHaveClass('rounded-full');
    expect(node.querySelector('[class*="linear-gradient"]')).not.toBeNull();
  });
});

describe('resolveNodeShapeReference', () => {
  const customShapes = { home: { svg: houseSvg } };

  it('passes built-in shapes through', () => {
    expect(resolveNodeShapeReference('diamond', customShapes)).toBe('diamond');
    expect(resolveNodeShapeReference(undefined, customShapes)).toBeUndefined();
  });

  it('resolves a custom reference to its svg', () => {
    expect(resolveNodeShapeReference('custom:home', customShapes)).toEqual({
      svg: houseSvg,
    });
  });

  it('falls back to a circle for a reference the node type does not define', () => {
    expect(resolveNodeShapeReference('custom:gone', customShapes)).toBe(
      'circle',
    );
    expect(resolveNodeShapeReference('custom:home', undefined)).toBe('circle');
  });
});

describe('Node built-in shapes', () => {
  it.each(['circle', 'square', 'diamond'] as const)(
    'renders the %s shape as before',
    (shape) => {
      const { container } = render(
        <Node label="Robin" shape={shape} size="lg" selected />,
      );
      expect(container.querySelector('svg')).toBeNull();
      // Base UI's generated id counts every render in the file, so it is
      // left out of the comparison.
      expect(
        container.innerHTML.replace(/id="base-ui-[^"]*"/, 'id="base-ui"'),
      ).toMatchSnapshot();
    },
  );
});

describe('resolveNodeShapeReference lookups', () => {
  it('draws a circle for an id that only exists on the prototype', () => {
    expect(resolveNodeShapeReference('custom:constructor', {})).toBe('circle');
    expect(resolveNodeShapeReference('custom:__proto__', {})).toBe('circle');
  });
});
