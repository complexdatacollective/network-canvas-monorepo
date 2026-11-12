---
title: Sociograma
navOrder: 9
translatedFrom: 7d27d8de5bb6cbb8e8e7d3af7ce752394bb09036
---

<InterfaceSummary type="Sociogram">

<InterfaceMeta type="Intérprete de nombres y generador de vínculos" creates="Vínculos de varios tipos y datos de atributos sobre un único tipo de nodo" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

Las interfaces «Sociograma» y [«Narrativa»](/es/design-protocols/interface-documentation/narrative) son las dos interfaces de visualización basadas en un lienzo de Network Canvas. En una etapa «Sociograma», quienes participan construyen la imagen espacial de su red colocando a sus álteres (cada persona a la que se nombra durante la entrevista) en un lienzo y dibujando los vínculos que los unen. La interfaz «Narrativa» es su complemento de solo visualización: vuelve a mostrar una red que la persona participante ya ha dispuesto, para conversar abiertamente sobre ella en un diálogo que guía quien investiga, sin recoger datos nuevos.

En una etapa «Sociograma», quienes participan colocan a sus álteres y dibujan los vínculos que los unen. La interfaz puede crear uno o varios tipos de vínculo entre los álteres, y puede recoger datos de atributos booleanos resaltando los álteres en los que el valor de una variable es verdadero.

## Configuración {#configuring}

Una etapa «Sociograma» se construye a partir de una o varias [preguntas](/es/design-protocols/key-concepts/prompts). Cada pregunta plantea una tarea en el lienzo (colocar nodos, dibujar un tipo concreto de vínculo o marcar un atributo), y la persona participante va pasando por las preguntas una tras otra. Algunos ajustes son comunes a toda la etapa (el fondo y el modo de disposición); el resto se configura en cada pregunta.

### El atributo de disposición {#the-layout-variable}

Cada pregunta tiene un **atributo de disposición**, que almacena la posición de cada nodo en el lienzo como un par de coordenadas. Ahí se registran los datos espaciales que recoges en la etapa «Sociograma».

Si usas el mismo atributo de disposición en todas las preguntas de una etapa, la posición de cada nodo se conserva cuando la persona participante pasa de una tarea a otra, de modo que va perfeccionando una única disposición compartida. Si quieres medidas espaciales independientes, asigna a cada pregunta un atributo de disposición distinto: reutilizar un atributo sustituye las coordenadas anteriores. Las posiciones se almacenan como coordenadas normalizadas que un [fondo SVG adaptable](/es/design-protocols/responsive-svg-backgrounds#classify-nodes-from-their-coordinates) permite convertir en zonas con significado durante el análisis.

### Colocación automática o manual {#automatic-or-manual-positioning}

Un ajuste de la etapa, **Modo de disposición**, decide cómo llegan los nodos al lienzo al principio:

- **Modo manual** coloca todos los nodos en una reserva situada en el borde de la pantalla. La persona participante arrastra cada nodo al lienzo para colocarlo, y puede volver a arrastrar un nodo a la reserva para quitarlo. Puedes ordenar la reserva para que los nodos se ofrezcan en un orden determinado.
- **Modo automático** coloca los nodos sin que intervenga la persona participante, con una disposición dirigida por fuerzas que simula atracción y repulsión al abrirse la etapa. La persona participante puede pausar y reanudar la simulación durante la entrevista, y ajustar posiciones concretas mientras está en pausa.

### Fondo {#background}

Una etapa «Sociograma» puede tener como fondo una serie de círculos concéntricos o una imagen de fondo personalizada. Para el fondo de círculos concéntricos, eliges cuántos círculos se dibujan y, si quieres, puedes ajustar su espaciado para que los anillos centrales sean proporcionalmente más grandes. Como imagen de fondo funciona mejor un SVG adaptable, porque mantiene legibles las zonas y las etiquetas cuando el lienzo cambia de forma entre la orientación vertical y la horizontal (consulta [Fondos SVG adaptables](/es/design-protocols/responsive-svg-backgrounds)).

<GoodPractice>

Plantéate personalizar el fondo para orientar a quienes participan en la actividad o para dar significado a la disposición; por ejemplo, dividiendo el lienzo en cuadrantes o en contextos sociales con los que después se puedan interpretar las posiciones de los nodos.

</GoodPractice>

### Crear y mostrar vínculos {#creating-and-displaying-edges}

Al tocar un nodo, la persona participante puede dibujar vínculos. En una pregunta configurada para la **creación de vínculos**, al tocar un nodo y después otro se crea entre ellos un vínculo del tipo elegido; al volver a tocar el mismo par, el vínculo se elimina. Cada pregunta de creación de vínculos crea un único tipo de vínculo, así que usa una pregunta distinta para cada tipo de relación que quieras recoger.

Con independencia de lo anterior, una pregunta puede **mostrar** uno o varios tipos de vínculo, lo que resulta útil para enseñar los vínculos que la persona participante dibujó en una pregunta anterior mientras trabaja en una tarea nueva. El tipo de vínculo que crea una pregunta siempre se muestra en esa pregunta. Cuando dos nodos están conectados por más de uno de los tipos de vínculo mostrados, solo se dibuja uno de esos vínculos.

![Dos álteres conectados por un vínculo en una etapa «Sociograma»](/assets/img/interface-documentation/sociogram/sociogram-edges.png)

### Resaltar atributos {#highlighting-attributes}

En lugar de dibujar vínculos, una pregunta puede usar los toques para **alternar un atributo**. Al tocar un nodo, una variable booleana cambia entre verdadero y falso, y los nodos cuyo valor es verdadero se resaltan. Así puedes recoger un atributo de sí o no (por ejemplo, si cada álter pertenece a un grupo o tiene una característica concreta) directamente en el lienzo.

![Álteres resaltados en una etapa «Sociograma» cuando un atributo es verdadero](/assets/img/interface-documentation/sociogram/sociogram-highlight.png)

La creación de vínculos y la alternancia de atributos son los dos comportamientos posibles al tocar un nodo, y cada pregunta usa uno u otro, no los dos. Si necesitas ambas tareas, repártelas en preguntas distintas.

<AppOnly app="current">

### Información emergente de los botones de pausa y reanudación {#pause-and-resume-tooltips}

La información emergente de los botones que pausan y reanudan la simulación de la disposición automática es [texto de entrevista](/es/design-protocols/translating-your-protocol#interview-text), compartido con la etapa «Narrativa», así que el editor de etapas no tiene ninguna sección para ella. Se reformula y traduce en la tabla de traducciones, en **Botones**, y un protocolo solo la contiene mientras alguna etapa usa la disposición automática.

</AppOnly>

### Buenas prácticas {#best-practices}

<GoodPractice>

Mantén el mismo atributo de disposición en todas las preguntas de una etapa cuando quieras que quienes participan vayan construyendo una única disposición de su red, de modo que las posiciones que fijen en una pregunta anterior sigan ahí en las posteriores.

</GoodPractice>

<GoodPractice>

Adapta la redacción de cada pregunta a lo que ocurre al tocar un nodo: pregunta por relaciones en las preguntas de creación de vínculos, y por una característica de cada álter en las preguntas en las que, al tocar un nodo, se activa o desactiva un atributo.

</GoodPractice>

### Qué evitar {#try-to-avoid}

<BadPractice>

Los nodos colocados demasiado cerca pueden taparse entre sí visualmente, o tapar el vínculo que los une. Advierte a quienes participan de que no coloquen unos nodos directamente encima de otros.

</BadPractice>
