<!--
  Walkthrough for the "Geospatial" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Geospatial.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: Participant prompts" wrapped in an HTML comment:
      section: <title>   highlight and scroll to the editor section whose
                         title this is
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
      dialog: <text>     a step for a dialog, not the editor: it is shown
                         only while a dialog whose title matches is open.
                         "form field" matches any title containing it
                         ("Create form field", "Edit form field");
                         "=attribute" matches a title that is exactly that;
                         alternatives are separated by "|". Dialog steps
                         play in order while it is open, and each dialog
                         keeps its place while another is opened from
                         inside it. The last one asks the researcher to
                         save (naming the dialog's own save button, e.g.
                         "Add") and rings that button, or, for a dialog
                         with no save button, to make their choice; once
                         the dialog closes the walkthrough picks up where
                         it was. Their "field:" looks inside the dialog.
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (node type, skip logic, interviewer guidance and
    so on); edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Geospatial

## What a geospatial stage is

<!-- scene: geospatial-intro -->

The Geospatial stage is a name interpreter: it collects information about alters already named, rather than creating new ones. It shows a map with outlined areas, such as neighborhoods or census tracts, and a panel naming one alter at a time. The participant selects the area that answers the prompt for that alter, then moves on to the next alter with Next.

The map is drawn by Mapbox, a map service, so the stage needs an internet connection during the interview.

Read the full [Geospatial documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/geospatial).

## What data it collects

<!-- scene: geospatial-data -->

Each prompt records one location attribute. Selecting an area saves the value of one of that area's properties, such as its census tract ID, so each prompt fills one column of your exported data, with a value for every alter placed. An alter marked as outside the selectable areas gets the value `outside-selectable-areas`.

> Do: Optionally merge all GeoJSON properties with your alter data during data cleaning and analysis. For example, you can match the `zipcode` to other attributes like `population` contained in the GeoJSON file.

## When to use it

Use this stage to record where alters are, such as the area each one lives or works in, when you can supply those areas as a map file.

> Avoid: Using this stage if your study needs to run fully offline. Because it loads maps from Mapbox, it requires an internet connection during the interview.

## Choose what this stage shows

<!-- section: Node setup -->

Pick the **node type** this stage asks about, for example _Person_. Every node of that type already in the participant's network is asked about in turn, on every prompt.

Changing the node type later removes the rest of this stage's settings, map settings included, apart from its name, interviewer notes and built-in wording, since they all describe the type chosen now. Architect asks before it does.

> Do: Consider using a **Stage filter** to narrow down nodes to only those that fall within the selectable map areas. An earlier stage, such as a [Categorical Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/categorical-bin) or [Per Alter Form](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form), can capture the attribute to filter on, so participants are only asked about relevant nodes.

<!-- include: node-type -->

<!-- include: stage-filter -->

<!-- include: rule -->

## Add a Mapbox API key

<!-- section: Map access -->
<!-- field: mapOptions.tokenAssetId -->

The map can only be drawn with an API key from your own [Mapbox](https://www.mapbox.com/) account. Mapbox offers a free tier that suits small projects. Create an account, copy the token from your account overview, and add it here.

A key is stored with the protocol's resources, so every Geospatial stage in the protocol can use the same one.

Read how to [get a Mapbox key](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/geospatial#mapbox-configuration).

## Add or choose the key

<!-- dialog: choose an api key -->

Add a key by giving it a name and pasting the key itself, or choose one already stored in this protocol. The key is saved inside your protocol as plain text, so anyone you give the protocol file to can read it.

A protocol started from a template that has a map uses Network Canvas's shared testing key, which is rate-limited and for evaluation only. The protocol's timeline warns you while it is in use; replace it with your own before you collect data.

## Choose the selectable areas

<!-- section: Map layers -->
<!-- field: mapOptions.dataSourceAssetId -->

The **Layer data source** is a [GeoJSON](https://geojson.org/) file that outlines the areas the participant can select, such as census tracts, ZIP codes or neighborhoods. Each area in it carries properties, such as its ID or name.

> Avoid: Excessively large GeoJSON files that contain areas far outside the intended selection areas. This can lead to slower performance when loading the map.

## Import or reuse a map layer

<!-- dialog: choose a map layer -->

Import a `.geojson` file from your computer, or choose one already stored in this protocol. The file travels inside the protocol, so every participant sees the same areas.

Read more about [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

## Choose what a selection records

<!-- section: Map layers -->
<!-- field: mapOptions.targetFeatureProperty -->
<!-- scene: geospatial-property -->

The **Map selection property** is the property whose value is saved when the participant selects an area. The properties offered are the ones in the chosen layer, so choose the layer first. If you change the layer later, Architect won't save the stage until the property is one the new layer has.

> Do: Choose a unique property, such as `zipcode` or `census_tract`, so each area is clearly distinguishable.

## Write the prompts

<!-- section: Prompt collection -->

Each prompt asks one question about where the alters are, and records the answer in its own location attribute. The participant places every alter for the first prompt, then every alter again for the next.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question shown in the panel at the top right of the map, above the alter it asks about, such as _"Which area does this person live in?"_. To name the alter in the question, insert **Node label** with the syringe button in the toolbar.

## Choose where the answer is saved

<!-- dialog: create prompt | edit prompt -->
<!-- field: variable -->

Under **Location response**, pick the **Location attribute** this prompt records. Only location attributes can hold a selected area.

Each prompt needs an attribute of its own: two prompts on one stage can't share one, because the later answer would replace the earlier one. An attribute a form collects elsewhere in the protocol isn't offered either.

<!-- include: attribute-search -->

## Choose the map style

<!-- section: Map appearance -->
<!-- field: mapOptions.style -->

The **Mapbox style** is the map drawn beneath the selectable areas, such as streets, outdoors, satellite imagery, or a light or dark map. Pick one whose place names your participants can read against the outline color.

## Choose the outline color

<!-- section: Map appearance -->
<!-- field: mapOptions.color -->

This color outlines every selectable area, and fills the area the participant has selected. Use one that stands out against the map style.

## Show public transit

<!-- section: Map appearance -->
<!-- field: mapOptions.showTransit -->

**Show public transit** draws rail lines and stations, with their names, on the map, which can help participants orient themselves when selecting areas.

## Let participants search

<!-- section: Map appearance -->
<!-- field: mapOptions.allowSearch -->

**Allow location search** adds a search box at the top left of the map, for addresses, neighborhoods and points of interest. Choosing a result moves the map there, and the participant then selects the area. Search uses the Mapbox Search API, which may add to your Mapbox costs.

## Set where the map opens

<!-- section: Map starting position -->
<!-- field: mapOptions.center -->

Type the longitude and latitude the map is centered on, and its **Starting zoom**, or click **Set the starting view on a map** to find the view by moving a map. The recenter button on the participant's map returns to this view.

> Do: Make sure the selectable areas from your GeoJSON file are visible within the initial map view.

## Frame the starting view

<!-- dialog: =map starting position -->

Pan and zoom the map to the view participants should see when the map first opens. **Use this view** appears once you have moved the map.

## Customize built-in wording

<!-- section: Customize built-in wording -->
<!-- scene: geospatial-outside -->

This section holds the words Network Canvas supplies for the map, which you can change and translate. **Outside selectable areas** labels the button in the prompt panel that marks a place outside the areas the map allows; selecting the map outside any area does the same.

Under **Shared by every stage of this kind** are the messages shown when the map can't be used as usual: while the device is offline, when the map can't be drawn, and when a search fails. A change to them applies to every Geospatial stage.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
