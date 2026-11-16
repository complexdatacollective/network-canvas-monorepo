---
title: Censo de fuerza de vínculos
navOrder: 19
translatedFrom: f357aca089c34831166e2c330d48ebd708f0eb21
---

<InterfaceSummary type="TieStrengthCensus">

<InterfaceMeta type="Intérprete de nombres" creates="Vínculos con un peso almacenado en una variable ordinal" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

La interfaz «Censo de fuerza de vínculos» es similar a la interfaz [«Censo de díadas»](../interface-documentation/dyad-census) en cuanto a la experiencia de uso, pero tiene la ventaja añadida de asignar un valor de una variable ordinal a cada vínculo que se crea.

Para cada par de álteres (cada persona a la que se nombra durante la entrevista), la persona participante podrá señalar que existe un vínculo indicando la fuerza de ese vínculo. También puede indicar que no existe ningún vínculo entre los dos álteres del par. Al seleccionar una opción, se pasa automáticamente al siguiente par, lo que ofrece una experiencia ágil y con poca carga de respuesta.

Si tu entrevista usa el método del censo de díadas (en lugar de crear los vínculos con la interfaz [«Sociograma»](../interface-documentation/sociogram)) y también te interesa la fuerza del vínculo, plantéate usar esta interfaz para reducir la carga de respuesta de quienes participan.

Para configurar esta interfaz en Architect, primero determinas el tipo de nodo para el que se crearán los vínculos. A continuación, configuras una o varias preguntas, y en cada una se especifica:

- Un tipo de vínculo que se creará
- Un atributo ordinal que recibirá un valor cuando se confirme un vínculo. Este atributo ordinal se creará en el tipo de vínculo que hayas especificado.
- Una etiqueta para la opción que indica que no existe ningún vínculo

### Buenas prácticas {#best-practices}

<GoodPractice>

Usa esta interfaz en situaciones en las que ya estés usando una etapa «Censo de díadas» y quieras recoger también datos sobre la fuerza de un vínculo.

</GoodPractice>

### Qué evitar {#try-to-avoid}

<BadPractice>

Evita usar esta interfaz en una entrevista que también use una etapa «Sociograma» para crear vínculos.

</BadPractice>

<BadPractice>

No uses variables ordinales con más de 5 opciones, porque la interfaz quedaría muy recargada.

</BadPractice>
