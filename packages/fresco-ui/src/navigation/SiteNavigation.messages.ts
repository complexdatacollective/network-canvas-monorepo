import type { SiteLocale } from '@codaco/shared-consts';

type SoftwareMessage = {
  name: string;
  action: string;
  description: string;
};

export type SiteNavigationMessages = {
  home: string;
  navigationLabel: string;
  community: string;
  documentation: string;
  protocolGallery: string;
  resources: string;
  software: string;
  getStarted: string;
  openMenu: string;
  closeMenu: string;
  softwareLinks: Record<
    | 'architect'
    | 'architectClassic'
    | 'interviewer'
    | 'interviewerClassic'
    | 'fresco',
    SoftwareMessage
  >;
};

const englishMessages = {
  home: 'Network Canvas home',
  navigationLabel: 'Primary navigation',
  community: 'Community',
  documentation: 'Documentation',
  protocolGallery: 'Protocol Gallery',
  resources: 'Resources',
  software: 'Software',
  getStarted: 'Get Started',
  openMenu: 'Open site navigation',
  closeMenu: 'Close site navigation',
  softwareLinks: {
    architect: {
      name: 'Architect',
      action: 'Open Architect',
      description:
        'Design polished Network Canvas interview protocols in your browser with a visual workflow built for researchers.',
    },
    architectClassic: {
      name: 'Architect Classic',
      action: 'Get Architect Classic',
      description:
        'Use only when your study must remain compatible with Interviewer Classic and schema 7.',
    },
    interviewer: {
      name: 'Interviewer',
      action: 'Open Interviewer',
      description:
        'Run engaging, interviewer-led network interviews in the field from any supported browser.',
    },
    interviewerClassic: {
      name: 'Interviewer Classic',
      action: 'Get Interviewer Classic',
      description:
        'For established schema 7 studies and offline desktop or tablet workflows. Maintained for compatibility and bug fixes.',
    },
    fresco: {
      name: 'Fresco',
      action: 'Try the Fresco Sandbox',
      description:
        'Coordinate remote network interviews and manage study data from one shared browser-based dashboard.',
    },
  },
} satisfies SiteNavigationMessages;

export const siteNavigationMessages = {
  'en-US': englishMessages,
  'en-GB': englishMessages,
  'es': {
    home: 'Inicio de Network Canvas',
    navigationLabel: 'Navegación principal',
    community: 'Comunidad',
    documentation: 'Documentación',
    protocolGallery: 'Galería de protocolos',
    resources: 'Recursos',
    software: 'Software',
    getStarted: 'Comenzar',
    openMenu: 'Abrir navegación del sitio',
    closeMenu: 'Cerrar navegación del sitio',
    softwareLinks: {
      architect: {
        name: 'Architect',
        action: 'Abrir Architect',
        description:
          'Diseñe protocolos de entrevista de Network Canvas en su navegador con un flujo de trabajo visual creado para equipos de investigación.',
      },
      architectClassic: {
        name: 'Architect Classic',
        action: 'Obtener Architect Classic',
        description:
          'Utilícelo únicamente cuando su estudio deba seguir siendo compatible con Interviewer Classic y el esquema 7.',
      },
      interviewer: {
        name: 'Interviewer',
        action: 'Abrir Interviewer',
        description:
          'Realice entrevistas de redes atractivas y guiadas por una persona entrevistadora desde cualquier navegador compatible.',
      },
      interviewerClassic: {
        name: 'Interviewer Classic',
        action: 'Obtener Interviewer Classic',
        description:
          'Para estudios consolidados con esquema 7 y flujos de trabajo sin conexión en computadoras de escritorio o tabletas. Se mantiene para ofrecer compatibilidad y corregir errores.',
      },
      fresco: {
        name: 'Fresco',
        action: 'Probar el entorno sandbox de Fresco',
        description:
          'Coordine entrevistas de redes remotas y gestione los datos del estudio desde un panel compartido en el navegador.',
      },
    },
  },
} satisfies Record<SiteLocale, SiteNavigationMessages>;
