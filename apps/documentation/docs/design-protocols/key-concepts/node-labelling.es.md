---
title: Etiquetado de nodos
navOrder: 13
translatedFrom: b561f288d8b113fc514c2257d9f6bc3c6718a769
---

## Cómo calcula Interviewer la etiqueta de un nodo {#how-interviewer-calculates-a-nodes-label}

Interviewer calcula la etiqueta que se usa al mostrar un nodo con la siguiente lógica:

0. Usar el _worker_ de etiquetado de nodos que incluya el protocolo, si lo hay (consulta el [apartado de más abajo](#custom-node-labeling-advanced) para ver los detalles de esta función avanzada).
1. Buscar una variable llamada «name» (sin distinguir mayúsculas y minúsculas) en el [libro de códigos](/es/design-protocols/key-concepts/codebook) para el tipo del nodo, e intentar obtener ese valor del nodo.
2. Buscar en el nodo una propiedad con la clave «name» (sin distinguir mayúsculas y minúsculas) e intentar obtener ese valor.
3. Mostrar el texto «No 'name' variable!».

Si obtienes resultados inesperados, como mensajes «No 'name' variable!», asegúrate de haber construido tu protocolo o tus datos de forma que se cumpla una regla de mayor prioridad. Por ejemplo, asegúrate de haber creado correctamente una variable «name» para el tipo de nodo y de que esa variable recibe un valor durante la entrevista.

Para funciones avanzadas, como calcular la etiqueta de un nodo de forma dinámica, consulta más abajo el apartado [«Etiquetado personalizado de nodos»](#custom-node-labeling-advanced).

## Etiquetar nodos a partir de datos de listas predefinidas {#labeling-nodes-from-roster-data}

Para controlar el etiquetado de los nodos procedentes de recursos de archivos de red (listas predefinidas que se importan como archivos de datos), tienes estas opciones: crea para tus nodos un atributo llamado «name» (sin distinguir mayúsculas y minúsculas). Puedes incluir este atributo como columna en tu archivo CSV o como atributo con nombre en un archivo GraphML.

Consulta también: [trabajar con recursos](/es/design-protocols/key-concepts/resources#network).

## Etiquetado personalizado de nodos (avanzado) {#custom-node-labeling-advanced}

<TipBox>

El etiquetado personalizado de nodos no es compatible con [Fresco](/es/collect-data/fresco/about). El `nodeLabelWorker` que se describe a continuación solo se ejecuta en Interviewer.

</TipBox>

Para etiquetar los nodos con más flexibilidad, puedes programar una función de etiquetado personalizada. Para ello, tendrías que:

- Añadir `nodeLabelWorker.js` a tu protocolo (consulta [Dentro de un archivo .netcanvas](./the-protocol-file#inside-a-netcanvas-file) para saber cómo hacerlo)
- Definir en ese archivo una función llamada `nodeLabelWorker`
- Hacer que esa función devuelva una cadena de texto, que se usará como etiqueta.

`nodeLabelWorker` se llama con un objeto que contiene información sobre el nodo y la red, y debe devolver la etiqueta (una cadena de texto) del nodo correspondiente. Conceptualmente: `f(node, network) -> label`. Así, puedes actualizar las etiquetas de los nodos según los cambios en el estado de la red o según los atributos de cada nodo.

Este es un ejemplo sencillo que etiqueta cada nodo con una propiedad compuesta (inicial + apellido):

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

Además de los atributos definidos en el protocolo, cada nodo tendrá una propiedad `networkCanvasId` única que puede usarse para identificar el nodo en la red.

La función `nodeLabelWorker` se ejecutará de forma asíncrona en un entorno de [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) (en inglés). Además, estará limitada por la política de seguridad de contenido (CSP) de la aplicación, así que no debes contar con tener acceso a la red dentro de la función de etiquetado.

Para ver un ejemplo más completo, consulta [el nodeLabelWorker del protocolo de desarrollo](https://github.com/complexdatacollective/development-protocol/blob/master/nodeLabelWorker.js) (en inglés).
