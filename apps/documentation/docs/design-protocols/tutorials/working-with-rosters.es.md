---
title: Trabajar con listas predefinidas
wip: false
navOrder: 2
translatedFrom: dc4f216e2ab188b2bf96abf919cb8d5da6b08114
---

<SummaryCard duration="30 minutos">
<SummarySection>

Este tutorial describe un flujo de trabajo para usar los datos de una lista
predefinida en Network Canvas. Incluye conceptos básicos sobre formatos de archivo y
algunas estrategias para usar listas predefinidas en aulas y en estudios de redes completas.

</SummarySection>
<PrerequisitesSection>

Para seguir el tutorial, debes:

- Conocer Network Canvas y su proceso de recopilación de datos.
- Tener acceso a un programa de hojas de cálculo, como Microsoft Excel u OpenOffice Calc.
- Tener acceso a Network Canvas Interviewer y a Architect (puedes abrirlos en tu navegador o instalar las aplicaciones Classic de escritorio).

</PrerequisitesSection>
</SummaryCard>

## ¿Qué es una lista predefinida? {#what-is-a-roster}

Una lista predefinida (una lista que se importa como archivo de datos) es aquella en la que cada fila puede llegar a convertirse en un nodo de una red. Puede estar formada por el alumnado de una clase, la plantilla de una oficina o las personas que integran un equipo deportivo. Una lista predefinida también puede incluir a las personas que alguien mencionó en encuestas anteriores, palabras relacionadas con una profesión o cualquier otro tipo de elemento cuando sea útil nombrar a miembros de esa lista en Network Canvas. Las listas predefinidas se suelen usar en estudios de redes completas, ya que permiten combinar todas las nominaciones entre el ego (la persona entrevistada) y cada álter (cada persona a la que se nombra durante la entrevista) para crear una red completa. Cada persona de la red completa nombraría a otras, y después el equipo de investigación podría combinar esas nominaciones.

Más arriba hemos hablado de listas de «personas mencionadas en una encuesta anterior». Como una lista predefinida pertenece al protocolo, todas las personas participantes a las que se entrevista con ese protocolo ven la misma lista: Network Canvas no admite listas predefinidas específicas de cada participante.

## Las listas predefinidas en Network Canvas {#rosters-in-network-canvas}

En una sesión de entrevista de Network Canvas, cuando una persona nombra nodos, podemos traer nodos desde un panel lateral. Normalmente, este panel lateral incluiría las «personas ya mencionadas». Sin embargo, también podemos traer nodos desde una lista definida de antemano. A continuación explicamos:

- cómo crear esta lista predefinida,
- cómo añadirla a un protocolo existente,
- cómo mostrar la lista en una entrevista,
- cómo combinar las listas predefinidas con paneles laterales y atributos adicionales (el «conjunto de álteres»),
- las posibles colisiones de nombres en Interviewer,
- y, por último, algunos consejos para usar listas predefinidas en estudios sociocéntricos.

En Network Canvas, una lista predefinida pertenece al protocolo. Es decir, un protocolo se usa para recoger casos, cada uno de los cuales representa a una persona participante. Como cada caso inicia una sesión de entrevista con el mismo protocolo, todos los casos tienen acceso a la misma lista. La lista se añade a tu protocolo en Architect y pasa a ser uno de sus [recursos](/es/design-protocols/key-concepts/resources), así que viaja dentro del archivo `.netcanvas` que se abre en Interviewer.

## Cómo crear una lista predefinida {#how-to-create-a-roster}

Una lista predefinida es una lista de posibles nodos. Para evitar confusiones, llamaremos a sus entradas «elementos» o elementos de la lista, porque todavía no son nodos en ninguna entrevista. Esta lista de elementos se debe preparar fuera de Network Canvas, en un programa de hojas de cálculo, y exportar en un tipo de archivo especial: CSV, o valores separados por comas.

Este es un ejemplo de tabla:

| name  | var1 | v_2   | v3a                        |
| ----- | ---- | ----- | -------------------------- |
| Alice | 30   | True  | "Yes it's the case"        |
| Barb  | 25   | False | "You can include strings!" |

Este es el aspecto de la tabla cuando se exporta a CSV:

```
name, var1, v_2, v3a
Alice, 30, True, "Yes it's the case"
Barb, 25, False, "You can include strings!"
```

### Aspectos que hay que tener en cuenta al dar formato al archivo CSV {#considerations-for-formatting-the-csv-file}

El formato de valores separados por comas es más un conjunto flexible de convenciones que un estándar estricto. Esto significa que podrías crear sin querer un CSV que no se abra correctamente en Network Canvas. Estos son algunos aspectos clave que debes tener en cuenta en tus archivos CSV:

- El archivo CSV debe tener una fila de encabezado con los nombres de las variables.
- El encabezado de la primera columna debe ser `name`. Es lo que verá la persona participante cuando el elemento de la lista se convierta en un nodo.
- El resto de las columnas representan variables adicionales. Por ejemplo, podría haber una columna para "club_member", "age", "profile page", etc. Estas variables pueden ser útiles al mostrar inicialmente una lista predefinida en una entrevista. Además, se conservan, de modo que cualquier exportación de datos de Network Canvas que incluya estos elementos de la lista como nodos también incluirá estas columnas como variables.
- Como los CSV usan comas para separar las columnas, si quieres una columna que contenga una coma, como una columna adicional para la ciudad y el país (por ejemplo, "Toronto, Canada"), el CSV debe encerrar `Toronto, Canada` entre comillas para saber que se trata de una coma literal y no de un separador de columnas.
- Por suerte, si editas una tabla de datos en un programa de hojas de cálculo como Microsoft Office u OpenOffice Calc, al exportar esa hoja de cálculo como CSV el programa se ocupa por ti de los problemas con las comillas y las comas. Por eso no recomendamos crear archivos CSV en programas como TextEdit o el Bloc de notas, ya que no gestionan estos pequeños problemas de formato.
- Las líneas en blanco se ignoran, así que una línea vacía entre filas o al final del archivo no causa ningún problema.
- Aunque el CSV sea válido, hay algunos caracteres que no se pueden usar en él. Los encabezados de las columnas se convierten en nombres de variables, así que siguen prácticamente las mismas reglas que cualquier otro nombre de variable. Consulta [Encabezados de las columnas](#column-headings) y [Valores](#values), más abajo.

Nota: esperamos que la primera columna, llamada `name`, contenga el nombre del elemento de la lista. Sin embargo, estos elementos no tienen por qué ser personas. Recuerda que la flexibilidad ontológica es uno de los principios de diseño de Network Canvas. Así que podrías enriquecer un estudio con una lista predefinida de palabras que representen emociones, conceptos, libros, lugares, etc.

#### Encabezados de las columnas {#column-headings}

Los encabezados de las columnas se pueden escribir en cualquier idioma y pueden incluir espacios y signos de puntuación, así que `género` (en español), `club member` y `年龄` funcionan sin problema. Como cualquier nombre de variable, un encabezado:

- no puede empezar ni terminar con un espacio
- no puede contener tabulaciones, saltos de línea ni otros caracteres de control invisibles

Consulta [Qué puede contener un nombre](/es/design-protocols/key-concepts/variables#what-a-name-can-contain) para ver todas las reglas. Cuando escribes un nombre de variable, Architect elimina por ti los espacios del principio y del final. No puede hacerlo con un encabezado de tu archivo, porque la entrevista lee cada encabezado del archivo tal como está, y un encabezado con un espacio en cualquiera de sus extremos nunca coincidiría con una variable. Por eso, Architect rechaza ese encabezado. En la práctica:

- **Espacios alrededor de un encabezado.** Network Canvas ignora los espacios antes y después de un encabezado que no está entre comillas, así que esos encabezados funcionan. Un encabezado entre comillas conserva sus espacios, así que uno escrito como `" age"` en el archivo se rechaza.
- **Letras con tilde.** Algunos programas, sobre todo en macOS, guardan una letra con tilde, como `é`, como dos caracteres: una `e` sin tilde seguida de la tilde. Architect acepta un encabezado guardado de cualquiera de las dos formas, y la columna sigue coincidiendo con una variable que tenga el mismo nombre. Lo que rechaza es un archivo con dos encabezados que sean el mismo nombre escrito de estas dos formas, porque solo una de las dos columnas podría completar esa variable.
- **Encabezados vacíos.** Una columna con el encabezado vacío recibe un nombre según su posición, como `field3` para la tercera columna. Pon un encabezado a cada columna y elimina las columnas vacías que haya al final de la hoja.

Evita dos encabezados que solo se diferencien en el uso de mayúsculas y minúsculas, como `Name` y `name`: Architect trata como el mismo nombre los nombres de variables que solo se diferencian en las mayúsculas y minúsculas, así que es fácil confundir las dos columnas.

Architect Classic es más estricto. Si lo usas, empieza cada encabezado con una letra y usa solo las letras de la A a la Z (mayúsculas y minúsculas), números y guiones bajos. Por ejemplo, `género` no funciona en Architect Classic, pero `genero` sí.

#### Valores {#values}

Los valores de tu lista predefinida pueden ser cualquier texto, en cualquier idioma, así que no tienes que cambiar el formato de un nombre como "Verónica" o "王芳". Una celda puede contener comas, comillas, tabulaciones y saltos de línea, siempre que la celda esté entre comillas (los programas de hojas de cálculo lo hacen por ti cuando guardan un archivo CSV).

Una celda no puede contener otros caracteres de control invisibles. Estos caracteres no se pueden almacenar en los archivos GraphML exportados, así que Architect rechaza las listas predefinidas que los contienen. Consulta [Si Architect rechaza tu lista predefinida](#if-architect-refuses-your-roster).

#### Si Architect rechaza tu lista predefinida {#if-architect-refuses-your-roster}

Architect comprueba la lista predefinida cuando la añades a tu protocolo y, si no puede usar el archivo, explica qué ha encontrado. Los problemas más habituales son:

- **Un encabezado de columna no se puede usar como nombre de variable.** Busca un encabezado entre comillas que empiece o termine con un espacio, o uno que ocupe dos líneas porque se escribió un salto de línea dentro de la celda del encabezado. Corrige el encabezado en tu hoja de cálculo y vuelve a guardar el archivo CSV.
- **El archivo contiene un carácter que no se puede usar.** Se trata de un carácter de control invisible, en una celda o en un encabezado. Estos caracteres no se ven y suelen llegar con texto pegado desde otro software, como un PDF, un procesador de textos o una exportación de una base de datos.
- **Algunas filas tienen un número de columnas distinto.** Haz que cada fila coincida con la fila de encabezado. Normalmente esto significa que un valor que contiene una coma no estaba entre comillas, o que la fila de encabezado tiene una coma de más al final.

Cuando un archivo contiene un carácter que no se puede usar, el mensaje indica dónde lo encontró Architect por primera vez y en cuántos otros lugares aparece el mismo problema. Como el carácter es invisible, el mensaje lo identifica por su punto de código Unicode, como U+0007:

> La fila 5 de la columna «notes» contiene un carácter que no se puede usar (U+0007). Elimínalo del archivo y vuelve a importarlo. El mismo problema aparece en 2 lugares más del archivo.

Las filas se numeran como lo hace una hoja de cálculo, con la fila de encabezado como fila 1, así que puedes ir directamente a la fila en tu hoja de cálculo. Si el carácter está en un encabezado, se indica el número de la columna, contando desde 1 por la izquierda. En una lista predefinida en formato JSON, el mensaje identifica el nodo por su posición en la lista de nodos del archivo, contando desde 1, y el atributo que contiene el carácter. Si el carácter impide leer el archivo, el mensaje indica en su lugar la línea del archivo.

Para eliminar los caracteres de control invisibles, abre el archivo en un programa de hojas de cálculo y usa su función `CLEAN`, disponible en Microsoft Excel, Google Sheets y LibreOffice Calc (si tu programa está en español, se llama `LIMPIAR`):

1. En una columna vacía, introduce `=CLEAN(C2)` (o `=LIMPIAR(C2)` si tu programa está en español) y sustituye `C2` por la celda que ha indicado Architect.
2. Copia el resultado y usa **Pegado especial** para pegarlo sobre la celda original solo como valores.
3. Elimina la columna adicional y vuelve a guardar el archivo como CSV.

`CLEAN` (o `LIMPIAR`) también elimina las tabulaciones y los saltos de línea de la celda. Si Architect sigue rechazando el archivo, borra el contenido de la celda y vuelve a escribirlo a mano.

## Añadir la lista predefinida a una entrevista de Network Canvas {#adding-the-roster-to-a-network-canvas-interview}

Cuando la lista predefinida te parezca correcta, puedes añadirla a un protocolo de Network Canvas desde Architect. Elige a continuación la versión de Architect que usas: las capturas de pantalla y las notas propias de cada versión se actualizan en consecuencia.

<AppSwitch>
  <AppOption label="Architect" icon="globe"></AppOption>
  <AppOption label="Architect Classic" icon="desktop"></AppOption>
</AppSwitch>

Puedes añadir la lista predefinida desde la [biblioteca de recursos](/es/design-protocols/key-concepts/resources), a la que se accede desde la pantalla de vista general de cualquier protocolo que estés editando.

<AppOnly app="current">

En Architect, tu protocolo, incluidos los recursos de listas predefinidas que añadas, se guarda automáticamente en la [biblioteca](/es/design-protocols/saving-and-backing-up) de tu navegador mientras trabajas, y la lista se incorpora al archivo `.netcanvas` cuando descargas el protocolo.

</AppOnly>

<AppOnly app="classic">

En Architect Classic, tu protocolo es un archivo `.netcanvas` guardado en tu ordenador, y la lista predefinida se almacena dentro de ese archivo cuando lo guardas.

![Botón de la biblioteca de recursos](/assets/img/roster-tutorial/resource-button.png 'El botón de la biblioteca de recursos dentro de un protocolo en Architect Classic')

</AppOnly>

También puedes añadir la lista predefinida al crear una etapa «Generador de nombres a partir de una lista». A continuación recorremos los pasos para añadirla a un generador de nombres, y añadiremos la lista sobre la marcha. Usaremos una lista sencilla con cinco miembros de la serie de dibujos animados «Los Simpson», pero deberías poder seguir los mismos pasos con una lista que hayas creado tú. El CSV de ejemplo está disponible <DownloadLink href="/assets/simpsons-roster.csv">aquí</DownloadLink>.

### Seleccionar la interfaz de tipo generador de nombres {#selecting-the-name-generator-interface}

Para usar una lista predefinida, debes seleccionar la interfaz «Generador de nombres a partir de una lista». Ponle un nombre a la etapa (por ejemplo, `roster_01`) y después crea o selecciona un tipo de nodo. En el ejemplo, hemos creado un tipo de nodo llamado «person» (persona), así que lo elegiremos. A continuación, el programa pide la «Fuente de datos de la lista». Si ya has subido el CSV a la biblioteca de recursos, podrás seleccionarlo. Si no, puedes subirlo ahora.

<AppOnly app="classic">

![Interfaz «Generador de nombres a partir de una lista»](/assets/img/roster-tutorial/roster-interface-selection.png 'La interfaz «Generador de nombres a partir de una lista», con la sección para seleccionar el nodo')

</AppOnly>

Antes de seleccionar la lista predefinida, conviene revisarla para comprobar que tiene el formato correcto. Cada recurso de lista predefinida tiene un botón de vista previa (un icono con forma de ojo). Al hacer clic en él, se muestra el CSV que se ha subido.

<AppOnly app="classic">

![Botón de vista previa del recurso](/assets/img/roster-tutorial/preview-roster-button.jpg 'Pantalla de selección de recursos con el botón de vista previa de un recurso')

</AppOnly>

En `simpsons-roster` puedes observar que la celda de la profesión de Maggie está vacía. Esto demuestra que los datos tenían el formato correcto y que todas las columnas están bien alineadas.

<AppOnly app="classic">

![Vista previa del recurso](/assets/img/roster-tutorial/example-roster-preview.png 'Lista predefinida de ejemplo en la pantalla de vista previa')

</AppOnly>

### Dar formato a la presentación de la lista predefinida {#formatting-the-display-of-the-roster}

Una vez seleccionada la lista predefinida, los tres apartados siguientes te permiten personalizar el aspecto de los elementos de la lista en Interviewer. Los elementos de la lista se muestran como tarjetas, no como nodos. Para nombrar a un miembro de la lista, la persona participante arrastra su tarjeta al panel de nodos, lo que la convierte en un nodo y la quita de la lista. Para ver una descripción completa de cómo nombra cada participante a los miembros de la lista, consulta la [documentación de la interfaz «Generador de nombres a partir de una lista»](/es/design-protocols/interface-documentation/name-generator-roster).

<AppOnly app="classic">

![Interfaz de lista predefinida en Interviewer Classic](/assets/img/roster-tutorial/roster-interview-example.png 'Ejemplo de una interfaz de lista predefinida en Interviewer Classic')

</AppOnly>

De forma predeterminada, las tarjetas muestran el nombre del elemento de la lista. Sin embargo, puedes añadir más datos a la tarjeta activando las «opciones de visualización de tarjetas». Así podrás seleccionar cuáles de las columnas adicionales del CSV se muestran debajo del nombre. El desplegable de la izquierda te permite elegir la columna del CSV, y el campo de la derecha te permite darle a esa variable otra etiqueta. Así, en el ejemplo de `simpsons-roster`, aunque el CSV tenía una columna llamada `gender` (en minúsculas), en la tarjeta escribiremos `Gender` para que se muestre así.

<AppOnly app="classic">

![Opciones de visualización de tarjetas](/assets/img/roster-tutorial/roster-card-options.png 'Panel de opciones de visualización de tarjetas en Architect Classic')

</AppOnly>

Como puede que haya que revisar a muchas personas en una lista predefinida, también puedes permitir que las tarjetas se ordenen según algún valor. Así, si añadimos la profesión, durante la entrevista la persona participante podrá ordenar la lista por profesión.

Por último, puedes permitir que quienes participan busquen entre los elementos de la lista con un cuadro de búsqueda. Si seleccionas el nombre y mantienes baja la precisión, se puede encontrar a una persona escribiendo caracteres parecidos a su nombre, aunque no coincidan exactamente.

<AppOnly app="current">

En un protocolo escrito en más de un idioma (consulta [Traducir tu protocolo](/es/design-protocols/translating-your-protocol)), las etiquetas de los datos de las tarjetas y de las opciones de ordenación se traducen como cualquier otro texto, pero los valores de la lista predefinida no. Una lista predefinida es un recurso, y su contenido es el mismo en todos los idiomas. Si quienes participan van a leer valores de la lista, como profesiones o nombres de asignaturas, comprueba que se entiendan en cada uno de los idiomas del protocolo.

</AppOnly>

### Plantear una pregunta para elegir elementos de la lista {#prompting-for-a-roster-item}

Al igual que otras interfaces de tipo generador de nombres, para seleccionar elementos de la lista la interfaz necesita una pregunta. Puede ser tan sencilla como «Selecciona a las personas que conoces»; sin embargo, recomendamos encarecidamente al equipo de investigación que se plantee usar preguntas habituales o preguntas formuladas cuidadosamente en función de una pregunta de investigación. Puedes usar varias preguntas en la misma interfaz.

> Recuerda que puedes usar varias preguntas en la misma interfaz, pero si no añades atributos adicionales no podrás saber qué pregunta dio lugar a cada nodo.

## Tener en cuenta los atributos adicionales de las preguntas: ¿qué es el conjunto de álteres? {#considering-additional-prompt-variables-what-is-an-alter-pool}

Un elemento de la lista solo se puede añadir una vez a la entrevista (o, en sentido estricto, una vez por tipo de nodo y entrevista). Esto tiene consecuencias si tienes varias preguntas que no son mutuamente excluyentes. Por ejemplo, imagina que pides a cada participante que nombre a las personas de su clase con las que estudia. Después, con una segunda pregunta, podrías preguntar por las personas de la clase a las que ya conocía antes de este curso. ¿Qué pasa con alguien que cumple ambas condiciones? Aquí es donde podemos pensar, conceptualmente, en un «conjunto de álteres» (alter pool) y recurrir a ese conjunto en las distintas preguntas.

Para gestionar los casos en los que un álter podría encajar en varias preguntas, conviene hacer dos cosas:

- Usar la función [«asignar atributos adicionales»](/es/design-protocols/key-concepts/additional-variables) al crear una pregunta.
- Usar el panel lateral de «ya mencionados» en la entrevista.

Cuando asignas un atributo adicional a una pregunta, esa pregunta no solo creará un nodo, sino que también le asignará algunos datos adicionales. Normalmente usamos una variable booleana por pregunta. Así, si tienes una pregunta sobre las personas de la clase con las que estudia cada participante, también deberías asignar un atributo adicional «study_together» con el valor True. Después, haz lo mismo con la pregunta sobre las personas a las que cada participante ya conocía antes de este curso. Cuando revises tus datos más adelante, tendrás dos columnas adicionales. Las personas nombradas en la pregunta `study_together` tendrán `True` en esa columna, y las personas nombradas en la pregunta `known_before` tendrán `True` en la suya.

Como un elemento de la lista solo se puede convertir en nodo una vez, si se crearon personas en la primera pregunta, `study_together`, necesitamos otra forma de incluirlas en la pregunta `known_before`. Por eso usamos un panel lateral. Los paneles laterales están disponibles en las interfaces [«Generador de nombres (con formularios)»](/es/design-protocols/interface-documentation/name-generator-using-forms) y [«Generador de nombres (adición rápida)»](/es/design-protocols/interface-documentation/name-generator-using-quick-add).

Con una etapa «Generador de nombres (adición rápida)», podemos nombrar nuevos nodos con el botón de nuevo nodo, abajo a la derecha. Pero en el lado izquierdo podemos tener un panel lateral. De hecho, podemos tener dos: uno para las personas ya nombradas, que ahora están en el conjunto de álteres, y otro para los elementos de la lista que todavía no se han nombrado.

<AppOnly app="classic">

A continuación se muestra un ejemplo de una pantalla así en Interviewer Classic, con algunos de los Simpson ya nombrados (en el conjunto de álteres) y otros todavía en la lista.

![Paneles laterales en un generador de nombres](/assets/img/roster-tutorial/quick-add-roster-side-panel.png 'Un generador de nombres en Interviewer Classic con paneles laterales para la lista predefinida y para los nodos ya mencionados')

</AppOnly>

Te recomendamos añadir al conjunto de álteres todos los nodos que puedas _antes_ de añadir más datos sobre ellos, para poder añadir esos datos a _todos_ los nodos nombrados en lugar de ir y volver por el protocolo. Esto se debe a que todas las etapas recurren al mismo conjunto de álteres si usan ese tipo de nodo. Imagina la siguiente situación: la persona participante añade nodos en la etapa 3, añade algún dato en la etapa 4, como lo cercana que es la relación entre el ego y cada álter, y después añade más nodos en la etapa 5. Esos nodos recién añadidos estarán disponibles si se vuelve a la etapa 4. Ten en cuenta también que la lista predefinida no cambia una vez que está en Interviewer. Así, todos los datos que añadas sobre un nodo procedente de una lista predefinida estarán disponibles cuando exportes tu caso, pero no quedarán asociados a ese elemento de la lista en los casos de entrevistas posteriores.

## ¿Cuándo es demasiado grande una lista predefinida? {#how-large-is-too-large-for-a-roster}

Una sola interfaz, «Generador de nombres a partir de una lista», adapta la forma de presentar a los miembros de la lista según el tamaño de la lista. Con una lista pequeña, se muestran tarjetas de todos sus miembros, que la persona participante puede revisar y ordenar. Con una lista más grande, la persona participante usa primero el cuadro de búsqueda para localizar a los miembros, antes de que se muestre ninguna tarjeta. Se admiten listas muy grandes (hemos probado con éxito una lista de 60.000 elementos), pero a esa escala la carga y la búsqueda se ralentizan considerablemente, así que prueba tu protocolo en los dispositivos de campo que tengas previsto usar. Consulta las [indicaciones sobre el tamaño de la lista](/es/design-protocols/interface-documentation/name-generator-roster) en la documentación de la interfaz para ver los detalles.

## Posible problema: listas predefinidas y colisiones de nombres {#potential-pitfall-rosters-and-name-collisions}

En lo que respecta a las listas predefinidas, hay unas cuantas situaciones en Network Canvas que pueden producir datos incorrectos si no se tienen bien en cuenta. Estos problemas se deben sobre todo a que, en Network Canvas, los nodos se [etiquetan](/es/design-protocols/key-concepts/node-labelling) con la variable `name`. Así, cuando la persona participante vincula nodos o les asigna datos adicionales, si hay dos personas con el mismo valor en `name`, puede ser difícil distinguirlas. A continuación se ofrecen dos ejemplos y algunas soluciones alternativas:

### Colisión de tipo 1. Colisiones dentro de la propia lista. {#collision-type-1-collisions-within-the-roster-list-itself}

Imagina que tienes una lista predefinida con dos personas llamadas Kwame. Una es Kwame Kenyatta y la otra, Kwame Nkrumah. Si la persona participante conoce a ambas, su conjunto de álteres tendrá dos Kwame y después no podrá distinguirlos. Aunque la tarjeta de la lista podría mostrar su apellido, el icono del nodo solo dirá «Kwame» en ambos casos. Esto se denomina colisión de nombres.

Internamente, el programa habrá asignado a cada uno de estos nodos un UUID único, pero la persona entrevistada no podrá saber cuál es cuál.

Posible solución: al importar una lista predefinida, Network Canvas no comprueba que la columna de nombres contenga solo elementos únicos. Sin embargo, puedes comprobarlo tú al preparar la lista. Una forma de hacerlo es seleccionar toda la columna en Excel o en Calc y elegir la opción de menú (en Excel) «Datos» - «Herramientas de tabla» - «Quitar duplicados». Si tu lista se ha acortado, tenías duplicados que deberías haber eliminado. Una forma de gestionarlo es crear una nueva variable de nombre que combine el nombre y el apellido. Puedes hacerlo a mano o con una fórmula de Excel.

No recomendamos editar el nombre en Network Canvas una vez creado, tanto por motivos técnicos como porque corres el riesgo de no poder saber si se trata del mismo Kwame o del Kwame_Nk de la lista cuando compares los datos de distintas personas. Recuerda que, con una lista predefinida, normalmente queremos combinar los datos de las distintas personas participantes para ver quién nombra a quién.

### Colisión de tipo 2. Colisiones porque ya existe un nodo con ese nombre {#collision-type-2-collisions-because-there-is-already-a-node-with-that-name}

El segundo tipo de colisión se produce cuando el nombre duplicado aparece porque la persona participante nombra a alguien que no está en la lista con el mismo nombre. Imagina que tenemos una pantalla con una lista predefinida en la que la persona nombra a «Kwame» y, después, nombra a otro Kwame en una etapa «Generador de nombres (adición rápida)» o «Generador de nombres (con formularios)». Network Canvas no te avisará de que ya hay un nodo llamado Kwame en el conjunto de álteres. Esta situación debe gestionarla una persona entrevistadora con formación, y hay que animar a la persona participante a usar nombres únicos.

Recuerda que, si la persona participante crea un nuevo nodo con un nombre duplicado y quiere eliminarlo, puede hacerlo arrastrando el nodo: aparecerá una papelera. Arrastra el nodo a la papelera y crea un nuevo nodo con un nombre más descriptivo y único.

## Consejos para usar listas predefinidas en estudios sociocéntricos {#tips-for-rosters-in-sociocentric-studies}

Un estudio sociocéntrico es aquel en el que te interesan las conexiones entre las personas dentro de un límite de red determinado. Para empezar por lo sencillo, imagina que solo nos interesan los vínculos entre el ego y cada álter. Es decir, no nos centramos en lo que opina alguien de la clase sobre si otras dos personas son amigas. Simplemente queremos que cada persona nombre a sus pares. Después, con algo de preparación de los datos, esto se puede convertir en una red completa en forma de matriz. Aquí no mostramos esa preparación, pero, por experiencia, podemos indicar algunos pasos que facilitan este proceso.

Recuerda que la matriz de adyacencia de una red tiene filas y columnas. Las filas representan los datos de cada participante y las columnas son los destinos (es decir, las personas a las que nombró cada participante). Como se trata de un estudio sociocéntrico, las filas y las columnas deben tener los mismos nombres. En la siguiente tabla sencilla vemos una clase con cuatro estudiantes. «Alice» nombra a «Bob» y a «Cam» como amistades. «Dot» nombra como amistades a todo el mundo, mientras que «Bob» y «Cam» solo se nombran entre sí. La matriz resultante sería la siguiente:

| name  | Alice | Bob | Cam | Dot |
| ----- | ----- | --- | --- | --- |
| Alice | \-    | 1   | 1   | 0   |
| Bob   | 0     | \-  | 1   | 0   |
| Cam   | 0     | 1   | \-  | 0   |
| Dot   | 1     | 1   | 1   | \-  |

En el caso de una lista predefinida en Network Canvas, cada participante aportaría una fila. Verás que la diagonal contiene `-`. Esto se debe a que, conceptualmente, en este tipo de trabajo no se espera que las personas puedan nombrarse a sí mismas (aunque eso depende de la pregunta de investigación).

Para recoger este tipo de datos en Network Canvas, podemos usar una lista predefinida y recoger solo las nominaciones de quienes participan. Sin embargo, nos interesa que cada participante se identifique en la lista para que no esté disponible en las preguntas posteriores. Para ello, podemos combinar varias funciones de Network Canvas:

1. Podemos crear una etapa «identifícate» con una sola pregunta, en la que cada participante se identifica, y fijar en 1 el número mínimo y máximo de álteres de la etapa.
2. Podemos añadir un atributo adicional llamado `is_ego` y darle el valor True para ese único nodo.
3. Como los elementos de la lista solo se convierten en nodos una vez, el ego ya no aparecerá en las preguntas posteriores de la lista.
4. Sin embargo, el ego sigue estando en el conjunto de álteres, así que cada vez que queramos hacer algo con los álteres, como preguntar por la frecuencia de comunicación, tenemos que excluir al ego, algo que podemos hacer con el [filtrado de la red en cada etapa](/es/design-protocols/key-concepts/network-filtering) y nuestra variable `is_ego`.

Puedes encontrar <DownloadLink href="/protocols/Roster Example Protocol v1.netcanvas">aquí</DownloadLink> un protocolo que incluye todas estas funciones. Tiene la lista predefinida pequeña con Alice, Bob, Cam y Dot, pero puedes sustituirla por tu propia lista y adaptarla a tus necesidades.
