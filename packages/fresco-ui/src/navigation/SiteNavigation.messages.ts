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
  'pt-BR': {
    home: 'Página inicial do Network Canvas',
    navigationLabel: 'Navegação principal',
    skipToContent: 'Pular para o conteúdo principal',
    community: 'Comunidade',
    documentation: 'Documentação',
    protocolGallery: 'Galeria de Protocolos',
    resources: 'Recursos',
    software: 'Software',
    getStarted: 'Começar',
    openMenu: 'Abrir a navegação do site',
    closeMenu: 'Fechar a navegação do site',
    softwareLinks: {
      architect: {
        name: 'Architect',
        action: 'Abrir o Architect',
        description:
          'Crie protocolos de entrevista do Network Canvas no navegador, com um fluxo de trabalho visual pensado para equipes de pesquisa.',
      },
      architectClassic: {
        name: 'Architect Classic',
        action: 'Baixar o Architect Classic',
        description:
          'Use apenas quando seu estudo precisar continuar compatível com o Interviewer Classic e o esquema 7.',
      },
      interviewer: {
        name: 'Interviewer',
        action: 'Abrir o Interviewer',
        description:
          'Conduza em campo entrevistas de redes envolventes, guiadas por quem entrevista, em qualquer navegador compatível.',
      },
      interviewerClassic: {
        name: 'Interviewer Classic',
        action: 'Baixar o Interviewer Classic',
        description:
          'Para estudos já em andamento no esquema 7 e fluxos de trabalho offline em computador ou tablet. Mantido para compatibilidade e correção de erros.',
      },
      fresco: {
        name: 'Fresco',
        action: 'Experimentar o sandbox do Fresco',
        description:
          'Coordene entrevistas de redes a distância e gerencie os dados do estudo em um painel compartilhado no navegador.',
      },
    },
  },
} satisfies Record<SiteLocale, SiteNavigationMessages>;
