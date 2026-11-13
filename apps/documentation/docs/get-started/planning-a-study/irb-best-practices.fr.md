---
title: Comités d’éthique (IRB) et bonnes pratiques de sécurité
navOrder: 2
translatedFrom: 1bafff6dc52b2e78d4e08e60d4a0e5ec310adc56
---

Nous savons que la sécurité des données est une préoccupation majeure pour la plupart des équipes de recherche. Network Canvas est né dans le contexte de recherches sensibles en santé publique auprès de populations marginalisées, et nous nous sommes appuyés sur notre expérience des études menées dans ce domaine pour définir notre approche de la sécurité.

Network Canvas utilise des fonctions de sécurité modernes et s’appuie sur des technologies existantes et des mises en œuvre largement répandues. Pour l’ensemble de nos outils, **l’équipe de Network Canvas ne reçoit, ne transmet ni ne stocke jamais aucune donnée des personnes participantes**. Nous n’agissons ni comme responsable du traitement ni comme sous-traitant : l’équipe de recherche conserve à tout moment le contrôle total des données de son étude et en garde l’entière responsabilité.

La manière dont ces données sont stockées, et donc les mesures de sécurité que vous devez mettre en place, dépend de l’outil que vous utilisez :

- **Applications sur l’appareil local (Architect, Architect Classic, Interviewer et Interviewer Classic)** : les données sont stockées uniquement sur l’appareil local, dans le navigateur pour les versions web d’Architect et d’Interviewer, ou dans l’application pour les applications Classic pour ordinateur et tablette. La sécurité repose sur la protection de cet appareil.
- **Fresco (application web auto-hébergée)** : les données sont stockées de manière centralisée dans une base de données et un espace de stockage que vous déployez et hébergez. La sécurité repose sur la protection de cette infrastructure de serveurs.

<TipBox>

Cette page résume les bonnes pratiques concrètes pour chaque outil. Pour une analyse complète et approfondie, qui couvre notamment les rôles au sens du règlement général sur la protection des données (RGPD), des recommandations pour les comités d’éthique et les services informatiques et une liste de contrôle complète de la sécurité, consultez notre [Guide de conformité au RGPD](/fr/get-started/planning-a-study/gdpr-compliance).

</TipBox>

## Applications sur l’appareil local (Architect, Architect Classic, Interviewer et Interviewer Classic) {#local-device-apps-architect-architect-classic-interviewer-and-interviewer-classic}

<TipBox>

**Interviewer Classic** fonctionne entièrement hors ligne. **Interviewer** stocke les données d’entretien localement de la même manière, mais certaines interfaces du schéma 8 (par exemple l’[interface géospatiale](/fr/design-protocols/interface-documentation/geospatial)) nécessitent une connexion Internet et contactent des services tiers pendant l’entretien : tenez-en compte dans votre évaluation des risques si vous les utilisez.

</TipBox>

Interviewer Classic et Architect Classic sont des outils entièrement hors ligne, conçus pour fonctionner sur des appareils contrôlés par l’équipe de recherche, et la version web d’Interviewer stocke ses données sur l’appareil de la même manière. Pour ces applications, notre approche de la sécurité des données se concentre sur le transfert des données, car nous partons du principe que les appareils sur lesquels elles fonctionnent sont entièrement contrôlés par l’équipe de recherche. Cela signifie que **le transfert des données (leur exportation hors de l’appareil) est le maillon le plus vulnérable du flux de travail.**

### Stockage des données {#data-storage}

Les données recueillies sur le terrain vous appartiennent et ne sont jamais stockées ailleurs que sur vos appareils. Nous ne recevons, ne transmettons ni ne stockons jamais de données des personnes participantes, et aucune donnée des personnes participantes ne quitte l’appareil, sauf si vous l’exportez manuellement. Interviewer envoie des statistiques d’utilisation et d’erreurs anonymes et facultatives (jamais de données des personnes participantes), qui sont activées par défaut et peuvent être désactivées à tout moment dans Paramètres → Confidentialité ; Interviewer Classic n’en envoie aucune. Nous n’utilisons ni cookies ni aucun autre jeton de suivi, de quelque nature que ce soit, dans Network Canvas.

### Quelles données sont stockées, et où {#what-data-is-stored-where}

Pour évaluer les risques, il est utile de savoir précisément ce que ces applications conservent sur l’appareil. Chacune stocke trois types de données, qui doivent tous être considérés comme potentiellement sensibles :

- **Protocoles** : en plus de la structure de votre entretien, un protocole peut intégrer tous les jeux de données nécessaires pour le mener. Par exemple, une étude menée dans une école peut inclure une liste des noms des camarades de classe (une liste prédéfinie, importée comme fichier de données, dans laquelle la personne participante choisit).
- **Données de session** : les données des réponses des personnes participantes, qui peuvent contenir des informations personnelles sensibles (en particulier dans des domaines comme la santé), ainsi que des métadonnées comme la date à laquelle une session a été menée, qui peuvent révéler où se trouvait la personne participante.
- **Configuration et métadonnées de l’application** : les paramètres de l’application et les métadonnées des protocoles, comme les préférences d’affichage dans Interviewer Classic ou le dernier protocole modifié dans Architect Classic.

L’emplacement de ces données varie selon la génération de l’application. Les versions web d’**Architect** et d’**Interviewer** stockent leurs données dans le stockage local de votre navigateur web, sur l’appareil que vous utilisez, tandis qu’**Architect Classic** et **Interviewer Classic** stockent leurs données dans l’application, sur l’appareil. Dans les deux cas, ce sont les protections de l’appareil décrites ci-dessous (chiffrement du disque, mots de passe robustes et verrouillage automatique) qui protègent ces données. Pour en savoir plus sur le stockage et la sécurité des données dans Fresco, consultez la [FAQ de Fresco](/fr/collect-data/fresco/faq#is-fresco-gdpr-compliant) et la section consacrée à Fresco ci-dessous.

### Bonnes pratiques de sécurité {#security-best-practices}

Comme le stockage des données et la sécurité des appareils relèvent de la responsabilité de l’équipe de recherche, nous vous recommandons les bonnes pratiques suivantes pour garantir la sécurité des données de votre étude Network Canvas :

- **Activez le chiffrement complet du disque (système d’exploitation).** Quelle que soit l’application utilisée, activez FileVault (macOS), BitLocker ou le chiffrement de l’appareil (Windows), ou l’équivalent sur votre plateforme. Interviewer Classic et Architect Classic ne chiffrent pas les données qu’ils stockent : le chiffrement de l’appareil est donc leur seule protection au repos. Interviewer chiffre en outre les données qu’il stocke sur l’appareil lorsque vous configurez un verrouillage de l’application, avec une clé liée à l’authentification qui déverrouille l’application : considérez-le comme une protection supplémentaire (défense en profondeur), et non comme un substitut au chiffrement de l’appareil.
- **Utilisez des mots de passe ou des codes d’accès robustes sur les appareils.** Mettez en place des contrôles d’accès par compte utilisateur afin que, sur les systèmes multi-utilisateurs, un compte ne puisse pas accéder aux données des autres comptes.
- **Limitez l’accès physique aux appareils.** L’utilisation de modes « kiosque » (ou similaires), associée à une supervision complète et constante de l’entretien, empêche les personnes participantes d’accéder aux données de l’application.
- **Réduisez au minimum la durée pendant laquelle les données de l’étude restent sur les appareils de terrain.** Transférer les données aussi régulièrement que possible vers des emplacements de stockage sécurisés prévus à cet effet, puis les supprimer des appareils de terrain, aide à limiter le risque de violation de données (par exemple en cas de vol d’un appareil).

## Fresco (application web auto-hébergée) {#fresco-self-hosted-web-app}

Fresco apporte les entretiens Network Canvas dans le navigateur web. Les personnes participantes réalisent l’entretien en se rendant à une URL, et vous gérez l’étude à partir d’un tableau de bord web protégé par une connexion. Comme **les données se trouvent sur un serveur accessible par Internet et non uniquement sur un appareil local**, les questions de sécurité diffèrent de celles des applications de bureau : la sécurité du serveur et de la base de données, les contrôles d’accès au tableau de bord et vos choix d’hébergement entrent tous en ligne de compte.

### Stockage des données {#data-storage-1}

Vous déployez et hébergez Fresco sur votre propre infrastructure, et toutes les données des personnes participantes restent à tout moment sous votre contrôle. L’équipe de Network Canvas n’héberge aucune donnée et n’est ni responsable du traitement ni sous-traitant.

- **Les données d’entretien** sont stockées de manière centralisée dans une base de données **Postgres** (chiffrée au repos avec des fournisseurs comme Neon, qui propose aussi des régions d’hébergement dans l’UE, le chiffrement en transit par TLS, des sauvegardes automatiques et des contrats de sous-traitance au sens de l’article 28 du RGPD).
- **Les ressources de l’étude** (par exemple les vidéos de présentation, les images, les logos et les fichiers de liste) sont stockées dans un **stockage d’objets compatible S3**. Vous pouvez utiliser **UploadThing** (un service hébergé reposant sur S3, le plus simple à configurer) ou faire pointer Fresco vers n’importe quel point de terminaison compatible S3, comme **AWS S3, MinIO auto-hébergé, Cloudflare R2 ou Backblaze B2**. L’accès est contrôlé par des URL signées, et le chiffrement côté serveur est soit imposé, soit activé par défaut chez le fournisseur, selon le service pris en charge. Notez que Fresco ne recueille pas de fichiers multimédias envoyés par les personnes participantes : le stockage des ressources ne contient que des documents fournis par l’équipe de recherche.
- **L’authentification au tableau de bord** prend en charge plusieurs comptes d’administration, l’authentification à deux facteurs par TOTP, WebAuthn et les clés d’accès, les codes de récupération et la limitation du nombre de tentatives de connexion. Les URL d’entretien des personnes participantes ne sont pas authentifiées et sont protégées par le fait qu’elles sont impossibles à deviner ; ajoutez une protection externe par authentification unique (SSO) ou par un fournisseur d’identité (IdP) si votre comité d’éthique (IRB) exige une authentification plus forte des personnes participantes.
- **Un hébergement conforme au RGPD** est possible en choisissant une région de l’UE à la fois pour la base de données et pour le stockage d’objets (un compartiment S3 dans l’UE, une offre payante d’UploadThing dans une région de l’UE ou un déploiement entièrement auto-hébergé dans votre juridiction).
- **Les statistiques d’utilisation** sont facultatives, anonymes et peuvent être désactivées dans les paramètres de Fresco. Elles ne contiennent aucune donnée d’entretien, mais, tant qu’elles sont activées, un terme recherché dans le tableau de bord peut apparaître dans les adresses de pages qu’elles envoient.
- **Entièrement auto-hébergeable.** Avec un service compatible S3, chaque composant (application, Postgres, stockage d’objets) peut fonctionner au sein de votre propre infrastructure, sans aucune dépendance externe obligatoire. Fresco n’est **pas** certifié HIPAA (la loi américaine sur la protection des données de santé) : consultez votre équipe chargée de la conformité avant de l’utiliser pour des données soumises à la HIPAA.

### Bonnes pratiques de sécurité {#security-best-practices-1}

En tant que responsable du traitement, il vous incombe de :

- **Établir une base légale** pour le traitement des données des personnes participantes.
- **Choisir des régions d’hébergement conformes au RGPD** à la fois pour votre base de données Postgres et pour votre stockage UploadThing ou S3.
- **Mettre en œuvre des mesures de sécurité des données appropriées** : utiliser HTTPS (imposé automatiquement), maintenir à jour la plateforme et ses dépendances, utiliser des identifiants robustes et uniques pour le tableau de bord d’administration, limiter l’accès à la base de données à la seule application et activer le chiffrement au repos et en transit.
- **Tenir à jour des politiques de conservation et de suppression des données**, et sauvegarder votre base de données de manière sécurisée.
- **Permettre aux personnes participantes d’exercer leurs droits** (accès, rectification, effacement).

<TipBox>

Si vous travaillez avec le service informatique, l’équipe d’administration des systèmes ou l’équipe de sécurité informatique de votre établissement sur un déploiement de Fresco, orientez-les vers la [FAQ pour les services informatiques](/fr/collect-data/fresco/it-faq), qui détaille les exigences d’infrastructure, le chiffrement, l’authentification, l’accès réseau, la journalisation et le niveau de sécurité de l’application. Pour en savoir plus sur le stockage et la sécurité des données en général, consultez la [FAQ de Fresco](/fr/collect-data/fresco/faq#is-fresco-gdpr-compliant). Pour des recommandations complètes et détaillées, étape par étape, sur la conformité, consultez le [Guide de conformité au RGPD](/fr/get-started/planning-a-study/gdpr-compliance).

</TipBox>
