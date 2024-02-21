---
title: Network Canvas GraphML Format
---

## GraphML Format

GraphML is the main file format used by the Network Canvas software. GraphML files can be used to manually import Network Canvas data into Server, and can be opened by many other pieces of network analysis software. 

The GraphML file format uses XML structure and the extension .graphml. 

## The Network Canvas GraphML Format

The Network Canvas GraphML format extends the GraphML format so that Network Canvas meta data, such as interview protocol, case ID, and session UUID, can be stored in the files. The key aim of this process has been to ensure interoperability with existing GraphML parsers.

### Schema Extensions

Our extensions provide namespaced attributes on the `<graph>` element: `nc:caseId`, `nc:sessionUUID`, `nc:protocolName`, `nc:protocolUID`, `nc:sessionExportTime`, `nc:sessionStartTime`,  and `nc:sessionFinishTime`.

The schema `nc-types.xsd` defines these attributes, and `graphml+netcanvas.xsd` extends the element to include them.

These data contain Network Canvas metadata for sessions needed for importing into Server.

### Ego Data

Storing ego data is possible using the existing GraphML schema, although only in a general sense (arbitrary data can be attached to the graph element). Existing parsers either ignore this data, or just show it (correctly) as one or more attributes of the graph itself. Our parsers will treat all graph `<key>` and `<data>` nodes as describing ego.

Specifically, ego data can be stored within GraphML just like we store node or edge data, except that instead of defining the element with a "for" attribute of either 'node' or 'edge', we can define them as for the graph:

``` XML
<key id="ego_attribute" attr.name="ego_attribute" attr.type="string" for="graph" />
```

**Note:** the key must be located outside of the `<graph>` element.

We can then give this attribute a value anywhere inside the `<graph>` element:

``` XML
<graph>
  <data key="ego_attribute">Jimbo</data>
</graph>
```
