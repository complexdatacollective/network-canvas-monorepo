'use client';
import { debounce } from 'es-toolkit';
import { Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { nuqsTableUrlKey, useNuqsTable } from './NuqsTableProvider';

type NuqsSearchFilterProps = {
  /** Logical param name (unprefixed). The provider's `prefix` will be applied. */
  paramKey: string;
  placeholder?: string;
  className?: string;
  /** Delay between last keystroke and URL commit. Defaults to 300 ms. */
  debounceMs?: number;
};

/**
 * URL-backed text filter for server-fetched tables.
 *
 * Holds a transient local buffer for instant keystroke feedback while the
 * actual URL write is debounced and routed through the provider's
 * `startTransition` — so the table body fades but the input never unmounts
 * or loses focus, and concurrent typing isn't dropped.
 */
export default function NuqsSearchFilter({
  paramKey,
  placeholder: placeholderProp,
  className,
  debounceMs = 300,
}: NuqsSearchFilterProps) {
  const intl = useAppIntl();
  const placeholder =
    placeholderProp ?? intl.formatMessage(messages.NuqsSearchFilterplaceholder);
  const { prefix, startTransition } = useNuqsTable();
  const urlKey = nuqsTableUrlKey(prefix, paramKey);

  const [value, setValue] = useQueryState(
    urlKey,
    parseAsString.withOptions({
      shallow: false,
      clearOnDefault: true,
      startTransition,
    }),
  );

  const [local, setLocal] = useState(value ?? '');

  // Tracks the last value this component wrote to the URL. Distinguishes
  // "my own debounced commit arrived back through nuqs" from "URL changed
  // externally" (clear button, browser back, navigation), so the external
  // case can cancel any in-flight debounce and adopt the new value without
  // being clobbered when the pending commit fires.
  const lastWrittenRef = useRef<string | null>(value);

  const debouncedCommit = useMemo(
    () =>
      debounce(
        (next: string | null) => {
          lastWrittenRef.current = next;
          void setValue(next);
        },
        debounceMs,
        { edges: ['trailing'] },
      ),
    [setValue, debounceMs],
  );

  useEffect(() => () => debouncedCommit.cancel(), [debouncedCommit]);

  useEffect(() => {
    if (value !== lastWrittenRef.current) {
      debouncedCommit.cancel();
      lastWrittenRef.current = value;
      setLocal(value ?? '');
    }
  }, [value, debouncedCommit]);

  return (
    <InputField
      type="search"
      prefixComponent={<Search />}
      name={urlKey}
      className={className}
      placeholder={placeholder}
      value={local}
      onChange={(next) => {
        const v = next ?? '';
        setLocal(v);
        debouncedCommit(v.length > 0 ? v : null);
      }}
    />
  );
}

const messages = defineMessages({
  NuqsSearchFilterplaceholder: {
    id: 'fresco.tableFilters.NuqsSearchFilterplaceholder',
    defaultMessage: 'Filter...',
    description: 'Researcher-facing tableFilters: Filter...',
  },
});
