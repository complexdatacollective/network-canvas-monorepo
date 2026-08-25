import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ConstraintConflict } from '@codaco/protocol-utilities';

import { SyntheticConflictAlert } from '../SyntheticConflictAlert';

/**
 * Where a refusal sends the researcher.
 *
 * A conflict names its owner structurally — `stageId`, or the entity type and
 * attribute keys — precisely so a surface can route to the controls without
 * parsing the prose. The Codebook's verdict tells the researcher to "open the
 * stage it names", and could only mean it with a link.
 */

const conflict = (over: Partial<ConstraintConflict>): ConstraintConflict => ({
  entity: 'node',
  entityType: 'person',
  entityTypeName: 'Person',
  variableIds: [],
  variableNames: [],
  rules: [],
  reason: 'This cannot be satisfied.',
  ...over,
});

describe('a refusal that names its owner', () => {
  it('links a stage-owned refusal to that stage’s synthetic section', () => {
    render(
      <SyntheticConflictAlert
        conflict={conflict({ stageId: 'census' })}
        linkToOwner
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/protocol/stage/census?section=synthetic',
    );
  });

  it('links an attribute-owned refusal to that attribute in the Codebook', () => {
    render(
      <SyntheticConflictAlert
        conflict={conflict({
          variableIds: ['v_age'],
          variableNames: ['age'],
        })}
        linkToOwner
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/protocol/codebook?entity=node%3Aperson&variable=v_age',
    );
  });

  it('names the link by what it opens AND what it is about', () => {
    // A verdict lists one alert per refusal, so a link named only "Open this
    // attribute" is the same sentence over and over to anyone moving through
    // a list of links.
    render(
      <SyntheticConflictAlert
        conflict={conflict({ variableIds: ['v_age'], variableNames: ['age'] })}
        linkToOwner
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open this attribute Person: age' }),
    ).toBeInTheDocument();
  });

  it('offers no link where the surface would be left standing over it', () => {
    // The generation dialog and the preview popup are modals, and a stage's
    // own section is already the place its refusals name.
    render(
      <SyntheticConflictAlert conflict={conflict({ stageId: 'census' })} />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('This cannot be satisfied.')).toBeInTheDocument();
  });
});
