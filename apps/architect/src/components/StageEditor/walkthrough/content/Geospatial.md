<!--
  Walkthrough for the "Geospatial" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Geospatial.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: prompts" wrapped in an HTML comment:
      section: <key>     highlight and scroll to the editor section with this
                         key (its data-section-key; the keys are listed in
                         protocol-builder's sections/sectionKeys.ts)
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      control: <name>    highlight a control outside the sections instead
                         (only "preview": the toolbar's Preview button)
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (skip logic, interviewer guidance and so on);
    edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Geospatial

## What a geospatial stage is

<!-- scene: geospatial-intro -->

The Geospatial stage is a name interpreter: it collects information about alters already named, and doesn't create new ones. It shows a map with outlined areas, such as neighborhoods or census tracts, and a panel naming one alter at a time. The participant selects the area that answers the prompt for that alter, then clicks Next to move on to the next alter.

The map is drawn by Mapbox, a map service, so the stage needs an internet connection during the interview.

Read the full [Geospatial documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/geospatial).

## When to use it

Use this stage to record where alters are, such as the area each one lives or works in, when you can supply those areas as a map file.

> Avoid: Using this stage if your study needs to run fully offline. Because it loads maps from Mapbox, it requires an internet connection during the interview.

## Choose the node type

<!-- section: node-type -->

Choose the **node type** this stage asks about, for example _Person_. The participant is asked about each node of that type already in their network, one at a time, on every prompt.

Changing the node type later clears this stage's other settings, including the map settings, because they depend on the node type. Only the stage's name, interviewer notes and built-in wording are kept. Architect asks you to confirm first.

> Do: Consider switching on **Filter network** to narrow down nodes to only those that fall within the selectable map areas. An earlier stage, such as a [Categorical Bin](https://documentation.networkcanvas.com/design-protocols/interface-documentation/categorical-bin) or [Per Alter Form](https://documentation.networkcanvas.com/design-protocols/interface-documentation/per-alter-form), can capture the attribute to filter on, so participants are only asked about relevant nodes.

<!-- include: filter-network -->

## Add a Mapbox API key

<!-- section: map-access -->
<!-- field: mapOptions.tokenAssetId -->

The map can only be drawn with an API key from your own [Mapbox](https://www.mapbox.com/) account. Mapbox offers a free tier that suits small projects. Create an account, copy the token from your account overview, and add it here.

The key is stored with the protocol's resources, so every Geospatial stage in the protocol can use the same one. It is saved as plain text, so anyone you give the protocol file to can read it.

A protocol started from a template that has a map uses Network Canvas's shared testing key, which is rate-limited and for evaluation only. Replace it with your own key before you collect data.

Read how to [get a Mapbox key](https://documentation.networkcanvas.com/design-protocols/interface-documentation/geospatial#mapbox-configuration).

## Choose the selectable areas

<!-- section: map-layers -->
<!-- field: mapOptions.dataSourceAssetId -->

The **Layer data source** is a [GeoJSON](https://geojson.org/) file that outlines the areas the participant can select, such as census tracts, ZIP codes or neighborhoods. Each area in the file carries properties, such as its ID or name.

> Avoid: Excessively large GeoJSON files that contain areas far outside the intended selection areas. This can lead to slower performance when loading the map.

## Choose what a selection records

<!-- section: map-layers -->
<!-- field: mapOptions.targetFeatureProperty -->
<!-- scene: geospatial-property -->

The **Map selection property** is the property whose value is saved when the participant selects an area. The properties offered are the ones in the chosen layer, so choose the layer first. If you change the layer later, Architect won't save the stage until you choose a property that the new layer has.

> Do: Choose a unique property, such as `zipcode` or `census_tract`, so each area is clearly distinguishable.

## Write the prompts

<!-- section: prompts -->

Each prompt asks one question about where the alters are, and records the answer in its own location attribute. The participant answers the first prompt for every alter, then the next prompt for every alter.

Read more about [prompts](https://documentation.networkcanvas.com/design-protocols/key-concepts/prompts).

## Choose the map style

<!-- section: map-appearance -->
<!-- field: mapOptions.style -->

The **Mapbox style** is the map drawn beneath the selectable areas, such as streets, outdoors, satellite imagery, or a light or dark map. Pick a style on which participants can still read the place names alongside your outline color.

## Choose the outline color

<!-- section: map-appearance -->
<!-- field: mapOptions.color -->

This color outlines every selectable area, and fills the area the participant has selected. Use a color that stands out against the map style.

## Show public transit

<!-- section: map-appearance -->
<!-- field: mapOptions.showTransit -->

**Show public transit** draws rail lines and stations on the map, with their names, which can help participants orient themselves when selecting areas.

## Let participants search

<!-- section: map-appearance -->
<!-- field: mapOptions.allowSearch -->

**Allow location search** adds a search box at the top left of the map, for addresses, neighborhoods and points of interest. Choosing a result moves the map there, and the participant then selects the area. Search uses the Mapbox Search API, which may add to your Mapbox costs.

## Set where the map opens

<!-- section: map-view -->
<!-- field: mapOptions.center -->

Type the longitude and latitude the map is centered on and its **Starting zoom**, or click **Set the starting view on a map** to find the view by moving a map. The recenter button on the participant's map returns to this view.

> Do: Make sure the selectable areas from your GeoJSON file are visible within the initial map view.

<!-- include: built-in-wording -->

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
