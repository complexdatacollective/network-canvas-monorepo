/// <reference types="vite/client" />

declare module '*.css';

declare global {
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
    credentialIdB64?: string;
    saltB64?: string;
  };

  type DbBridge = {
    protocols: {
      list: () => Promise<import('./lib/db/types').ProtocolWithCounts[]>;
      getByHash: (
        hash: string,
      ) => Promise<import('./lib/db/types').StoredProtocol | undefined>;
      getByHashes: (
        hashes: string[],
      ) => Promise<import('./lib/db/types').StoredProtocol[]>;
      getById: (
        id: string,
      ) => Promise<import('./lib/db/types').StoredProtocol | undefined>;
      save: (input: {
        protocol: import('@codaco/protocol-validation').CurrentProtocol;
        hash: string;
        assets: WireAssetInput[];
      }) => Promise<import('./lib/db/types').StoredProtocol>;
      delete: (hash: string) => Promise<void>;
      listAssets: (hash: string) => Promise<WireAsset[]>;
      getAsset: (args: {
        hash: string;
        assetId: string;
      }) => Promise<WireAsset | null>;
    };
    sessions: {
      list: () => Promise<import('./lib/db/types').StoredSession[]>;
      listForProtocol: (
        hash: string,
      ) => Promise<import('./lib/db/types').StoredSession[]>;
      get: (
        id: string,
      ) => Promise<import('./lib/db/types').StoredSession | undefined>;
      getByIds: (
        ids: string[],
      ) => Promise<import('./lib/db/types').StoredSession[]>;
      create: (args: {
        protocolHash: string;
        protocolName: string;
        caseId: string;
        initialNetwork: import('@codaco/shared-consts').NcNetwork;
      }) => Promise<import('./lib/db/types').StoredSession>;
      update: (args: {
        id: string;
        patch: Partial<import('./lib/db/types').StoredSession>;
      }) => Promise<import('./lib/db/types').StoredSession | undefined>;
      markFinished: (id: string) => Promise<void>;
      markExported: (ids: string[]) => Promise<void>;
      delete: (id: string) => Promise<void>;
      deleteMany: (ids: string[]) => Promise<void>;
    };
    settings: {
      get: () => Promise<import('./lib/db/types').StoredSettings>;
      update: (
        patch: Partial<Omit<import('./lib/db/types').StoredSettings, 'id'>>,
      ) => Promise<import('./lib/db/types').StoredSettings>;
    };
  };

  type AuthBridge = {
    status: () => Promise<AuthStatus>;
    setup: (args: {
      credentialIdB64: string;
      saltB64: string;
      prfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    unlock: (args: {
      prfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    lock: () => Promise<void>;
    reEnrol: (args: {
      currentPrfOutputB64: string;
      nextCredentialIdB64: string;
      nextSaltB64: string;
      nextPrfOutputB64: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    revoke: () => Promise<void>;
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
    platform: 'darwin' | 'win32' | 'linux';
    isPackaged: boolean;
    db: DbBridge;
    auth: AuthBridge;
  };

  // `interface` is required (not `type`) so this declaration MERGES with
  // the global Window from lib.dom.d.ts instead of replacing it.
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
