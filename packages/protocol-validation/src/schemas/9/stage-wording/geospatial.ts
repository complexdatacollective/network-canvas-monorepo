import type {
  SuppliedStageSetting,
  SuppliedWording,
} from '../supplied-stage-setting.ts';
import { hasMapSearch } from './conditions.ts';

/** The notice while the device is offline and the map cannot load. */
const OFFLINE_NOTICE = {
  'en': 'You are offline — the map will not load until you reconnect.',
  'de': 'Sie sind offline – die Karte wird erst geladen, wenn Sie wieder verbunden sind.',
  'es': 'No tienes conexión. El mapa no se cargará hasta que vuelvas a conectarte.',
  'fr': 'Vous êtes hors ligne : la carte ne se chargera pas tant que la connexion ne sera pas rétablie.',
  'it': 'Sei offline: la mappa non verrà caricata finché non ti riconnetti.',
  'nl': 'Je bent offline – de kaart wordt pas geladen als je weer verbinding hebt.',
  'pt-BR':
    'Você está offline — o mapa só será carregado quando você se reconectar.',
  'zh-Hans': '您当前处于离线状态 — 重新联网之前，地图将无法加载。',
  'zh-Hant': '您目前處於離線狀態，重新連線之前無法載入地圖。',
} as const satisfies SuppliedWording;

/** What the participant is told when the map cannot be drawn at all. */
const MAP_UNAVAILABLE = {
  'en': 'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
  'en-GB':
    'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organiser. You may be able to continue your interview by selecting the next arrow.',
  'de': 'Das kann passieren, wenn Ihr Browser oder Gerät die Funktionen, die die Karte benötigt (zum Beispiel WebGL), nicht unterstützt. Versuchen Sie es mit einem anderen Browser oder Gerät, oder wenden Sie sich an die Studienleitung. Möglicherweise können Sie das Interview fortsetzen, indem Sie auf den Weiter-Pfeil klicken.',
  'es': 'Esto puede ocurrir si tu navegador o dispositivo no admite las funciones que necesita el mapa (por ejemplo, WebGL). Prueba con otro navegador o dispositivo, o contacta con la persona que organiza el estudio. Es posible que puedas continuar la entrevista pulsando la flecha de avance.',
  'fr': 'Cela peut se produire si votre navigateur ou votre appareil ne prend pas en charge les fonctionnalités nécessaires à la carte (par exemple WebGL). Essayez un autre navigateur ou un autre appareil, ou contactez l’équipe responsable de l’étude. Vous pourrez peut-être poursuivre votre entretien en sélectionnant la flèche Suivant.',
  'it': 'Può succedere se il tuo browser o dispositivo non supporta le funzionalità richieste dalla mappa (ad esempio WebGL). Prova con un altro browser o dispositivo, oppure contatta chi organizza lo studio. Potresti riuscire a continuare l’intervista selezionando la freccia Avanti.',
  'nl': 'Dit kan gebeuren als je browser of apparaat de functies die de kaart nodig heeft niet ondersteunt (bijvoorbeeld WebGL). Probeer een andere browser of een ander apparaat, of neem contact op met de organisator van het onderzoek. Mogelijk kun je verder met je interview door de pijl Volgende te selecteren.',
  'pt-BR':
    'Isso pode acontecer se o seu navegador ou dispositivo não for compatível com as funcionalidades que o mapa exige (por exemplo, WebGL). Tente usar outro navegador ou dispositivo, ou entre em contato com a equipe responsável pelo estudo. Talvez você consiga continuar sua entrevista selecionando a seta de avançar.',
  'zh-Hans':
    '如果您的浏览器或设备不支持地图所需的功能（例如 WebGL），就可能出现这种情况。请尝试使用其他浏览器或设备，或联系研究组织者。您也许可以点击“下一步”箭头继续访谈。',
  'zh-Hant':
    '如果您的瀏覽器或裝置不支援地圖所需的功能（例如 WebGL），就可能發生這種情況。請改用其他瀏覽器或裝置，或聯絡研究團隊。您或許可以點選「下一步」箭頭，繼續進行訪談。',
} as const satisfies SuppliedWording;

/** The label of the button that picks a location outside the selectable areas. */
const OUTSIDE_AREAS_LABEL = {
  'en': 'Outside Selectable Areas',
  'de': 'Außerhalb der auswählbaren Bereiche',
  'es': 'Fuera de las áreas seleccionables',
  'fr': 'En dehors des zones sélectionnables',
  'it': 'Fuori dalle aree selezionabili',
  'nl': 'Buiten de selecteerbare gebieden',
  'pt-BR': 'Fora das áreas selecionáveis',
  'zh-Hans': '不在可选区域内',
  'zh-Hant': '不在可選取的區域內',
} as const satisfies SuppliedWording;

/** The search box's placeholder, and its accessible name. */
const SEARCH_LABEL = {
  'en': 'Search',
  'de': 'Suchen',
  'es': 'Buscar',
  'fr': 'Rechercher',
  'it': 'Cerca',
  'nl': 'Zoeken',
  'pt-BR': 'Buscar',
  'zh-Hans': '搜索',
  'zh-Hant': '搜尋',
} as const satisfies SuppliedWording;

/** The notice when a search matches nothing. */
const SEARCH_NO_MATCH = {
  'en': 'Nothing matched your search term.',
  'de': 'Keine Treffer für Ihren Suchbegriff.',
  'es': 'No hay resultados que coincidan con tu búsqueda.',
  'fr': 'Aucun résultat ne correspond à votre recherche.',
  'it': 'Nessun risultato per il termine cercato.',
  'nl': 'Niets gevonden voor je zoekterm.',
  'pt-BR': 'Nenhum resultado corresponde ao termo buscado.',
  'zh-Hans': '没有与您的搜索词匹配的结果。',
  'zh-Hant': '找不到符合搜尋字詞的結果。',
} as const satisfies SuppliedWording;

/** The notice when a search could not run, which says nothing about the place. */
const SEARCH_FAILED = {
  'en': 'Search could not be completed. Try again in a moment.',
  'de': 'Die Suche konnte nicht abgeschlossen werden. Versuchen Sie es gleich noch einmal.',
  'es': 'No se pudo completar la búsqueda. Vuelve a intentarlo en un momento.',
  'fr': 'La recherche n’a pas pu aboutir. Réessayez dans un instant.',
  'it': 'Non è stato possibile completare la ricerca. Riprova tra un momento.',
  'nl': 'Zoeken is niet gelukt. Probeer het zo meteen opnieuw.',
  'pt-BR': 'Não foi possível concluir a busca. Tente novamente em instantes.',
  'zh-Hans': '无法完成搜索，请稍后重试。',
  'zh-Hant': '無法完成搜尋。請稍後再試。',
} as const satisfies SuppliedWording;

/** The Geospatial's settings Network Canvas words. */
export const GEOSPATIAL_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  { path: ['offlineNotice'], message: OFFLINE_NOTICE },
  { path: ['mapUnavailable'], message: MAP_UNAVAILABLE },
  { path: ['outsideAreasLabel'], message: OUTSIDE_AREAS_LABEL },
  { path: ['searchLabel'], message: SEARCH_LABEL, when: hasMapSearch },
  { path: ['searchNoMatch'], message: SEARCH_NO_MATCH, when: hasMapSearch },
  { path: ['searchFailed'], message: SEARCH_FAILED, when: hasMapSearch },
];
