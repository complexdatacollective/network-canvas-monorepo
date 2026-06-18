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
import type { UpdateInfo } from './lib/update/types';

declare module '*.css';

declare global {
  // Injected at build time by `vite.renderer.config.ts` (read from
  // apps/interviewer-v8/package.json `version`). Renderer-only.
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
    mode?:
      | 'biometric-keystore'
      | 'biometric-native'
      | 'pin'
      | 'passphrase'
      | 'none';
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
    setupPin: (args: {
      pin: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    setupNone: () => Promise<{ ok: boolean; message?: string }>;
    setupBiometric: () => Promise<{ ok: boolean; message?: string }>;
    unlockPin: (args: {
      pin: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    unlockBiometric: () => Promise<{ ok: boolean; message?: string }>;
    verifyBiometric: () => Promise<{ ok: boolean; message?: string }>;
    biometricAvailable: () => Promise<boolean>;
    lock: () => Promise<void>;
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

  type UpdateProgress = {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };

  type UpdateBridge = {
    check: () => Promise<UpdateInfo | null>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    onProgress: (callback: (progress: UpdateProgress) => void) => () => void;
    onDownloaded: (callback: () => void) => () => void;
    onError: (callback: (message: string) => void) => () => void;
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
    update: UpdateBridge;
  };

  // `interface` is required (not `type`) so this declaration MERGES with
  // the global Window from lib.dom.d.ts instead of replacing it.
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
