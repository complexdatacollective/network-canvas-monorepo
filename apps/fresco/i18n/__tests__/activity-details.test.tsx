import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { AppI18nProvider, useAppIntl } from '@codaco/app-i18n/react';
import { fetchActivityFeedTableColumnDefs } from '~/app/dashboard/_components/ActivityFeed/ColumnDefinition';
import {
  formatActivityDetails,
  type ActivityLocalization,
} from '~/i18n/activityDetails';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';

const legacy = 'User Ada changed an old setting';
const event = {
  id: 'test-activity',
  timestamp: new Date('2026-09-05T12:00:00Z'),
  type: 'Participant(s) Added',
  message: legacy,
  localization: {
    kind: 'participantsAdded',
    values: { username: '<img src=x onerror=alert(1)>', count: 2 },
  } satisfies ActivityLocalization,
};

function Details() {
  const intl = useAppIntl();
  const table = useReactTable({
    data: [event],
    columns: fetchActivityFeedTableColumnDefs(intl),
    getCoreRowModel: getCoreRowModel(),
  });
  const cell = table
    .getRowModel()
    .rows[0]?.getAllCells()
    .find((entry) => entry.column.id === 'message');
  return cell
    ? flexRender(cell.column.columnDef.cell, cell.getContext())
    : null;
}
function View({ locale }: { locale: string }) {
  return (
    <AppI18nProvider
      locale={locale}
      locales={frescoLocales}
      messages={frescoCatalogs[locale]}
    >
      <Details />
    </AppI18nProvider>
  );
}

describe('localized activity records', () => {
  it('formats structured details in the active locale and escapes literal user values', () => {
    const view = render(<View locale="en" />);
    expect(
      screen.getByText(
        'User <img src=x onerror=alert(1)> added 2 participants.',
      ),
    ).toBeVisible();
    view.rerender(<View locale="es" />);
    expect(
      screen.getByText(
        '«<img src=x onerror=alert(1)>» añadió 2 participantes.',
      ),
    ).toBeVisible();
    expect(view.container.querySelector('img')).toBeNull();
    expect(event.message).toBe(legacy);
  });

  it.each([
    null,
    undefined,
    { kind: 'futureEvent', values: {} },
    { kind: 'userLogin', values: {} },
    { kind: 'userLogin', values: { username: 'Ada', extra: 'unexpected' } },
    { kind: 'participantsAdded', values: { username: 'Ada', count: 'two' } },
  ])(
    'preserves historical or unrecognized audit content verbatim: %j',
    (localization) => {
      const intl = createAppIntl({ locale: 'es', messages: frescoCatalogs.es });
      expect(
        formatActivityDetails(intl, { message: legacy, localization }),
      ).toBe(legacy);
    },
  );

  it('formats independent counts and user lists without translating research identifiers', () => {
    const intl = createAppIntl({ locale: 'es', messages: frescoCatalogs.es });
    expect(
      formatActivityDetails(intl, {
        message: 'original audit record',
        localization: {
          kind: 'syntheticDeleted',
          values: { username: 'admin', interviews: 1, participants: 2 },
        },
      }),
    ).toBe(
      '«admin» eliminó 1 entrevista sintética y 2 participantes de prueba.',
    );
    expect(
      formatActivityDetails(intl, {
        message: 'original audit record',
        localization: {
          kind: 'usersDeleted',
          values: { username: 'admin', count: 2, users: ['Ana', 'Luis'] },
        },
      }),
    ).toBe('«admin» eliminó las cuentas: Ana y Luis.');
  });
});
