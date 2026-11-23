import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_REVIEW_OWN_MODEL_KEY } from '~/utils/storageNames';

import {
  readStoredOwnModel,
  readStoredProvider,
  writeStoredOwnModel,
  writeStoredProvider,
} from '../browserState';
import {
  chatCompletionsUrl,
  completeOwnModelSettings,
  isOwnModelAddress,
  OWN_MODEL,
} from '../ownModel';

describe('the address of the researcher’s own model', () => {
  it.each([
    'https://models.example.edu/v1',
    'https://api.example.com',
    'http://localhost:11434/v1',
    'http://127.0.0.1:1234/v1',
    '  http://localhost:11434/v1  ',
  ])('accepts %s', (address) => {
    expect(isOwnModelAddress(address)).toBe(true);
  });

  // Plain http is only for this computer: the browser blocks an https page
  // from any other plain-http machine, and so does the app's own policy.
  it.each([
    '',
    'localhost:11434',
    'not an address',
    'http://192.168.1.20:11434/v1',
    'http://models.example.edu/v1',
    'ftp://localhost/v1',
    'javascript:alert(1)',
    'https://user:secret@models.example.edu/v1',
  ])('refuses %s', (address) => {
    expect(isOwnModelAddress(address)).toBe(false);
    expect(chatCompletionsUrl(address)).toBeNull();
  });

  it('asks the chat API under the base address', () => {
    expect(chatCompletionsUrl('http://localhost:11434/v1')).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    expect(chatCompletionsUrl('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    expect(chatCompletionsUrl('https://api.example.com')).toBe(
      'https://api.example.com/chat/completions',
    );
  });

  it('leaves an address that already names the chat API as it is', () => {
    expect(
      chatCompletionsUrl('https://api.example.com/v1/chat/completions'),
    ).toBe('https://api.example.com/v1/chat/completions');
  });
});

describe('the settings a review can be sent with', () => {
  it('trims what was typed, and takes a missing key as none', () => {
    expect(
      completeOwnModelSettings({
        address: ' http://localhost:11434/v1 ',
        model: ' llama ',
      }),
    ).toEqual({
      address: 'http://localhost:11434/v1',
      model: 'llama',
      apiKey: '',
    });
  });

  it.each([
    [{ address: 'http://example.com/v1', model: 'llama', apiKey: '' }],
    [{ address: 'http://localhost:11434/v1', model: '  ', apiKey: '' }],
    [{ model: 'llama' }],
    // A key that cannot be sent as typed is not sent as no key.
    [
      {
        address: 'http://localhost:11434/v1',
        model: 'llama',
        apiKey: 'k'.repeat(501),
      },
    ],
    [{ address: 'http://localhost:11434/v1', model: 'llama', apiKey: 7 }],
    [null],
    ['http://localhost:11434/v1'],
  ])('is not %j', (value) => {
    expect(completeOwnModelSettings(value)).toBeNull();
  });
});

describe('what this browser keeps', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps no endpoint until one is saved, then the one saved', () => {
    expect(readStoredOwnModel()).toBeNull();
    const settings = {
      address: 'https://models.example.edu/v1',
      model: 'llama',
      apiKey: 'secret',
    };
    writeStoredOwnModel(settings);
    expect(readStoredOwnModel()).toEqual(settings);
  });

  it.each(['not json', '{"address":"http://example.com","model":"m"}', '[]'])(
    'reads %s as no endpoint',
    (stored) => {
      localStorage.setItem(PROTOCOL_REVIEW_OWN_MODEL_KEY, stored);
      expect(readStoredOwnModel()).toBeNull();
    },
  );

  it('remembers the researcher’s own model as the choice', () => {
    writeStoredProvider(OWN_MODEL);
    expect(readStoredProvider()).toBe(OWN_MODEL);
  });

  it('keeps nothing, and fails nothing, when storage refuses', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    expect(() =>
      writeStoredOwnModel({
        address: 'http://localhost:11434/v1',
        model: 'llama',
        apiKey: '',
      }),
    ).not.toThrow();
    vi.restoreAllMocks();
    expect(readStoredOwnModel()).toBeNull();
  });
});
