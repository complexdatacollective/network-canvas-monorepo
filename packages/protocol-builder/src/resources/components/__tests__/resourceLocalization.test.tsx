import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { protocolBuilderCatalogs } from '../../../locales/catalogs.ts';
import { esIntl } from '../../../testing/i18n.ts';
import type {
  ResourceGatewayFailure,
  ResourceInspection,
  ResourceResult,
} from '../../types.ts';
import ResourceFailureNotice from '../ResourceFailureNotice.tsx';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import ResourceSummary from '../ResourceSummary.tsx';
import ResourceUploadControl from '../ResourceUploadControl.tsx';
import {
  renderResourceClient,
  ResourceContextFrame,
} from './resourceContext.tsx';
import {
  createResourceHost,
  withResourceProcedures,
  type CommittedResource,
} from './resourceHost.ts';

/**
 * Every other test in this directory renders without a provider, which is what
 * makes their English literals real assertions: `useAppIntl` falls back to the
 * descriptors themselves. These are the mirror of that — the same surfaces
 * under a reader whose language the package ships copy for.
 */
function inSpanish(children: ReactNode) {
  return (
    <AppI18nProvider
      locale="es"
      locales={ecosystemLocales}
      messages={protocolBuilderCatalogs.es}
    >
      {children}
    </AppI18nProvider>
  );
}

const IMAGE_INSPECTION: ResourceInspection = Object.freeze({
  descriptor: Object.freeze({
    id: 'staged-image',
    kind: 'image' as const,
    name: 'Skyline',
    status: 'staged' as const,
    source: 'skyline.png',
    byteLength: 2048,
    contentType: 'image/png',
  }),
  dimensions: Object.freeze({ width: 800, height: 600 }),
  durationSeconds: 1,
});

const IMAGE_SEED: CommittedResource = {
  kind: 'image',
  id: 'image-1',
  name: 'Neighbourhood photo',
  source: 'neighbourhood.png',
  bytes: 'png-bytes',
};

function expectFailure<T>(result: ResourceResult<T>): ResourceGatewayFailure {
  if (result.status !== 'failed') {
    throw new Error('expected a failed resource result');
  }
  return result.failure;
}

/**
 * The picker as a field really holds it: the choice is written back, so the
 * announcement is made about a selection the control went on to show.
 */
function ImagePicker() {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <ResourcePickerControl
      name="backgroundImage"
      kind="image"
      value={value}
      onChange={setValue}
    />
  );
}

describe('resource surfaces in a reader’s own language', () => {
  it('renders a resource summary in Spanish, numbers and plurals included', () => {
    render(inSpanish(<ResourceSummary inspection={IMAGE_INSPECTION} />));

    // The kind and status badges come from the record in `resourceKinds`,
    // which the picker, the browser and this summary all read.
    expect(screen.getByText('Imagen')).toBeVisible();
    expect(screen.getByText('Importado, aún sin guardar')).toBeVisible();
    expect(screen.getByText('Tamaño')).toBeVisible();

    // A rounded size is a formatted number, so its decimal separator is the
    // reader's: 2.0 KB in English, 2,0 KB here. Built with the locale's own
    // formatter rather than written out, so this asserts that the size went
    // through ICU rather than restating what CLDR says about Spanish.
    expect(
      screen.getByText(
        `${esIntl.formatNumber(2, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })} KB`,
      ),
    ).toBeVisible();

    // The English template said "1 seconds" for every duration; the plural
    // categories are the locale's, and Spanish agrees with English about one.
    expect(screen.getByText('1 segundo')).toBeVisible();
    expect(screen.getByText('800 × 600 píxeles')).toBeVisible();
  });

  it('renders an import control and its refusal in Spanish', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const host = createResourceHost();
    render(
      inSpanish(
        <ResourceContextFrame client={host.client} protocolId={host.protocolId}>
          <ResourceUploadControl kind="image" onStaged={() => undefined} />
        </ResourceContextFrame>,
      ),
    );

    expect(
      screen.getByText('Arrastra y suelta aquí un archivo para importarlo.'),
    ).toBeVisible();

    await user.upload(
      screen.getByLabelText('Elige un archivo de tu ordenador'),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    );

    // The refusal is produced by `resourceKinds` as an encoded descriptor and
    // decoded here, so the extension list is joined by Spanish's own
    // conjunction rather than by the comma an `Array.join` would have left.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Ese archivo no se puede importar aquí. Los tipos de archivo admitidos son: ${esIntl.formatList(
        ['.jpg', '.jpeg', '.gif', '.png', '.svg'],
      )}.`,
    );
  });

  it('announces a chosen resource in Spanish', async () => {
    // The one thing a researcher who cannot see the field learns from making a
    // choice, so it is the one sentence the picker MUST say in their language:
    // the summary beside it is already there for everybody else.
    const user = userEvent.setup();
    const host = createResourceHost({ resources: [IMAGE_SEED] });
    render(
      inSpanish(
        <ResourceContextFrame client={host.client} protocolId={host.protocolId}>
          <ImagePicker />
        </ResourceContextFrame>,
      ),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Selecciona una imagen' }),
    );
    await user.click(
      within(
        await screen.findByRole('list', { name: 'Recursos de este protocolo' }),
      ).getByRole('button', { name: 'Neighbourhood photo' }),
    );

    // The resource's own name is the researcher's, so it is not translated —
    // everything the picker says around it is.
    const announcement = await screen.findByText(
      'Neighbourhood photo está ahora seleccionado.',
    );
    expect(announcement).toHaveAttribute('aria-live', 'polite');
  });

  /**
   * An announcement is the copy that waits longest for a reader.
   *
   * Nothing replaces it until the researcher makes another choice, so it is
   * still in the live region when an application changes its language — and it
   * is the one sentence a reader who cannot see the field has. Held as an
   * encoded descriptor, it is read in whichever language the region is being
   * read in now rather than the one the choice was made in.
   */
  it('re-reads the announcement it is holding when the language changes', async () => {
    const user = userEvent.setup();
    const host = createResourceHost({ resources: [IMAGE_SEED] });
    const picker = (
      <ResourceContextFrame client={host.client} protocolId={host.protocolId}>
        <ImagePicker />
      </ResourceContextFrame>
    );
    const { rerender } = render(
      <AppI18nProvider locale="en" locales={ecosystemLocales}>
        {picker}
      </AppI18nProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.click(
      within(
        await screen.findByRole('list', { name: 'Resources in this protocol' }),
      ).getByRole('button', { name: 'Neighbourhood photo' }),
    );
    expect(
      await screen.findByText('Neighbourhood photo is now selected.'),
    ).toBeVisible();

    rerender(
      <AppI18nProvider
        locale="es"
        locales={ecosystemLocales}
        messages={protocolBuilderCatalogs.es}
      >
        {picker}
      </AppI18nProvider>,
    );

    expect(
      await screen.findByText('Neighbourhood photo está ahora seleccionado.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Neighbourhood photo is now selected.'),
    ).not.toBeInTheDocument();
  });
});

/**
 * The one place the English wording genuinely moved. The template read
 * `${Math.round(durationSeconds)} seconds` and so said "1 seconds"; ICU picks
 * the category, and English has a singular. Asserted here because nothing else
 * in the suite rendered a duration at all, so the change would otherwise have
 * no oracle in either language.
 */
describe('a duration in English', () => {
  it('agrees with itself about one', () => {
    const { rerender } = render(
      <ResourceSummary
        inspection={{ ...IMAGE_INSPECTION, durationSeconds: 1 }}
      />,
    );
    expect(screen.getByText('1 second')).toBeVisible();

    rerender(
      <ResourceSummary
        inspection={{ ...IMAGE_INSPECTION, durationSeconds: 5.4 }}
      />,
    );
    expect(screen.getByText('5 seconds')).toBeVisible();
  });

  it('rounds a size to one decimal place, as it always did', () => {
    render(<ResourceSummary inspection={IMAGE_INSPECTION} />);
    expect(screen.getByText('2.0 KB')).toBeVisible();
  });
});

describe('a failure crossing the contract’s string-only message', () => {
  it('renders a refusal this package produced in the reader’s language', async () => {
    // A host that throws rather than answering is the one refusal this package
    // still writes the words for: the resource client turns it into
    // `unreachable`, which travels as an encoded descriptor on a field the
    // contract types as a plain `string`.
    const host = createResourceHost();
    const resources = renderResourceClient(
      withResourceProcedures(host.client, {
        inspect: () => {
          throw new Error('the host threw');
        },
      }),
      host.protocolId,
    );
    const failure = expectFailure(await resources().inspect('image-1'));
    // Encoded rather than formatted where it was produced, which is what lets
    // it be read in a language nothing had chosen at the time.
    expect(failure.message).not.toContain('acceder');

    render(inSpanish(<ResourceFailureNotice failure={failure} />));

    expect(
      screen.getByText(
        'No se pudo acceder al recurso. Inténtalo de nuevo en un momento.',
      ),
    ).toBeVisible();
  });

  it('leaves a host’s own plain-string failure exactly as the host wrote it', () => {
    // The contract's `message` is a `string` and stays one: a host serves the
    // procedures itself, in its own already-localized copy, which decodes to
    // nothing and must therefore fall through untouched. Without the `??`
    // fallback at the render site this sentence would vanish.
    const hostFailure: ResourceGatewayFailure = {
      reason: 'unavailable',
      message: 'El almacén de la universidad no responde. Vuelve a intentarlo.',
      retryable: true,
    };

    render(inSpanish(<ResourceFailureNotice failure={hostFailure} />));

    expect(
      screen.getByText(
        'El almacén de la universidad no responde. Vuelve a intentarlo.',
      ),
    ).toBeVisible();
  });
});
