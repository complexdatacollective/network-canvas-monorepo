---
title: Choisir un appareil pour Interviewer
navOrder: 3
wip: false
toc: true
translatedFrom: e172569169a1662f0d42f1623b4f90ac38be9f52
---

Le choix de l’appareil sur lequel exécuter Interviewer est une décision importante pour optimiser la qualité des données que vous recueillez, ainsi que le déroulement général d’une étude Network Canvas.

<TipBox>

La comparaison des plateformes ci-dessous — ainsi que les questions de disponibilité dans les boutiques d’applications et de gestion des applications natives — concerne surtout **Interviewer Classic**, que vous installez de façon native sur chaque appareil. La version navigateur d’**Interviewer** s’exécute dans n’importe quel [navigateur web pris en charge](/fr/collect-data/interviewer/installing-interviewer#supported-browsers) : sa principale exigence matérielle est donc un appareil qui fait bien tourner un navigateur récent. Les conseils de cette page sur la qualité de l’écran, le clavier, les performances et la connectivité restent valables, mais vous pouvez ignorer les mises en garde relatives aux boutiques d’applications et à l’installation native.

</TipBox>

## Points essentiels {#key-concerns}

Plusieurs considérations importantes sont à garder à l’esprit au moment de prendre cette décision.

La première est que **la saisie de texte est très laborieuse sans clavier physique**. Sur un appareil sans clavier physique (comme une tablette), le clavier virtuel qui apparaît lors de la saisie de texte peut occuper plus de 50 % de l’écran disponible. Il reste alors très peu de place pour afficher les éléments de l’interface ou d’autres données. Bien qu’Interviewer Classic dispose de fonctionnalités pour atténuer ce problème (consultez notre [article sur la configuration de votre appareil d’entretien](/fr/collect-data/interviewer/configuring-devices)), nous vous recommandons tout de même vivement de choisir un appareil doté d’un clavier physique, sauf si la saisie de texte est très limitée dans votre étude.

La deuxième est que vous devez **tenir compte de votre procédure de gestion des données**. Comment allez-vous distribuer vos protocoles d’entretien (et à quelle fréquence de nouvelles versions seront-elles nécessaires) ? Comment allez-vous récupérer les données de vos appareils d’entretien ? Selon le système d’exploitation et la plateforme, cette opération peut être plus ou moins difficile, et nécessiter le recours à des outils tiers (comme des fournisseurs de services cloud).

La troisième est que **les performances matérielles sont directement liées à l’expérience utilisateur**. Interviewer fait un usage intensif d’animations et d’interactions qui sollicitent fortement le processeur graphique (GPU). Un appareil aux performances graphiques médiocres entraînera des saccades et d’autres effets indésirables que les personnes participantes risquent de trouver désagréables, ce qui nuira en retour à la qualité des données. De même, les performances du processeur (CPU) influent sur le temps d’ouverture des interfaces qui utilisent une liste prédéfinie (importée comme fichier de données, dans laquelle la personne participante choisit), ce qui peut rendre ces fonctionnalités plus fastidieuses à utiliser.

La quatrième est la **connectivité**. Si vous prévoyez d’utiliser **Interviewer** avec des interfaces du schéma 8 qui dépendent d’Internet, comme l’[interface géospatiale](/fr/design-protocols/interface-documentation/geospatial), l’appareil d’entretien aura besoin d’une connexion Internet fiable sur le terrain. **Interviewer Classic**, ainsi que les protocoles qui n’utilisent pas ce type d’interfaces, fonctionnent entièrement hors ligne.

## Comparaison des plateformes {#platform-comparison}

### Tablette Android {#android-tablet}

✅ Largement disponibles, y compris en dehors de l’Occident et des pays du Nord.  
✅ Peuvent être très abordables.  
👎 Ont souvent de faibles performances et utilisent d’anciennes versions d’Android.  
👎 Peu de fabricants de matériel de qualité (Samsung et Huawei).  
👎 Utilisent généralement des écrans au format très allongé, peu adaptés à Interviewer.  
👎 Ne peuvent généralement pas exécuter d’autres logiciels de recherche.  
👎 L’importation des protocoles et la gestion des données peuvent être difficiles.  
👎 Le clavier doit être acheté séparément.

### Chromebook {#chromebook}

✅ Les appareils comportent généralement à la fois un écran tactile et un clavier.  
✅ Peuvent être très abordables, mais peuvent aussi être configurés avec du matériel plus puissant.  
✅ Format portable, comparable à celui d’un ordinateur portable ou d’une tablette avec clavier.  
✅ Utilisent généralement la dernière version d’Android.  
👎 Certains modèles offrent de faibles performances avec les applications Android.  
👎 Tous les modèles ne permettent pas d’exécuter des applications Android.  
👎 Ne peuvent généralement pas exécuter d’autres logiciels de recherche.

### iPad {#ipad}

✅ Extrêmement puissants en matière de GPU et de CPU, avec des écrans de grande qualité.  
✅ Potentiellement mieux acceptés dans certains contextes.  
⛔️ **Interviewer Classic n’est plus proposé au public sur iPad, en raison de difficultés avec le processus d’examen de l’App Store d’Apple.**  
👎 L’importation des protocoles et la gestion des données peuvent être difficiles.  
👎 Chers ! Le clavier doit être acheté séparément.

### Ordinateur portable {#laptop}

✅ Environnement familier pour les équipes de recherche comme pour les personnes participantes.  
✅ Gestion simple des protocoles et des données d’entretien.  
✅ Peut exécuter d’autres logiciels d’usage général si nécessaire.  
✅ Facile à acheter via les procédures d’achat informatique.  
👎 Peut être moins facile à transporter et offrir une moins bonne autonomie de batterie.  
👎 Les écrans de meilleure qualité sont plus chers.

## Recommandation générale {#overall-recommendation}

Pour la plupart des personnes qui utilisent nos logiciels, la meilleure option globale sera d’exécuter Interviewer sur un **ordinateur portable à écran tactile d’un des grands fabricants** (Dell, HP, Lenovo, Acer, Asus).

Lorsque ces fabricants proposent différentes configurations, privilégiez la qualité de l’écran (recherchez des écrans aussi grands et lumineux que possible, avec la plus haute résolution possible), ainsi que les performances graphiques. Une carte graphique dédiée offrira les meilleures performances, mais les processeurs récents (comme les 11e et 12e générations d’Intel) intègrent un processeur graphique performant.
