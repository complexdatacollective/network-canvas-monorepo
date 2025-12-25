/// <reference types="vite/client" />

type ImportMetaEnv = {
	readonly VITE_PARTY_HOST: string;
};

type ImportMeta = {
	readonly env: ImportMetaEnv;
};
