import { fireEvent, render, screen } from '@testing-library/react';
import { noop } from 'es-toolkit/compat';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import VariableSpotlight from '../VariableSpotlight';

const mockStore = createStore(() => ({
  activeProtocol: { present: { codebook: { node: {}, edge: {}, ego: {} } } },
}));

describe('VariableSpotlight', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('when options is empty it renders the empty message', () => {
    const { baseElement } = render(
      <Provider store={mockStore}>
        <VariableSpotlight
          open={true}
          onOpenChange={noop}
          onSelect={noop}
          entity=""
          type=""
          onCreateOption={noop}
          options={[]}
        />
      </Provider>,
    );

    expect(
      baseElement.querySelector('[data-testid="variable-spotlight-empty"]'),
    ).toBeInTheDocument();
  });

  it('it renders options', () => {
    const { baseElement } = render(
      <Provider store={mockStore}>
        <VariableSpotlight
          open={true}
          onOpenChange={noop}
          onSelect={noop}
          entity=""
          type=""
          onCreateOption={noop}
          options={[
            {
              value: 'name',
              label: 'Name',
              type: 'text',
            },
            {
              value: 'age',
              label: 'Just a number',
              type: 'number',
            },
          ]}
        />
      </Provider>,
    );

    const items = baseElement.querySelectorAll(
      '[data-testid="spotlight-list-item"]',
    );

    // Rows are sorted by label: "Just a number" before "Name".
    expect(items[0]).toHaveTextContent('Just a number');
    expect(items[0]?.querySelector('.icon')).toBeInTheDocument();
    expect(items[0]).toHaveClass(
      'hover:bg-surface-2',
      'data-disabled:hover:bg-transparent',
    );
    expect(items[1]).toHaveTextContent('Name');
    expect(items[1]?.querySelector('.icon')).toBeInTheDocument();
  });

  it('keeps focus leaving the portalled popup from blurring its owning field', () => {
    const onOwnerBlur = vi.fn();
    render(
      <div onBlur={onOwnerBlur}>
        <Provider store={mockStore}>
          <VariableSpotlight
            open={true}
            onOpenChange={noop}
            onSelect={noop}
            entity=""
            type=""
            onCreateOption={noop}
            options={[]}
          />
        </Provider>
      </div>,
    );

    const search = screen.getByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    search.focus();
    onOwnerBlur.mockClear();

    // Base UI removes the focused popup content after an answered selection.
    // React portal events otherwise bubble through the owner component tree,
    // making the form believe focus left the field.
    fireEvent.blur(search, { relatedTarget: document.body });

    expect(onOwnerBlur).not.toHaveBeenCalled();
  });

  it('lets a completed direct-field pick blur its owning field', () => {
    const onOwnerBlur = vi.fn();
    const shouldPropagateBlur = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    render(
      <div onBlur={onOwnerBlur}>
        <Provider store={mockStore}>
          <VariableSpotlight
            open={true}
            onOpenChange={noop}
            onSelect={noop}
            entity=""
            type=""
            onCreateOption={noop}
            options={[]}
            shouldPropagateBlur={shouldPropagateBlur}
          />
        </Provider>
      </div>,
    );

    const search = screen.getByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    search.focus();
    onOwnerBlur.mockClear();
    fireEvent.blur(search, { relatedTarget: document.body });

    expect(onOwnerBlur).toHaveBeenCalled();
    expect(shouldPropagateBlur).toHaveBeenCalled();
  });
});

describe('VariableSpotlight attribute names', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const renderSpotlight = (onCreateOption = vi.fn()) => {
    render(
      <Provider store={mockStore}>
        <VariableSpotlight
          open
          onOpenChange={noop}
          onSelect={noop}
          entity="node"
          type="person"
          onCreateOption={onCreateOption}
          options={[{ value: 'name', label: 'Name', type: 'text' }]}
        />
      </Provider>,
    );
    return screen.getByRole('searchbox', {
      name: 'Find or create an attribute',
    });
  };

  it.each([
    ['amigo cercano', 'amigo cercano'],
    ['Collègue', 'Collègue'],
    ['友人', '友人'],
    ['  Colle\u0300gue ', 'Collègue'],
  ])('offers to create %j as %j', (typed, named) => {
    const onCreateOption = vi.fn();
    const search = renderSpotlight(onCreateOption);

    fireEvent.change(search, { target: { value: typed } });
    expect(
      screen.getByText(`Create new attribute called "${named}".`),
    ).toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onCreateOption).toHaveBeenCalledWith(named);
  });

  it('offers nothing to create from a term of only spaces', () => {
    const onCreateOption = vi.fn();
    const search = renderSpotlight(onCreateOption);

    fireEvent.change(search, { target: { value: '   ' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(screen.queryByText(/Create new attribute called/)).toBeNull();
    expect(screen.queryByText(/Cannot create attribute named/)).toBeNull();
    expect(onCreateOption).not.toHaveBeenCalled();
  });

  it('explains why a term with a control character cannot be created', () => {
    const onCreateOption = vi.fn();
    const search = renderSpotlight(onCreateOption);

    fireEvent.change(search, { target: { value: 'bad\tname' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(
      screen.getByText(
        /^Cannot create attribute named ".*": This can’t contain tabs, line breaks or other control characters\.$/,
      ),
    ).toBeInTheDocument();
    expect(onCreateOption).not.toHaveBeenCalled();
  });
});
