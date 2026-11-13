---
title: Utiliser des données de liste
wip: false
navOrder: 2
translatedFrom: 365181d0e0314f85b07e843a5c61c5ab8b071d85
---

<SummaryCard duration="30 minutes">
<SummarySection>

Ce tutoriel décrit une méthode de travail pour utiliser des données de liste dans Network Canvas. Il présente des notions de base sur les formats de fichier ainsi que quelques stratégies d’utilisation des listes dans des classes et dans des études de réseaux complets.

</SummarySection>
<PrerequisitesSection>

Pour suivre ce tutoriel, vous devez :

- Connaître Network Canvas et son processus de collecte de données.
- Avoir accès à un tableur comme Microsoft Excel ou OpenOffice Calc
- Avoir accès à Network Canvas Interviewer et Architect (ouvrez-les dans votre navigateur, ou installez les applications de bureau Classic)

</PrerequisitesSection>
</SummaryCard>

## Qu’est-ce qu’une liste ? {#what-is-a-roster}

Une liste (une liste prédéfinie, importée comme fichier de données, dans laquelle la personne participante choisit) est un tableau dont chaque ligne peut devenir un nœud d’un réseau. Elle peut se composer des élèves d’une classe, des personnes qui travaillent dans un bureau ou des membres d’une équipe sportive. Une liste peut aussi comprendre des personnes mentionnées par une personne donnée lors d’enquêtes précédentes, des mots liés à une profession, ou tout élément qu’il est utile de désigner dans Network Canvas. Les listes sont couramment utilisées dans les études de réseaux complets, car on peut fusionner toutes les désignations entre l’ego (la personne participante, au centre de son réseau) et chaque alter (chaque personne que la personne participante cite pendant l’entretien) pour créer un réseau complet. Chaque personne du réseau complet désignerait d’autres personnes, puis l’équipe de recherche pourrait combiner ces désignations.

Nous avons évoqué plus haut les listes de « personnes mentionnées dans une enquête précédente ». Comme une liste appartient au protocole, toutes les personnes participantes interrogées avec ce protocole voient la même liste : Network Canvas ne prend pas en charge les listes propres à une personne participante donnée.

## Les listes dans Network Canvas {#rosters-in-network-canvas}

Dans une session d’entretien Network Canvas, lorsqu’une personne désigne des nœuds, il est possible de faire venir des nœuds depuis un panneau latéral. Ce panneau latéral contient généralement les « personnes déjà mentionnées ». Nous pouvons cependant aussi faire venir des nœuds depuis une liste prédéfinie. Nous verrons ci-dessous :

- comment créer cette liste,
- comment ajouter cette liste à un protocole existant,
- comment afficher la liste pendant un entretien,
- comment combiner les listes avec des panneaux latéraux et des attributs supplémentaires (l’« ensemble d’alters », ou alter pool),
- les problèmes de collision de noms possibles dans Interviewer,
- et, enfin, quelques conseils pour utiliser les listes dans les études sociocentrées.

Dans Network Canvas, une liste existe au niveau du protocole. Autrement dit, un protocole sert à recueillir des cas, chacun représentant une personne participante. Comme chaque cas commence une session d’entretien avec le même protocole, tous les cas ont accès à la même liste. La liste est ajoutée à votre protocole dans Architect et devient l’une de ses [ressources](/fr/design-protocols/key-concepts/resources) : elle voyage donc à l’intérieur du fichier `.netcanvas` qui est ouvert dans Interviewer.

## Comment créer une liste {#how-to-create-a-roster}

Une liste prédéfinie est un ensemble de nœuds potentiels. Pour éviter toute confusion, les éléments de cette liste seront appelés « entrées de la liste », car ce ne sont encore des nœuds dans aucun entretien. Cette liste d’entrées doit être préparée en dehors de Network Canvas, dans un tableur, puis exportée dans un type de fichier particulier : CSV, ou valeurs séparées par des virgules.

Voici un exemple de tableau :

| name  | var1 | v_2   | v3a                        |
| ----- | ---- | ----- | -------------------------- |
| Alice | 30   | True  | "Yes it’s the case"        |
| Barb  | 25   | False | "You can include strings!" |

Voici à quoi ressemble ce tableau une fois exporté en CSV

```
name, var1, v_2, v3a
Alice, 30, True, "Yes it's the case"
Barb, 25, False, "You can include strings!"
```

### Points à prendre en compte pour mettre en forme le fichier CSV {#considerations-for-formatting-the-csv-file}

Le format des valeurs séparées par des virgules est davantage un ensemble souple de conventions qu’une norme stricte. Vous pourriez donc créer par mégarde un fichier CSV qui ne s’ouvrira pas correctement dans Network Canvas. Voici quelques points essentiels à prendre en compte pour vos fichiers CSV :

- Le fichier CSV doit avoir une ligne d’en-tête pour les noms de variables.
- L’en-tête de la première colonne doit être `name`. C’est ce que verra la personne participante lorsque l’entrée de la liste deviendra un nœud.
- Les autres colonnes représentent des variables supplémentaires. Par exemple, il peut y avoir une colonne pour « club_member », « age », « profile page », etc. Ces variables peuvent être utiles lors du premier affichage d’une liste pendant un entretien. Elles sont aussi « transmises » : toute exportation de données de Network Canvas qui comprend ces entrées de la liste sous forme de nœuds comprendra aussi ces colonnes sous forme de variables.
- Comme les fichiers CSV utilisent des virgules pour séparer les colonnes, si vous voulez une colonne contenant une virgule, comme une colonne supplémentaire pour la ville et le pays (p. ex. « Toronto, Canada »), le fichier CSV doit placer `Toronto, Canada` entre guillemets pour qu’il soit clair qu’il s’agit d’une virgule littérale et non d’un séparateur de colonnes.
- Heureusement, si vous modifiez un tableau de données dans un tableur comme Microsoft Office ou OpenOffice Calc, l’exportation de ce tableau au format CSV règle pour vous ces problèmes de guillemets et de virgules. Nous déconseillons donc de créer des fichiers CSV dans des programmes comme TextEdit ou le Bloc-notes, car ils ne gèrent pas ces petits problèmes de mise en forme.
- Les lignes vides sont ignorées : une ligne vide entre deux lignes ou à la fin du fichier ne pose donc aucun problème.
- Même si le fichier CSV est valide, certains caractères ne peuvent pas y être utilisés. Les en-têtes de colonne deviennent des noms de variables : ils suivent donc à peu près les mêmes règles que tout autre nom de variable. Voir [En-têtes de colonne](#column-headings) et [Valeurs](#values) ci-dessous.

Remarque : la première colonne, appelée `name`, doit contenir le nom de l’entrée de la liste. Ces entrées n’ont toutefois pas besoin d’être des personnes. Rappelons que la flexibilité ontologique est l’un des principes de conception de Network Canvas. Vous pourriez donc enrichir une étude avec une liste de mots représentant des émotions, des concepts, des livres, des lieux, etc.

#### En-têtes de colonne {#column-headings}

Les en-têtes de colonne peuvent être écrits dans n’importe quelle langue et contenir des espaces et des signes de ponctuation : `género` (genre en espagnol), `club member` et `年龄` fonctionnent donc tous. Comme tout nom de variable, un en-tête :

- ne peut pas commencer ni se terminer par une espace
- ne peut pas contenir de tabulations, de sauts de ligne ni d’autres caractères de contrôle invisibles

Voir [Ce que peut contenir un nom](/fr/design-protocols/key-concepts/variables#what-a-name-can-contain) pour l’ensemble des règles. Lorsque vous saisissez un nom de variable, Architect supprime pour vous les espaces au début et à la fin. Il ne peut pas le faire pour un en-tête de votre fichier, car l’entretien lit chaque en-tête du fichier tel quel, et un en-tête comportant une espace à l’une de ses extrémités ne correspondrait jamais à une variable. Architect refuse donc cet en-tête. En pratique :

- **Espaces autour d’un en-tête.** Network Canvas ignore les espaces avant et après un en-tête qui n’est pas entre guillemets : ces en-têtes fonctionnent donc. Un en-tête entre guillemets conserve ses espaces : un en-tête écrit `" age"` dans le fichier est donc refusé.
- **Lettres accentuées.** Certains programmes, surtout sous macOS, enregistrent une lettre accentuée comme `é` sous la forme de deux caractères : un `e` simple suivi d’un accent. Architect accepte un en-tête enregistré de l’une ou l’autre manière, et la colonne correspond toujours à une variable du même nom. Il refuse un fichier contenant deux en-têtes qui sont le même nom écrit de ces deux manières, car une seule des deux colonnes pourrait renseigner cette variable.
- **En-têtes vides.** Une colonne dont l’en-tête est vide est nommée d’après sa position, par exemple `field3` pour la troisième colonne. Donnez un en-tête à chaque colonne, et supprimez les éventuelles colonnes vides à la fin de la feuille.

Évitez deux en-têtes qui ne diffèrent que par les majuscules, comme `Name` et `name` : Architect considère comme identiques les noms de variables qui ne diffèrent que par les majuscules, si bien que les deux colonnes sont faciles à confondre.

Architect Classic est plus strict. Si vous l’utilisez, commencez chaque en-tête par une lettre et n’utilisez que les lettres A à Z et a à z, des chiffres et des tirets bas. Par exemple, `género` ne fonctionnera pas dans Architect Classic, mais `genero` fonctionnera.

#### Valeurs {#values}

Les valeurs de votre liste peuvent être n’importe quel texte, dans n’importe quelle langue : vous n’avez donc pas besoin de modifier un nom comme « Verónica » ou « 王芳 ». Une cellule peut contenir des virgules, des guillemets, des tabulations et des sauts de ligne, à condition que la cellule soit placée entre guillemets (les tableurs le font pour vous lorsqu’ils enregistrent un fichier CSV).

Une cellule ne peut pas contenir d’autres caractères de contrôle invisibles. Ils ne peuvent pas être stockés dans les fichiers GraphML exportés : Architect refuse donc une liste qui en contient. Voir [Si Architect refuse votre liste](#if-architect-refuses-your-roster).

#### Si Architect refuse votre liste {#if-architect-refuses-your-roster}

Architect vérifie une liste lorsque vous l’ajoutez à votre protocole, et explique ce qu’il a trouvé s’il ne peut pas utiliser le fichier. Les problèmes les plus courants sont les suivants :

- **Un en-tête de colonne ne peut pas être utilisé comme nom de variable.** Cherchez un en-tête entre guillemets qui commence ou se termine par une espace, ou un en-tête qui s’étend sur deux lignes parce qu’un retour à la ligne a été saisi dans la cellule d’en-tête. Corrigez l’en-tête dans votre tableur et enregistrez de nouveau le fichier CSV.
- **Le fichier contient un caractère qui ne peut pas être utilisé.** Il s’agit d’un caractère de contrôle invisible, dans une cellule ou dans un en-tête. Ces caractères ne se voient pas et proviennent généralement de texte collé depuis un autre logiciel, comme un PDF, un traitement de texte ou une exportation de base de données.
- **Certaines lignes n’ont pas le même nombre de colonnes.** Faites correspondre chaque ligne à la ligne d’en-tête. Cela signifie généralement qu’une valeur contenant une virgule n’a pas été placée entre guillemets, ou que la ligne d’en-tête comporte une virgule en trop à la fin.

Lorsqu’un fichier contient un caractère qui ne peut pas être utilisé, le message indique où Architect l’a trouvé en premier, et à combien d’autres endroits le même problème se présente. Comme le caractère est invisible, le message le désigne par son point de code Unicode, comme U+0007 :

> La ligne 5 de la colonne « notes » contient un caractère qui ne peut pas être utilisé (U+0007). Supprimez-le du fichier, puis importez de nouveau le fichier. Le même problème apparaît à 2 autres endroits du fichier.

Les lignes sont numérotées comme dans un tableur, la ligne d’en-tête étant la ligne 1 : vous pouvez donc aller directement à la ligne dans votre tableur. Un caractère dans un en-tête est signalé par le numéro de la colonne, en comptant à partir de 1 depuis la gauche. Dans une liste au format JSON, le message désigne le nœud par sa position dans la liste des nœuds du fichier, en comptant à partir de 1, ainsi que l’attribut qui contient le caractère. Si le caractère empêche complètement la lecture du fichier, le message indique plutôt la ligne du fichier.

Pour supprimer les caractères de contrôle invisibles, ouvrez le fichier dans un tableur et utilisez sa fonction `CLEAN`, que proposent Microsoft Excel, Google Sheets et LibreOffice Calc (dans les versions en français d’Excel, de LibreOffice Calc et, selon vos réglages, de Google Sheets, elle s’appelle `EPURAGE`) :

1. Dans une colonne vide, saisissez `=CLEAN(C2)` (ou `=EPURAGE(C2)` dans un tableur en français), en remplaçant `C2` par la cellule indiquée par Architect.
2. Copiez le résultat, puis utilisez **Collage spécial** pour le coller sur la cellule d’origine en tant que valeurs uniquement.
3. Supprimez la colonne supplémentaire, puis enregistrez de nouveau le fichier au format CSV.

`CLEAN` (ou `EPURAGE`) supprime aussi les tabulations et les sauts de ligne de la cellule. Si Architect refuse toujours le fichier, supprimez le contenu de la cellule et saisissez-le de nouveau à la main.

## Ajouter la liste à un entretien Network Canvas {#adding-the-roster-to-a-network-canvas-interview}

Une fois votre liste prête, vous pouvez l’ajouter à un protocole Network Canvas depuis Architect. Choisissez ci-dessous la version d’Architect que vous utilisez : les captures d’écran et les remarques propres à chaque version s’adaptent en conséquence.

<AppSwitch>
  <AppOption label="Architect" icon="globe"></AppOption>
  <AppOption label="Architect Classic" icon="desktop"></AppOption>
</AppSwitch>

Vous pouvez ajouter la liste depuis la [bibliothèque de ressources](/fr/design-protocols/key-concepts/resources), accessible depuis l’écran de vue d’ensemble de tout protocole que vous modifiez.

<AppOnly app="current">

Dans Architect, votre protocole, y compris les ressources de liste que vous ajoutez, est enregistré automatiquement au fil de votre travail dans la [bibliothèque de protocoles (dans le navigateur)](/fr/design-protocols/saving-and-backing-up), et la liste est intégrée au fichier `.netcanvas` lorsque vous téléchargez le protocole.

</AppOnly>

<AppOnly app="classic">

Dans Architect Classic, votre protocole est un fichier `.netcanvas` stocké sur votre ordinateur, et la liste est enregistrée dans ce fichier lorsque vous enregistrez le protocole.

![Bouton de la bibliothèque de ressources](/assets/img/roster-tutorial/resource-button.png 'Le bouton de la bibliothèque de ressources dans un protocole dans Architect Classic')

</AppOnly>

Vous pouvez aussi ajouter la liste lorsque vous créez une étape « Générateur de noms à partir d’une liste ». Nous décrivons ci-dessous la marche à suivre pour configurer un générateur de noms, en ajoutant la liste au passage. Nous utiliserons une liste simple qui comprend cinq personnages de la série télévisée d’animation « Les Simpson », mais vous devriez pouvoir suivre la même démarche avec une liste que vous aurez créée. Le fichier CSV d’exemple est disponible <DownloadLink href="/assets/simpsons-roster.csv">ici</DownloadLink>.

### Sélectionner l’interface de générateur de noms {#selecting-the-name-generator-interface}

Pour utiliser une liste, sélectionnez l’interface « Générateur de noms à partir d’une liste ». Donnez un nom à l’étape (par exemple `roster_01`), puis créez ou sélectionnez un type de nœud. Dans l’exemple, nous avons créé un type de nœud appelé « person » (personne) : c’est donc celui-ci que nous choisissons. L’application demande ensuite la « Source des données de la liste ». Si vous avez déjà importé le fichier CSV dans la bibliothèque de ressources, vous pourrez le sélectionner. Sinon, vous pouvez l’importer maintenant.

<AppOnly app="classic">

![Interface « Générateur de noms à partir d’une liste »](/assets/img/roster-tutorial/roster-interface-selection.png 'L’interface « Générateur de noms à partir d’une liste », avec la section de sélection du nœud')

</AppOnly>

Avant de sélectionner la liste, il est utile de l’examiner pour vérifier qu’elle est correctement mise en forme. Chaque ressource de liste dispose d’un bouton d’aperçu (une icône en forme d’œil). Cliquer dessus affiche le fichier CSV qui a été importé.

<AppOnly app="classic">

![Bouton d’aperçu de la ressource](/assets/img/roster-tutorial/preview-roster-button.jpg 'L’écran de sélection des ressources, avec le bouton d’aperçu d’une ressource')

</AppOnly>

Avec `simpsons-roster`, vous pouvez constater que la cellule de la profession de Maggie est vide. Cela montre que les données ont été correctement mises en forme et que les colonnes sont toutes bien alignées.

<AppOnly app="classic">

![Aperçu de la ressource](/assets/img/roster-tutorial/example-roster-preview.png 'Une liste d’exemple affichée dans l’écran d’aperçu')

</AppOnly>

### Mettre en forme l’affichage de la liste {#formatting-the-display-of-the-roster}

Une fois une liste sélectionnée, les trois éléments suivants permettent de personnaliser l’apparence des entrées de la liste dans Interviewer. Les entrées de la liste s’affichent sous forme de cartes plutôt que de nœuds. Pour désigner un membre de la liste, la personne participante fait glisser sa carte dans le panneau des nœuds, ce qui la transforme en nœud et retire la carte de la liste. Pour une description complète de la façon dont les personnes participantes désignent les membres de la liste, consultez la [documentation de l’interface « Générateur de noms à partir d’une liste »](/fr/design-protocols/interface-documentation/name-generator-roster).

<AppOnly app="classic">

![Interface de liste dans Interviewer Classic](/assets/img/roster-tutorial/roster-interview-example.png 'Exemple d’interface de liste dans Interviewer Classic')

</AppOnly>

Par défaut, les cartes affichent le nom de l’entrée de la liste. Vous pouvez cependant ajouter d’autres informations sur la carte en activant l’« Affichage des cartes » (« Card display options » dans Architect Classic, dont l’interface est en anglais). Vous pourrez alors choisir, parmi les colonnes supplémentaires du fichier CSV, celles à afficher sous le nom. La liste déroulante de gauche permet de choisir la colonne du fichier CSV, et l’élément de droite permet de donner un autre libellé à cette variable. Ainsi, dans l’exemple `simpsons-roster`, alors que le fichier CSV avait une colonne appelée `gender` (en minuscules), nous écrirons `Gender` pour l’affichage sur la carte.

<AppOnly app="classic">

![Options d’affichage des cartes](/assets/img/roster-tutorial/roster-card-options.png 'Le panneau des options d’affichage des cartes dans Architect Classic')

</AppOnly>

Comme une liste peut comporter un grand nombre de personnes à parcourir, vous pouvez aussi permettre de trier les cartes selon une valeur. Si nous ajoutons la profession, la personne participante pourra trier la liste par profession pendant l’entretien.

Enfin, vous pouvez permettre aux personnes participantes de rechercher parmi les entrées de la liste à l’aide d’un champ de recherche. Sélectionner le nom et choisir « Précision faible » dans « Précision de la recherche » permet de trouver une personne en saisissant des caractères proches de son nom, même s’ils ne sont pas exacts.

<AppOnly app="current">

Dans un protocole rédigé en plusieurs langues (voir [Traduire votre protocole](/fr/design-protocols/translating-your-protocol)), les libellés donnés aux informations des cartes et aux options de tri sont traduits comme n’importe quel autre texte, mais pas les valeurs de la liste. Une liste est une ressource, et son contenu est le même dans toutes les langues. Lorsque les personnes participantes liront des valeurs de la liste, comme des professions ou des intitulés de cours, vérifiez qu’elles seront comprises par les personnes participantes de chacune des langues du protocole.

</AppOnly>

### Formuler une consigne pour les entrées de la liste {#prompting-for-a-roster-item}

Comme dans les autres interfaces de type générateur de noms, l’interface a besoin d’une consigne pour que l’on puisse sélectionner des entrées de la liste. Elle peut être aussi simple que « Veuillez sélectionner les personnes que vous connaissez » ; nous encourageons toutefois vivement les équipes de recherche à envisager des consignes éprouvées, couramment utilisées dans la littérature, ou des consignes soigneusement liées à une question de recherche. Vous pouvez utiliser plusieurs consignes dans la même interface.

> N’oubliez pas que vous pouvez utiliser plusieurs consignes dans la même interface, mais que sans ajouter d’attributs supplémentaires, vous ne pourrez pas déterminer quelle consigne a fait apparaître quel nœud.

## Prendre en compte les attributs supplémentaires des consignes : qu’est-ce qu’un ensemble d’alters ? {#considering-additional-prompt-variables-what-is-an-alter-pool}

Une entrée de la liste ne peut être ajoutée à l’entretien qu’une seule fois (ou plus précisément, une fois par type de nœud et par entretien). Cela a des conséquences si vous avez plusieurs consignes qui ne s’excluent pas mutuellement. Imaginez par exemple que vous demandiez aux personnes de désigner les camarades de classe avec qui elles étudient. Une seconde consigne pourrait ensuite porter sur les camarades de classe qu’elles connaissaient avant cette année. Qu’en est-il d’une personne qui remplit les deux conditions ? C’est là que l’on peut penser, sur le plan conceptuel, à un « ensemble d’alters » (alter pool), dans lequel on puise ensuite d’une consigne à l’autre.

Pour gérer les cas où des alters pourraient correspondre à plusieurs consignes, il est utile de faire deux choses :

- Utiliser la fonction [« Attributs supplémentaires »](/fr/design-protocols/key-concepts/additional-variables) lors de la création d’une consigne.
- Utiliser le panneau des personnes « déjà mentionnées » pendant l’entretien.

Affecter un attribut supplémentaire à une consigne signifie que cette consigne ne se contente pas de créer un nœud : elle lui attribue aussi des données supplémentaires. Nous utilisons généralement un attribut booléen par consigne. Si vous avez une consigne pour les camarades de classe avec qui la personne étudie, vous devriez donc aussi affecter un attribut supplémentaire « study_together » et le définir sur True. Faites ensuite de même pour la consigne sur les personnes connues avant cette année. Lorsque vous examinerez vos données plus tard, vous aurez deux colonnes supplémentaires. Les personnes désignées dans la consigne `study_together` auront `True` dans cette colonne, et les personnes désignées dans la consigne `known_before` auront `True` dans la leur.

Comme une entrée de la liste ne peut devenir un nœud qu’une seule fois, si des personnes ont été créées dans la première consigne, `study_together`, il nous faut un autre moyen de les inclure dans la consigne `known_before`. C’est pourquoi nous utilisons un panneau latéral. Les panneaux latéraux sont disponibles dans les interfaces [« Générateur de noms (avec formulaires) »](/fr/design-protocols/interface-documentation/name-generator-using-forms) et [« Générateur de noms (ajout rapide) »](/fr/design-protocols/interface-documentation/name-generator-using-quick-add).

Avec une étape « Générateur de noms (ajout rapide) », nous pouvons désigner de nouveaux nœuds à l’aide du bouton de nouveau nœud, en bas à droite. Mais sur le côté gauche, nous pouvons avoir un panneau latéral. Nous pouvons même en avoir deux : un pour les personnes déjà désignées, qui font désormais partie de l’ensemble d’alters, et un pour les entrées de la liste qui n’ont pas encore été désignées.

<AppOnly app="classic">

Voici un exemple d’un tel écran dans Interviewer Classic, où certains des Simpson sont déjà désignés (dans l’ensemble d’alters) et d’autres sont encore dans la liste.

![Panneaux latéraux dans un générateur de noms](/assets/img/roster-tutorial/quick-add-roster-side-panel.png 'Un générateur de noms dans Interviewer Classic, avec des panneaux latéraux pour la liste et pour les nœuds déjà mentionnés')

</AppOnly>

Nous vous recommandons d’ajouter à l’ensemble d’alters tous les nœuds possibles _avant_ d’ajouter des informations supplémentaires, afin de pouvoir ajouter ces informations à _tous_ les nœuds désignés plutôt que de faire des allers-retours dans le protocole. En effet, toutes les étapes puisent dans le même ensemble d’alters si elles utilisent ce type de nœud. Imaginez le scénario suivant : la personne participante ajoute des nœuds à l’étape 3, ajoute quelques informations à l’étape 4, comme la proximité entre l’ego et chaque alter, puis ajoute d’autres nœuds à l’étape 5. Ces nœuds nouvellement ajoutés seront disponibles si l’on revient à l’étape 4. Notez aussi que la liste ne change pas une fois qu’elle est dans Interviewer. Toutes les données que vous ajoutez sur un nœud issu d’une liste seront donc disponibles lorsque vous exporterez votre cas, mais elles ne seront pas associées à cette entrée de la liste dans les cas d’entretien suivants.

## À partir de quelle taille une liste est-elle trop grande ? {#how-large-is-too-large-for-a-roster}

Le « Générateur de noms à partir d’une liste » est une interface unique qui adapte la présentation des membres de la liste à la taille de votre liste. Une petite liste affiche une carte pour chaque membre, que la personne participante peut parcourir et trier. Avec une liste plus grande, la personne participante utilise plutôt le champ de recherche pour trouver des membres avant que des cartes ne s’affichent. Les très grandes listes sont prises en charge (nous avons testé avec succès une liste de 60 000 entrées), mais le chargement et la recherche ralentissent considérablement à cette échelle : testez donc votre protocole sur les appareils de terrain que vous prévoyez d’utiliser. Consultez les [indications sur la taille des listes](/fr/design-protocols/interface-documentation/name-generator-roster) dans la documentation de l’interface pour plus de détails.

## Écueil possible : listes et collisions de noms {#potential-pitfall-rosters-and-name-collisions}

En ce qui concerne les listes, quelques situations dans Network Canvas peuvent conduire à des données incorrectes si elles ne sont pas bien prises en compte. Ces problèmes tiennent principalement au fait que le [libellé](/fr/design-protocols/key-concepts/node-labelling) d’un nœud dans Network Canvas provient de la variable `name`. Lorsque la personne participante relie des nœuds ou leur attribue des données supplémentaires, s’il y a deux personnes avec la même valeur pour `name`, il peut être difficile de les distinguer. Voici deux exemples et quelques solutions de contournement proposées :

### Collision de type 1. Collisions au sein de la liste elle-même. {#collision-type-1-collisions-within-the-roster-list-itself}

Imaginez une liste avec deux personnes prénommées Kwame. L’une est Kwame Kenyatta et l’autre Kwame Nkrumah. Si la personne participante connaît ces deux personnes, son ensemble d’alters contiendra deux Kwame, et la personne participante ne pourra pas les distinguer par la suite. Même si la carte de la liste peut afficher leur nom de famille, l’icône du nœud indiquera simplement « Kwame » pour les deux. C’est ce que l’on appelle une collision de noms.

En interne, le programme aura attribué à chacun de ces nœuds un UUID unique, mais la personne participante ne pourra pas savoir qui est qui.

Solution possible : lors de l’importation d’une liste, Network Canvas ne vérifie pas que la colonne des noms ne contient que des entrées uniques. Vous pouvez toutefois le faire lorsque vous préparez votre liste. Une façon de procéder consiste à copier la colonne des noms dans une feuille vierge, à la sélectionner, puis à choisir « Données » - « Outils de données » - « Supprimer les doublons » dans Excel (dans Calc, choisissez « Données » - « Plus de filtres » - « Filtre standard » et cochez « Sans doublons »). Si la liste copiée raccourcit, certains noms apparaissent plusieurs fois. Ne supprimez pas les répétitions de votre liste, car deux personnes différentes peuvent porter le même nom. Rendez plutôt chaque nom unique. Une façon de le faire consiste à créer une nouvelle variable de nom qui combine le prénom et le nom de famille. Vous pouvez le faire à la main ou à l’aide d’une formule dans Excel.

Nous déconseillons de modifier le nom dans Network Canvas une fois qu’il a été créé, à la fois pour des raisons techniques et parce que vous risquez de ne plus pouvoir déterminer qu’il s’agit du même Kwame ou du Kwame_Nk de la liste lorsque vous comparez les données de plusieurs personnes. Rappelons qu’avec une liste, on souhaite généralement fusionner les données des personnes participantes pour voir qui désigne qui.

### Collision de type 2. Collisions dues à l’existence d’un nœud portant déjà ce nom {#collision-type-2-collisions-because-there-is-already-a-node-with-that-name}

Le second type de collision se produit lorsque le nom en double apparaît parce que la personne participante désigne une personne extérieure à la liste qui porte le même nom. Imaginez un premier écran avec une liste où la personne désigne « Kwame », puis désigne un autre Kwame dans une étape « Générateur de noms (ajout rapide) » ou « Générateur de noms (avec formulaires) ». Network Canvas ne vous avertira pas qu’il existe déjà un nœud nommé Kwame dans l’ensemble d’alters. Cette situation doit être gérée par une personne formée pour mener l’entretien, et la personne participante doit être encouragée à utiliser des noms uniques.

N’oubliez pas que si la personne participante crée un nouveau nœud avec un nom en double et souhaite le supprimer, elle peut faire glisser le nœud : une corbeille apparaît alors. Faites glisser le nœud dans la corbeille et créez un nouveau nœud avec un nom plus descriptif et plus unique.

## Conseils pour les listes dans les études sociocentrées {#tips-for-rosters-in-sociocentric-studies}

Une étude sociocentrée est une étude qui s’intéresse aux relations entre les personnes à l’intérieur d’une limite de réseau donnée. Pour commencer simplement, imaginons que seules les relations entre l’ego et les alters nous intéressent. Autrement dit, nous ne cherchons pas à savoir si une personne de la classe pense que deux autres personnes sont amies. Nous voulons simplement que les personnes désignent leurs pairs. Ces données peuvent ensuite être converties en un réseau complet sous forme de matrice, au prix d’un certain travail de préparation des données. Nous ne présentons pas ici cette préparation, mais, d’après notre expérience, nous pouvons indiquer quelques étapes qui facilitent ce processus.

Rappelons que la matrice d’adjacence d’un réseau comporte des lignes et des colonnes. Les lignes représentent les données des personnes participantes et les colonnes sont les cibles (c’est-à-dire les personnes que les personnes participantes ont désignées). Comme il s’agit d’une étude sociocentrée, les lignes et les colonnes doivent porter les mêmes noms. Dans le tableau simple suivant, on voit une classe de quatre élèves. « Alice » désigne « Bob » et « Cam » comme amis. « Dot » désigne tout le monde comme ami, tandis que « Bob » et « Cam » ne se désignent que l’un l’autre. La matrice obtenue serait la suivante :

| name  | Alice | Bob | Cam | Dot |
| ----- | ----- | --- | --- | --- |
| Alice | \-    | 1   | 1   | 0   |
| Bob   | 0     | \-  | 1   | 0   |
| Cam   | 0     | 1   | \-  | 0   |
| Dot   | 1     | 1   | 1   | \-  |

Dans le cas d’une liste dans Network Canvas, chaque personne participante fournirait une ligne. Vous remarquerez que la diagonale contient `-`. C’est parce que, sur le plan conceptuel, on ne considère pas que les personnes puissent se désigner elles-mêmes dans ce type de travail (même si cela dépend de la question de recherche).

Pour recueillir ce type de données dans Network Canvas, nous pouvons utiliser une liste et ne recueillir que les désignations des personnes participantes. Nous aimerions cependant que la personne participante s’identifie dans la liste, afin qu’elle ne soit plus proposée dans les questions suivantes. Pour cela, nous pouvons combiner plusieurs fonctionnalités de Network Canvas :

1. Nous pouvons créer une étape « identifiez-vous » avec une seule consigne, et fixer à 1 le nombre minimum et maximum d’alters de l’étape.
2. Nous pouvons associer un attribut supplémentaire appelé `is_ego` et le définir sur True pour ce seul nœud.
3. Comme les entrées de la liste ne deviennent des nœuds qu’une seule fois, l’ego ne sera alors plus proposé dans les consignes de liste suivantes.
4. L’ego reste cependant dans l’ensemble d’alters : chaque fois que nous voulons faire quelque chose avec les alters, comme demander des données sur la fréquence de communication, nous devons donc exclure l’ego, ce que nous pouvons faire avec le [filtrage au niveau de l’étape](/fr/design-protocols/key-concepts/network-filtering) et notre variable `is_ego`.

Vous trouverez <DownloadLink href="/protocols/Roster Example Protocol v1.netcanvas">ici</DownloadLink> un protocole qui comprend toutes ces fonctionnalités. Il contient la petite liste avec Alice, Bob, Cam et Dot, mais vous pouvez la remplacer par votre propre liste et l’adapter à vos besoins.
