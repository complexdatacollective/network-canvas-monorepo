---
title: Le fichier de protocole
navOrder: 1
translatedFrom: 40092f88310335767b2d6122e9461605a97d223f
---

<Definition>

Un fichier portant l’extension .netcanvas, qui représente votre protocole d’entretien et contient toutes les données et ressources qu’il utilise.

</Definition>

## Détails {#details}

Un protocole Network Canvas est stocké sous la forme d’un fichier `.netcanvas` : une copie autonome de votre protocole et de tout ce qu’il utilise. Le rapport entre ce fichier et la copie sur laquelle vous travaillez dépend de la version d’Architect que vous utilisez :

- Dans **Architect** (l’application pour navigateur), votre protocole se trouve, pendant que vous travaillez, dans la **bibliothèque de protocoles** (dans le navigateur). Pour obtenir un fichier `.netcanvas`, afin de le sauvegarder, de le déplacer ou de le déployer, utilisez **Télécharger** depuis l’écran de vue d’ensemble du protocole.
- Dans **Architect Classic** (l’application de bureau), votre protocole _est_ un fichier `.netcanvas` sur votre ordinateur. Il se comporte comme n’importe quel autre fichier : vous pouvez le déplacer, le renommer, et vous pouvez (et devriez !) le sauvegarder.

Dans les deux cas, le fichier `.netcanvas` contient toutes les données de votre protocole. Si vous utilisez des [ressources](/fr/design-protocols/key-concepts/resources), comme des données de liste (une liste prédéfinie, importée comme fichier de données, dans laquelle la personne participante choisit), des images ou des vidéos, celles-ci sont donc intégrées au fichier. Consultez [Enregistrement et sauvegarde](/fr/design-protocols/saving-and-backing-up) pour savoir comment chaque version stocke votre travail et comment le garder en sécurité.

## Contenu d’un fichier .netcanvas {#inside-a-netcanvas-file}

Même si vous pouvez traiter un fichier `.netcanvas` comme un fichier unique, il s’agit en réalité d’un dossier compressé. À l’intérieur, les étapes, les consignes et la logique qui composent votre entretien sont stockées dans un fichier appelé `protocol.json`, et toutes les ressources que vous avez ajoutées, comme des images, des vidéos ou des données de liste, se trouvent à côté, dans un dossier `assets/`.

Pour examiner le contenu d’un protocole, renommez-le pour que son nom se termine par `.zip`, puis décompressez-le. La principale raison de le faire est la procédure des [libellés de nœuds personnalisés](/fr/design-protocols/key-concepts/node-labelling#custom-node-labeling-advanced), qui consiste à placer un fichier `nodeLabelWorker.js` au premier niveau du protocole, dans le même dossier que `protocol.json`. Une fois le fichier ajouté, compressez de nouveau le dossier, renommez-le pour que son nom se termine par `.netcanvas`, et importez-le dans Interviewer. Si vous modifiez ensuite le protocole dans Architect, le fichier JavaScript est conservé lors de l’enregistrement.

## Créer des fichiers de protocole {#authoring-protocol-files}

Architect crée votre protocole pour vous lorsque vous en commencez un nouveau. Dans **Architect** (l’application pour navigateur), vos modifications sont enregistrées automatiquement dans la bibliothèque de protocoles au fil de votre travail : il n’y a pas de bouton d’enregistrement, et vous utilisez **Télécharger** pour obtenir un fichier `.netcanvas` lorsque vous voulez une copie. Dans **Architect Classic**, Architect crée le fichier `.netcanvas` et vous invite à enregistrer vos modifications à mesure que vous ajoutez des étapes, modifiez le contenu ou importez des ressources. Dans les deux cas, vos modifications sont stockées dans le protocole.

Sachez toutefois qu’une fois votre protocole déployé dans d’autres applications, y apporter des modifications revient en pratique à en créer une nouvelle version. Si vous devez apporter des modifications après l’avoir déployé, deux options s’offrent à vous. Il est recommandé, après avoir apporté les modifications, d’enregistrer une copie de votre protocole sous un nouveau nom, et d’importer la nouvelle version dans Interviewer. L’autre option consiste à supprimer le protocole existant (et toutes les données d’entretien) d’Interviewer ou de Fresco, puis à importer la version la plus récente dans Interviewer, ou à la téléverser (envoyer vers le serveur) dans Fresco. Cette précaution est nécessaire pour garantir la compatibilité entre les outils.

Si vous choisissez de créer ou de modifier un fichier de protocole à la main, il vous appartient de vérifier qu’il respecte toutes les spécifications de la version actuelle du [schéma de protocole](/fr/get-started/protocol-schema-information).

## Utiliser les fichiers de protocole {#using-protocol-files}

Une fois votre fichier de protocole terminé, vous pouvez l’utiliser dans Interviewer ou dans Fresco.

- **Interviewer** : consultez notre [tutoriel sur les flux de travail des protocoles et des données](/fr/collect-data/protocol-and-data-workflows) pour en savoir plus sur la gestion des protocoles dans Interviewer.
- **Fresco** : consultez [Utiliser Fresco](/fr/collect-data/fresco/using-fresco#uploading-protocols) pour en savoir plus sur le téléversement de protocoles dans Fresco.
