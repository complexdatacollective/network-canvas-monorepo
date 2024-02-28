import { type MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Network Canvas Documentation',
    short_name: 'Documentation',
    description:
      'Documentation and information about the Network Canvas project. Network Canvas is free suite of tools that facilitate research that uses complex personal network data.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1E283A',
    theme_color: '#1E283A',
    icons: [
      {
        src: '/favicons/icon192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/favicons/icon512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
