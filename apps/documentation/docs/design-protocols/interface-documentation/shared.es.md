---
title: Opciones comunes de las interfaces
navOrder: 1

layout: page
translatedFrom: 46902ff86ef2c61eb91878599b8c35f2a8337703
---

Algunas opciones de configuración están disponibles en todas las etapas o en la mayoría de ellas (según la subcategoría de interfaz; por ejemplo, los generadores de nombres).

<AppOnly app="current">

## El editor de etapas {#the-stage-editor}

Junto al editor de etapas, Architect enumera las secciones de la etapa. Elige una sección de la lista para ir directamente a ella. Cada entrada lleva un color y un icono que indican su estado (terminada, sin terminar, con un problema, desactivada o todavía no disponible; esto último indica que la sección no se puede completar hasta que se elija otra cosa en la etapa), para que veas de un vistazo qué partes de la etapa requieren todavía tu atención. Los lectores de pantalla anuncian ese mismo estado después del nombre de la sección. En una pantalla estrecha, la lista aparece encima del editor en lugar de al lado.

Si intentas guardar una etapa que no está terminada, Architect no la guarda: enumera cada problema encima del formulario, con el nombre de la sección en la que se encuentra, y además lo señala junto al control al que afecta.

</AppOnly>

## Configuración común {#shared-configuration}

![](/assets/img/interface-documentation/shared/shared-configuration.png)

### Nombre {#name}

Todas las etapas tienen un nombre configurable. Se muestra en la navegación al realizar las entrevistas y en la línea de tiempo al construirlas. Sirve para poner un título fácil de recordar o para describir el propósito de una etapa concreta.

### Tipo de entidad {#entity-type}

En todos los tipos de etapa hay que seleccionar un único tipo de entidad, que define el tipo de entidad principal de la recogida de datos. La única excepción es la etapa «Información», que no recoge ningún dato.

Según la interfaz concreta, se tratará de un tipo de _nodo_ o de un tipo de _vínculo_.

<AppOnly app="current">

En Architect, los tipos de nodo y de vínculo se crean y se editan desde el propio selector de tipos. **Crear nuevo tipo de nodo** o **Crear nuevo tipo de vínculo**, situado debajo del selector, abre el editor de tipos sin salir de la etapa, y el tipo nuevo queda seleccionado en la etapa en cuanto se guarda. **Editar este tipo de nodo** (o **Editar este tipo de vínculo**) abre el tipo que ya usa la etapa, para que puedas cambiar allí mismo su nombre y su color (y, en el caso de un tipo de nodo, su forma y su icono).

</AppOnly>

### Filtrado {#filtering}

Esta función está disponible en las categorías de etapas de _sociograma_ y de _intérprete de nombres_. Permite acotar aún más el tipo de entidad seleccionado.

Por ejemplo, una etapa «Sociograma» puede tener seleccionado el tipo de nodo «Persona» como tipo de entidad. Con esta opción puedes limitarla solo a los nodos «Persona» que, además, tienen un atributo concreto.

[Más información sobre el filtrado](../key-concepts/network-filtering)

### Lógica de salto {#skip-logic}

Esta función está disponible en todos los tipos de etapa. Se puede evaluar el estado de la red de la persona participante para determinar si una etapa debe mostrarse u omitirse.

[Más información sobre la lógica de salto](../key-concepts/skip-logic)
