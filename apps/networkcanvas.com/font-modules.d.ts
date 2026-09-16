declare module '@fontsource-variable/nunito';
declare module '@fontsource-variable/inclusive-sans';

// Turbopack resolves a .woff2 import to the emitted asset URL.
declare module '*.woff2' {
  const src: string;
  export default src;
}
