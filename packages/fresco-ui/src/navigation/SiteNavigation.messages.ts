import type { SiteLocale } from '@codaco/shared-consts';

type SoftwareMessage = {
  name: string;
  action: string;
  description: string;
};

export type SiteNavigationMessages = {
  home: string;
  navigationLabel: string;
  skipToContent: string;
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
  skipToContent: 'Skip to main content',
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
    skipToContent: 'Saltar al contenido principal',
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
  'zh-Hans': {
    home: 'Network Canvas 首页',
    navigationLabel: '主导航',
    skipToContent: '跳到主要内容',
    community: '社区',
    documentation: '文档',
    protocolGallery: '协议示例库',
    resources: '资源',
    software: '软件',
    getStarted: '快速入门',
    openMenu: '打开网站导航',
    closeMenu: '关闭网站导航',
    softwareLinks: {
      architect: {
        name: 'Architect',
        action: '打开 Architect',
        description:
          '在浏览器中通过专为研究人员打造的可视化工作流程，设计精致的 Network Canvas 访谈协议。',
      },
      architectClassic: {
        name: 'Architect Classic',
        action: '获取 Architect Classic',
        description:
          '仅在您的研究必须保持与 Interviewer Classic 和架构 7 兼容时使用。',
      },
      interviewer: {
        name: 'Interviewer',
        action: '打开 Interviewer',
        description:
          '在任何受支持的浏览器中，于实地开展富有吸引力、由访谈员主导的社会网络访谈。',
      },
      interviewerClassic: {
        name: 'Interviewer Classic',
        action: '获取 Interviewer Classic',
        description:
          '适用于已在进行的架构 7 研究，以及离线的桌面或平板电脑工作流程。为保持兼容性和修复错误而继续维护。',
      },
      fresco: {
        name: 'Fresco',
        action: '试用 Fresco 沙盒',
        description:
          '通过一个基于浏览器的共享仪表板，协调远程社会网络访谈并管理研究数据。',
      },
    },
  },
  'fr': {
    home: 'Accueil Network Canvas',
    navigationLabel: 'Navigation principale',
    skipToContent: 'Aller au contenu principal',
    community: 'Communauté',
    documentation: 'Documentation',
    protocolGallery: 'Galerie de protocoles',
    resources: 'Ressources',
    software: 'Logiciels',
    getStarted: 'Commencer',
    openMenu: 'Ouvrir la navigation du site',
    closeMenu: 'Fermer la navigation du site',
    softwareLinks: {
      architect: {
        name: 'Architect',
        action: 'Ouvrir Architect',
        description:
          'Concevez des protocoles d’entretien Network Canvas soignés dans votre navigateur, grâce à un flux de travail visuel pensé pour les équipes de recherche.',
      },
      architectClassic: {
        name: 'Architect Classic',
        action: 'Obtenir Architect Classic',
        description:
          'À utiliser uniquement si votre étude doit rester compatible avec Interviewer Classic et le schéma 7.',
      },
      interviewer: {
        name: 'Interviewer',
        action: 'Ouvrir Interviewer',
        description:
          'Menez sur le terrain, depuis n’importe quel navigateur pris en charge, des entretiens de réseau engageants, guidés par la personne qui mène l’entretien.',
      },
      interviewerClassic: {
        name: 'Interviewer Classic',
        action: 'Obtenir Interviewer Classic',
        description:
          'Pour les études établies en schéma 7 et les flux de travail hors ligne sur ordinateur ou tablette. Maintenu pour la compatibilité et la correction des bogues.',
      },
      fresco: {
        name: 'Fresco',
        action: 'Essayer le bac à sable Fresco',
        description:
          'Coordonnez des entretiens de réseau à distance et gérez les données de l’étude depuis un tableau de bord partagé, accessible dans le navigateur.',
      },
    },
  },
} satisfies Record<SiteLocale, SiteNavigationMessages>;
