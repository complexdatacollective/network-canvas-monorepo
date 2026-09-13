import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { commonCatalogs } from '@codaco/app-i18n/common';
import { ecosystemLocales, mergeCatalogs } from '@codaco/app-i18n/locales';
import { formatMessageError } from '@codaco/app-i18n/messages';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { useDeleteCodebookVariable } from '../writes.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });
const SUBJECT = { entity: 'node', type: 'person' } as const;

const ANA = { sessionId: 'session-ana', userId: 'ana', displayName: 'Ana' };
const BLAKE = {
  sessionId: 'session-blake',
  userId: 'blake',
  displayName: 'Blake',
};

/**
 * The codebook dialog's delete button, as far as its refusal is concerned.
 *
 * No dialog offers a delete yet — PR 3's codebook editors are where the button
 * lands — so the seam is driven directly. What is under test is the mapping
 * from the contract's typed refactor errors to something a researcher can read,
 * and a button that does not exist yet cannot be the reason a host's refusal
 * arrives as "check your connection".
 */
function DeleteAttribute({ variableId }: Readonly<{ variableId: string }>) {
  const deleteVariable = useDeleteCodebookVariable();
  const intl = useAppIntl();
  const [said, setSaid] = useState('');

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          void deleteVariable(SUBJECT, variableId).then((outcome) =>
            setSaid(
              outcome.status === 'refused'
                ? (formatMessageError(outcome.message, intl) ?? outcome.message)
                : 'deleted',
            ),
          );
        }}
      >
        Delete the attribute
      </Button>
      <p aria-label="What happened">{said}</p>
    </>
  );
}

const renderDeleting = (
  host: InMemoryHost,
  variableId: string,
  locale?: string,
) => {
  const tree = (
    <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
      <DeleteAttribute variableId={variableId} />
    </ProtocolBuilder>
  );
  render(
    locale === undefined ? (
      tree
    ) : (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={mergeCatalogs(
          commonCatalogs[locale] ?? {},
          protocolBuilderCatalogs[locale] ?? {},
        )}
        manageDocument={false}
      >
        {tree}
      </AppI18nProvider>
    ),
  );
  return {
    user: userEvent.setup(),
    said: screen.getByLabelText('What happened'),
  };
};

/** Whether the protocol — not a view of it — still holds the attribute. */
const personStillHas = (host: InMemoryHost, variableId: string): boolean => {
  const variables = host.store.read(PERSON).document.variables;
  return (
    typeof variables === 'object' &&
    variables !== null &&
    Object.hasOwn(variables, variableId)
  );
};

describe('a codebook deletion the protocol still has references for', () => {
  it('says how many other parts of the protocol use it, and deletes nothing', async () => {
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(FIXTURE),
    });
    // `name` is the quick-add stage's whole reason to exist and the name
    // generator's only form field, so the host cannot strip either reference.
    const { user, said } = renderDeleting(host, 'name');

    await user.click(
      screen.getByRole('button', { name: 'Delete the attribute' }),
    );

    await waitFor(() =>
      expect(said).toHaveTextContent(
        /other parts of the protocol still use this, so nothing was deleted\. Change those first, then delete it\./,
      ),
    );
    expect(personStillHas(host, 'name')).toBe(true);
  });

  it('says it in Spanish too', async () => {
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(FIXTURE),
    });
    const { user, said } = renderDeleting(host, 'name', 'es');

    await user.click(
      screen.getByRole('button', { name: 'Delete the attribute' }),
    );

    await waitFor(() =>
      expect(said).toHaveTextContent(
        /partes del protocolo todavía usan esto, así que no se ha eliminado nada\./,
      ),
    );
  });
});

describe('a codebook deletion a collaborator is standing in the way of', () => {
  it('names every holder, not the first one it found', async () => {
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(FIXTURE),
    });
    const [first, second] = sectionsARefactorWrites('relationship_to_ego');
    // Two sections, two people: a refactor writes everywhere the attribute is
    // named, so one refusal can be about more than one collaborator.
    if (first === undefined || second === undefined) {
      throw new Error(
        'deleting this attribute writes fewer than two sections, so it cannot be held up by two people',
      );
    }
    host.store.acquire(first, ANA);
    host.store.acquire(second, BLAKE);

    const { user, said } = renderDeleting(host, 'relationship_to_ego');

    await user.click(
      screen.getByRole('button', { name: 'Delete the attribute' }),
    );

    await waitFor(() =>
      expect(said).toHaveTextContent(
        'Ana and Blake are currently editing sections needed for this change.',
      ),
    );
    expect(personStillHas(host, 'relationship_to_ego')).toBe(true);
  });
});

/**
 * Which sections a deletion writes, asked of a throwaway copy of the protocol
 * by making the deletion in it.
 *
 * Asked rather than written out here, so the test is about the refusal naming
 * everyone in the way rather than about which stages the shared fixture happens
 * to mention the attribute in.
 */
function sectionsARefactorWrites(
  variableId: string,
): readonly ProtocolSectionId[] {
  const probe = createInMemoryHost({ sections: sectionsFromProtocol(FIXTURE) });
  const outcome = probe.store.deleteVariable(SUBJECT, variableId, ANA);
  if (outcome.status !== 'applied') {
    throw new Error(
      `deleting ${variableId} is refused before any lock is taken, so it cannot show what a held one does`,
    );
  }
  return outcome.changedSections;
}
