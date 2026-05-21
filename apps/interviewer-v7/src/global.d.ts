/// <reference types="vite/client" />

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import type {
  ProtocolWithCounts,
  SessionQueryParams,
  SessionQueryResult,
  StoredProtocol,
  StoredSession,
  StoredSessionLite,
  StoredSettings,
} from './lib/db/types';

declare module '*.css';

declare global {
  // Injected at build time by `vite.renderer.config.ts` (read from
  // apps/interviewer-v7/package.json `version`). Renderer-only.
  const __APP_VERSION__: string;

  type WireAsset = {
    id: string;
    protocolHash: string;
    assetId: string;
    name: string;
    type: 'image' | 'video' | 'audio' | 'network' | 'geojson' | 'apikey';
    kind: 'string' | 'blob';
    mimeType?: string;
    data: string | Uint8Array;
  };

  type WireAssetInput =
    | { id: string; name: string; kind: 'string'; data: string }
    | {
        id: string;
        name: string;
        kind: 'blob';
        mimeType: string;
        data: Uint8Array;
      };

  type AuthStatus = {
    configured: boolean;
    locked: boolean;
    mode?: 'webauthn' | 'biometric-native' | 'pin' | 'passphrase' | 'none';
    credentialIdB64?: string;
    saltB64?: string;
  };

  type DbBridge = {
    protocols: {
      list: () => Promise<ProtocolWithCounts[]>;
      getByHash: (hash: string) => Promise<StoredProtocol | undefined>;
      getByHashes: (hashes: string[]) => Promise<StoredProtocol[]>;
      save: (input: {
        protocol: CurrentProtocol;
        hash: string;
        assets: WireAssetInput[];
      }) => Promise<StoredProtocol>;
      delete: (hash: string) => Promise<void>;
      listAssets: (hash: string) => Promise<WireAsset[]>;
      getAsset: (args: {
        hash: string;
        assetId: string;
      }) => Promise<WireAsset | null>;
    };
    sessions: {
      list: () => Promise<StoredSessionLite[]>;
      query: (params: SessionQueryParams) => Promise<SessionQueryResult>;
      queryMatchingIds: (params: SessionQueryParams) => Promise<string[]>;
      get: (id: string) => Promise<StoredSession | undefined>;
      getByIds: (ids: string[]) => Promise<StoredSession[]>;
      create: (args: {
        protocolHash: string;
        protocolName: string;
        caseId: string;
        initialNetwork: NcNetwork;
        isSynthetic?: boolean;
      }) => Promise<StoredSession>;
      update: (args: {
        id: string;
        patch: Partial<StoredSession>;
      }) => Promise<StoredSession | undefined>;
      markFinished: (id: string) => Promise<void>;
      markExported: (ids: string[]) => Promise<void>;
      deleteMany: (ids: string[]) => Promise<void>;
      countSynthetic: () => Promise<number>;
      deleteSynthetic: () => Promise<number>;
    };
    settings: {
      get: () => Promise<StoredSettings>;
      update: (
        patch: Partial<Omit<StoredSettings, 'id'>>,
      ) => Promise<StoredSettings>;
    };
  };

  type AuthBridge = {
    status: () => Promise<AuthStatus>;
    setup: (args: {
      credentialIdB64: string;
      saltB64: string;
      prfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    setupPin: (args: {
      pin: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    setupNone: () => Promise<{ ok: boolean; message?: string }>;
    unlock: (args: {
      prfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    unlockPin: (args: {
      pin: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    lock: () => Promise<void>;
    reEnrol: (args: {
      currentPrfOutputB64: string;
      nextCredentialIdB64: string;
      nextSaltB64: string;
      nextPrfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    reEnrolPin: (args: {
      currentPin: string;
      nextPin: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    setupPassphrase: (args: {
      phrase: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    unlockPassphrase: (args: {
      phrase: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    reEnrolPassphrase: (args: {
      currentPhrase: string;
      nextPhrase: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    verifyWebAuthn: (args: {
      prfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    verifyPin: (args: {
      pin: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    verifyPassphrase: (args: {
      phrase: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    revoke: () => Promise<void>;
  };

  type SystemBridge = {
    storageInfo: () => Promise<{
      dbBytes: number | null;
      diskFreeBytes: number | null;
      diskTotalBytes: number | null;
    }>;
  };

  type ElectronAPI = {
    openFile: () => Promise<{
      canceled: boolean;
      data?: Uint8Array;
      name?: string;
    } | null>;
    saveFile: (
      suggestedName: string,
      data: Uint8Array,
    ) => Promise<{ canceled: boolean; path?: string }>;
    fetchProtocolFromUrl: (
      url: string,
    ) => Promise<
      { ok: true; data: Uint8Array } | { ok: false; message: string }
    >;
    platform: 'darwin' | 'win32' | 'linux';
    isPackaged: boolean;
    db: DbBridge;
    auth: AuthBridge;
    system: SystemBridge;
  };

  // `interface` is required (not `type`) so this declaration MERGES with
  // the global Window from lib.dom.d.ts instead of replacing it.
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
