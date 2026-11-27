---
title: Libellés des nœuds
navOrder: 13
translatedFrom: 16f0a31bf39a92b6aec134b3022dba22baa9066b
---

## Comment le libellé d’un nœud est choisi {#how-a-nodes-label-is-chosen}

Chaque nœud est affiché avec un libellé : sur un sociogramme, dans la liste d’un générateur de noms, dans une case, et partout où le texte d’une étape [insère](/fr/design-protocols/key-concepts/piped-text) le **Libellé du nœud**. L’entretien choisit le libellé de chaque nœud de la façon suivante :

1. Si le type du nœud a un [libellé dynamique](#dynamic-labels), le nœud affiche ce libellé.
2. Sinon, le nœud affiche son libellé par défaut, tiré des données propres au nœud : un attribut nommé « name » ; à défaut, un attribut dont le nom contient « name » ; à défaut, pour des données importées, une colonne dont le nom contient « name », même si le [livre de codes](/fr/design-protocols/key-concepts/codebook) ne la mentionne pas ; à défaut, le premier attribut de type texte qui a une valeur.
3. Un nœud qui n’a rien de tout cela s’affiche avec le libellé « Sans nom ».

Si un nœud affiche un libellé inattendu, vérifiez que son type a un attribut nommé « name » et que cet attribut reçoit une valeur pendant l’entretien.

## Attribuer un libellé aux nœuds issus d’une liste prédéfinie {#labeling-nodes-from-roster-data}

Pour contrôler le libellé des nœuds issus d’un fichier de réseau ajouté comme ressource et utilisé comme liste (une liste prédéfinie, importée comme fichier de données, dans laquelle la personne participante choisit), donnez à vos nœuds un attribut appelé « name » (sans tenir compte de la casse). Vous pouvez mettre en œuvre cet attribut sous la forme d’une colonne de votre fichier CSV, ou d’un attribut nommé dans un fichier GraphML.

Voir aussi : [travailler avec les ressources](/fr/design-protocols/key-concepts/resources#network).

## Libellés dynamiques {#dynamic-labels}

Un libellé dynamique est un libellé que vous rédigez vous-même pour un type de nœud. Il remplace le libellé par défaut sur tous les nœuds de ce type, et il peut changer d’un nœud à l’autre et au cours de l’entretien : il peut afficher les attributs d’un nœud, et il peut afficher un texte différent selon ces attributs ou selon la place du nœud dans le réseau, par exemple le nombre de liens qu’il a.

Les libellés dynamiques sont une fonctionnalité avancée. La plupart des protocoles n’en ont pas besoin, car le libellé par défaut affiche déjà le nom de chaque nœud.

Les libellés dynamiques fonctionnent dans Interviewer et dans [Fresco](/fr/collect-data/fresco/about). Ils font partie du protocole lui-même : aucun fichier supplémentaire n’est nécessaire.

### Activer un libellé dynamique {#turning-on-a-dynamic-label}

1. Dans Architect, ouvrez le **Livre de codes** et modifiez le type de nœud. Vous pouvez aussi le faire depuis une étape, lorsque vous créez un type de nœud ou modifiez celui que l’étape utilise.
2. Activez **Libellé dynamique**.
3. Rédigez le libellé dans le champ **Libellé**.
4. Enregistrez le type de nœud.

Si vous désactivez de nouveau **Libellé dynamique**, le libellé que vous avez rédigé est supprimé et le type de nœud retrouve son libellé par défaut.

### Rédiger le libellé {#writing-the-label}

Le libellé est une seule ligne de texte. Vous pouvez saisir du texte ordinaire et des emojis, et insérer deux sortes d’éléments avec le bouton **Attribut** de la barre d’outils du champ, ou en saisissant `{`.

**Attributs.** Un attribut s’affiche sous la forme d’une pastille : sur chaque nœud, le libellé affiche à sa place la valeur de ce nœud. Vous pouvez insérer n’importe quel attribut du type de nœud, ou le **Libellé par défaut**, c’est-à-dire le libellé que le nœud aurait eu sans libellé dynamique. Par exemple, un libellé composé du libellé par défaut suivi de l’âge du nœud affiche « Alice 34 » sur un nœud et « Bo 27 » sur un autre. Un attribut peut n’avoir aucune valeur pour certains nœuds, et une valeur manquante n’affiche rien. Voir [Lorsque l’information manque](/fr/design-protocols/key-concepts/piped-text#when-information-is-missing).

**Attributs dynamiques.** Un attribut dynamique est un mot ou une expression qui change d’un nœud à l’autre. Choisissez **Créer un attribut dynamique** sous **Attributs dynamiques** dans la liste, choisissez sa **Logique**, puis rédigez chaque version :

- **Si … sinon** affiche une version lorsque les règles que vous définissez sont satisfaites, et une autre sinon. **Sauf si … sinon** fait l’inverse.
- **Formulation différente pour chaque réponse** affiche une version pour chaque réponse à un attribut catégoriel, ordinal ou booléen.
- **Formulation pour les nombres au singulier ou au pluriel** affiche une version pour chaque forme du nombre, comme « 1 enfant » et « 3 enfants ».

Un attribut dynamique appartient au libellé : il peut donc être utilisé plusieurs fois dans le libellé, et une modification apportée à cet attribut s’applique partout où il est utilisé dans le libellé. Sélectionnez sa pastille pour le modifier. Ses versions sont de simples mots. Une version peut être laissée vide : rien n’est alors affiché à la place de la pastille. Voir [Attributs dynamiques](/fr/design-protocols/key-concepts/piped-text#dynamic-attributes).

### Règles {#rules}

Un **Si** teste des règles sur le nœud qui affiche le libellé. Définissez-les sous **Règles de « Si »**, dans les paramètres de l’attribut dynamique. Une règle peut tester :

- un attribut du nœud, par exemple si son âge est d’au moins 18 ;
- si le nœud a un lien d’un type donné, ou un attribut de l’un de ses liens ;
- le nombre de liens du nœud, d’un type ou de tout type. Ce nombre peut être comparé à un nombre que vous indiquez (exactement, plus de, au plus, etc.) ou aux autres nœuds du même type : **Est le plus élevé parmi les nœuds de son type** et **Est le plus faible parmi les nœuds de son type**. Les nœuds à égalité pour le nombre le plus élevé, ou pour le plus faible, satisfont tous la règle. Aucun nœud ne la satisfait lorsque tous les nœuds du type ont le même nombre de liens.

Lorsqu’un **Si** a plusieurs règles, vous choisissez sous **Correspondance** si elles doivent toutes être satisfaites ou si une seule suffit.

**Ajouter « Sinon, si »** ajoute une version supplémentaire avec ses propres règles, vérifiée lorsque les versions précédentes ne s’appliquent pas. La dernière version, **Sinon**, s’affiche lorsqu’aucune des autres ne s’applique.

Par exemple, pour signaler la personne la mieux connectée sur un sociogramme, rédigez le libellé par défaut suivi d’un attribut dynamique avec **Si … sinon**, dont la règle est que le nombre de liens « connaît » est le plus élevé parmi les nœuds de son type. Faites de sa première version un emoji étoile, et laissez la version **Sinon** vide. À mesure que la personne participante trace des liens, l’étoile passe au nœud qui en a le plus.

### Comment les personnes participantes voient un libellé dynamique {#how-participants-see-a-dynamic-label}

Les personnes participantes ne voient que le libellé final. Il s’affiche partout où le nœud est dessiné, et partout où le texte d’une étape insère le libellé du nœud. Le libellé est recalculé chaque fois que les attributs ou les liens du nœud changent : il reste donc à jour tout au long de l’entretien.

Un libellé dynamique ne change que ce qui est affiché. Il n’est pas enregistré avec le nœud et n’est pas exporté : les attributs du nœud sont exportés comme d’habitude.

### Traduire un libellé dynamique {#translating-a-dynamic-label}

Dans un protocole en plusieurs langues, un libellé dynamique se traduit dans le [tableau des traductions](/fr/design-protocols/tutorials/translating-your-protocol#the-translation-table), comme toute autre chaîne traduisible qui affiche des valeurs. La logique de ses attributs dynamiques est la même dans toutes les langues, et seule la formulation de chaque version est traduite.

### Protocoles qui utilisaient un script de libellés de nœuds {#protocols-that-used-a-node-label-worker}

Les protocoles créés pour d’anciennes versions d’Interviewer pouvaient attribuer un libellé aux nœuds à l’aide d’un script, `nodeLabelWorker.js`, placé dans le fichier du protocole. Ni les versions actuelles d’Interviewer ni Fresco n’exécutent de scripts. Utilisez plutôt un libellé dynamique.
