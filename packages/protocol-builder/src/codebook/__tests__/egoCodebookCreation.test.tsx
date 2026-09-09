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
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../../contract/contract.ts';
import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { useCodebookSectionWrite } from '../writes.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const EGO = sectionId({ kind: 'codebookEgo' });
const SUBJECT = { entity: 'ego' } as const;

const ANA = { sessionId: 'session-ana', userId: 'ana', displayName: 'Ana' };

const AGE = {
  age: { name: 'age', type: 'number' },
} as const;

/** The protocol as it is before the researcher has asked the participant anything. */
function sectionsWithoutTheParticipant(): Record<string, SectionDoc> {
  const { [EGO]: _ego, ...rest } = sectionsFromProtocol(FIXTURE);
  return rest;
}

/**
 * The control that adds an attribute to the participant themselves, as far as
 * the write behind it is concerned.
 *
 * Driven directly, because the two surfaces that call this write —
 * `AttributeCodebookControls` and the pedigree's create button — both hide
 * themselves while the section has no document, so the first ego attribute
 * cannot be reached from either until PR 3's codebook editors. What is under
 * test is the seam: a codebook section a protocol need not have yet is created
 * by the write that adds to it, rather than refused as a section that has gone.
 */
function AddAnEgoAttribute() {
  const write = useCodebookSectionWrite();
  const intl = useAppIntl();
  const [said, setSaid] = useState('');

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          void write(SUBJECT, (authoritative) => ({
            ...authoritative,
            variables: {
              ...(typeof authoritative.variables === 'object' &&
              authoritative.variables !== null
                ? authoritative.variables
                : {}),
              ...AGE,
            },
          })).then((outcome) =>
            setSaid(
              outcome.status === 'refused'
                ? (formatMessageError(outcome.message, intl) ?? outcome.message)
                : 'added',
            ),
          );
        }}
      >
        Add an attribute about the participant
      </Button>
      <p aria-label="What happened">{said}</p>
    </>
  );
}

const renderAdding = (
  host: InMemoryHost,
  client: ProtocolBuilderClient,
  locale?: string,
) => {
  const tree = (
    <ProtocolBuilder client={client} protocolId={host.protocolId}>
      <AddAnEgoAttribute />
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

/** The attributes the protocol — not a view of it — holds for the participant. */
const participantAttributes = (host: InMemoryHost): string[] => {
  if (!host.store.has(EGO)) return [];
  const variables = host.store.read(EGO).document.variables;
  return typeof variables === 'object' && variables !== null
    ? Object.keys(variables)
    : [];
};

describe('the first attribute asked of the participant', () => {
  it('creates the section that holds it', async () => {
    const host = createInMemoryHost({
      sections: sectionsWithoutTheParticipant(),
    });
    // The protocol really has nowhere to put one yet: this is the state the
    // write has to answer for, not a section that happens to be empty.
    expect(host.store.has(EGO)).toBe(false);

    const { user, said } = renderAdding(host, host.client);
    await user.click(
      screen.getByRole('button', {
        name: 'Add an attribute about the participant',
      }),
    );

    await waitFor(() => expect(said).toHaveTextContent('added'));
    expect(participantAttributes(host)).toEqual(['age']);
  });

  it('is refused, not overwritten, when a collaborator added theirs first', async () => {
    const host = createInMemoryHost({
      sections: sectionsWithoutTheParticipant(),
    });

    const { user, said } = renderAdding(host, racedByACollaborator(host));
    await user.click(
      screen.getByRole('button', {
        name: 'Add an attribute about the participant',
      }),
    );

    await waitFor(() =>
      expect(said).toHaveTextContent(
        'Somebody else has just added the participant’s first attribute, so nothing was saved. Try again to add yours to theirs.',
      ),
    );
    // Theirs, whole: a create that overwrote would have left the section
    // holding this editor's attribute and not the one already committed.
    expect(participantAttributes(host)).toEqual(['pronouns']);
  });

  it('says it in Spanish too', async () => {
    const host = createInMemoryHost({
      sections: sectionsWithoutTheParticipant(),
    });

    const { user, said } = renderAdding(host, racedByACollaborator(host), 'es');
    await user.click(
      screen.getByRole('button', {
        name: 'Add an attribute about the participant',
      }),
    );

    await waitFor(() =>
      expect(said).toHaveTextContent(
        /Otra persona acaba de añadir el primer atributo del participante/,
      ),
    );
  });
});

/**
 * A client whose `create` a collaborator gets in front of.
 *
 * The race the refusal is about, made to happen: this editor's acquire is
 * answered "no such section", and by the time its create arrives the section
 * exists. `create` takes no lock, so this is the only thing standing between
 * two researchers adding the participant's first attribute at once.
 */
function racedByACollaborator(host: InMemoryHost): ProtocolBuilderClient {
  const create: ProtocolBuilderClient['create'] = async (input, options) => {
    if (!host.store.has(EGO)) {
      await host.asCollaborator(ANA).create({
        protocolId: host.protocolId,
        kind: 'codebookEgo',
        document: {
          variables: { pronouns: { name: 'pronouns', type: 'text' } },
        },
      });
    }
    return host.client.create(input, options);
  };
  // Proxied rather than spread: a contract client's procedures are reached
  // through property access rather than held as own properties, so a spread
  // copy of one has no procedures on it at all.
  return new Proxy(host.client, {
    get: (target, property) =>
      property === 'create' ? create : Reflect.get(target, property),
  });
}
