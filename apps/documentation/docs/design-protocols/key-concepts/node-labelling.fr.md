---
title: Libellés des nœuds
navOrder: 13
translatedFrom: b561f288d8b113fc514c2257d9f6bc3c6718a769
---

## Comment Interviewer calcule le libellé d’un nœud {#how-interviewer-calculates-a-nodes-label}

Interviewer calcule le libellé à utiliser pour afficher un nœud selon la logique suivante :

0. Utiliser le script de libellés de nœuds (_worker_ `nodeLabelWorker.js`) que contient le protocole, s’il y en a un (voir la [section ci-dessous](#custom-node-labeling-advanced) pour les détails de cette fonctionnalité avancée).
1. Chercher une variable appelée « name » (sans tenir compte de la casse) parmi celles que le [livre de codes](/fr/design-protocols/key-concepts/codebook) définit pour le type du nœud (le livre de codes est la définition des types de nœuds, de liens et de leurs attributs, comme le dictionnaire des codes d’une enquête), et essayer de récupérer sur le nœud la valeur de cette variable.
2. Chercher sur le nœud une propriété dont la clé est « name » (sans tenir compte de la casse), et essayer de récupérer cette valeur.
3. Afficher le texte « No 'name' variable! ».

Si vous obtenez des résultats inattendus, comme des messages « No 'name' variable! », vérifiez que vous avez construit votre protocole ou vos données de façon à satisfaire une règle prioritaire, c’est-à-dire placée plus haut dans la liste ci-dessus. Par exemple, vérifiez que vous avez correctement créé une variable « name » pour le type de nœud, et que cette variable reçoit une valeur pendant votre entretien.

Pour des fonctionnalités avancées, comme le calcul dynamique du libellé d’un nœud, consultez plus bas la section [« Libellés de nœuds personnalisés »](#custom-node-labeling-advanced).

## Attribuer un libellé aux nœuds issus d’une liste prédéfinie {#labeling-nodes-from-roster-data}

Pour contrôler le libellé des nœuds issus d’un fichier de réseau ajouté comme ressource et utilisé comme liste (une liste prédéfinie, importée comme fichier de données, dans laquelle la personne participante choisit), l’option suivante est disponible : créez pour vos nœuds un attribut appelé « name » (sans tenir compte de la casse). Vous pouvez mettre en œuvre cet attribut sous la forme d’une colonne de votre fichier CSV, ou d’un attribut nommé dans un fichier GraphML.

Voir aussi : [travailler avec les ressources](/fr/design-protocols/key-concepts/resources#network).

## Libellés de nœuds personnalisés (avancé) {#custom-node-labeling-advanced}

<TipBox>

Les libellés de nœuds personnalisés ne sont pas pris en charge dans [Fresco](/fr/collect-data/fresco/about). Le `nodeLabelWorker` décrit ci-dessous ne s’exécute que dans Interviewer.

</TipBox>

Pour attribuer des libellés aux nœuds avec plus de souplesse, vous pouvez programmer une fonction de libellé personnalisée. Pour cela, il vous faut :

- Ajouter `nodeLabelWorker.js` à votre protocole (voir [Contenu d’un fichier .netcanvas](./the-protocol-file#inside-a-netcanvas-file) pour savoir comment procéder)
- Définir dans ce fichier une fonction nommée `nodeLabelWorker`
- Faire en sorte que cette fonction renvoie une chaîne de caractères, qui sera utilisée comme libellé.

`nodeLabelWorker` est appelée avec un objet contenant des informations sur le nœud et le réseau, et doit renvoyer le libellé (une chaîne de caractères) du nœud concerné. Conceptuellement : `f(node, network) -> label`. Vous pouvez ainsi mettre à jour les libellés des nœuds en fonction de l’évolution de l’état du réseau, ou des attributs de chaque nœud.

Voici un exemple simple qui attribue à chaque nœud un libellé composé (initiale + nom de famille) :

```javascript
/**
 * @param  {Object} data
 * @param  {Object} data.node All props for the node requiring a label
 * @param  {string} data.node.networkCanvasId Unique ID for the node. Note that if your data
 *                                            happens to already contain a property named
 *                                            "networkCanvasId", your prop will take precedence,
 *                                            and this cannot be used to identify edge connections.
 * @param  {Object} data.network The current state of the network in this session
 * @param  {Array} data.network.nodes Each node has a unique `networkCanvasId` prop
 * @param  {Array} data.network.edges Edges contain `to` and `from` props which
 *                                    correspond to nodes' `networkCanvasId` values
 *
 * @return {string|Promise} a label for the input node, or
 *                          a promise that resolves to the label
 */
function nodeLabelWorker({ node, network }) {
  return `${node.first_name[0]} ${node.last_name}`;
}
```

En plus des attributs définis dans le protocole, chaque nœud contient une propriété `networkCanvasId`, un identifiant unique qui permet de repérer le nœud dans le réseau.

La fonction `nodeLabelWorker` est exécutée de manière asynchrone dans un environnement [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) (documentation MDN en anglais). Elle est en outre limitée par la politique de sécurité du contenu (CSP) de l’application : ne comptez pas sur un accès à Internet (requêtes réseau) dans la fonction de libellé.

Pour un exemple plus complet, consultez [le nodeLabelWorker du protocole de développement](https://github.com/complexdatacollective/development-protocol/blob/master/nodeLabelWorker.js) (en anglais).
