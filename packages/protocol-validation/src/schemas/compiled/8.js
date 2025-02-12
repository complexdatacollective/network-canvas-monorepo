"use strict";
export const validate = validate405;
export default validate405;
const schema328 = {"$ref":"#/definitions/Protocol","definitions":{"Protocol":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"lastModified":{"type":"string","format":"date-time"},"schemaVersion":{"type":"number","const":8},"codebook":{"type":"object","properties":{"node":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"displayVariable":{"type":"string"},"iconVariant":{"type":"string"},"variables":{"type":"object","additionalProperties":{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},"type":{"type":"string","enum":["boolean","text","number","datetime","ordinal","scalar","categorical","layout","location"]},"encrypted":{"type":"boolean"},"component":{"type":"string","enum":["Boolean","CheckboxGroup","Number","RadioGroup","Text","TextArea","Toggle","ToggleButtonGroup","Slider","VisualAnalogScale","LikertScale","DatePicker","RelativeDatePicker"]},"options":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"label":{"type":"string"},"value":{"anyOf":[{"type":"integer"},{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},{"type":"boolean"}]},"negative":{"type":"boolean"}},"required":["label","value"],"additionalProperties":false},{"type":"integer"},{"type":"string"}]}},"parameters":{"type":"object","additionalProperties":{}},"validation":{"type":"object","properties":{"required":{"type":"boolean"},"requiredAcceptsNull":{"type":"boolean"},"minLength":{"type":"integer"},"maxLength":{"type":"integer"},"minValue":{"type":"integer"},"maxValue":{"type":"integer"},"minSelected":{"type":"integer"},"maxSelected":{"type":"integer"},"unique":{"type":"boolean"},"differentFrom":{"type":"string"},"sameAs":{"type":"string"},"greaterThanVariable":{"type":"string"},"lessThanVariable":{"type":"string"}},"additionalProperties":false}},"required":["name","type"],"additionalProperties":false},"propertyNames":{"pattern":"^[a-zA-Z0-9._:-]+$"}},"color":{"type":"string"}},"required":["name","variables","color"],"additionalProperties":false},{"not":{}}]}},"edge":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"color":{"type":"string"},"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["name","color","variables"],"additionalProperties":false},{"not":{}}]}},"ego":{"type":"object","properties":{"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["variables"],"additionalProperties":false}},"required":["node"],"additionalProperties":false},"assetManifest":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["image","video","network","geojson"]},"name":{"type":"string"},"source":{"type":"string"}},"required":["id","type","name","source"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/id"},"type":{"type":"string","enum":["apikey"]},"name":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/name"},"value":{"type":"string"}},"required":["id","type","name","value"],"additionalProperties":false}]}},"stages":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"interviewScript":{"type":"string"},"label":{"type":"string"},"filter":{"anyOf":[{"anyOf":[{"not":{}},{"type":"object","properties":{"join":{"type":"string","enum":["OR","AND"]},"rules":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["alter","ego","edge"]},"id":{"type":"string"},"options":{"allOf":[{"type":"object","properties":{"type":{"type":"string"},"attribute":{"type":"string"},"operator":{"type":"string","enum":["EXISTS","NOT_EXISTS","EXACTLY","NOT","GREATER_THAN","GREATER_THAN_OR_EQUAL","LESS_THAN","LESS_THAN_OR_EQUAL","INCLUDES","EXCLUDES","OPTIONS_GREATER_THAN","OPTIONS_LESS_THAN","OPTIONS_EQUALS","OPTIONS_NOT_EQUALS","CONTAINS","DOES NOT CONTAIN"]},"value":{"anyOf":[{"type":"integer"},{"type":"string"},{"type":"boolean"},{"type":"array"}]}},"required":["operator"]},{}]}},"required":["type","id","options"],"additionalProperties":false}}},"additionalProperties":false}]},{"type":"null"}]},"skipLogic":{"type":"object","properties":{"action":{"type":"string","enum":["SHOW","SKIP"]},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]}},"required":["action"],"additionalProperties":false},"introductionPanel":{"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false},"type":{"type":"string","const":"EgoForm"},"form":{"type":"object","properties":{"title":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"variable":{"type":"string"},"prompt":{"type":"string"}},"required":["variable","prompt"],"additionalProperties":false}}},"required":["fields"],"additionalProperties":false}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterForm"},"subject":{"type":"object","properties":{"entity":{"type":"string","enum":["edge","node","ego"]},"type":{"type":"string"}},"required":["entity","type"],"additionalProperties":false},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterEdgeForm"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGenerator"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]},"dataSource":{"type":["string","null"]}},"required":["id","title","dataSource"],"additionalProperties":false}},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"}},"required":["id","text"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","form","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorQuickAdd"},"quickAdd":{"type":"string"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/panels/items"}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1},"behaviours":{"type":"object","properties":{"minNodes":{"type":"integer"},"maxNodes":{"type":"integer"}},"additionalProperties":false}},"required":["id","label","type","quickAdd","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorRoster"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"dataSource":{"type":"string"},"cardOptions":{"type":"object","properties":{"displayLabel":{"type":"string"},"additionalProperties":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"variable":{"type":"string"}},"required":["label","variable"],"additionalProperties":false}}},"additionalProperties":false},"searchOptions":{"type":"object","properties":{"fuzziness":{"type":"number"},"matchProperties":{"type":"array","items":{"type":"string"}}},"required":["fuzziness","matchProperties"],"additionalProperties":false},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","dataSource","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Sociogram"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"background":{"type":"object","properties":{"image":{"type":"string"},"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"automaticLayout":{"type":"object","properties":{"enabled":{"type":"boolean"}},"required":["enabled"],"additionalProperties":false}},"additionalProperties":{}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"DyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"TieStrengthCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"},"edgeVariable":{"type":"string"},"negativeLabel":{"type":"string"}},"required":["id","text","createEdge","edgeVariable","negativeLabel"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OrdinalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"bucketSortOrder":{"type":"array","items":{"type":"object","properties":{"property":{"type":"string"},"direction":{"type":"string","enum":["desc","asc"]},"type":{"type":"string","enum":["string","number","boolean","date","hierarchy"]},"hierarchy":{"type":"array","items":{"type":["string","number","boolean"]}}},"required":["property"],"additionalProperties":false}},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"color":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"CategoricalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"otherVariable":{"type":"string"},"otherVariablePrompt":{"type":"string"},"otherOptionLabel":{"type":"string"},"bucketSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Narrative"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"presets":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"label":{"type":"string"},"layoutVariable":{"type":"string"},"groupVariable":{"type":"string"},"edges":{"type":"object","properties":{"display":{"type":"array","items":{"type":"string"}}},"additionalProperties":false},"highlight":{"type":"array","items":{"type":"string"}}},"required":["id","label","layoutVariable"],"additionalProperties":false},"minItems":1},"background":{"type":"object","properties":{"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"freeDraw":{"type":"boolean"},"allowRepositioning":{"type":"boolean"}},"additionalProperties":false}},"required":["id","label","type","presets"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Information"},"title":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["text","asset"]},"content":{"type":"string"},"description":{"type":"string"},"size":{"type":"string"},"loop":{"type":"boolean"}},"required":["id","type","content"],"additionalProperties":false}}},"required":["id","label","type","items"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Anonymisation"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["text","asset"]},"content":{"type":"string"},"size":{"type":"string"}},"required":["id","type","content"],"additionalProperties":false}}},"required":["id","label","type","items"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OneToManyDyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"FamilyTreeCensus"}},"required":["id","label","type"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Geospatial"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"mapOptions":{"type":"object","properties":{"tokenAssetId":{"type":"string"},"style":{"type":"string","enum":["mapbox://styles/mapbox/standard","mapbox://styles/mapbox/standard-satellite","mapbox://styles/mapbox/streets-v12","mapbox://styles/mapbox/outdoors-v12","mapbox://styles/mapbox/light-v11","mapbox://styles/mapbox/dark-v11","mapbox://styles/mapbox/satellite-v9","mapbox://styles/mapbox/satellite-streets-v12","mapbox://styles/mapbox/navigation-day-v1","mapbox://styles/mapbox/navigation-night-v1"]},"center":{"type":"array","minItems":2,"maxItems":2,"items":[{"type":"number"},{"type":"number"}]},"initialZoom":{"type":"number","minimum":0,"maximum":22},"dataSourceAssetId":{"type":"string"},"color":{"type":"string"},"targetFeatureProperty":{"type":"string"}},"required":["tokenAssetId","style","center","initialZoom","dataSourceAssetId","color","targetFeatureProperty"],"additionalProperties":false},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","mapOptions","prompts"],"additionalProperties":false}]}}},"required":["schemaVersion","codebook","stages"],"additionalProperties":false}},"$schema":"http://json-schema.org/draft-07/schema#"};
const schema329 = {"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"lastModified":{"type":"string","format":"date-time"},"schemaVersion":{"type":"number","const":8},"codebook":{"type":"object","properties":{"node":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"displayVariable":{"type":"string"},"iconVariant":{"type":"string"},"variables":{"type":"object","additionalProperties":{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},"type":{"type":"string","enum":["boolean","text","number","datetime","ordinal","scalar","categorical","layout","location"]},"encrypted":{"type":"boolean"},"component":{"type":"string","enum":["Boolean","CheckboxGroup","Number","RadioGroup","Text","TextArea","Toggle","ToggleButtonGroup","Slider","VisualAnalogScale","LikertScale","DatePicker","RelativeDatePicker"]},"options":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"label":{"type":"string"},"value":{"anyOf":[{"type":"integer"},{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},{"type":"boolean"}]},"negative":{"type":"boolean"}},"required":["label","value"],"additionalProperties":false},{"type":"integer"},{"type":"string"}]}},"parameters":{"type":"object","additionalProperties":{}},"validation":{"type":"object","properties":{"required":{"type":"boolean"},"requiredAcceptsNull":{"type":"boolean"},"minLength":{"type":"integer"},"maxLength":{"type":"integer"},"minValue":{"type":"integer"},"maxValue":{"type":"integer"},"minSelected":{"type":"integer"},"maxSelected":{"type":"integer"},"unique":{"type":"boolean"},"differentFrom":{"type":"string"},"sameAs":{"type":"string"},"greaterThanVariable":{"type":"string"},"lessThanVariable":{"type":"string"}},"additionalProperties":false}},"required":["name","type"],"additionalProperties":false},"propertyNames":{"pattern":"^[a-zA-Z0-9._:-]+$"}},"color":{"type":"string"}},"required":["name","variables","color"],"additionalProperties":false},{"not":{}}]}},"edge":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"color":{"type":"string"},"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["name","color","variables"],"additionalProperties":false},{"not":{}}]}},"ego":{"type":"object","properties":{"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["variables"],"additionalProperties":false}},"required":["node"],"additionalProperties":false},"assetManifest":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["image","video","network","geojson"]},"name":{"type":"string"},"source":{"type":"string"}},"required":["id","type","name","source"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/id"},"type":{"type":"string","enum":["apikey"]},"name":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/name"},"value":{"type":"string"}},"required":["id","type","name","value"],"additionalProperties":false}]}},"stages":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"interviewScript":{"type":"string"},"label":{"type":"string"},"filter":{"anyOf":[{"anyOf":[{"not":{}},{"type":"object","properties":{"join":{"type":"string","enum":["OR","AND"]},"rules":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["alter","ego","edge"]},"id":{"type":"string"},"options":{"allOf":[{"type":"object","properties":{"type":{"type":"string"},"attribute":{"type":"string"},"operator":{"type":"string","enum":["EXISTS","NOT_EXISTS","EXACTLY","NOT","GREATER_THAN","GREATER_THAN_OR_EQUAL","LESS_THAN","LESS_THAN_OR_EQUAL","INCLUDES","EXCLUDES","OPTIONS_GREATER_THAN","OPTIONS_LESS_THAN","OPTIONS_EQUALS","OPTIONS_NOT_EQUALS","CONTAINS","DOES NOT CONTAIN"]},"value":{"anyOf":[{"type":"integer"},{"type":"string"},{"type":"boolean"},{"type":"array"}]}},"required":["operator"]},{}]}},"required":["type","id","options"],"additionalProperties":false}}},"additionalProperties":false}]},{"type":"null"}]},"skipLogic":{"type":"object","properties":{"action":{"type":"string","enum":["SHOW","SKIP"]},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]}},"required":["action"],"additionalProperties":false},"introductionPanel":{"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false},"type":{"type":"string","const":"EgoForm"},"form":{"type":"object","properties":{"title":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"variable":{"type":"string"},"prompt":{"type":"string"}},"required":["variable","prompt"],"additionalProperties":false}}},"required":["fields"],"additionalProperties":false}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterForm"},"subject":{"type":"object","properties":{"entity":{"type":"string","enum":["edge","node","ego"]},"type":{"type":"string"}},"required":["entity","type"],"additionalProperties":false},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterEdgeForm"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGenerator"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]},"dataSource":{"type":["string","null"]}},"required":["id","title","dataSource"],"additionalProperties":false}},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"}},"required":["id","text"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","form","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorQuickAdd"},"quickAdd":{"type":"string"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/panels/items"}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1},"behaviours":{"type":"object","properties":{"minNodes":{"type":"integer"},"maxNodes":{"type":"integer"}},"additionalProperties":false}},"required":["id","label","type","quickAdd","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorRoster"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"dataSource":{"type":"string"},"cardOptions":{"type":"object","properties":{"displayLabel":{"type":"string"},"additionalProperties":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"variable":{"type":"string"}},"required":["label","variable"],"additionalProperties":false}}},"additionalProperties":false},"searchOptions":{"type":"object","properties":{"fuzziness":{"type":"number"},"matchProperties":{"type":"array","items":{"type":"string"}}},"required":["fuzziness","matchProperties"],"additionalProperties":false},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","dataSource","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Sociogram"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"background":{"type":"object","properties":{"image":{"type":"string"},"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"automaticLayout":{"type":"object","properties":{"enabled":{"type":"boolean"}},"required":["enabled"],"additionalProperties":false}},"additionalProperties":{}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"DyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"TieStrengthCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"},"edgeVariable":{"type":"string"},"negativeLabel":{"type":"string"}},"required":["id","text","createEdge","edgeVariable","negativeLabel"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OrdinalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"bucketSortOrder":{"type":"array","items":{"type":"object","properties":{"property":{"type":"string"},"direction":{"type":"string","enum":["desc","asc"]},"type":{"type":"string","enum":["string","number","boolean","date","hierarchy"]},"hierarchy":{"type":"array","items":{"type":["string","number","boolean"]}}},"required":["property"],"additionalProperties":false}},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"color":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"CategoricalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"otherVariable":{"type":"string"},"otherVariablePrompt":{"type":"string"},"otherOptionLabel":{"type":"string"},"bucketSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Narrative"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"presets":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"label":{"type":"string"},"layoutVariable":{"type":"string"},"groupVariable":{"type":"string"},"edges":{"type":"object","properties":{"display":{"type":"array","items":{"type":"string"}}},"additionalProperties":false},"highlight":{"type":"array","items":{"type":"string"}}},"required":["id","label","layoutVariable"],"additionalProperties":false},"minItems":1},"background":{"type":"object","properties":{"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"freeDraw":{"type":"boolean"},"allowRepositioning":{"type":"boolean"}},"additionalProperties":false}},"required":["id","label","type","presets"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Information"},"title":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["text","asset"]},"content":{"type":"string"},"description":{"type":"string"},"size":{"type":"string"},"loop":{"type":"boolean"}},"required":["id","type","content"],"additionalProperties":false}}},"required":["id","label","type","items"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Anonymisation"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["text","asset"]},"content":{"type":"string"},"size":{"type":"string"}},"required":["id","type","content"],"additionalProperties":false}}},"required":["id","label","type","items"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OneToManyDyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"FamilyTreeCensus"}},"required":["id","label","type"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Geospatial"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"mapOptions":{"type":"object","properties":{"tokenAssetId":{"type":"string"},"style":{"type":"string","enum":["mapbox://styles/mapbox/standard","mapbox://styles/mapbox/standard-satellite","mapbox://styles/mapbox/streets-v12","mapbox://styles/mapbox/outdoors-v12","mapbox://styles/mapbox/light-v11","mapbox://styles/mapbox/dark-v11","mapbox://styles/mapbox/satellite-v9","mapbox://styles/mapbox/satellite-streets-v12","mapbox://styles/mapbox/navigation-day-v1","mapbox://styles/mapbox/navigation-night-v1"]},"center":{"type":"array","minItems":2,"maxItems":2,"items":[{"type":"number"},{"type":"number"}]},"initialZoom":{"type":"number","minimum":0,"maximum":22},"dataSourceAssetId":{"type":"string"},"color":{"type":"string"},"targetFeatureProperty":{"type":"string"}},"required":["tokenAssetId","style","center","initialZoom","dataSourceAssetId","color","targetFeatureProperty"],"additionalProperties":false},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","mapOptions","prompts"],"additionalProperties":false}]}}},"required":["schemaVersion","codebook","stages"],"additionalProperties":false};
const schema330 = {"type":"object","additionalProperties":{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},"type":{"type":"string","enum":["boolean","text","number","datetime","ordinal","scalar","categorical","layout","location"]},"encrypted":{"type":"boolean"},"component":{"type":"string","enum":["Boolean","CheckboxGroup","Number","RadioGroup","Text","TextArea","Toggle","ToggleButtonGroup","Slider","VisualAnalogScale","LikertScale","DatePicker","RelativeDatePicker"]},"options":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"label":{"type":"string"},"value":{"anyOf":[{"type":"integer"},{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},{"type":"boolean"}]},"negative":{"type":"boolean"}},"required":["label","value"],"additionalProperties":false},{"type":"integer"},{"type":"string"}]}},"parameters":{"type":"object","additionalProperties":{}},"validation":{"type":"object","properties":{"required":{"type":"boolean"},"requiredAcceptsNull":{"type":"boolean"},"minLength":{"type":"integer"},"maxLength":{"type":"integer"},"minValue":{"type":"integer"},"maxValue":{"type":"integer"},"minSelected":{"type":"integer"},"maxSelected":{"type":"integer"},"unique":{"type":"boolean"},"differentFrom":{"type":"string"},"sameAs":{"type":"string"},"greaterThanVariable":{"type":"string"},"lessThanVariable":{"type":"string"}},"additionalProperties":false}},"required":["name","type"],"additionalProperties":false},"propertyNames":{"pattern":"^[a-zA-Z0-9._:-]+$"}};
const schema332 = {"type":"string"};
const schema333 = {"type":"string"};
const schema334 = {"anyOf":[{"not":{}},{"type":"object","properties":{"join":{"type":"string","enum":["OR","AND"]},"rules":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["alter","ego","edge"]},"id":{"type":"string"},"options":{"allOf":[{"type":"object","properties":{"type":{"type":"string"},"attribute":{"type":"string"},"operator":{"type":"string","enum":["EXISTS","NOT_EXISTS","EXACTLY","NOT","GREATER_THAN","GREATER_THAN_OR_EQUAL","LESS_THAN","LESS_THAN_OR_EQUAL","INCLUDES","EXCLUDES","OPTIONS_GREATER_THAN","OPTIONS_LESS_THAN","OPTIONS_EQUALS","OPTIONS_NOT_EQUALS","CONTAINS","DOES NOT CONTAIN"]},"value":{"anyOf":[{"type":"integer"},{"type":"string"},{"type":"boolean"},{"type":"array"}]}},"required":["operator"]},{}]}},"required":["type","id","options"],"additionalProperties":false}}},"additionalProperties":false}]};
const schema335 = {"type":"string"};
const schema336 = {"type":"string"};
const schema337 = {"type":"string"};
const schema338 = {"anyOf":[{"anyOf":[{"not":{}},{"type":"object","properties":{"join":{"type":"string","enum":["OR","AND"]},"rules":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["alter","ego","edge"]},"id":{"type":"string"},"options":{"allOf":[{"type":"object","properties":{"type":{"type":"string"},"attribute":{"type":"string"},"operator":{"type":"string","enum":["EXISTS","NOT_EXISTS","EXACTLY","NOT","GREATER_THAN","GREATER_THAN_OR_EQUAL","LESS_THAN","LESS_THAN_OR_EQUAL","INCLUDES","EXCLUDES","OPTIONS_GREATER_THAN","OPTIONS_LESS_THAN","OPTIONS_EQUALS","OPTIONS_NOT_EQUALS","CONTAINS","DOES NOT CONTAIN"]},"value":{"anyOf":[{"type":"integer"},{"type":"string"},{"type":"boolean"},{"type":"array"}]}},"required":["operator"]},{}]}},"required":["type","id","options"],"additionalProperties":false}}},"additionalProperties":false}]},{"type":"null"}]};
const schema341 = {"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false};
const schema342 = {"type":"object","properties":{"title":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"variable":{"type":"string"},"prompt":{"type":"string"}},"required":["variable","prompt"],"additionalProperties":false}}},"required":["fields"],"additionalProperties":false};
const schema348 = {"type":"object","properties":{"entity":{"type":"string","enum":["edge","node","ego"]},"type":{"type":"string"}},"required":["entity","type"],"additionalProperties":false};
const schema366 = {"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"}},"required":["id","text"],"additionalProperties":false};
const schema387 = {"type":"string"};
const schema388 = {"type":"string"};
const schema405 = {"type":"array","items":{"type":"object","properties":{"property":{"type":"string"},"direction":{"type":"string","enum":["desc","asc"]},"type":{"type":"string","enum":["string","number","boolean","date","hierarchy"]},"hierarchy":{"type":"array","items":{"type":["string","number","boolean"]}}},"required":["property"],"additionalProperties":false}};
const formats0 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
const pattern22 = new RegExp("^[a-zA-Z0-9._:-]+$", "u");
const func2 = Object.prototype.hasOwnProperty;
const schema339 = {"type":"object","properties":{"action":{"type":"string","enum":["SHOW","SKIP"]},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]}},"required":["action"],"additionalProperties":false};

function validate407(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "action") || (key0 === "filter"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.action !== undefined){
let data0 = data.action;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!((data0 === "SHOW") || (data0 === "SKIP"))){
const err3 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema339.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.filter !== undefined){
let data1 = data.filter;
const _errs5 = errors;
let valid1 = false;
const _errs6 = errors;
const _errs8 = errors;
let valid3 = false;
const _errs9 = errors;
const err4 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
var _valid1 = _errs9 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const _errs11 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
if(!((key1 === "join") || (key1 === "rules"))){
const err5 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.join !== undefined){
let data2 = data1.join;
if(typeof data2 !== "string"){
const err6 = {instancePath:instancePath+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!((data2 === "OR") || (data2 === "AND"))){
const err7 = {instancePath:instancePath+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.rules !== undefined){
let data3 = data1.rules;
if(Array.isArray(data3)){
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.type === undefined){
const err8 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data4.id === undefined){
const err9 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data4.options === undefined){
const err10 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key2 in data4){
if(!(((key2 === "type") || (key2 === "id")) || (key2 === "options"))){
const err11 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data4.type !== undefined){
let data5 = data4.type;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/filter/rules/" + i0+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((data5 === "alter") || (data5 === "ego")) || (data5 === "edge"))){
const err13 = {instancePath:instancePath+"/filter/rules/" + i0+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data4.id !== undefined){
if(typeof data4.id !== "string"){
const err14 = {instancePath:instancePath+"/filter/rules/" + i0+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data4.options !== undefined){
let data7 = data4.options;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.operator === undefined){
const err15 = {instancePath:instancePath+"/filter/rules/" + i0+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data7.type !== undefined){
if(typeof data7.type !== "string"){
const err16 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data7.attribute !== undefined){
if(typeof data7.attribute !== "string"){
const err17 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data7.operator !== undefined){
let data10 = data7.operator;
if(typeof data10 !== "string"){
const err18 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!((((((((((((((((data10 === "EXISTS") || (data10 === "NOT_EXISTS")) || (data10 === "EXACTLY")) || (data10 === "NOT")) || (data10 === "GREATER_THAN")) || (data10 === "GREATER_THAN_OR_EQUAL")) || (data10 === "LESS_THAN")) || (data10 === "LESS_THAN_OR_EQUAL")) || (data10 === "INCLUDES")) || (data10 === "EXCLUDES")) || (data10 === "OPTIONS_GREATER_THAN")) || (data10 === "OPTIONS_LESS_THAN")) || (data10 === "OPTIONS_EQUALS")) || (data10 === "OPTIONS_NOT_EQUALS")) || (data10 === "CONTAINS")) || (data10 === "DOES NOT CONTAIN"))){
const err19 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data7.value !== undefined){
let data11 = data7.value;
const _errs35 = errors;
let valid10 = false;
const _errs36 = errors;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err20 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid2 = _errs36 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs38 = errors;
if(typeof data11 !== "string"){
const err21 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid2 = _errs38 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs40 = errors;
if(typeof data11 !== "boolean"){
const err22 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid2 = _errs40 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs42 = errors;
if(!(Array.isArray(data11))){
const err23 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid2 = _errs42 === errors;
valid10 = valid10 || _valid2;
}
}
}
if(!valid10){
const err24 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
errors = _errs35;
if(vErrors !== null){
if(_errs35){
vErrors.length = _errs35;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err25 = {instancePath:instancePath+"/filter/rules/" + i0+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
else {
const err27 = {instancePath:instancePath+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid1 = _errs11 === errors;
valid3 = valid3 || _valid1;
}
if(!valid3){
const err29 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
var _valid0 = _errs6 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs44 = errors;
if(data1 !== null){
const err30 = {instancePath:instancePath+"/filter",schemaPath:"#/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid0 = _errs44 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err31 = {instancePath:instancePath+"/filter",schemaPath:"#/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
errors = _errs5;
if(vErrors !== null){
if(_errs5){
vErrors.length = _errs5;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
validate407.errors = vErrors;
return errors === 0;
}

const schema364 = {"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]},"dataSource":{"type":["string","null"]}},"required":["id","title","dataSource"],"additionalProperties":false};

function validate412(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.title === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.dataSource === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "dataSource"},message:"must have required property '"+"dataSource"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "title")) || (key0 === "filter")) || (key0 === "dataSource"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
if(typeof data.id !== "string"){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err5 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.filter !== undefined){
let data2 = data.filter;
const _errs7 = errors;
let valid1 = false;
const _errs8 = errors;
const _errs10 = errors;
let valid3 = false;
const _errs11 = errors;
const err6 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
var _valid1 = _errs11 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const _errs13 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
for(const key1 in data2){
if(!((key1 === "join") || (key1 === "rules"))){
const err7 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data2.join !== undefined){
let data3 = data2.join;
if(typeof data3 !== "string"){
const err8 = {instancePath:instancePath+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!((data3 === "OR") || (data3 === "AND"))){
const err9 = {instancePath:instancePath+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data2.rules !== undefined){
let data4 = data2.rules;
if(Array.isArray(data4)){
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
let data5 = data4[i0];
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.type === undefined){
const err10 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data5.id === undefined){
const err11 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data5.options === undefined){
const err12 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key2 in data5){
if(!(((key2 === "type") || (key2 === "id")) || (key2 === "options"))){
const err13 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data5.type !== undefined){
let data6 = data5.type;
if(typeof data6 !== "string"){
const err14 = {instancePath:instancePath+"/filter/rules/" + i0+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(((data6 === "alter") || (data6 === "ego")) || (data6 === "edge"))){
const err15 = {instancePath:instancePath+"/filter/rules/" + i0+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data5.id !== undefined){
if(typeof data5.id !== "string"){
const err16 = {instancePath:instancePath+"/filter/rules/" + i0+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data5.options !== undefined){
let data8 = data5.options;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.operator === undefined){
const err17 = {instancePath:instancePath+"/filter/rules/" + i0+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data8.type !== undefined){
if(typeof data8.type !== "string"){
const err18 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data8.attribute !== undefined){
if(typeof data8.attribute !== "string"){
const err19 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data8.operator !== undefined){
let data11 = data8.operator;
if(typeof data11 !== "string"){
const err20 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!((((((((((((((((data11 === "EXISTS") || (data11 === "NOT_EXISTS")) || (data11 === "EXACTLY")) || (data11 === "NOT")) || (data11 === "GREATER_THAN")) || (data11 === "GREATER_THAN_OR_EQUAL")) || (data11 === "LESS_THAN")) || (data11 === "LESS_THAN_OR_EQUAL")) || (data11 === "INCLUDES")) || (data11 === "EXCLUDES")) || (data11 === "OPTIONS_GREATER_THAN")) || (data11 === "OPTIONS_LESS_THAN")) || (data11 === "OPTIONS_EQUALS")) || (data11 === "OPTIONS_NOT_EQUALS")) || (data11 === "CONTAINS")) || (data11 === "DOES NOT CONTAIN"))){
const err21 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data8.value !== undefined){
let data12 = data8.value;
const _errs37 = errors;
let valid10 = false;
const _errs38 = errors;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err22 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid2 = _errs38 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs40 = errors;
if(typeof data12 !== "string"){
const err23 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid2 = _errs40 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs42 = errors;
if(typeof data12 !== "boolean"){
const err24 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid2 = _errs42 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs44 = errors;
if(!(Array.isArray(data12))){
const err25 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var _valid2 = _errs44 === errors;
valid10 = valid10 || _valid2;
}
}
}
if(!valid10){
const err26 = {instancePath:instancePath+"/filter/rules/" + i0+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
else {
errors = _errs37;
if(vErrors !== null){
if(_errs37){
vErrors.length = _errs37;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err27 = {instancePath:instancePath+"/filter/rules/" + i0+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/filter/rules/" + i0,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath:instancePath+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid1 = _errs13 === errors;
valid3 = valid3 || _valid1;
}
if(!valid3){
const err31 = {instancePath:instancePath+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
var _valid0 = _errs8 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs46 = errors;
if(data2 !== null){
const err32 = {instancePath:instancePath+"/filter",schemaPath:"#/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid0 = _errs46 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err33 = {instancePath:instancePath+"/filter",schemaPath:"#/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
else {
errors = _errs7;
if(vErrors !== null){
if(_errs7){
vErrors.length = _errs7;
}
else {
vErrors = null;
}
}
}
}
if(data.dataSource !== undefined){
let data13 = data.dataSource;
if((typeof data13 !== "string") && (data13 !== null)){
const err34 = {instancePath:instancePath+"/dataSource",schemaPath:"#/properties/dataSource/type",keyword:"type",params:{type: schema364.properties.dataSource.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
validate412.errors = vErrors;
return errors === 0;
}


function validate406(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.codebook === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "codebook"},message:"must have required property '"+"codebook"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.stages === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stages"},message:"must have required property '"+"stages"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "name") || (key0 === "description")) || (key0 === "lastModified")) || (key0 === "schemaVersion")) || (key0 === "codebook")) || (key0 === "assetManifest")) || (key0 === "stages"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.name !== undefined){
if(typeof data.name !== "string"){
const err4 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.description !== undefined){
if(typeof data.description !== "string"){
const err5 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.lastModified !== undefined){
let data2 = data.lastModified;
if(typeof data2 === "string"){
if(!(formats0.test(data2))){
const err6 = {instancePath:instancePath+"/lastModified",schemaPath:"#/properties/lastModified/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/lastModified",schemaPath:"#/properties/lastModified/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data3 = data.schemaVersion;
if(!((typeof data3 == "number") && (isFinite(data3)))){
const err8 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(8 !== data3){
const err9 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: 8},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.codebook !== undefined){
let data4 = data.codebook;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.node === undefined){
const err10 = {instancePath:instancePath+"/codebook",schemaPath:"#/properties/codebook/required",keyword:"required",params:{missingProperty: "node"},message:"must have required property '"+"node"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key1 in data4){
if(!(((key1 === "node") || (key1 === "edge")) || (key1 === "ego"))){
const err11 = {instancePath:instancePath+"/codebook",schemaPath:"#/properties/codebook/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data4.node !== undefined){
let data5 = data4.node;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
for(const key2 in data5){
let data6 = data5[key2];
const _errs17 = errors;
let valid3 = false;
const _errs18 = errors;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.name === undefined){
const err12 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data6.variables === undefined){
const err13 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "variables"},message:"must have required property '"+"variables"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data6.color === undefined){
const err14 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "color"},message:"must have required property '"+"color"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key3 in data6){
if(!(((((key3 === "name") || (key3 === "displayVariable")) || (key3 === "iconVariant")) || (key3 === "variables")) || (key3 === "color"))){
const err15 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data6.name !== undefined){
if(typeof data6.name !== "string"){
const err16 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data6.displayVariable !== undefined){
if(typeof data6.displayVariable !== "string"){
const err17 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/displayVariable",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/displayVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data6.iconVariant !== undefined){
if(typeof data6.iconVariant !== "string"){
const err18 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/iconVariant",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/iconVariant/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data6.variables !== undefined){
let data10 = data6.variables;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
for(const key4 in data10){
const _errs29 = errors;
if(typeof key4 === "string"){
if(!pattern22.test(key4)){
const err19 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\"",propertyName:key4};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
var valid5 = _errs29 === errors;
if(!valid5){
const err20 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames",keyword:"propertyNames",params:{propertyName: key4},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
for(const key5 in data10){
let data11 = data10[key5];
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
if(data11.name === undefined){
const err21 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data11.type === undefined){
const err22 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key6 in data11){
if(!(((((((key6 === "name") || (key6 === "type")) || (key6 === "encrypted")) || (key6 === "component")) || (key6 === "options")) || (key6 === "parameters")) || (key6 === "validation"))){
const err23 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data11.name !== undefined){
let data12 = data11.name;
if(typeof data12 === "string"){
if(!pattern22.test(data12)){
const err24 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data11.type !== undefined){
let data13 = data11.type;
if(typeof data13 !== "string"){
const err26 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!(((((((((data13 === "boolean") || (data13 === "text")) || (data13 === "number")) || (data13 === "datetime")) || (data13 === "ordinal")) || (data13 === "scalar")) || (data13 === "categorical")) || (data13 === "layout")) || (data13 === "location"))){
const err27 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.codebook.properties.node.additionalProperties.anyOf[0].properties.variables.additionalProperties.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data11.encrypted !== undefined){
if(typeof data11.encrypted !== "boolean"){
const err28 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/encrypted",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/encrypted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data11.component !== undefined){
let data15 = data11.component;
if(typeof data15 !== "string"){
const err29 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(!(((((((((((((data15 === "Boolean") || (data15 === "CheckboxGroup")) || (data15 === "Number")) || (data15 === "RadioGroup")) || (data15 === "Text")) || (data15 === "TextArea")) || (data15 === "Toggle")) || (data15 === "ToggleButtonGroup")) || (data15 === "Slider")) || (data15 === "VisualAnalogScale")) || (data15 === "LikertScale")) || (data15 === "DatePicker")) || (data15 === "RelativeDatePicker"))){
const err30 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/enum",keyword:"enum",params:{allowedValues: schema329.properties.codebook.properties.node.additionalProperties.anyOf[0].properties.variables.additionalProperties.properties.component.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data11.options !== undefined){
let data16 = data11.options;
if(Array.isArray(data16)){
const len0 = data16.length;
for(let i0=0; i0<len0; i0++){
let data17 = data16[i0];
const _errs45 = errors;
let valid10 = false;
const _errs46 = errors;
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
if(data17.label === undefined){
const err31 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(data17.value === undefined){
const err32 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
for(const key7 in data17){
if(!(((key7 === "label") || (key7 === "value")) || (key7 === "negative"))){
const err33 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data17.label !== undefined){
if(typeof data17.label !== "string"){
const err34 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/label",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data17.value !== undefined){
let data19 = data17.value;
const _errs52 = errors;
let valid12 = false;
const _errs53 = errors;
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err35 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid2 = _errs53 === errors;
valid12 = valid12 || _valid2;
if(!valid12){
const _errs55 = errors;
if(typeof data19 === "string"){
if(!pattern22.test(data19)){
const err36 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
else {
const err37 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid2 = _errs55 === errors;
valid12 = valid12 || _valid2;
if(!valid12){
const _errs57 = errors;
if(typeof data19 !== "boolean"){
const err38 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var _valid2 = _errs57 === errors;
valid12 = valid12 || _valid2;
}
}
if(!valid12){
const err39 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
errors = _errs52;
if(vErrors !== null){
if(_errs52){
vErrors.length = _errs52;
}
else {
vErrors = null;
}
}
}
}
if(data17.negative !== undefined){
if(typeof data17.negative !== "boolean"){
const err40 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/negative",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/negative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var _valid1 = _errs46 === errors;
valid10 = valid10 || _valid1;
if(!valid10){
const _errs61 = errors;
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err42 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var _valid1 = _errs61 === errors;
valid10 = valid10 || _valid1;
if(!valid10){
const _errs63 = errors;
if(typeof data17 !== "string"){
const err43 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var _valid1 = _errs63 === errors;
valid10 = valid10 || _valid1;
}
}
if(!valid10){
const err44 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
else {
errors = _errs45;
if(vErrors !== null){
if(_errs45){
vErrors.length = _errs45;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err45 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/options",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data11.parameters !== undefined){
let data21 = data11.parameters;
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
}
else {
const err46 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/parameters",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data11.validation !== undefined){
let data22 = data11.validation;
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
for(const key8 in data22){
if(!(func2.call(schema329.properties.codebook.properties.node.additionalProperties.anyOf[0].properties.variables.additionalProperties.properties.validation.properties, key8))){
const err47 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data22.required !== undefined){
if(typeof data22.required !== "boolean"){
const err48 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/required",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data22.requiredAcceptsNull !== undefined){
if(typeof data22.requiredAcceptsNull !== "boolean"){
const err49 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/requiredAcceptsNull",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/requiredAcceptsNull/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data22.minLength !== undefined){
let data25 = data22.minLength;
if(!(((typeof data25 == "number") && (!(data25 % 1) && !isNaN(data25))) && (isFinite(data25)))){
const err50 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minLength",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data22.maxLength !== undefined){
let data26 = data22.maxLength;
if(!(((typeof data26 == "number") && (!(data26 % 1) && !isNaN(data26))) && (isFinite(data26)))){
const err51 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxLength",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data22.minValue !== undefined){
let data27 = data22.minValue;
if(!(((typeof data27 == "number") && (!(data27 % 1) && !isNaN(data27))) && (isFinite(data27)))){
const err52 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minValue",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data22.maxValue !== undefined){
let data28 = data22.maxValue;
if(!(((typeof data28 == "number") && (!(data28 % 1) && !isNaN(data28))) && (isFinite(data28)))){
const err53 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxValue",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data22.minSelected !== undefined){
let data29 = data22.minSelected;
if(!(((typeof data29 == "number") && (!(data29 % 1) && !isNaN(data29))) && (isFinite(data29)))){
const err54 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minSelected",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data22.maxSelected !== undefined){
let data30 = data22.maxSelected;
if(!(((typeof data30 == "number") && (!(data30 % 1) && !isNaN(data30))) && (isFinite(data30)))){
const err55 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxSelected",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data22.unique !== undefined){
if(typeof data22.unique !== "boolean"){
const err56 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/unique",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/unique/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data22.differentFrom !== undefined){
if(typeof data22.differentFrom !== "string"){
const err57 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/differentFrom",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/differentFrom/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data22.sameAs !== undefined){
if(typeof data22.sameAs !== "string"){
const err58 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/sameAs",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/sameAs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data22.greaterThanVariable !== undefined){
if(typeof data22.greaterThanVariable !== "string"){
const err59 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/greaterThanVariable",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/greaterThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data22.lessThanVariable !== undefined){
if(typeof data22.lessThanVariable !== "string"){
const err60 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/lessThanVariable",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/lessThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
}
else {
const err61 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
}
else {
const err62 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
}
else {
const err63 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data6.color !== undefined){
if(typeof data6.color !== "string"){
const err64 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/color",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
else {
const err65 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid0 = _errs18 === errors;
valid3 = valid3 || _valid0;
if(!valid3){
const _errs99 = errors;
const err66 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/1/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
var _valid0 = _errs99 === errors;
valid3 = valid3 || _valid0;
}
if(!valid3){
const err67 = {instancePath:instancePath+"/codebook/node/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err68 = {instancePath:instancePath+"/codebook/node",schemaPath:"#/properties/codebook/properties/node/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data4.edge !== undefined){
let data37 = data4.edge;
if(data37 && typeof data37 == "object" && !Array.isArray(data37)){
for(const key9 in data37){
let data38 = data37[key9];
const _errs105 = errors;
let valid15 = false;
const _errs106 = errors;
if(data38 && typeof data38 == "object" && !Array.isArray(data38)){
if(data38.name === undefined){
const err69 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(data38.color === undefined){
const err70 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "color"},message:"must have required property '"+"color"+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(data38.variables === undefined){
const err71 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "variables"},message:"must have required property '"+"variables"+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
for(const key10 in data38){
if(!(((key10 === "name") || (key10 === "color")) || (key10 === "variables"))){
const err72 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data38.name !== undefined){
if(typeof data38.name !== "string"){
const err73 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data38.color !== undefined){
if(typeof data38.color !== "string"){
const err74 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/color",schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data38.variables !== undefined){
let data41 = data38.variables;
if(data41 && typeof data41 == "object" && !Array.isArray(data41)){
for(const key11 in data41){
const _errs116 = errors;
if(typeof key11 === "string"){
if(!pattern22.test(key11)){
const err75 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\"",propertyName:key11};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
var valid18 = _errs116 === errors;
if(!valid18){
const err76 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames",keyword:"propertyNames",params:{propertyName: key11},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
for(const key12 in data41){
let data42 = data41[key12];
if(data42 && typeof data42 == "object" && !Array.isArray(data42)){
if(data42.name === undefined){
const err77 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(data42.type === undefined){
const err78 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
for(const key13 in data42){
if(!(((((((key13 === "name") || (key13 === "type")) || (key13 === "encrypted")) || (key13 === "component")) || (key13 === "options")) || (key13 === "parameters")) || (key13 === "validation"))){
const err79 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data42.name !== undefined){
let data43 = data42.name;
if(typeof data43 === "string"){
if(!pattern22.test(data43)){
const err80 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
else {
const err81 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data42.type !== undefined){
let data44 = data42.type;
if(typeof data44 !== "string"){
const err82 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(!(((((((((data44 === "boolean") || (data44 === "text")) || (data44 === "number")) || (data44 === "datetime")) || (data44 === "ordinal")) || (data44 === "scalar")) || (data44 === "categorical")) || (data44 === "layout")) || (data44 === "location"))){
const err83 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data42.encrypted !== undefined){
if(typeof data42.encrypted !== "boolean"){
const err84 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/encrypted",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/encrypted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data42.component !== undefined){
let data46 = data42.component;
if(typeof data46 !== "string"){
const err85 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(!(((((((((((((data46 === "Boolean") || (data46 === "CheckboxGroup")) || (data46 === "Number")) || (data46 === "RadioGroup")) || (data46 === "Text")) || (data46 === "TextArea")) || (data46 === "Toggle")) || (data46 === "ToggleButtonGroup")) || (data46 === "Slider")) || (data46 === "VisualAnalogScale")) || (data46 === "LikertScale")) || (data46 === "DatePicker")) || (data46 === "RelativeDatePicker"))){
const err86 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.component.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data42.options !== undefined){
let data47 = data42.options;
if(Array.isArray(data47)){
const len1 = data47.length;
for(let i1=0; i1<len1; i1++){
let data48 = data47[i1];
const _errs132 = errors;
let valid23 = false;
const _errs133 = errors;
if(data48 && typeof data48 == "object" && !Array.isArray(data48)){
if(data48.label === undefined){
const err87 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if(data48.value === undefined){
const err88 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
for(const key14 in data48){
if(!(((key14 === "label") || (key14 === "value")) || (key14 === "negative"))){
const err89 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data48.label !== undefined){
if(typeof data48.label !== "string"){
const err90 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/label",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data48.value !== undefined){
let data50 = data48.value;
const _errs139 = errors;
let valid25 = false;
const _errs140 = errors;
if(!(((typeof data50 == "number") && (!(data50 % 1) && !isNaN(data50))) && (isFinite(data50)))){
const err91 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
var _valid5 = _errs140 === errors;
valid25 = valid25 || _valid5;
if(!valid25){
const _errs142 = errors;
if(typeof data50 === "string"){
if(!pattern22.test(data50)){
const err92 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
else {
const err93 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var _valid5 = _errs142 === errors;
valid25 = valid25 || _valid5;
if(!valid25){
const _errs144 = errors;
if(typeof data50 !== "boolean"){
const err94 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var _valid5 = _errs144 === errors;
valid25 = valid25 || _valid5;
}
}
if(!valid25){
const err95 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
else {
errors = _errs139;
if(vErrors !== null){
if(_errs139){
vErrors.length = _errs139;
}
else {
vErrors = null;
}
}
}
}
if(data48.negative !== undefined){
if(typeof data48.negative !== "boolean"){
const err96 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/negative",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/negative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
}
else {
const err97 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var _valid4 = _errs133 === errors;
valid23 = valid23 || _valid4;
if(!valid23){
const _errs148 = errors;
if(!(((typeof data48 == "number") && (!(data48 % 1) && !isNaN(data48))) && (isFinite(data48)))){
const err98 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
var _valid4 = _errs148 === errors;
valid23 = valid23 || _valid4;
if(!valid23){
const _errs150 = errors;
if(typeof data48 !== "string"){
const err99 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
var _valid4 = _errs150 === errors;
valid23 = valid23 || _valid4;
}
}
if(!valid23){
const err100 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
else {
errors = _errs132;
if(vErrors !== null){
if(_errs132){
vErrors.length = _errs132;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err101 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/options",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
if(data42.parameters !== undefined){
let data52 = data42.parameters;
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
}
else {
const err102 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/parameters",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data42.validation !== undefined){
let data53 = data42.validation;
if(data53 && typeof data53 == "object" && !Array.isArray(data53)){
for(const key15 in data53){
if(!(func2.call(schema330.additionalProperties.properties.validation.properties, key15))){
const err103 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
if(data53.required !== undefined){
if(typeof data53.required !== "boolean"){
const err104 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/required",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data53.requiredAcceptsNull !== undefined){
if(typeof data53.requiredAcceptsNull !== "boolean"){
const err105 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/requiredAcceptsNull",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/requiredAcceptsNull/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
if(data53.minLength !== undefined){
let data56 = data53.minLength;
if(!(((typeof data56 == "number") && (!(data56 % 1) && !isNaN(data56))) && (isFinite(data56)))){
const err106 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
if(data53.maxLength !== undefined){
let data57 = data53.maxLength;
if(!(((typeof data57 == "number") && (!(data57 % 1) && !isNaN(data57))) && (isFinite(data57)))){
const err107 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
if(data53.minValue !== undefined){
let data58 = data53.minValue;
if(!(((typeof data58 == "number") && (!(data58 % 1) && !isNaN(data58))) && (isFinite(data58)))){
const err108 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data53.maxValue !== undefined){
let data59 = data53.maxValue;
if(!(((typeof data59 == "number") && (!(data59 % 1) && !isNaN(data59))) && (isFinite(data59)))){
const err109 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
if(data53.minSelected !== undefined){
let data60 = data53.minSelected;
if(!(((typeof data60 == "number") && (!(data60 % 1) && !isNaN(data60))) && (isFinite(data60)))){
const err110 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
if(data53.maxSelected !== undefined){
let data61 = data53.maxSelected;
if(!(((typeof data61 == "number") && (!(data61 % 1) && !isNaN(data61))) && (isFinite(data61)))){
const err111 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
if(data53.unique !== undefined){
if(typeof data53.unique !== "boolean"){
const err112 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/unique",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/unique/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
if(data53.differentFrom !== undefined){
if(typeof data53.differentFrom !== "string"){
const err113 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/differentFrom",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/differentFrom/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
if(data53.sameAs !== undefined){
if(typeof data53.sameAs !== "string"){
const err114 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/sameAs",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/sameAs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
if(data53.greaterThanVariable !== undefined){
if(typeof data53.greaterThanVariable !== "string"){
const err115 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/greaterThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/greaterThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
if(data53.lessThanVariable !== undefined){
if(typeof data53.lessThanVariable !== "string"){
const err116 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/lessThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/lessThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
}
else {
const err117 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
}
else {
const err118 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key12.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
}
else {
const err119 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
}
else {
const err120 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
var _valid3 = _errs106 === errors;
valid15 = valid15 || _valid3;
if(!valid15){
const _errs184 = errors;
const err121 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/1/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
var _valid3 = _errs184 === errors;
valid15 = valid15 || _valid3;
}
if(!valid15){
const err122 = {instancePath:instancePath+"/codebook/edge/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
else {
errors = _errs105;
if(vErrors !== null){
if(_errs105){
vErrors.length = _errs105;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err123 = {instancePath:instancePath+"/codebook/edge",schemaPath:"#/properties/codebook/properties/edge/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data4.ego !== undefined){
let data67 = data4.ego;
if(data67 && typeof data67 == "object" && !Array.isArray(data67)){
if(data67.variables === undefined){
const err124 = {instancePath:instancePath+"/codebook/ego",schemaPath:"#/properties/codebook/properties/ego/required",keyword:"required",params:{missingProperty: "variables"},message:"must have required property '"+"variables"+"'"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
for(const key16 in data67){
if(!(key16 === "variables")){
const err125 = {instancePath:instancePath+"/codebook/ego",schemaPath:"#/properties/codebook/properties/ego/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
if(data67.variables !== undefined){
let data68 = data67.variables;
if(data68 && typeof data68 == "object" && !Array.isArray(data68)){
for(const key17 in data68){
const _errs192 = errors;
if(typeof key17 === "string"){
if(!pattern22.test(key17)){
const err126 = {instancePath:instancePath+"/codebook/ego/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\"",propertyName:key17};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
var valid29 = _errs192 === errors;
if(!valid29){
const err127 = {instancePath:instancePath+"/codebook/ego/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames",keyword:"propertyNames",params:{propertyName: key17},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
for(const key18 in data68){
let data69 = data68[key18];
if(data69 && typeof data69 == "object" && !Array.isArray(data69)){
if(data69.name === undefined){
const err128 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
if(data69.type === undefined){
const err129 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
for(const key19 in data69){
if(!(((((((key19 === "name") || (key19 === "type")) || (key19 === "encrypted")) || (key19 === "component")) || (key19 === "options")) || (key19 === "parameters")) || (key19 === "validation"))){
const err130 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data69.name !== undefined){
let data70 = data69.name;
if(typeof data70 === "string"){
if(!pattern22.test(data70)){
const err131 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
}
else {
const err132 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
}
if(data69.type !== undefined){
let data71 = data69.type;
if(typeof data71 !== "string"){
const err133 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if(!(((((((((data71 === "boolean") || (data71 === "text")) || (data71 === "number")) || (data71 === "datetime")) || (data71 === "ordinal")) || (data71 === "scalar")) || (data71 === "categorical")) || (data71 === "layout")) || (data71 === "location"))){
const err134 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
if(data69.encrypted !== undefined){
if(typeof data69.encrypted !== "boolean"){
const err135 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/encrypted",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/encrypted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
if(data69.component !== undefined){
let data73 = data69.component;
if(typeof data73 !== "string"){
const err136 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
if(!(((((((((((((data73 === "Boolean") || (data73 === "CheckboxGroup")) || (data73 === "Number")) || (data73 === "RadioGroup")) || (data73 === "Text")) || (data73 === "TextArea")) || (data73 === "Toggle")) || (data73 === "ToggleButtonGroup")) || (data73 === "Slider")) || (data73 === "VisualAnalogScale")) || (data73 === "LikertScale")) || (data73 === "DatePicker")) || (data73 === "RelativeDatePicker"))){
const err137 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.component.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
if(data69.options !== undefined){
let data74 = data69.options;
if(Array.isArray(data74)){
const len2 = data74.length;
for(let i2=0; i2<len2; i2++){
let data75 = data74[i2];
const _errs208 = errors;
let valid34 = false;
const _errs209 = errors;
if(data75 && typeof data75 == "object" && !Array.isArray(data75)){
if(data75.label === undefined){
const err138 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
if(data75.value === undefined){
const err139 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
for(const key20 in data75){
if(!(((key20 === "label") || (key20 === "value")) || (key20 === "negative"))){
const err140 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
if(data75.label !== undefined){
if(typeof data75.label !== "string"){
const err141 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/label",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
}
if(data75.value !== undefined){
let data77 = data75.value;
const _errs215 = errors;
let valid36 = false;
const _errs216 = errors;
if(!(((typeof data77 == "number") && (!(data77 % 1) && !isNaN(data77))) && (isFinite(data77)))){
const err142 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var _valid7 = _errs216 === errors;
valid36 = valid36 || _valid7;
if(!valid36){
const _errs218 = errors;
if(typeof data77 === "string"){
if(!pattern22.test(data77)){
const err143 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
else {
const err144 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
var _valid7 = _errs218 === errors;
valid36 = valid36 || _valid7;
if(!valid36){
const _errs220 = errors;
if(typeof data77 !== "boolean"){
const err145 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
var _valid7 = _errs220 === errors;
valid36 = valid36 || _valid7;
}
}
if(!valid36){
const err146 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
else {
errors = _errs215;
if(vErrors !== null){
if(_errs215){
vErrors.length = _errs215;
}
else {
vErrors = null;
}
}
}
}
if(data75.negative !== undefined){
if(typeof data75.negative !== "boolean"){
const err147 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/negative",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/negative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
}
else {
const err148 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
var _valid6 = _errs209 === errors;
valid34 = valid34 || _valid6;
if(!valid34){
const _errs224 = errors;
if(!(((typeof data75 == "number") && (!(data75 % 1) && !isNaN(data75))) && (isFinite(data75)))){
const err149 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
var _valid6 = _errs224 === errors;
valid34 = valid34 || _valid6;
if(!valid34){
const _errs226 = errors;
if(typeof data75 !== "string"){
const err150 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
var _valid6 = _errs226 === errors;
valid34 = valid34 || _valid6;
}
}
if(!valid34){
const err151 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
else {
errors = _errs208;
if(vErrors !== null){
if(_errs208){
vErrors.length = _errs208;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err152 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/options",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
if(data69.parameters !== undefined){
let data79 = data69.parameters;
if(data79 && typeof data79 == "object" && !Array.isArray(data79)){
}
else {
const err153 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/parameters",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
}
if(data69.validation !== undefined){
let data80 = data69.validation;
if(data80 && typeof data80 == "object" && !Array.isArray(data80)){
for(const key21 in data80){
if(!(func2.call(schema330.additionalProperties.properties.validation.properties, key21))){
const err154 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
if(data80.required !== undefined){
if(typeof data80.required !== "boolean"){
const err155 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/required",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
if(data80.requiredAcceptsNull !== undefined){
if(typeof data80.requiredAcceptsNull !== "boolean"){
const err156 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/requiredAcceptsNull",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/requiredAcceptsNull/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
}
if(data80.minLength !== undefined){
let data83 = data80.minLength;
if(!(((typeof data83 == "number") && (!(data83 % 1) && !isNaN(data83))) && (isFinite(data83)))){
const err157 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
if(data80.maxLength !== undefined){
let data84 = data80.maxLength;
if(!(((typeof data84 == "number") && (!(data84 % 1) && !isNaN(data84))) && (isFinite(data84)))){
const err158 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
if(data80.minValue !== undefined){
let data85 = data80.minValue;
if(!(((typeof data85 == "number") && (!(data85 % 1) && !isNaN(data85))) && (isFinite(data85)))){
const err159 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
}
if(data80.maxValue !== undefined){
let data86 = data80.maxValue;
if(!(((typeof data86 == "number") && (!(data86 % 1) && !isNaN(data86))) && (isFinite(data86)))){
const err160 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
}
if(data80.minSelected !== undefined){
let data87 = data80.minSelected;
if(!(((typeof data87 == "number") && (!(data87 % 1) && !isNaN(data87))) && (isFinite(data87)))){
const err161 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
}
if(data80.maxSelected !== undefined){
let data88 = data80.maxSelected;
if(!(((typeof data88 == "number") && (!(data88 % 1) && !isNaN(data88))) && (isFinite(data88)))){
const err162 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
if(data80.unique !== undefined){
if(typeof data80.unique !== "boolean"){
const err163 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/unique",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/unique/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
}
if(data80.differentFrom !== undefined){
if(typeof data80.differentFrom !== "string"){
const err164 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/differentFrom",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/differentFrom/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
if(data80.sameAs !== undefined){
if(typeof data80.sameAs !== "string"){
const err165 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/sameAs",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/sameAs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
if(data80.greaterThanVariable !== undefined){
if(typeof data80.greaterThanVariable !== "string"){
const err166 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/greaterThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/greaterThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
}
if(data80.lessThanVariable !== undefined){
if(typeof data80.lessThanVariable !== "string"){
const err167 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/lessThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/lessThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
}
}
else {
const err168 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
}
}
else {
const err169 = {instancePath:instancePath+"/codebook/ego/variables/" + key18.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
}
else {
const err170 = {instancePath:instancePath+"/codebook/ego/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
}
else {
const err171 = {instancePath:instancePath+"/codebook/ego",schemaPath:"#/properties/codebook/properties/ego/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
}
}
else {
const err172 = {instancePath:instancePath+"/codebook",schemaPath:"#/properties/codebook/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
}
if(data.assetManifest !== undefined){
let data94 = data.assetManifest;
if(data94 && typeof data94 == "object" && !Array.isArray(data94)){
for(const key22 in data94){
let data95 = data94[key22];
const _errs264 = errors;
let valid39 = false;
const _errs265 = errors;
if(data95 && typeof data95 == "object" && !Array.isArray(data95)){
if(data95.id === undefined){
const err173 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
if(data95.type === undefined){
const err174 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
if(data95.name === undefined){
const err175 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
if(data95.source === undefined){
const err176 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
for(const key23 in data95){
if(!((((key23 === "id") || (key23 === "type")) || (key23 === "name")) || (key23 === "source"))){
const err177 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
}
if(data95.id !== undefined){
if(typeof data95.id !== "string"){
const err178 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/id",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
}
if(data95.type !== undefined){
let data97 = data95.type;
if(typeof data97 !== "string"){
const err179 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
if(!((((data97 === "image") || (data97 === "video")) || (data97 === "network")) || (data97 === "geojson"))){
const err180 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.assetManifest.additionalProperties.anyOf[0].properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
if(data95.name !== undefined){
if(typeof data95.name !== "string"){
const err181 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
if(data95.source !== undefined){
if(typeof data95.source !== "string"){
const err182 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/source",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
}
}
else {
const err183 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
var _valid8 = _errs265 === errors;
valid39 = valid39 || _valid8;
if(!valid39){
const _errs276 = errors;
if(data95 && typeof data95 == "object" && !Array.isArray(data95)){
if(data95.id === undefined){
const err184 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
if(data95.type === undefined){
const err185 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
}
if(data95.name === undefined){
const err186 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
if(data95.value === undefined){
const err187 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
for(const key24 in data95){
if(!((((key24 === "id") || (key24 === "type")) || (key24 === "name")) || (key24 === "value"))){
const err188 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
}
if(data95.id !== undefined){
if(typeof data95.id !== "string"){
const err189 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/id",schemaPath:"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
if(data95.type !== undefined){
let data101 = data95.type;
if(typeof data101 !== "string"){
const err190 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
if(!(data101 === "apikey")){
const err191 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.assetManifest.additionalProperties.anyOf[1].properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
}
if(data95.name !== undefined){
if(typeof data95.name !== "string"){
const err192 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
}
if(data95.value !== undefined){
if(typeof data95.value !== "string"){
const err193 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1")+"/value",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
}
}
else {
const err194 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
var _valid8 = _errs276 === errors;
valid39 = valid39 || _valid8;
}
if(!valid39){
const err195 = {instancePath:instancePath+"/assetManifest/" + key22.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
else {
errors = _errs264;
if(vErrors !== null){
if(_errs264){
vErrors.length = _errs264;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err196 = {instancePath:instancePath+"/assetManifest",schemaPath:"#/properties/assetManifest/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
}
if(data.stages !== undefined){
let data104 = data.stages;
if(Array.isArray(data104)){
const len3 = data104.length;
for(let i3=0; i3<len3; i3++){
let data105 = data104[i3];
const _errs292 = errors;
let valid46 = false;
const _errs293 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err197 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
}
if(data105.label === undefined){
const err198 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
if(data105.type === undefined){
const err199 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
if(data105.form === undefined){
const err200 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
for(const key25 in data105){
if(!((((((((key25 === "id") || (key25 === "interviewScript")) || (key25 === "label")) || (key25 === "filter")) || (key25 === "skipLogic")) || (key25 === "introductionPanel")) || (key25 === "type")) || (key25 === "form"))){
const err201 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err202 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err203 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err204 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
}
if(data105.filter !== undefined){
let data109 = data105.filter;
const _errs303 = errors;
let valid48 = false;
const _errs304 = errors;
const _errs305 = errors;
let valid49 = false;
const _errs306 = errors;
const err205 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
var _valid11 = _errs306 === errors;
valid49 = valid49 || _valid11;
if(!valid49){
const _errs308 = errors;
if(data109 && typeof data109 == "object" && !Array.isArray(data109)){
for(const key26 in data109){
if(!((key26 === "join") || (key26 === "rules"))){
const err206 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
}
}
if(data109.join !== undefined){
let data110 = data109.join;
if(typeof data110 !== "string"){
const err207 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err207];
}
else {
vErrors.push(err207);
}
errors++;
}
if(!((data110 === "OR") || (data110 === "AND"))){
const err208 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.filter.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err208];
}
else {
vErrors.push(err208);
}
errors++;
}
}
if(data109.rules !== undefined){
let data111 = data109.rules;
if(Array.isArray(data111)){
const len4 = data111.length;
for(let i4=0; i4<len4; i4++){
let data112 = data111[i4];
if(data112 && typeof data112 == "object" && !Array.isArray(data112)){
if(data112.type === undefined){
const err209 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err209];
}
else {
vErrors.push(err209);
}
errors++;
}
if(data112.id === undefined){
const err210 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err210];
}
else {
vErrors.push(err210);
}
errors++;
}
if(data112.options === undefined){
const err211 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err211];
}
else {
vErrors.push(err211);
}
errors++;
}
for(const key27 in data112){
if(!(((key27 === "type") || (key27 === "id")) || (key27 === "options"))){
const err212 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key27},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err212];
}
else {
vErrors.push(err212);
}
errors++;
}
}
if(data112.type !== undefined){
let data113 = data112.type;
if(typeof data113 !== "string"){
const err213 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err213];
}
else {
vErrors.push(err213);
}
errors++;
}
if(!(((data113 === "alter") || (data113 === "ego")) || (data113 === "edge"))){
const err214 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.filter.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err214];
}
else {
vErrors.push(err214);
}
errors++;
}
}
if(data112.id !== undefined){
if(typeof data112.id !== "string"){
const err215 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/id",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err215];
}
else {
vErrors.push(err215);
}
errors++;
}
}
if(data112.options !== undefined){
let data115 = data112.options;
if(data115 && typeof data115 == "object" && !Array.isArray(data115)){
if(data115.operator === undefined){
const err216 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err216];
}
else {
vErrors.push(err216);
}
errors++;
}
if(data115.type !== undefined){
if(typeof data115.type !== "string"){
const err217 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err217];
}
else {
vErrors.push(err217);
}
errors++;
}
}
if(data115.attribute !== undefined){
if(typeof data115.attribute !== "string"){
const err218 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/attribute",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err218];
}
else {
vErrors.push(err218);
}
errors++;
}
}
if(data115.operator !== undefined){
let data118 = data115.operator;
if(typeof data118 !== "string"){
const err219 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/operator",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err219];
}
else {
vErrors.push(err219);
}
errors++;
}
if(!((((((((((((((((data118 === "EXISTS") || (data118 === "NOT_EXISTS")) || (data118 === "EXACTLY")) || (data118 === "NOT")) || (data118 === "GREATER_THAN")) || (data118 === "GREATER_THAN_OR_EQUAL")) || (data118 === "LESS_THAN")) || (data118 === "LESS_THAN_OR_EQUAL")) || (data118 === "INCLUDES")) || (data118 === "EXCLUDES")) || (data118 === "OPTIONS_GREATER_THAN")) || (data118 === "OPTIONS_LESS_THAN")) || (data118 === "OPTIONS_EQUALS")) || (data118 === "OPTIONS_NOT_EQUALS")) || (data118 === "CONTAINS")) || (data118 === "DOES NOT CONTAIN"))){
const err220 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/operator",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.filter.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err220];
}
else {
vErrors.push(err220);
}
errors++;
}
}
if(data115.value !== undefined){
let data119 = data115.value;
const _errs332 = errors;
let valid56 = false;
const _errs333 = errors;
if(!(((typeof data119 == "number") && (!(data119 % 1) && !isNaN(data119))) && (isFinite(data119)))){
const err221 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err221];
}
else {
vErrors.push(err221);
}
errors++;
}
var _valid12 = _errs333 === errors;
valid56 = valid56 || _valid12;
if(!valid56){
const _errs335 = errors;
if(typeof data119 !== "string"){
const err222 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err222];
}
else {
vErrors.push(err222);
}
errors++;
}
var _valid12 = _errs335 === errors;
valid56 = valid56 || _valid12;
if(!valid56){
const _errs337 = errors;
if(typeof data119 !== "boolean"){
const err223 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err223];
}
else {
vErrors.push(err223);
}
errors++;
}
var _valid12 = _errs337 === errors;
valid56 = valid56 || _valid12;
if(!valid56){
const _errs339 = errors;
if(!(Array.isArray(data119))){
const err224 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err224];
}
else {
vErrors.push(err224);
}
errors++;
}
var _valid12 = _errs339 === errors;
valid56 = valid56 || _valid12;
}
}
}
if(!valid56){
const err225 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err225];
}
else {
vErrors.push(err225);
}
errors++;
}
else {
errors = _errs332;
if(vErrors !== null){
if(_errs332){
vErrors.length = _errs332;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err226 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err226];
}
else {
vErrors.push(err226);
}
errors++;
}
}
}
else {
const err227 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err227];
}
else {
vErrors.push(err227);
}
errors++;
}
}
}
else {
const err228 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err228];
}
else {
vErrors.push(err228);
}
errors++;
}
}
}
else {
const err229 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err229];
}
else {
vErrors.push(err229);
}
errors++;
}
var _valid11 = _errs308 === errors;
valid49 = valid49 || _valid11;
}
if(!valid49){
const err230 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err230];
}
else {
vErrors.push(err230);
}
errors++;
}
else {
errors = _errs305;
if(vErrors !== null){
if(_errs305){
vErrors.length = _errs305;
}
else {
vErrors = null;
}
}
}
var _valid10 = _errs304 === errors;
valid48 = valid48 || _valid10;
if(!valid48){
const _errs341 = errors;
if(data109 !== null){
const err231 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err231];
}
else {
vErrors.push(err231);
}
errors++;
}
var _valid10 = _errs341 === errors;
valid48 = valid48 || _valid10;
}
if(!valid48){
const err232 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err232];
}
else {
vErrors.push(err232);
}
errors++;
}
else {
errors = _errs303;
if(vErrors !== null){
if(_errs303){
vErrors.length = _errs303;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
let data120 = data105.skipLogic;
if(data120 && typeof data120 == "object" && !Array.isArray(data120)){
if(data120.action === undefined){
const err233 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err233];
}
else {
vErrors.push(err233);
}
errors++;
}
for(const key28 in data120){
if(!((key28 === "action") || (key28 === "filter"))){
const err234 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key28},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err234];
}
else {
vErrors.push(err234);
}
errors++;
}
}
if(data120.action !== undefined){
let data121 = data120.action;
if(typeof data121 !== "string"){
const err235 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/action",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err235];
}
else {
vErrors.push(err235);
}
errors++;
}
if(!((data121 === "SHOW") || (data121 === "SKIP"))){
const err236 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/action",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/action/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.skipLogic.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err236];
}
else {
vErrors.push(err236);
}
errors++;
}
}
if(data120.filter !== undefined){
let data122 = data120.filter;
const _errs349 = errors;
let valid58 = false;
const _errs350 = errors;
const _errs352 = errors;
let valid60 = false;
const _errs353 = errors;
const err237 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err237];
}
else {
vErrors.push(err237);
}
errors++;
var _valid14 = _errs353 === errors;
valid60 = valid60 || _valid14;
if(!valid60){
const _errs355 = errors;
if(data122 && typeof data122 == "object" && !Array.isArray(data122)){
for(const key29 in data122){
if(!((key29 === "join") || (key29 === "rules"))){
const err238 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key29},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err238];
}
else {
vErrors.push(err238);
}
errors++;
}
}
if(data122.join !== undefined){
let data123 = data122.join;
if(typeof data123 !== "string"){
const err239 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err239];
}
else {
vErrors.push(err239);
}
errors++;
}
if(!((data123 === "OR") || (data123 === "AND"))){
const err240 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err240];
}
else {
vErrors.push(err240);
}
errors++;
}
}
if(data122.rules !== undefined){
let data124 = data122.rules;
if(Array.isArray(data124)){
const len5 = data124.length;
for(let i5=0; i5<len5; i5++){
let data125 = data124[i5];
if(data125 && typeof data125 == "object" && !Array.isArray(data125)){
if(data125.type === undefined){
const err241 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err241];
}
else {
vErrors.push(err241);
}
errors++;
}
if(data125.id === undefined){
const err242 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err242];
}
else {
vErrors.push(err242);
}
errors++;
}
if(data125.options === undefined){
const err243 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err243];
}
else {
vErrors.push(err243);
}
errors++;
}
for(const key30 in data125){
if(!(((key30 === "type") || (key30 === "id")) || (key30 === "options"))){
const err244 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key30},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err244];
}
else {
vErrors.push(err244);
}
errors++;
}
}
if(data125.type !== undefined){
let data126 = data125.type;
if(typeof data126 !== "string"){
const err245 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err245];
}
else {
vErrors.push(err245);
}
errors++;
}
if(!(((data126 === "alter") || (data126 === "ego")) || (data126 === "edge"))){
const err246 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err246];
}
else {
vErrors.push(err246);
}
errors++;
}
}
if(data125.id !== undefined){
if(typeof data125.id !== "string"){
const err247 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err247];
}
else {
vErrors.push(err247);
}
errors++;
}
}
if(data125.options !== undefined){
let data128 = data125.options;
if(data128 && typeof data128 == "object" && !Array.isArray(data128)){
if(data128.operator === undefined){
const err248 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err248];
}
else {
vErrors.push(err248);
}
errors++;
}
if(data128.type !== undefined){
if(typeof data128.type !== "string"){
const err249 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err249];
}
else {
vErrors.push(err249);
}
errors++;
}
}
if(data128.attribute !== undefined){
if(typeof data128.attribute !== "string"){
const err250 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err250];
}
else {
vErrors.push(err250);
}
errors++;
}
}
if(data128.operator !== undefined){
let data131 = data128.operator;
if(typeof data131 !== "string"){
const err251 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err251];
}
else {
vErrors.push(err251);
}
errors++;
}
if(!((((((((((((((((data131 === "EXISTS") || (data131 === "NOT_EXISTS")) || (data131 === "EXACTLY")) || (data131 === "NOT")) || (data131 === "GREATER_THAN")) || (data131 === "GREATER_THAN_OR_EQUAL")) || (data131 === "LESS_THAN")) || (data131 === "LESS_THAN_OR_EQUAL")) || (data131 === "INCLUDES")) || (data131 === "EXCLUDES")) || (data131 === "OPTIONS_GREATER_THAN")) || (data131 === "OPTIONS_LESS_THAN")) || (data131 === "OPTIONS_EQUALS")) || (data131 === "OPTIONS_NOT_EQUALS")) || (data131 === "CONTAINS")) || (data131 === "DOES NOT CONTAIN"))){
const err252 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err252];
}
else {
vErrors.push(err252);
}
errors++;
}
}
if(data128.value !== undefined){
let data132 = data128.value;
const _errs379 = errors;
let valid67 = false;
const _errs380 = errors;
if(!(((typeof data132 == "number") && (!(data132 % 1) && !isNaN(data132))) && (isFinite(data132)))){
const err253 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err253];
}
else {
vErrors.push(err253);
}
errors++;
}
var _valid15 = _errs380 === errors;
valid67 = valid67 || _valid15;
if(!valid67){
const _errs382 = errors;
if(typeof data132 !== "string"){
const err254 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err254];
}
else {
vErrors.push(err254);
}
errors++;
}
var _valid15 = _errs382 === errors;
valid67 = valid67 || _valid15;
if(!valid67){
const _errs384 = errors;
if(typeof data132 !== "boolean"){
const err255 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err255];
}
else {
vErrors.push(err255);
}
errors++;
}
var _valid15 = _errs384 === errors;
valid67 = valid67 || _valid15;
if(!valid67){
const _errs386 = errors;
if(!(Array.isArray(data132))){
const err256 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err256];
}
else {
vErrors.push(err256);
}
errors++;
}
var _valid15 = _errs386 === errors;
valid67 = valid67 || _valid15;
}
}
}
if(!valid67){
const err257 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err257];
}
else {
vErrors.push(err257);
}
errors++;
}
else {
errors = _errs379;
if(vErrors !== null){
if(_errs379){
vErrors.length = _errs379;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err258 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err258];
}
else {
vErrors.push(err258);
}
errors++;
}
}
}
else {
const err259 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err259];
}
else {
vErrors.push(err259);
}
errors++;
}
}
}
else {
const err260 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err260];
}
else {
vErrors.push(err260);
}
errors++;
}
}
}
else {
const err261 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err261];
}
else {
vErrors.push(err261);
}
errors++;
}
var _valid14 = _errs355 === errors;
valid60 = valid60 || _valid14;
}
if(!valid60){
const err262 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err262];
}
else {
vErrors.push(err262);
}
errors++;
}
else {
errors = _errs352;
if(vErrors !== null){
if(_errs352){
vErrors.length = _errs352;
}
else {
vErrors = null;
}
}
}
var _valid13 = _errs350 === errors;
valid58 = valid58 || _valid13;
if(!valid58){
const _errs388 = errors;
if(data122 !== null){
const err263 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err263];
}
else {
vErrors.push(err263);
}
errors++;
}
var _valid13 = _errs388 === errors;
valid58 = valid58 || _valid13;
}
if(!valid58){
const err264 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err264];
}
else {
vErrors.push(err264);
}
errors++;
}
else {
errors = _errs349;
if(vErrors !== null){
if(_errs349){
vErrors.length = _errs349;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err265 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err265];
}
else {
vErrors.push(err265);
}
errors++;
}
}
if(data105.introductionPanel !== undefined){
let data133 = data105.introductionPanel;
if(data133 && typeof data133 == "object" && !Array.isArray(data133)){
if(data133.title === undefined){
const err266 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err266];
}
else {
vErrors.push(err266);
}
errors++;
}
if(data133.text === undefined){
const err267 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err267];
}
else {
vErrors.push(err267);
}
errors++;
}
for(const key31 in data133){
if(!((key31 === "title") || (key31 === "text"))){
const err268 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key31},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err268];
}
else {
vErrors.push(err268);
}
errors++;
}
}
if(data133.title !== undefined){
if(typeof data133.title !== "string"){
const err269 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err269];
}
else {
vErrors.push(err269);
}
errors++;
}
}
if(data133.text !== undefined){
if(typeof data133.text !== "string"){
const err270 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err270];
}
else {
vErrors.push(err270);
}
errors++;
}
}
}
else {
const err271 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err271];
}
else {
vErrors.push(err271);
}
errors++;
}
}
if(data105.type !== undefined){
let data136 = data105.type;
if(typeof data136 !== "string"){
const err272 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err272];
}
else {
vErrors.push(err272);
}
errors++;
}
if("EgoForm" !== data136){
const err273 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/type/const",keyword:"const",params:{allowedValue: "EgoForm"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err273];
}
else {
vErrors.push(err273);
}
errors++;
}
}
if(data105.form !== undefined){
let data137 = data105.form;
if(data137 && typeof data137 == "object" && !Array.isArray(data137)){
if(data137.fields === undefined){
const err274 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err274];
}
else {
vErrors.push(err274);
}
errors++;
}
for(const key32 in data137){
if(!((key32 === "title") || (key32 === "fields"))){
const err275 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key32},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err275];
}
else {
vErrors.push(err275);
}
errors++;
}
}
if(data137.title !== undefined){
if(typeof data137.title !== "string"){
const err276 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err276];
}
else {
vErrors.push(err276);
}
errors++;
}
}
if(data137.fields !== undefined){
let data139 = data137.fields;
if(Array.isArray(data139)){
const len6 = data139.length;
for(let i6=0; i6<len6; i6++){
let data140 = data139[i6];
if(data140 && typeof data140 == "object" && !Array.isArray(data140)){
if(data140.variable === undefined){
const err277 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err277];
}
else {
vErrors.push(err277);
}
errors++;
}
if(data140.prompt === undefined){
const err278 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err278];
}
else {
vErrors.push(err278);
}
errors++;
}
for(const key33 in data140){
if(!((key33 === "variable") || (key33 === "prompt"))){
const err279 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key33},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err279];
}
else {
vErrors.push(err279);
}
errors++;
}
}
if(data140.variable !== undefined){
if(typeof data140.variable !== "string"){
const err280 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6+"/variable",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err280];
}
else {
vErrors.push(err280);
}
errors++;
}
}
if(data140.prompt !== undefined){
if(typeof data140.prompt !== "string"){
const err281 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6+"/prompt",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err281];
}
else {
vErrors.push(err281);
}
errors++;
}
}
}
else {
const err282 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err282];
}
else {
vErrors.push(err282);
}
errors++;
}
}
}
else {
const err283 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err283];
}
else {
vErrors.push(err283);
}
errors++;
}
}
}
else {
const err284 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err284];
}
else {
vErrors.push(err284);
}
errors++;
}
}
}
else {
const err285 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err285];
}
else {
vErrors.push(err285);
}
errors++;
}
var _valid9 = _errs293 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs413 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err286 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err286];
}
else {
vErrors.push(err286);
}
errors++;
}
if(data105.label === undefined){
const err287 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err287];
}
else {
vErrors.push(err287);
}
errors++;
}
if(data105.type === undefined){
const err288 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err288];
}
else {
vErrors.push(err288);
}
errors++;
}
if(data105.form === undefined){
const err289 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err289];
}
else {
vErrors.push(err289);
}
errors++;
}
for(const key34 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[1].properties, key34))){
const err290 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key34},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err290];
}
else {
vErrors.push(err290);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err291 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err291];
}
else {
vErrors.push(err291);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err292 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err292];
}
else {
vErrors.push(err292);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err293 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err293];
}
else {
vErrors.push(err293);
}
errors++;
}
}
if(data105.filter !== undefined){
let data146 = data105.filter;
const _errs427 = errors;
let valid78 = false;
const _errs428 = errors;
const _errs429 = errors;
let valid79 = false;
const _errs430 = errors;
const err294 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err294];
}
else {
vErrors.push(err294);
}
errors++;
var _valid17 = _errs430 === errors;
valid79 = valid79 || _valid17;
if(!valid79){
const _errs432 = errors;
if(data146 && typeof data146 == "object" && !Array.isArray(data146)){
for(const key35 in data146){
if(!((key35 === "join") || (key35 === "rules"))){
const err295 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key35},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err295];
}
else {
vErrors.push(err295);
}
errors++;
}
}
if(data146.join !== undefined){
let data147 = data146.join;
if(typeof data147 !== "string"){
const err296 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err296];
}
else {
vErrors.push(err296);
}
errors++;
}
if(!((data147 === "OR") || (data147 === "AND"))){
const err297 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err297];
}
else {
vErrors.push(err297);
}
errors++;
}
}
if(data146.rules !== undefined){
let data148 = data146.rules;
if(Array.isArray(data148)){
const len7 = data148.length;
for(let i7=0; i7<len7; i7++){
let data149 = data148[i7];
if(data149 && typeof data149 == "object" && !Array.isArray(data149)){
if(data149.type === undefined){
const err298 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err298];
}
else {
vErrors.push(err298);
}
errors++;
}
if(data149.id === undefined){
const err299 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err299];
}
else {
vErrors.push(err299);
}
errors++;
}
if(data149.options === undefined){
const err300 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err300];
}
else {
vErrors.push(err300);
}
errors++;
}
for(const key36 in data149){
if(!(((key36 === "type") || (key36 === "id")) || (key36 === "options"))){
const err301 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key36},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err301];
}
else {
vErrors.push(err301);
}
errors++;
}
}
if(data149.type !== undefined){
let data150 = data149.type;
if(typeof data150 !== "string"){
const err302 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err302];
}
else {
vErrors.push(err302);
}
errors++;
}
if(!(((data150 === "alter") || (data150 === "ego")) || (data150 === "edge"))){
const err303 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err303];
}
else {
vErrors.push(err303);
}
errors++;
}
}
if(data149.id !== undefined){
if(typeof data149.id !== "string"){
const err304 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err304];
}
else {
vErrors.push(err304);
}
errors++;
}
}
if(data149.options !== undefined){
let data152 = data149.options;
if(data152 && typeof data152 == "object" && !Array.isArray(data152)){
if(data152.operator === undefined){
const err305 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err305];
}
else {
vErrors.push(err305);
}
errors++;
}
if(data152.type !== undefined){
if(typeof data152.type !== "string"){
const err306 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err306];
}
else {
vErrors.push(err306);
}
errors++;
}
}
if(data152.attribute !== undefined){
if(typeof data152.attribute !== "string"){
const err307 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err307];
}
else {
vErrors.push(err307);
}
errors++;
}
}
if(data152.operator !== undefined){
let data155 = data152.operator;
if(typeof data155 !== "string"){
const err308 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err308];
}
else {
vErrors.push(err308);
}
errors++;
}
if(!((((((((((((((((data155 === "EXISTS") || (data155 === "NOT_EXISTS")) || (data155 === "EXACTLY")) || (data155 === "NOT")) || (data155 === "GREATER_THAN")) || (data155 === "GREATER_THAN_OR_EQUAL")) || (data155 === "LESS_THAN")) || (data155 === "LESS_THAN_OR_EQUAL")) || (data155 === "INCLUDES")) || (data155 === "EXCLUDES")) || (data155 === "OPTIONS_GREATER_THAN")) || (data155 === "OPTIONS_LESS_THAN")) || (data155 === "OPTIONS_EQUALS")) || (data155 === "OPTIONS_NOT_EQUALS")) || (data155 === "CONTAINS")) || (data155 === "DOES NOT CONTAIN"))){
const err309 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err309];
}
else {
vErrors.push(err309);
}
errors++;
}
}
if(data152.value !== undefined){
let data156 = data152.value;
const _errs456 = errors;
let valid86 = false;
const _errs457 = errors;
if(!(((typeof data156 == "number") && (!(data156 % 1) && !isNaN(data156))) && (isFinite(data156)))){
const err310 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err310];
}
else {
vErrors.push(err310);
}
errors++;
}
var _valid18 = _errs457 === errors;
valid86 = valid86 || _valid18;
if(!valid86){
const _errs459 = errors;
if(typeof data156 !== "string"){
const err311 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err311];
}
else {
vErrors.push(err311);
}
errors++;
}
var _valid18 = _errs459 === errors;
valid86 = valid86 || _valid18;
if(!valid86){
const _errs461 = errors;
if(typeof data156 !== "boolean"){
const err312 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err312];
}
else {
vErrors.push(err312);
}
errors++;
}
var _valid18 = _errs461 === errors;
valid86 = valid86 || _valid18;
if(!valid86){
const _errs463 = errors;
if(!(Array.isArray(data156))){
const err313 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err313];
}
else {
vErrors.push(err313);
}
errors++;
}
var _valid18 = _errs463 === errors;
valid86 = valid86 || _valid18;
}
}
}
if(!valid86){
const err314 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err314];
}
else {
vErrors.push(err314);
}
errors++;
}
else {
errors = _errs456;
if(vErrors !== null){
if(_errs456){
vErrors.length = _errs456;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err315 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err315];
}
else {
vErrors.push(err315);
}
errors++;
}
}
}
else {
const err316 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err316];
}
else {
vErrors.push(err316);
}
errors++;
}
}
}
else {
const err317 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err317];
}
else {
vErrors.push(err317);
}
errors++;
}
}
}
else {
const err318 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err318];
}
else {
vErrors.push(err318);
}
errors++;
}
var _valid17 = _errs432 === errors;
valid79 = valid79 || _valid17;
}
if(!valid79){
const err319 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err319];
}
else {
vErrors.push(err319);
}
errors++;
}
else {
errors = _errs429;
if(vErrors !== null){
if(_errs429){
vErrors.length = _errs429;
}
else {
vErrors = null;
}
}
}
var _valid16 = _errs428 === errors;
valid78 = valid78 || _valid16;
if(!valid78){
const _errs465 = errors;
if(data146 !== null){
const err320 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err320];
}
else {
vErrors.push(err320);
}
errors++;
}
var _valid16 = _errs465 === errors;
valid78 = valid78 || _valid16;
}
if(!valid78){
const err321 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err321];
}
else {
vErrors.push(err321);
}
errors++;
}
else {
errors = _errs427;
if(vErrors !== null){
if(_errs427){
vErrors.length = _errs427;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data158 = data105.introductionPanel;
if(data158 && typeof data158 == "object" && !Array.isArray(data158)){
if(data158.title === undefined){
const err322 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err322];
}
else {
vErrors.push(err322);
}
errors++;
}
if(data158.text === undefined){
const err323 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err323];
}
else {
vErrors.push(err323);
}
errors++;
}
for(const key37 in data158){
if(!((key37 === "title") || (key37 === "text"))){
const err324 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key37},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err324];
}
else {
vErrors.push(err324);
}
errors++;
}
}
if(data158.title !== undefined){
if(typeof data158.title !== "string"){
const err325 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err325];
}
else {
vErrors.push(err325);
}
errors++;
}
}
if(data158.text !== undefined){
if(typeof data158.text !== "string"){
const err326 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err326];
}
else {
vErrors.push(err326);
}
errors++;
}
}
}
else {
const err327 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err327];
}
else {
vErrors.push(err327);
}
errors++;
}
}
if(data105.type !== undefined){
let data161 = data105.type;
if(typeof data161 !== "string"){
const err328 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err328];
}
else {
vErrors.push(err328);
}
errors++;
}
if("AlterForm" !== data161){
const err329 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/1/properties/type/const",keyword:"const",params:{allowedValue: "AlterForm"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err329];
}
else {
vErrors.push(err329);
}
errors++;
}
}
if(data105.subject !== undefined){
let data162 = data105.subject;
if(data162 && typeof data162 == "object" && !Array.isArray(data162)){
if(data162.entity === undefined){
const err330 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err330];
}
else {
vErrors.push(err330);
}
errors++;
}
if(data162.type === undefined){
const err331 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err331];
}
else {
vErrors.push(err331);
}
errors++;
}
for(const key38 in data162){
if(!((key38 === "entity") || (key38 === "type"))){
const err332 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key38},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err332];
}
else {
vErrors.push(err332);
}
errors++;
}
}
if(data162.entity !== undefined){
let data163 = data162.entity;
if(typeof data163 !== "string"){
const err333 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err333];
}
else {
vErrors.push(err333);
}
errors++;
}
if(!(((data163 === "edge") || (data163 === "node")) || (data163 === "ego"))){
const err334 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[1].properties.subject.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err334];
}
else {
vErrors.push(err334);
}
errors++;
}
}
if(data162.type !== undefined){
if(typeof data162.type !== "string"){
const err335 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err335];
}
else {
vErrors.push(err335);
}
errors++;
}
}
}
else {
const err336 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err336];
}
else {
vErrors.push(err336);
}
errors++;
}
}
if(data105.form !== undefined){
let data165 = data105.form;
if(data165 && typeof data165 == "object" && !Array.isArray(data165)){
if(data165.fields === undefined){
const err337 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err337];
}
else {
vErrors.push(err337);
}
errors++;
}
for(const key39 in data165){
if(!((key39 === "title") || (key39 === "fields"))){
const err338 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key39},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err338];
}
else {
vErrors.push(err338);
}
errors++;
}
}
if(data165.title !== undefined){
if(typeof data165.title !== "string"){
const err339 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err339];
}
else {
vErrors.push(err339);
}
errors++;
}
}
if(data165.fields !== undefined){
let data167 = data165.fields;
if(Array.isArray(data167)){
const len8 = data167.length;
for(let i8=0; i8<len8; i8++){
let data168 = data167[i8];
if(data168 && typeof data168 == "object" && !Array.isArray(data168)){
if(data168.variable === undefined){
const err340 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err340];
}
else {
vErrors.push(err340);
}
errors++;
}
if(data168.prompt === undefined){
const err341 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err341];
}
else {
vErrors.push(err341);
}
errors++;
}
for(const key40 in data168){
if(!((key40 === "variable") || (key40 === "prompt"))){
const err342 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key40},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err342];
}
else {
vErrors.push(err342);
}
errors++;
}
}
if(data168.variable !== undefined){
if(typeof data168.variable !== "string"){
const err343 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8+"/variable",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err343];
}
else {
vErrors.push(err343);
}
errors++;
}
}
if(data168.prompt !== undefined){
if(typeof data168.prompt !== "string"){
const err344 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8+"/prompt",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err344];
}
else {
vErrors.push(err344);
}
errors++;
}
}
}
else {
const err345 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err345];
}
else {
vErrors.push(err345);
}
errors++;
}
}
}
else {
const err346 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err346];
}
else {
vErrors.push(err346);
}
errors++;
}
}
}
else {
const err347 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err347];
}
else {
vErrors.push(err347);
}
errors++;
}
}
}
else {
const err348 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err348];
}
else {
vErrors.push(err348);
}
errors++;
}
var _valid9 = _errs413 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs500 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err349 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err349];
}
else {
vErrors.push(err349);
}
errors++;
}
if(data105.label === undefined){
const err350 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err350];
}
else {
vErrors.push(err350);
}
errors++;
}
if(data105.type === undefined){
const err351 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err351];
}
else {
vErrors.push(err351);
}
errors++;
}
if(data105.form === undefined){
const err352 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err352];
}
else {
vErrors.push(err352);
}
errors++;
}
for(const key41 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[2].properties, key41))){
const err353 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key41},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err353];
}
else {
vErrors.push(err353);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err354 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err354];
}
else {
vErrors.push(err354);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err355 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err355];
}
else {
vErrors.push(err355);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err356 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err356];
}
else {
vErrors.push(err356);
}
errors++;
}
}
if(data105.filter !== undefined){
let data174 = data105.filter;
const _errs514 = errors;
let valid100 = false;
const _errs515 = errors;
const _errs516 = errors;
let valid101 = false;
const _errs517 = errors;
const err357 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err357];
}
else {
vErrors.push(err357);
}
errors++;
var _valid20 = _errs517 === errors;
valid101 = valid101 || _valid20;
if(!valid101){
const _errs519 = errors;
if(data174 && typeof data174 == "object" && !Array.isArray(data174)){
for(const key42 in data174){
if(!((key42 === "join") || (key42 === "rules"))){
const err358 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key42},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err358];
}
else {
vErrors.push(err358);
}
errors++;
}
}
if(data174.join !== undefined){
let data175 = data174.join;
if(typeof data175 !== "string"){
const err359 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err359];
}
else {
vErrors.push(err359);
}
errors++;
}
if(!((data175 === "OR") || (data175 === "AND"))){
const err360 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err360];
}
else {
vErrors.push(err360);
}
errors++;
}
}
if(data174.rules !== undefined){
let data176 = data174.rules;
if(Array.isArray(data176)){
const len9 = data176.length;
for(let i9=0; i9<len9; i9++){
let data177 = data176[i9];
if(data177 && typeof data177 == "object" && !Array.isArray(data177)){
if(data177.type === undefined){
const err361 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err361];
}
else {
vErrors.push(err361);
}
errors++;
}
if(data177.id === undefined){
const err362 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err362];
}
else {
vErrors.push(err362);
}
errors++;
}
if(data177.options === undefined){
const err363 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err363];
}
else {
vErrors.push(err363);
}
errors++;
}
for(const key43 in data177){
if(!(((key43 === "type") || (key43 === "id")) || (key43 === "options"))){
const err364 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key43},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err364];
}
else {
vErrors.push(err364);
}
errors++;
}
}
if(data177.type !== undefined){
let data178 = data177.type;
if(typeof data178 !== "string"){
const err365 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err365];
}
else {
vErrors.push(err365);
}
errors++;
}
if(!(((data178 === "alter") || (data178 === "ego")) || (data178 === "edge"))){
const err366 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err366];
}
else {
vErrors.push(err366);
}
errors++;
}
}
if(data177.id !== undefined){
if(typeof data177.id !== "string"){
const err367 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err367];
}
else {
vErrors.push(err367);
}
errors++;
}
}
if(data177.options !== undefined){
let data180 = data177.options;
if(data180 && typeof data180 == "object" && !Array.isArray(data180)){
if(data180.operator === undefined){
const err368 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err368];
}
else {
vErrors.push(err368);
}
errors++;
}
if(data180.type !== undefined){
if(typeof data180.type !== "string"){
const err369 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err369];
}
else {
vErrors.push(err369);
}
errors++;
}
}
if(data180.attribute !== undefined){
if(typeof data180.attribute !== "string"){
const err370 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err370];
}
else {
vErrors.push(err370);
}
errors++;
}
}
if(data180.operator !== undefined){
let data183 = data180.operator;
if(typeof data183 !== "string"){
const err371 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err371];
}
else {
vErrors.push(err371);
}
errors++;
}
if(!((((((((((((((((data183 === "EXISTS") || (data183 === "NOT_EXISTS")) || (data183 === "EXACTLY")) || (data183 === "NOT")) || (data183 === "GREATER_THAN")) || (data183 === "GREATER_THAN_OR_EQUAL")) || (data183 === "LESS_THAN")) || (data183 === "LESS_THAN_OR_EQUAL")) || (data183 === "INCLUDES")) || (data183 === "EXCLUDES")) || (data183 === "OPTIONS_GREATER_THAN")) || (data183 === "OPTIONS_LESS_THAN")) || (data183 === "OPTIONS_EQUALS")) || (data183 === "OPTIONS_NOT_EQUALS")) || (data183 === "CONTAINS")) || (data183 === "DOES NOT CONTAIN"))){
const err372 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err372];
}
else {
vErrors.push(err372);
}
errors++;
}
}
if(data180.value !== undefined){
let data184 = data180.value;
const _errs543 = errors;
let valid108 = false;
const _errs544 = errors;
if(!(((typeof data184 == "number") && (!(data184 % 1) && !isNaN(data184))) && (isFinite(data184)))){
const err373 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err373];
}
else {
vErrors.push(err373);
}
errors++;
}
var _valid21 = _errs544 === errors;
valid108 = valid108 || _valid21;
if(!valid108){
const _errs546 = errors;
if(typeof data184 !== "string"){
const err374 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err374];
}
else {
vErrors.push(err374);
}
errors++;
}
var _valid21 = _errs546 === errors;
valid108 = valid108 || _valid21;
if(!valid108){
const _errs548 = errors;
if(typeof data184 !== "boolean"){
const err375 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err375];
}
else {
vErrors.push(err375);
}
errors++;
}
var _valid21 = _errs548 === errors;
valid108 = valid108 || _valid21;
if(!valid108){
const _errs550 = errors;
if(!(Array.isArray(data184))){
const err376 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err376];
}
else {
vErrors.push(err376);
}
errors++;
}
var _valid21 = _errs550 === errors;
valid108 = valid108 || _valid21;
}
}
}
if(!valid108){
const err377 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err377];
}
else {
vErrors.push(err377);
}
errors++;
}
else {
errors = _errs543;
if(vErrors !== null){
if(_errs543){
vErrors.length = _errs543;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err378 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err378];
}
else {
vErrors.push(err378);
}
errors++;
}
}
}
else {
const err379 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err379];
}
else {
vErrors.push(err379);
}
errors++;
}
}
}
else {
const err380 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err380];
}
else {
vErrors.push(err380);
}
errors++;
}
}
}
else {
const err381 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err381];
}
else {
vErrors.push(err381);
}
errors++;
}
var _valid20 = _errs519 === errors;
valid101 = valid101 || _valid20;
}
if(!valid101){
const err382 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err382];
}
else {
vErrors.push(err382);
}
errors++;
}
else {
errors = _errs516;
if(vErrors !== null){
if(_errs516){
vErrors.length = _errs516;
}
else {
vErrors = null;
}
}
}
var _valid19 = _errs515 === errors;
valid100 = valid100 || _valid19;
if(!valid100){
const _errs552 = errors;
if(data174 !== null){
const err383 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err383];
}
else {
vErrors.push(err383);
}
errors++;
}
var _valid19 = _errs552 === errors;
valid100 = valid100 || _valid19;
}
if(!valid100){
const err384 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err384];
}
else {
vErrors.push(err384);
}
errors++;
}
else {
errors = _errs514;
if(vErrors !== null){
if(_errs514){
vErrors.length = _errs514;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data186 = data105.introductionPanel;
if(data186 && typeof data186 == "object" && !Array.isArray(data186)){
if(data186.title === undefined){
const err385 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err385];
}
else {
vErrors.push(err385);
}
errors++;
}
if(data186.text === undefined){
const err386 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err386];
}
else {
vErrors.push(err386);
}
errors++;
}
for(const key44 in data186){
if(!((key44 === "title") || (key44 === "text"))){
const err387 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key44},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err387];
}
else {
vErrors.push(err387);
}
errors++;
}
}
if(data186.title !== undefined){
if(typeof data186.title !== "string"){
const err388 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err388];
}
else {
vErrors.push(err388);
}
errors++;
}
}
if(data186.text !== undefined){
if(typeof data186.text !== "string"){
const err389 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err389];
}
else {
vErrors.push(err389);
}
errors++;
}
}
}
else {
const err390 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err390];
}
else {
vErrors.push(err390);
}
errors++;
}
}
if(data105.type !== undefined){
let data189 = data105.type;
if(typeof data189 !== "string"){
const err391 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/2/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err391];
}
else {
vErrors.push(err391);
}
errors++;
}
if("AlterEdgeForm" !== data189){
const err392 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/2/properties/type/const",keyword:"const",params:{allowedValue: "AlterEdgeForm"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err392];
}
else {
vErrors.push(err392);
}
errors++;
}
}
if(data105.subject !== undefined){
let data190 = data105.subject;
if(data190 && typeof data190 == "object" && !Array.isArray(data190)){
if(data190.entity === undefined){
const err393 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err393];
}
else {
vErrors.push(err393);
}
errors++;
}
if(data190.type === undefined){
const err394 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err394];
}
else {
vErrors.push(err394);
}
errors++;
}
for(const key45 in data190){
if(!((key45 === "entity") || (key45 === "type"))){
const err395 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key45},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err395];
}
else {
vErrors.push(err395);
}
errors++;
}
}
if(data190.entity !== undefined){
let data191 = data190.entity;
if(typeof data191 !== "string"){
const err396 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err396];
}
else {
vErrors.push(err396);
}
errors++;
}
if(!(((data191 === "edge") || (data191 === "node")) || (data191 === "ego"))){
const err397 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err397];
}
else {
vErrors.push(err397);
}
errors++;
}
}
if(data190.type !== undefined){
if(typeof data190.type !== "string"){
const err398 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err398];
}
else {
vErrors.push(err398);
}
errors++;
}
}
}
else {
const err399 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err399];
}
else {
vErrors.push(err399);
}
errors++;
}
}
if(data105.form !== undefined){
let data193 = data105.form;
if(data193 && typeof data193 == "object" && !Array.isArray(data193)){
if(data193.fields === undefined){
const err400 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err400];
}
else {
vErrors.push(err400);
}
errors++;
}
for(const key46 in data193){
if(!((key46 === "title") || (key46 === "fields"))){
const err401 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key46},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err401];
}
else {
vErrors.push(err401);
}
errors++;
}
}
if(data193.title !== undefined){
if(typeof data193.title !== "string"){
const err402 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err402];
}
else {
vErrors.push(err402);
}
errors++;
}
}
if(data193.fields !== undefined){
let data195 = data193.fields;
if(Array.isArray(data195)){
const len10 = data195.length;
for(let i10=0; i10<len10; i10++){
let data196 = data195[i10];
if(data196 && typeof data196 == "object" && !Array.isArray(data196)){
if(data196.variable === undefined){
const err403 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err403];
}
else {
vErrors.push(err403);
}
errors++;
}
if(data196.prompt === undefined){
const err404 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err404];
}
else {
vErrors.push(err404);
}
errors++;
}
for(const key47 in data196){
if(!((key47 === "variable") || (key47 === "prompt"))){
const err405 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key47},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err405];
}
else {
vErrors.push(err405);
}
errors++;
}
}
if(data196.variable !== undefined){
if(typeof data196.variable !== "string"){
const err406 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10+"/variable",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err406];
}
else {
vErrors.push(err406);
}
errors++;
}
}
if(data196.prompt !== undefined){
if(typeof data196.prompt !== "string"){
const err407 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10+"/prompt",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err407];
}
else {
vErrors.push(err407);
}
errors++;
}
}
}
else {
const err408 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err408];
}
else {
vErrors.push(err408);
}
errors++;
}
}
}
else {
const err409 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err409];
}
else {
vErrors.push(err409);
}
errors++;
}
}
}
else {
const err410 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err410];
}
else {
vErrors.push(err410);
}
errors++;
}
}
}
else {
const err411 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err411];
}
else {
vErrors.push(err411);
}
errors++;
}
var _valid9 = _errs500 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs588 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err412 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err412];
}
else {
vErrors.push(err412);
}
errors++;
}
if(data105.label === undefined){
const err413 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err413];
}
else {
vErrors.push(err413);
}
errors++;
}
if(data105.type === undefined){
const err414 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err414];
}
else {
vErrors.push(err414);
}
errors++;
}
if(data105.form === undefined){
const err415 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err415];
}
else {
vErrors.push(err415);
}
errors++;
}
if(data105.prompts === undefined){
const err416 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err416];
}
else {
vErrors.push(err416);
}
errors++;
}
for(const key48 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[3].properties, key48))){
const err417 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key48},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err417];
}
else {
vErrors.push(err417);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err418 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err418];
}
else {
vErrors.push(err418);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err419 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err419];
}
else {
vErrors.push(err419);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err420 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err420];
}
else {
vErrors.push(err420);
}
errors++;
}
}
if(data105.filter !== undefined){
let data202 = data105.filter;
const _errs602 = errors;
let valid123 = false;
const _errs603 = errors;
const _errs604 = errors;
let valid124 = false;
const _errs605 = errors;
const err421 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err421];
}
else {
vErrors.push(err421);
}
errors++;
var _valid23 = _errs605 === errors;
valid124 = valid124 || _valid23;
if(!valid124){
const _errs607 = errors;
if(data202 && typeof data202 == "object" && !Array.isArray(data202)){
for(const key49 in data202){
if(!((key49 === "join") || (key49 === "rules"))){
const err422 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key49},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err422];
}
else {
vErrors.push(err422);
}
errors++;
}
}
if(data202.join !== undefined){
let data203 = data202.join;
if(typeof data203 !== "string"){
const err423 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err423];
}
else {
vErrors.push(err423);
}
errors++;
}
if(!((data203 === "OR") || (data203 === "AND"))){
const err424 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err424];
}
else {
vErrors.push(err424);
}
errors++;
}
}
if(data202.rules !== undefined){
let data204 = data202.rules;
if(Array.isArray(data204)){
const len11 = data204.length;
for(let i11=0; i11<len11; i11++){
let data205 = data204[i11];
if(data205 && typeof data205 == "object" && !Array.isArray(data205)){
if(data205.type === undefined){
const err425 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err425];
}
else {
vErrors.push(err425);
}
errors++;
}
if(data205.id === undefined){
const err426 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err426];
}
else {
vErrors.push(err426);
}
errors++;
}
if(data205.options === undefined){
const err427 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err427];
}
else {
vErrors.push(err427);
}
errors++;
}
for(const key50 in data205){
if(!(((key50 === "type") || (key50 === "id")) || (key50 === "options"))){
const err428 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key50},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err428];
}
else {
vErrors.push(err428);
}
errors++;
}
}
if(data205.type !== undefined){
let data206 = data205.type;
if(typeof data206 !== "string"){
const err429 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err429];
}
else {
vErrors.push(err429);
}
errors++;
}
if(!(((data206 === "alter") || (data206 === "ego")) || (data206 === "edge"))){
const err430 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err430];
}
else {
vErrors.push(err430);
}
errors++;
}
}
if(data205.id !== undefined){
if(typeof data205.id !== "string"){
const err431 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err431];
}
else {
vErrors.push(err431);
}
errors++;
}
}
if(data205.options !== undefined){
let data208 = data205.options;
if(data208 && typeof data208 == "object" && !Array.isArray(data208)){
if(data208.operator === undefined){
const err432 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err432];
}
else {
vErrors.push(err432);
}
errors++;
}
if(data208.type !== undefined){
if(typeof data208.type !== "string"){
const err433 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err433];
}
else {
vErrors.push(err433);
}
errors++;
}
}
if(data208.attribute !== undefined){
if(typeof data208.attribute !== "string"){
const err434 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err434];
}
else {
vErrors.push(err434);
}
errors++;
}
}
if(data208.operator !== undefined){
let data211 = data208.operator;
if(typeof data211 !== "string"){
const err435 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err435];
}
else {
vErrors.push(err435);
}
errors++;
}
if(!((((((((((((((((data211 === "EXISTS") || (data211 === "NOT_EXISTS")) || (data211 === "EXACTLY")) || (data211 === "NOT")) || (data211 === "GREATER_THAN")) || (data211 === "GREATER_THAN_OR_EQUAL")) || (data211 === "LESS_THAN")) || (data211 === "LESS_THAN_OR_EQUAL")) || (data211 === "INCLUDES")) || (data211 === "EXCLUDES")) || (data211 === "OPTIONS_GREATER_THAN")) || (data211 === "OPTIONS_LESS_THAN")) || (data211 === "OPTIONS_EQUALS")) || (data211 === "OPTIONS_NOT_EQUALS")) || (data211 === "CONTAINS")) || (data211 === "DOES NOT CONTAIN"))){
const err436 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err436];
}
else {
vErrors.push(err436);
}
errors++;
}
}
if(data208.value !== undefined){
let data212 = data208.value;
const _errs631 = errors;
let valid131 = false;
const _errs632 = errors;
if(!(((typeof data212 == "number") && (!(data212 % 1) && !isNaN(data212))) && (isFinite(data212)))){
const err437 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err437];
}
else {
vErrors.push(err437);
}
errors++;
}
var _valid24 = _errs632 === errors;
valid131 = valid131 || _valid24;
if(!valid131){
const _errs634 = errors;
if(typeof data212 !== "string"){
const err438 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err438];
}
else {
vErrors.push(err438);
}
errors++;
}
var _valid24 = _errs634 === errors;
valid131 = valid131 || _valid24;
if(!valid131){
const _errs636 = errors;
if(typeof data212 !== "boolean"){
const err439 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err439];
}
else {
vErrors.push(err439);
}
errors++;
}
var _valid24 = _errs636 === errors;
valid131 = valid131 || _valid24;
if(!valid131){
const _errs638 = errors;
if(!(Array.isArray(data212))){
const err440 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err440];
}
else {
vErrors.push(err440);
}
errors++;
}
var _valid24 = _errs638 === errors;
valid131 = valid131 || _valid24;
}
}
}
if(!valid131){
const err441 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err441];
}
else {
vErrors.push(err441);
}
errors++;
}
else {
errors = _errs631;
if(vErrors !== null){
if(_errs631){
vErrors.length = _errs631;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err442 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err442];
}
else {
vErrors.push(err442);
}
errors++;
}
}
}
else {
const err443 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err443];
}
else {
vErrors.push(err443);
}
errors++;
}
}
}
else {
const err444 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err444];
}
else {
vErrors.push(err444);
}
errors++;
}
}
}
else {
const err445 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err445];
}
else {
vErrors.push(err445);
}
errors++;
}
var _valid23 = _errs607 === errors;
valid124 = valid124 || _valid23;
}
if(!valid124){
const err446 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err446];
}
else {
vErrors.push(err446);
}
errors++;
}
else {
errors = _errs604;
if(vErrors !== null){
if(_errs604){
vErrors.length = _errs604;
}
else {
vErrors = null;
}
}
}
var _valid22 = _errs603 === errors;
valid123 = valid123 || _valid22;
if(!valid123){
const _errs640 = errors;
if(data202 !== null){
const err447 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err447];
}
else {
vErrors.push(err447);
}
errors++;
}
var _valid22 = _errs640 === errors;
valid123 = valid123 || _valid22;
}
if(!valid123){
const err448 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err448];
}
else {
vErrors.push(err448);
}
errors++;
}
else {
errors = _errs602;
if(vErrors !== null){
if(_errs602){
vErrors.length = _errs602;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data214 = data105.introductionPanel;
if(data214 && typeof data214 == "object" && !Array.isArray(data214)){
if(data214.title === undefined){
const err449 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err449];
}
else {
vErrors.push(err449);
}
errors++;
}
if(data214.text === undefined){
const err450 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err450];
}
else {
vErrors.push(err450);
}
errors++;
}
for(const key51 in data214){
if(!((key51 === "title") || (key51 === "text"))){
const err451 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key51},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err451];
}
else {
vErrors.push(err451);
}
errors++;
}
}
if(data214.title !== undefined){
if(typeof data214.title !== "string"){
const err452 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err452];
}
else {
vErrors.push(err452);
}
errors++;
}
}
if(data214.text !== undefined){
if(typeof data214.text !== "string"){
const err453 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err453];
}
else {
vErrors.push(err453);
}
errors++;
}
}
}
else {
const err454 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err454];
}
else {
vErrors.push(err454);
}
errors++;
}
}
if(data105.type !== undefined){
let data217 = data105.type;
if(typeof data217 !== "string"){
const err455 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/3/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err455];
}
else {
vErrors.push(err455);
}
errors++;
}
if("NameGenerator" !== data217){
const err456 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/3/properties/type/const",keyword:"const",params:{allowedValue: "NameGenerator"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err456];
}
else {
vErrors.push(err456);
}
errors++;
}
}
if(data105.form !== undefined){
let data218 = data105.form;
if(data218 && typeof data218 == "object" && !Array.isArray(data218)){
if(data218.fields === undefined){
const err457 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err457];
}
else {
vErrors.push(err457);
}
errors++;
}
for(const key52 in data218){
if(!((key52 === "title") || (key52 === "fields"))){
const err458 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key52},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err458];
}
else {
vErrors.push(err458);
}
errors++;
}
}
if(data218.title !== undefined){
if(typeof data218.title !== "string"){
const err459 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err459];
}
else {
vErrors.push(err459);
}
errors++;
}
}
if(data218.fields !== undefined){
let data220 = data218.fields;
if(Array.isArray(data220)){
const len12 = data220.length;
for(let i12=0; i12<len12; i12++){
let data221 = data220[i12];
if(data221 && typeof data221 == "object" && !Array.isArray(data221)){
if(data221.variable === undefined){
const err460 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err460];
}
else {
vErrors.push(err460);
}
errors++;
}
if(data221.prompt === undefined){
const err461 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err461];
}
else {
vErrors.push(err461);
}
errors++;
}
for(const key53 in data221){
if(!((key53 === "variable") || (key53 === "prompt"))){
const err462 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key53},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err462];
}
else {
vErrors.push(err462);
}
errors++;
}
}
if(data221.variable !== undefined){
if(typeof data221.variable !== "string"){
const err463 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12+"/variable",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err463];
}
else {
vErrors.push(err463);
}
errors++;
}
}
if(data221.prompt !== undefined){
if(typeof data221.prompt !== "string"){
const err464 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12+"/prompt",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err464];
}
else {
vErrors.push(err464);
}
errors++;
}
}
}
else {
const err465 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err465];
}
else {
vErrors.push(err465);
}
errors++;
}
}
}
else {
const err466 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err466];
}
else {
vErrors.push(err466);
}
errors++;
}
}
}
else {
const err467 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err467];
}
else {
vErrors.push(err467);
}
errors++;
}
}
if(data105.subject !== undefined){
let data224 = data105.subject;
if(data224 && typeof data224 == "object" && !Array.isArray(data224)){
if(data224.entity === undefined){
const err468 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err468];
}
else {
vErrors.push(err468);
}
errors++;
}
if(data224.type === undefined){
const err469 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err469];
}
else {
vErrors.push(err469);
}
errors++;
}
for(const key54 in data224){
if(!((key54 === "entity") || (key54 === "type"))){
const err470 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key54},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err470];
}
else {
vErrors.push(err470);
}
errors++;
}
}
if(data224.entity !== undefined){
let data225 = data224.entity;
if(typeof data225 !== "string"){
const err471 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err471];
}
else {
vErrors.push(err471);
}
errors++;
}
if(!(((data225 === "edge") || (data225 === "node")) || (data225 === "ego"))){
const err472 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err472];
}
else {
vErrors.push(err472);
}
errors++;
}
}
if(data224.type !== undefined){
if(typeof data224.type !== "string"){
const err473 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err473];
}
else {
vErrors.push(err473);
}
errors++;
}
}
}
else {
const err474 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err474];
}
else {
vErrors.push(err474);
}
errors++;
}
}
if(data105.panels !== undefined){
let data227 = data105.panels;
if(Array.isArray(data227)){
const len13 = data227.length;
for(let i13=0; i13<len13; i13++){
let data228 = data227[i13];
if(data228 && typeof data228 == "object" && !Array.isArray(data228)){
if(data228.id === undefined){
const err475 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err475];
}
else {
vErrors.push(err475);
}
errors++;
}
if(data228.title === undefined){
const err476 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err476];
}
else {
vErrors.push(err476);
}
errors++;
}
if(data228.dataSource === undefined){
const err477 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/required",keyword:"required",params:{missingProperty: "dataSource"},message:"must have required property '"+"dataSource"+"'"};
if(vErrors === null){
vErrors = [err477];
}
else {
vErrors.push(err477);
}
errors++;
}
for(const key55 in data228){
if(!((((key55 === "id") || (key55 === "title")) || (key55 === "filter")) || (key55 === "dataSource"))){
const err478 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key55},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err478];
}
else {
vErrors.push(err478);
}
errors++;
}
}
if(data228.id !== undefined){
if(typeof data228.id !== "string"){
const err479 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/id",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err479];
}
else {
vErrors.push(err479);
}
errors++;
}
}
if(data228.title !== undefined){
if(typeof data228.title !== "string"){
const err480 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/title",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err480];
}
else {
vErrors.push(err480);
}
errors++;
}
}
if(data228.filter !== undefined){
let data231 = data228.filter;
const _errs686 = errors;
let valid144 = false;
const _errs687 = errors;
const _errs689 = errors;
let valid146 = false;
const _errs690 = errors;
const err481 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err481];
}
else {
vErrors.push(err481);
}
errors++;
var _valid26 = _errs690 === errors;
valid146 = valid146 || _valid26;
if(!valid146){
const _errs692 = errors;
if(data231 && typeof data231 == "object" && !Array.isArray(data231)){
for(const key56 in data231){
if(!((key56 === "join") || (key56 === "rules"))){
const err482 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key56},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err482];
}
else {
vErrors.push(err482);
}
errors++;
}
}
if(data231.join !== undefined){
let data232 = data231.join;
if(typeof data232 !== "string"){
const err483 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err483];
}
else {
vErrors.push(err483);
}
errors++;
}
if(!((data232 === "OR") || (data232 === "AND"))){
const err484 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err484];
}
else {
vErrors.push(err484);
}
errors++;
}
}
if(data231.rules !== undefined){
let data233 = data231.rules;
if(Array.isArray(data233)){
const len14 = data233.length;
for(let i14=0; i14<len14; i14++){
let data234 = data233[i14];
if(data234 && typeof data234 == "object" && !Array.isArray(data234)){
if(data234.type === undefined){
const err485 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err485];
}
else {
vErrors.push(err485);
}
errors++;
}
if(data234.id === undefined){
const err486 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err486];
}
else {
vErrors.push(err486);
}
errors++;
}
if(data234.options === undefined){
const err487 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err487];
}
else {
vErrors.push(err487);
}
errors++;
}
for(const key57 in data234){
if(!(((key57 === "type") || (key57 === "id")) || (key57 === "options"))){
const err488 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key57},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err488];
}
else {
vErrors.push(err488);
}
errors++;
}
}
if(data234.type !== undefined){
let data235 = data234.type;
if(typeof data235 !== "string"){
const err489 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err489];
}
else {
vErrors.push(err489);
}
errors++;
}
if(!(((data235 === "alter") || (data235 === "ego")) || (data235 === "edge"))){
const err490 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err490];
}
else {
vErrors.push(err490);
}
errors++;
}
}
if(data234.id !== undefined){
if(typeof data234.id !== "string"){
const err491 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err491];
}
else {
vErrors.push(err491);
}
errors++;
}
}
if(data234.options !== undefined){
let data237 = data234.options;
if(data237 && typeof data237 == "object" && !Array.isArray(data237)){
if(data237.operator === undefined){
const err492 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err492];
}
else {
vErrors.push(err492);
}
errors++;
}
if(data237.type !== undefined){
if(typeof data237.type !== "string"){
const err493 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err493];
}
else {
vErrors.push(err493);
}
errors++;
}
}
if(data237.attribute !== undefined){
if(typeof data237.attribute !== "string"){
const err494 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err494];
}
else {
vErrors.push(err494);
}
errors++;
}
}
if(data237.operator !== undefined){
let data240 = data237.operator;
if(typeof data240 !== "string"){
const err495 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err495];
}
else {
vErrors.push(err495);
}
errors++;
}
if(!((((((((((((((((data240 === "EXISTS") || (data240 === "NOT_EXISTS")) || (data240 === "EXACTLY")) || (data240 === "NOT")) || (data240 === "GREATER_THAN")) || (data240 === "GREATER_THAN_OR_EQUAL")) || (data240 === "LESS_THAN")) || (data240 === "LESS_THAN_OR_EQUAL")) || (data240 === "INCLUDES")) || (data240 === "EXCLUDES")) || (data240 === "OPTIONS_GREATER_THAN")) || (data240 === "OPTIONS_LESS_THAN")) || (data240 === "OPTIONS_EQUALS")) || (data240 === "OPTIONS_NOT_EQUALS")) || (data240 === "CONTAINS")) || (data240 === "DOES NOT CONTAIN"))){
const err496 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err496];
}
else {
vErrors.push(err496);
}
errors++;
}
}
if(data237.value !== undefined){
let data241 = data237.value;
const _errs716 = errors;
let valid153 = false;
const _errs717 = errors;
if(!(((typeof data241 == "number") && (!(data241 % 1) && !isNaN(data241))) && (isFinite(data241)))){
const err497 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err497];
}
else {
vErrors.push(err497);
}
errors++;
}
var _valid27 = _errs717 === errors;
valid153 = valid153 || _valid27;
if(!valid153){
const _errs719 = errors;
if(typeof data241 !== "string"){
const err498 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err498];
}
else {
vErrors.push(err498);
}
errors++;
}
var _valid27 = _errs719 === errors;
valid153 = valid153 || _valid27;
if(!valid153){
const _errs721 = errors;
if(typeof data241 !== "boolean"){
const err499 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err499];
}
else {
vErrors.push(err499);
}
errors++;
}
var _valid27 = _errs721 === errors;
valid153 = valid153 || _valid27;
if(!valid153){
const _errs723 = errors;
if(!(Array.isArray(data241))){
const err500 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err500];
}
else {
vErrors.push(err500);
}
errors++;
}
var _valid27 = _errs723 === errors;
valid153 = valid153 || _valid27;
}
}
}
if(!valid153){
const err501 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err501];
}
else {
vErrors.push(err501);
}
errors++;
}
else {
errors = _errs716;
if(vErrors !== null){
if(_errs716){
vErrors.length = _errs716;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err502 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err502];
}
else {
vErrors.push(err502);
}
errors++;
}
}
}
else {
const err503 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err503];
}
else {
vErrors.push(err503);
}
errors++;
}
}
}
else {
const err504 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err504];
}
else {
vErrors.push(err504);
}
errors++;
}
}
}
else {
const err505 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err505];
}
else {
vErrors.push(err505);
}
errors++;
}
var _valid26 = _errs692 === errors;
valid146 = valid146 || _valid26;
}
if(!valid146){
const err506 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err506];
}
else {
vErrors.push(err506);
}
errors++;
}
else {
errors = _errs689;
if(vErrors !== null){
if(_errs689){
vErrors.length = _errs689;
}
else {
vErrors = null;
}
}
}
var _valid25 = _errs687 === errors;
valid144 = valid144 || _valid25;
if(!valid144){
const _errs725 = errors;
if(data231 !== null){
const err507 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err507];
}
else {
vErrors.push(err507);
}
errors++;
}
var _valid25 = _errs725 === errors;
valid144 = valid144 || _valid25;
}
if(!valid144){
const err508 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err508];
}
else {
vErrors.push(err508);
}
errors++;
}
else {
errors = _errs686;
if(vErrors !== null){
if(_errs686){
vErrors.length = _errs686;
}
else {
vErrors = null;
}
}
}
}
if(data228.dataSource !== undefined){
let data242 = data228.dataSource;
if((typeof data242 !== "string") && (data242 !== null)){
const err509 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/dataSource",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/dataSource/type",keyword:"type",params:{type: schema329.properties.stages.items.anyOf[3].properties.panels.items.properties.dataSource.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err509];
}
else {
vErrors.push(err509);
}
errors++;
}
}
}
else {
const err510 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err510];
}
else {
vErrors.push(err510);
}
errors++;
}
}
}
else {
const err511 = {instancePath:instancePath+"/stages/" + i3+"/panels",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err511];
}
else {
vErrors.push(err511);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data243 = data105.prompts;
if(Array.isArray(data243)){
if(data243.length < 1){
const err512 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err512];
}
else {
vErrors.push(err512);
}
errors++;
}
const len15 = data243.length;
for(let i15=0; i15<len15; i15++){
let data244 = data243[i15];
if(data244 && typeof data244 == "object" && !Array.isArray(data244)){
if(data244.id === undefined){
const err513 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err513];
}
else {
vErrors.push(err513);
}
errors++;
}
if(data244.text === undefined){
const err514 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err514];
}
else {
vErrors.push(err514);
}
errors++;
}
for(const key58 in data244){
if(!((key58 === "id") || (key58 === "text"))){
const err515 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key58},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err515];
}
else {
vErrors.push(err515);
}
errors++;
}
}
if(data244.id !== undefined){
if(typeof data244.id !== "string"){
const err516 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15+"/id",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err516];
}
else {
vErrors.push(err516);
}
errors++;
}
}
if(data244.text !== undefined){
if(typeof data244.text !== "string"){
const err517 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15+"/text",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err517];
}
else {
vErrors.push(err517);
}
errors++;
}
}
}
else {
const err518 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err518];
}
else {
vErrors.push(err518);
}
errors++;
}
}
}
else {
const err519 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err519];
}
else {
vErrors.push(err519);
}
errors++;
}
}
}
else {
const err520 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err520];
}
else {
vErrors.push(err520);
}
errors++;
}
var _valid9 = _errs588 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs738 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err521 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err521];
}
else {
vErrors.push(err521);
}
errors++;
}
if(data105.label === undefined){
const err522 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err522];
}
else {
vErrors.push(err522);
}
errors++;
}
if(data105.type === undefined){
const err523 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err523];
}
else {
vErrors.push(err523);
}
errors++;
}
if(data105.quickAdd === undefined){
const err524 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "quickAdd"},message:"must have required property '"+"quickAdd"+"'"};
if(vErrors === null){
vErrors = [err524];
}
else {
vErrors.push(err524);
}
errors++;
}
if(data105.prompts === undefined){
const err525 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err525];
}
else {
vErrors.push(err525);
}
errors++;
}
for(const key59 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[4].properties, key59))){
const err526 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key59},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err526];
}
else {
vErrors.push(err526);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err527 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err527];
}
else {
vErrors.push(err527);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err528 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err528];
}
else {
vErrors.push(err528);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err529 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err529];
}
else {
vErrors.push(err529);
}
errors++;
}
}
if(data105.filter !== undefined){
let data250 = data105.filter;
const _errs752 = errors;
let valid162 = false;
const _errs753 = errors;
const _errs754 = errors;
let valid163 = false;
const _errs755 = errors;
const err530 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err530];
}
else {
vErrors.push(err530);
}
errors++;
var _valid29 = _errs755 === errors;
valid163 = valid163 || _valid29;
if(!valid163){
const _errs757 = errors;
if(data250 && typeof data250 == "object" && !Array.isArray(data250)){
for(const key60 in data250){
if(!((key60 === "join") || (key60 === "rules"))){
const err531 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key60},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err531];
}
else {
vErrors.push(err531);
}
errors++;
}
}
if(data250.join !== undefined){
let data251 = data250.join;
if(typeof data251 !== "string"){
const err532 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err532];
}
else {
vErrors.push(err532);
}
errors++;
}
if(!((data251 === "OR") || (data251 === "AND"))){
const err533 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err533];
}
else {
vErrors.push(err533);
}
errors++;
}
}
if(data250.rules !== undefined){
let data252 = data250.rules;
if(Array.isArray(data252)){
const len16 = data252.length;
for(let i16=0; i16<len16; i16++){
let data253 = data252[i16];
if(data253 && typeof data253 == "object" && !Array.isArray(data253)){
if(data253.type === undefined){
const err534 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err534];
}
else {
vErrors.push(err534);
}
errors++;
}
if(data253.id === undefined){
const err535 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err535];
}
else {
vErrors.push(err535);
}
errors++;
}
if(data253.options === undefined){
const err536 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err536];
}
else {
vErrors.push(err536);
}
errors++;
}
for(const key61 in data253){
if(!(((key61 === "type") || (key61 === "id")) || (key61 === "options"))){
const err537 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key61},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err537];
}
else {
vErrors.push(err537);
}
errors++;
}
}
if(data253.type !== undefined){
let data254 = data253.type;
if(typeof data254 !== "string"){
const err538 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err538];
}
else {
vErrors.push(err538);
}
errors++;
}
if(!(((data254 === "alter") || (data254 === "ego")) || (data254 === "edge"))){
const err539 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err539];
}
else {
vErrors.push(err539);
}
errors++;
}
}
if(data253.id !== undefined){
if(typeof data253.id !== "string"){
const err540 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err540];
}
else {
vErrors.push(err540);
}
errors++;
}
}
if(data253.options !== undefined){
let data256 = data253.options;
if(data256 && typeof data256 == "object" && !Array.isArray(data256)){
if(data256.operator === undefined){
const err541 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err541];
}
else {
vErrors.push(err541);
}
errors++;
}
if(data256.type !== undefined){
if(typeof data256.type !== "string"){
const err542 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err542];
}
else {
vErrors.push(err542);
}
errors++;
}
}
if(data256.attribute !== undefined){
if(typeof data256.attribute !== "string"){
const err543 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err543];
}
else {
vErrors.push(err543);
}
errors++;
}
}
if(data256.operator !== undefined){
let data259 = data256.operator;
if(typeof data259 !== "string"){
const err544 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err544];
}
else {
vErrors.push(err544);
}
errors++;
}
if(!((((((((((((((((data259 === "EXISTS") || (data259 === "NOT_EXISTS")) || (data259 === "EXACTLY")) || (data259 === "NOT")) || (data259 === "GREATER_THAN")) || (data259 === "GREATER_THAN_OR_EQUAL")) || (data259 === "LESS_THAN")) || (data259 === "LESS_THAN_OR_EQUAL")) || (data259 === "INCLUDES")) || (data259 === "EXCLUDES")) || (data259 === "OPTIONS_GREATER_THAN")) || (data259 === "OPTIONS_LESS_THAN")) || (data259 === "OPTIONS_EQUALS")) || (data259 === "OPTIONS_NOT_EQUALS")) || (data259 === "CONTAINS")) || (data259 === "DOES NOT CONTAIN"))){
const err545 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err545];
}
else {
vErrors.push(err545);
}
errors++;
}
}
if(data256.value !== undefined){
let data260 = data256.value;
const _errs781 = errors;
let valid170 = false;
const _errs782 = errors;
if(!(((typeof data260 == "number") && (!(data260 % 1) && !isNaN(data260))) && (isFinite(data260)))){
const err546 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err546];
}
else {
vErrors.push(err546);
}
errors++;
}
var _valid30 = _errs782 === errors;
valid170 = valid170 || _valid30;
if(!valid170){
const _errs784 = errors;
if(typeof data260 !== "string"){
const err547 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err547];
}
else {
vErrors.push(err547);
}
errors++;
}
var _valid30 = _errs784 === errors;
valid170 = valid170 || _valid30;
if(!valid170){
const _errs786 = errors;
if(typeof data260 !== "boolean"){
const err548 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err548];
}
else {
vErrors.push(err548);
}
errors++;
}
var _valid30 = _errs786 === errors;
valid170 = valid170 || _valid30;
if(!valid170){
const _errs788 = errors;
if(!(Array.isArray(data260))){
const err549 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err549];
}
else {
vErrors.push(err549);
}
errors++;
}
var _valid30 = _errs788 === errors;
valid170 = valid170 || _valid30;
}
}
}
if(!valid170){
const err550 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err550];
}
else {
vErrors.push(err550);
}
errors++;
}
else {
errors = _errs781;
if(vErrors !== null){
if(_errs781){
vErrors.length = _errs781;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err551 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err551];
}
else {
vErrors.push(err551);
}
errors++;
}
}
}
else {
const err552 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err552];
}
else {
vErrors.push(err552);
}
errors++;
}
}
}
else {
const err553 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err553];
}
else {
vErrors.push(err553);
}
errors++;
}
}
}
else {
const err554 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err554];
}
else {
vErrors.push(err554);
}
errors++;
}
var _valid29 = _errs757 === errors;
valid163 = valid163 || _valid29;
}
if(!valid163){
const err555 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err555];
}
else {
vErrors.push(err555);
}
errors++;
}
else {
errors = _errs754;
if(vErrors !== null){
if(_errs754){
vErrors.length = _errs754;
}
else {
vErrors = null;
}
}
}
var _valid28 = _errs753 === errors;
valid162 = valid162 || _valid28;
if(!valid162){
const _errs790 = errors;
if(data250 !== null){
const err556 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err556];
}
else {
vErrors.push(err556);
}
errors++;
}
var _valid28 = _errs790 === errors;
valid162 = valid162 || _valid28;
}
if(!valid162){
const err557 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err557];
}
else {
vErrors.push(err557);
}
errors++;
}
else {
errors = _errs752;
if(vErrors !== null){
if(_errs752){
vErrors.length = _errs752;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data262 = data105.introductionPanel;
if(data262 && typeof data262 == "object" && !Array.isArray(data262)){
if(data262.title === undefined){
const err558 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err558];
}
else {
vErrors.push(err558);
}
errors++;
}
if(data262.text === undefined){
const err559 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err559];
}
else {
vErrors.push(err559);
}
errors++;
}
for(const key62 in data262){
if(!((key62 === "title") || (key62 === "text"))){
const err560 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key62},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err560];
}
else {
vErrors.push(err560);
}
errors++;
}
}
if(data262.title !== undefined){
if(typeof data262.title !== "string"){
const err561 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err561];
}
else {
vErrors.push(err561);
}
errors++;
}
}
if(data262.text !== undefined){
if(typeof data262.text !== "string"){
const err562 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err562];
}
else {
vErrors.push(err562);
}
errors++;
}
}
}
else {
const err563 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err563];
}
else {
vErrors.push(err563);
}
errors++;
}
}
if(data105.type !== undefined){
let data265 = data105.type;
if(typeof data265 !== "string"){
const err564 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/4/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err564];
}
else {
vErrors.push(err564);
}
errors++;
}
if("NameGeneratorQuickAdd" !== data265){
const err565 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/4/properties/type/const",keyword:"const",params:{allowedValue: "NameGeneratorQuickAdd"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err565];
}
else {
vErrors.push(err565);
}
errors++;
}
}
if(data105.quickAdd !== undefined){
if(typeof data105.quickAdd !== "string"){
const err566 = {instancePath:instancePath+"/stages/" + i3+"/quickAdd",schemaPath:"#/properties/stages/items/anyOf/4/properties/quickAdd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err566];
}
else {
vErrors.push(err566);
}
errors++;
}
}
if(data105.subject !== undefined){
let data267 = data105.subject;
if(data267 && typeof data267 == "object" && !Array.isArray(data267)){
if(data267.entity === undefined){
const err567 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err567];
}
else {
vErrors.push(err567);
}
errors++;
}
if(data267.type === undefined){
const err568 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err568];
}
else {
vErrors.push(err568);
}
errors++;
}
for(const key63 in data267){
if(!((key63 === "entity") || (key63 === "type"))){
const err569 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key63},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err569];
}
else {
vErrors.push(err569);
}
errors++;
}
}
if(data267.entity !== undefined){
let data268 = data267.entity;
if(typeof data268 !== "string"){
const err570 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err570];
}
else {
vErrors.push(err570);
}
errors++;
}
if(!(((data268 === "edge") || (data268 === "node")) || (data268 === "ego"))){
const err571 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err571];
}
else {
vErrors.push(err571);
}
errors++;
}
}
if(data267.type !== undefined){
if(typeof data267.type !== "string"){
const err572 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err572];
}
else {
vErrors.push(err572);
}
errors++;
}
}
}
else {
const err573 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err573];
}
else {
vErrors.push(err573);
}
errors++;
}
}
if(data105.panels !== undefined){
let data270 = data105.panels;
if(Array.isArray(data270)){
const len17 = data270.length;
for(let i17=0; i17<len17; i17++){
if(!(validate412(data270[i17], {instancePath:instancePath+"/stages/" + i3+"/panels/" + i17,parentData:data270,parentDataProperty:i17,rootData}))){
vErrors = vErrors === null ? validate412.errors : vErrors.concat(validate412.errors);
errors = vErrors.length;
}
}
}
else {
const err574 = {instancePath:instancePath+"/stages/" + i3+"/panels",schemaPath:"#/properties/stages/items/anyOf/4/properties/panels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err574];
}
else {
vErrors.push(err574);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data272 = data105.prompts;
if(Array.isArray(data272)){
if(data272.length < 1){
const err575 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/4/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err575];
}
else {
vErrors.push(err575);
}
errors++;
}
const len18 = data272.length;
for(let i18=0; i18<len18; i18++){
let data273 = data272[i18];
if(data273 && typeof data273 == "object" && !Array.isArray(data273)){
if(data273.id === undefined){
const err576 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err576];
}
else {
vErrors.push(err576);
}
errors++;
}
if(data273.text === undefined){
const err577 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err577];
}
else {
vErrors.push(err577);
}
errors++;
}
for(const key64 in data273){
if(!((key64 === "id") || (key64 === "text"))){
const err578 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key64},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err578];
}
else {
vErrors.push(err578);
}
errors++;
}
}
if(data273.id !== undefined){
if(typeof data273.id !== "string"){
const err579 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err579];
}
else {
vErrors.push(err579);
}
errors++;
}
}
if(data273.text !== undefined){
if(typeof data273.text !== "string"){
const err580 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err580];
}
else {
vErrors.push(err580);
}
errors++;
}
}
}
else {
const err581 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err581];
}
else {
vErrors.push(err581);
}
errors++;
}
}
}
else {
const err582 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/4/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err582];
}
else {
vErrors.push(err582);
}
errors++;
}
}
if(data105.behaviours !== undefined){
let data276 = data105.behaviours;
if(data276 && typeof data276 == "object" && !Array.isArray(data276)){
for(const key65 in data276){
if(!((key65 === "minNodes") || (key65 === "maxNodes"))){
const err583 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key65},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err583];
}
else {
vErrors.push(err583);
}
errors++;
}
}
if(data276.minNodes !== undefined){
let data277 = data276.minNodes;
if(!(((typeof data277 == "number") && (!(data277 % 1) && !isNaN(data277))) && (isFinite(data277)))){
const err584 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/minNodes",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/properties/minNodes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err584];
}
else {
vErrors.push(err584);
}
errors++;
}
}
if(data276.maxNodes !== undefined){
let data278 = data276.maxNodes;
if(!(((typeof data278 == "number") && (!(data278 % 1) && !isNaN(data278))) && (isFinite(data278)))){
const err585 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/maxNodes",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/properties/maxNodes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err585];
}
else {
vErrors.push(err585);
}
errors++;
}
}
}
else {
const err586 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err586];
}
else {
vErrors.push(err586);
}
errors++;
}
}
}
else {
const err587 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err587];
}
else {
vErrors.push(err587);
}
errors++;
}
var _valid9 = _errs738 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs833 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err588 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err588];
}
else {
vErrors.push(err588);
}
errors++;
}
if(data105.label === undefined){
const err589 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err589];
}
else {
vErrors.push(err589);
}
errors++;
}
if(data105.type === undefined){
const err590 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err590];
}
else {
vErrors.push(err590);
}
errors++;
}
if(data105.dataSource === undefined){
const err591 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "dataSource"},message:"must have required property '"+"dataSource"+"'"};
if(vErrors === null){
vErrors = [err591];
}
else {
vErrors.push(err591);
}
errors++;
}
if(data105.prompts === undefined){
const err592 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err592];
}
else {
vErrors.push(err592);
}
errors++;
}
for(const key66 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[5].properties, key66))){
const err593 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key66},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err593];
}
else {
vErrors.push(err593);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err594 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err594];
}
else {
vErrors.push(err594);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err595 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err595];
}
else {
vErrors.push(err595);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err596 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err596];
}
else {
vErrors.push(err596);
}
errors++;
}
}
if(data105.filter !== undefined){
let data282 = data105.filter;
const _errs847 = errors;
let valid187 = false;
const _errs848 = errors;
const _errs849 = errors;
let valid188 = false;
const _errs850 = errors;
const err597 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err597];
}
else {
vErrors.push(err597);
}
errors++;
var _valid32 = _errs850 === errors;
valid188 = valid188 || _valid32;
if(!valid188){
const _errs852 = errors;
if(data282 && typeof data282 == "object" && !Array.isArray(data282)){
for(const key67 in data282){
if(!((key67 === "join") || (key67 === "rules"))){
const err598 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key67},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err598];
}
else {
vErrors.push(err598);
}
errors++;
}
}
if(data282.join !== undefined){
let data283 = data282.join;
if(typeof data283 !== "string"){
const err599 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err599];
}
else {
vErrors.push(err599);
}
errors++;
}
if(!((data283 === "OR") || (data283 === "AND"))){
const err600 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err600];
}
else {
vErrors.push(err600);
}
errors++;
}
}
if(data282.rules !== undefined){
let data284 = data282.rules;
if(Array.isArray(data284)){
const len19 = data284.length;
for(let i19=0; i19<len19; i19++){
let data285 = data284[i19];
if(data285 && typeof data285 == "object" && !Array.isArray(data285)){
if(data285.type === undefined){
const err601 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err601];
}
else {
vErrors.push(err601);
}
errors++;
}
if(data285.id === undefined){
const err602 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err602];
}
else {
vErrors.push(err602);
}
errors++;
}
if(data285.options === undefined){
const err603 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err603];
}
else {
vErrors.push(err603);
}
errors++;
}
for(const key68 in data285){
if(!(((key68 === "type") || (key68 === "id")) || (key68 === "options"))){
const err604 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key68},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err604];
}
else {
vErrors.push(err604);
}
errors++;
}
}
if(data285.type !== undefined){
let data286 = data285.type;
if(typeof data286 !== "string"){
const err605 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err605];
}
else {
vErrors.push(err605);
}
errors++;
}
if(!(((data286 === "alter") || (data286 === "ego")) || (data286 === "edge"))){
const err606 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err606];
}
else {
vErrors.push(err606);
}
errors++;
}
}
if(data285.id !== undefined){
if(typeof data285.id !== "string"){
const err607 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err607];
}
else {
vErrors.push(err607);
}
errors++;
}
}
if(data285.options !== undefined){
let data288 = data285.options;
if(data288 && typeof data288 == "object" && !Array.isArray(data288)){
if(data288.operator === undefined){
const err608 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err608];
}
else {
vErrors.push(err608);
}
errors++;
}
if(data288.type !== undefined){
if(typeof data288.type !== "string"){
const err609 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err609];
}
else {
vErrors.push(err609);
}
errors++;
}
}
if(data288.attribute !== undefined){
if(typeof data288.attribute !== "string"){
const err610 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err610];
}
else {
vErrors.push(err610);
}
errors++;
}
}
if(data288.operator !== undefined){
let data291 = data288.operator;
if(typeof data291 !== "string"){
const err611 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err611];
}
else {
vErrors.push(err611);
}
errors++;
}
if(!((((((((((((((((data291 === "EXISTS") || (data291 === "NOT_EXISTS")) || (data291 === "EXACTLY")) || (data291 === "NOT")) || (data291 === "GREATER_THAN")) || (data291 === "GREATER_THAN_OR_EQUAL")) || (data291 === "LESS_THAN")) || (data291 === "LESS_THAN_OR_EQUAL")) || (data291 === "INCLUDES")) || (data291 === "EXCLUDES")) || (data291 === "OPTIONS_GREATER_THAN")) || (data291 === "OPTIONS_LESS_THAN")) || (data291 === "OPTIONS_EQUALS")) || (data291 === "OPTIONS_NOT_EQUALS")) || (data291 === "CONTAINS")) || (data291 === "DOES NOT CONTAIN"))){
const err612 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err612];
}
else {
vErrors.push(err612);
}
errors++;
}
}
if(data288.value !== undefined){
let data292 = data288.value;
const _errs876 = errors;
let valid195 = false;
const _errs877 = errors;
if(!(((typeof data292 == "number") && (!(data292 % 1) && !isNaN(data292))) && (isFinite(data292)))){
const err613 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err613];
}
else {
vErrors.push(err613);
}
errors++;
}
var _valid33 = _errs877 === errors;
valid195 = valid195 || _valid33;
if(!valid195){
const _errs879 = errors;
if(typeof data292 !== "string"){
const err614 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err614];
}
else {
vErrors.push(err614);
}
errors++;
}
var _valid33 = _errs879 === errors;
valid195 = valid195 || _valid33;
if(!valid195){
const _errs881 = errors;
if(typeof data292 !== "boolean"){
const err615 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err615];
}
else {
vErrors.push(err615);
}
errors++;
}
var _valid33 = _errs881 === errors;
valid195 = valid195 || _valid33;
if(!valid195){
const _errs883 = errors;
if(!(Array.isArray(data292))){
const err616 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err616];
}
else {
vErrors.push(err616);
}
errors++;
}
var _valid33 = _errs883 === errors;
valid195 = valid195 || _valid33;
}
}
}
if(!valid195){
const err617 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err617];
}
else {
vErrors.push(err617);
}
errors++;
}
else {
errors = _errs876;
if(vErrors !== null){
if(_errs876){
vErrors.length = _errs876;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err618 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err618];
}
else {
vErrors.push(err618);
}
errors++;
}
}
}
else {
const err619 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err619];
}
else {
vErrors.push(err619);
}
errors++;
}
}
}
else {
const err620 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err620];
}
else {
vErrors.push(err620);
}
errors++;
}
}
}
else {
const err621 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err621];
}
else {
vErrors.push(err621);
}
errors++;
}
var _valid32 = _errs852 === errors;
valid188 = valid188 || _valid32;
}
if(!valid188){
const err622 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err622];
}
else {
vErrors.push(err622);
}
errors++;
}
else {
errors = _errs849;
if(vErrors !== null){
if(_errs849){
vErrors.length = _errs849;
}
else {
vErrors = null;
}
}
}
var _valid31 = _errs848 === errors;
valid187 = valid187 || _valid31;
if(!valid187){
const _errs885 = errors;
if(data282 !== null){
const err623 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err623];
}
else {
vErrors.push(err623);
}
errors++;
}
var _valid31 = _errs885 === errors;
valid187 = valid187 || _valid31;
}
if(!valid187){
const err624 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err624];
}
else {
vErrors.push(err624);
}
errors++;
}
else {
errors = _errs847;
if(vErrors !== null){
if(_errs847){
vErrors.length = _errs847;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data294 = data105.introductionPanel;
if(data294 && typeof data294 == "object" && !Array.isArray(data294)){
if(data294.title === undefined){
const err625 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err625];
}
else {
vErrors.push(err625);
}
errors++;
}
if(data294.text === undefined){
const err626 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err626];
}
else {
vErrors.push(err626);
}
errors++;
}
for(const key69 in data294){
if(!((key69 === "title") || (key69 === "text"))){
const err627 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key69},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err627];
}
else {
vErrors.push(err627);
}
errors++;
}
}
if(data294.title !== undefined){
if(typeof data294.title !== "string"){
const err628 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err628];
}
else {
vErrors.push(err628);
}
errors++;
}
}
if(data294.text !== undefined){
if(typeof data294.text !== "string"){
const err629 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err629];
}
else {
vErrors.push(err629);
}
errors++;
}
}
}
else {
const err630 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err630];
}
else {
vErrors.push(err630);
}
errors++;
}
}
if(data105.type !== undefined){
let data297 = data105.type;
if(typeof data297 !== "string"){
const err631 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/5/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err631];
}
else {
vErrors.push(err631);
}
errors++;
}
if("NameGeneratorRoster" !== data297){
const err632 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/5/properties/type/const",keyword:"const",params:{allowedValue: "NameGeneratorRoster"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err632];
}
else {
vErrors.push(err632);
}
errors++;
}
}
if(data105.subject !== undefined){
let data298 = data105.subject;
if(data298 && typeof data298 == "object" && !Array.isArray(data298)){
if(data298.entity === undefined){
const err633 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err633];
}
else {
vErrors.push(err633);
}
errors++;
}
if(data298.type === undefined){
const err634 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err634];
}
else {
vErrors.push(err634);
}
errors++;
}
for(const key70 in data298){
if(!((key70 === "entity") || (key70 === "type"))){
const err635 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key70},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err635];
}
else {
vErrors.push(err635);
}
errors++;
}
}
if(data298.entity !== undefined){
let data299 = data298.entity;
if(typeof data299 !== "string"){
const err636 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err636];
}
else {
vErrors.push(err636);
}
errors++;
}
if(!(((data299 === "edge") || (data299 === "node")) || (data299 === "ego"))){
const err637 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err637];
}
else {
vErrors.push(err637);
}
errors++;
}
}
if(data298.type !== undefined){
if(typeof data298.type !== "string"){
const err638 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err638];
}
else {
vErrors.push(err638);
}
errors++;
}
}
}
else {
const err639 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err639];
}
else {
vErrors.push(err639);
}
errors++;
}
}
if(data105.dataSource !== undefined){
if(typeof data105.dataSource !== "string"){
const err640 = {instancePath:instancePath+"/stages/" + i3+"/dataSource",schemaPath:"#/properties/stages/items/anyOf/5/properties/dataSource/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err640];
}
else {
vErrors.push(err640);
}
errors++;
}
}
if(data105.cardOptions !== undefined){
let data302 = data105.cardOptions;
if(data302 && typeof data302 == "object" && !Array.isArray(data302)){
for(const key71 in data302){
if(!((key71 === "displayLabel") || (key71 === "additionalProperties"))){
const err641 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key71},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err641];
}
else {
vErrors.push(err641);
}
errors++;
}
}
if(data302.displayLabel !== undefined){
if(typeof data302.displayLabel !== "string"){
const err642 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/displayLabel",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/displayLabel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err642];
}
else {
vErrors.push(err642);
}
errors++;
}
}
if(data302.additionalProperties !== undefined){
let data304 = data302.additionalProperties;
if(Array.isArray(data304)){
const len20 = data304.length;
for(let i20=0; i20<len20; i20++){
let data305 = data304[i20];
if(data305 && typeof data305 == "object" && !Array.isArray(data305)){
if(data305.label === undefined){
const err643 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err643];
}
else {
vErrors.push(err643);
}
errors++;
}
if(data305.variable === undefined){
const err644 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err644];
}
else {
vErrors.push(err644);
}
errors++;
}
for(const key72 in data305){
if(!((key72 === "label") || (key72 === "variable"))){
const err645 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key72},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err645];
}
else {
vErrors.push(err645);
}
errors++;
}
}
if(data305.label !== undefined){
if(typeof data305.label !== "string"){
const err646 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20+"/label",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err646];
}
else {
vErrors.push(err646);
}
errors++;
}
}
if(data305.variable !== undefined){
if(typeof data305.variable !== "string"){
const err647 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20+"/variable",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err647];
}
else {
vErrors.push(err647);
}
errors++;
}
}
}
else {
const err648 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err648];
}
else {
vErrors.push(err648);
}
errors++;
}
}
}
else {
const err649 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err649];
}
else {
vErrors.push(err649);
}
errors++;
}
}
}
else {
const err650 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err650];
}
else {
vErrors.push(err650);
}
errors++;
}
}
if(data105.searchOptions !== undefined){
let data308 = data105.searchOptions;
if(data308 && typeof data308 == "object" && !Array.isArray(data308)){
if(data308.fuzziness === undefined){
const err651 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/required",keyword:"required",params:{missingProperty: "fuzziness"},message:"must have required property '"+"fuzziness"+"'"};
if(vErrors === null){
vErrors = [err651];
}
else {
vErrors.push(err651);
}
errors++;
}
if(data308.matchProperties === undefined){
const err652 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/required",keyword:"required",params:{missingProperty: "matchProperties"},message:"must have required property '"+"matchProperties"+"'"};
if(vErrors === null){
vErrors = [err652];
}
else {
vErrors.push(err652);
}
errors++;
}
for(const key73 in data308){
if(!((key73 === "fuzziness") || (key73 === "matchProperties"))){
const err653 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key73},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err653];
}
else {
vErrors.push(err653);
}
errors++;
}
}
if(data308.fuzziness !== undefined){
let data309 = data308.fuzziness;
if(!((typeof data309 == "number") && (isFinite(data309)))){
const err654 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions/fuzziness",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/properties/fuzziness/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err654];
}
else {
vErrors.push(err654);
}
errors++;
}
}
if(data308.matchProperties !== undefined){
let data310 = data308.matchProperties;
if(Array.isArray(data310)){
const len21 = data310.length;
for(let i21=0; i21<len21; i21++){
if(typeof data310[i21] !== "string"){
const err655 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions/matchProperties/" + i21,schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/properties/matchProperties/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err655];
}
else {
vErrors.push(err655);
}
errors++;
}
}
}
else {
const err656 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions/matchProperties",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/properties/matchProperties/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err656];
}
else {
vErrors.push(err656);
}
errors++;
}
}
}
else {
const err657 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err657];
}
else {
vErrors.push(err657);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data312 = data105.prompts;
if(Array.isArray(data312)){
if(data312.length < 1){
const err658 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/5/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err658];
}
else {
vErrors.push(err658);
}
errors++;
}
const len22 = data312.length;
for(let i22=0; i22<len22; i22++){
let data313 = data312[i22];
if(data313 && typeof data313 == "object" && !Array.isArray(data313)){
if(data313.id === undefined){
const err659 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err659];
}
else {
vErrors.push(err659);
}
errors++;
}
if(data313.text === undefined){
const err660 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err660];
}
else {
vErrors.push(err660);
}
errors++;
}
for(const key74 in data313){
if(!((key74 === "id") || (key74 === "text"))){
const err661 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key74},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err661];
}
else {
vErrors.push(err661);
}
errors++;
}
}
if(data313.id !== undefined){
if(typeof data313.id !== "string"){
const err662 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err662];
}
else {
vErrors.push(err662);
}
errors++;
}
}
if(data313.text !== undefined){
if(typeof data313.text !== "string"){
const err663 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err663];
}
else {
vErrors.push(err663);
}
errors++;
}
}
}
else {
const err664 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err664];
}
else {
vErrors.push(err664);
}
errors++;
}
}
}
else {
const err665 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/5/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err665];
}
else {
vErrors.push(err665);
}
errors++;
}
}
}
else {
const err666 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err666];
}
else {
vErrors.push(err666);
}
errors++;
}
var _valid9 = _errs833 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs941 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err667 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err667];
}
else {
vErrors.push(err667);
}
errors++;
}
if(data105.label === undefined){
const err668 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err668];
}
else {
vErrors.push(err668);
}
errors++;
}
if(data105.type === undefined){
const err669 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err669];
}
else {
vErrors.push(err669);
}
errors++;
}
if(data105.prompts === undefined){
const err670 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err670];
}
else {
vErrors.push(err670);
}
errors++;
}
for(const key75 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[6].properties, key75))){
const err671 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key75},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err671];
}
else {
vErrors.push(err671);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err672 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err672];
}
else {
vErrors.push(err672);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err673 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err673];
}
else {
vErrors.push(err673);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err674 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err674];
}
else {
vErrors.push(err674);
}
errors++;
}
}
if(data105.filter !== undefined){
let data319 = data105.filter;
const _errs955 = errors;
let valid216 = false;
const _errs956 = errors;
const _errs957 = errors;
let valid217 = false;
const _errs958 = errors;
const err675 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err675];
}
else {
vErrors.push(err675);
}
errors++;
var _valid35 = _errs958 === errors;
valid217 = valid217 || _valid35;
if(!valid217){
const _errs960 = errors;
if(data319 && typeof data319 == "object" && !Array.isArray(data319)){
for(const key76 in data319){
if(!((key76 === "join") || (key76 === "rules"))){
const err676 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key76},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err676];
}
else {
vErrors.push(err676);
}
errors++;
}
}
if(data319.join !== undefined){
let data320 = data319.join;
if(typeof data320 !== "string"){
const err677 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err677];
}
else {
vErrors.push(err677);
}
errors++;
}
if(!((data320 === "OR") || (data320 === "AND"))){
const err678 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err678];
}
else {
vErrors.push(err678);
}
errors++;
}
}
if(data319.rules !== undefined){
let data321 = data319.rules;
if(Array.isArray(data321)){
const len23 = data321.length;
for(let i23=0; i23<len23; i23++){
let data322 = data321[i23];
if(data322 && typeof data322 == "object" && !Array.isArray(data322)){
if(data322.type === undefined){
const err679 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err679];
}
else {
vErrors.push(err679);
}
errors++;
}
if(data322.id === undefined){
const err680 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err680];
}
else {
vErrors.push(err680);
}
errors++;
}
if(data322.options === undefined){
const err681 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err681];
}
else {
vErrors.push(err681);
}
errors++;
}
for(const key77 in data322){
if(!(((key77 === "type") || (key77 === "id")) || (key77 === "options"))){
const err682 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key77},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err682];
}
else {
vErrors.push(err682);
}
errors++;
}
}
if(data322.type !== undefined){
let data323 = data322.type;
if(typeof data323 !== "string"){
const err683 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err683];
}
else {
vErrors.push(err683);
}
errors++;
}
if(!(((data323 === "alter") || (data323 === "ego")) || (data323 === "edge"))){
const err684 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err684];
}
else {
vErrors.push(err684);
}
errors++;
}
}
if(data322.id !== undefined){
if(typeof data322.id !== "string"){
const err685 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err685];
}
else {
vErrors.push(err685);
}
errors++;
}
}
if(data322.options !== undefined){
let data325 = data322.options;
if(data325 && typeof data325 == "object" && !Array.isArray(data325)){
if(data325.operator === undefined){
const err686 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err686];
}
else {
vErrors.push(err686);
}
errors++;
}
if(data325.type !== undefined){
if(typeof data325.type !== "string"){
const err687 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err687];
}
else {
vErrors.push(err687);
}
errors++;
}
}
if(data325.attribute !== undefined){
if(typeof data325.attribute !== "string"){
const err688 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err688];
}
else {
vErrors.push(err688);
}
errors++;
}
}
if(data325.operator !== undefined){
let data328 = data325.operator;
if(typeof data328 !== "string"){
const err689 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err689];
}
else {
vErrors.push(err689);
}
errors++;
}
if(!((((((((((((((((data328 === "EXISTS") || (data328 === "NOT_EXISTS")) || (data328 === "EXACTLY")) || (data328 === "NOT")) || (data328 === "GREATER_THAN")) || (data328 === "GREATER_THAN_OR_EQUAL")) || (data328 === "LESS_THAN")) || (data328 === "LESS_THAN_OR_EQUAL")) || (data328 === "INCLUDES")) || (data328 === "EXCLUDES")) || (data328 === "OPTIONS_GREATER_THAN")) || (data328 === "OPTIONS_LESS_THAN")) || (data328 === "OPTIONS_EQUALS")) || (data328 === "OPTIONS_NOT_EQUALS")) || (data328 === "CONTAINS")) || (data328 === "DOES NOT CONTAIN"))){
const err690 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err690];
}
else {
vErrors.push(err690);
}
errors++;
}
}
if(data325.value !== undefined){
let data329 = data325.value;
const _errs984 = errors;
let valid224 = false;
const _errs985 = errors;
if(!(((typeof data329 == "number") && (!(data329 % 1) && !isNaN(data329))) && (isFinite(data329)))){
const err691 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err691];
}
else {
vErrors.push(err691);
}
errors++;
}
var _valid36 = _errs985 === errors;
valid224 = valid224 || _valid36;
if(!valid224){
const _errs987 = errors;
if(typeof data329 !== "string"){
const err692 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err692];
}
else {
vErrors.push(err692);
}
errors++;
}
var _valid36 = _errs987 === errors;
valid224 = valid224 || _valid36;
if(!valid224){
const _errs989 = errors;
if(typeof data329 !== "boolean"){
const err693 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err693];
}
else {
vErrors.push(err693);
}
errors++;
}
var _valid36 = _errs989 === errors;
valid224 = valid224 || _valid36;
if(!valid224){
const _errs991 = errors;
if(!(Array.isArray(data329))){
const err694 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err694];
}
else {
vErrors.push(err694);
}
errors++;
}
var _valid36 = _errs991 === errors;
valid224 = valid224 || _valid36;
}
}
}
if(!valid224){
const err695 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err695];
}
else {
vErrors.push(err695);
}
errors++;
}
else {
errors = _errs984;
if(vErrors !== null){
if(_errs984){
vErrors.length = _errs984;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err696 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err696];
}
else {
vErrors.push(err696);
}
errors++;
}
}
}
else {
const err697 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err697];
}
else {
vErrors.push(err697);
}
errors++;
}
}
}
else {
const err698 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err698];
}
else {
vErrors.push(err698);
}
errors++;
}
}
}
else {
const err699 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err699];
}
else {
vErrors.push(err699);
}
errors++;
}
var _valid35 = _errs960 === errors;
valid217 = valid217 || _valid35;
}
if(!valid217){
const err700 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err700];
}
else {
vErrors.push(err700);
}
errors++;
}
else {
errors = _errs957;
if(vErrors !== null){
if(_errs957){
vErrors.length = _errs957;
}
else {
vErrors = null;
}
}
}
var _valid34 = _errs956 === errors;
valid216 = valid216 || _valid34;
if(!valid216){
const _errs993 = errors;
if(data319 !== null){
const err701 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err701];
}
else {
vErrors.push(err701);
}
errors++;
}
var _valid34 = _errs993 === errors;
valid216 = valid216 || _valid34;
}
if(!valid216){
const err702 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err702];
}
else {
vErrors.push(err702);
}
errors++;
}
else {
errors = _errs955;
if(vErrors !== null){
if(_errs955){
vErrors.length = _errs955;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data331 = data105.introductionPanel;
if(data331 && typeof data331 == "object" && !Array.isArray(data331)){
if(data331.title === undefined){
const err703 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err703];
}
else {
vErrors.push(err703);
}
errors++;
}
if(data331.text === undefined){
const err704 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err704];
}
else {
vErrors.push(err704);
}
errors++;
}
for(const key78 in data331){
if(!((key78 === "title") || (key78 === "text"))){
const err705 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key78},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err705];
}
else {
vErrors.push(err705);
}
errors++;
}
}
if(data331.title !== undefined){
if(typeof data331.title !== "string"){
const err706 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err706];
}
else {
vErrors.push(err706);
}
errors++;
}
}
if(data331.text !== undefined){
if(typeof data331.text !== "string"){
const err707 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err707];
}
else {
vErrors.push(err707);
}
errors++;
}
}
}
else {
const err708 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err708];
}
else {
vErrors.push(err708);
}
errors++;
}
}
if(data105.type !== undefined){
let data334 = data105.type;
if(typeof data334 !== "string"){
const err709 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/6/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err709];
}
else {
vErrors.push(err709);
}
errors++;
}
if("Sociogram" !== data334){
const err710 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/6/properties/type/const",keyword:"const",params:{allowedValue: "Sociogram"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err710];
}
else {
vErrors.push(err710);
}
errors++;
}
}
if(data105.subject !== undefined){
let data335 = data105.subject;
if(data335 && typeof data335 == "object" && !Array.isArray(data335)){
if(data335.entity === undefined){
const err711 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err711];
}
else {
vErrors.push(err711);
}
errors++;
}
if(data335.type === undefined){
const err712 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err712];
}
else {
vErrors.push(err712);
}
errors++;
}
for(const key79 in data335){
if(!((key79 === "entity") || (key79 === "type"))){
const err713 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key79},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err713];
}
else {
vErrors.push(err713);
}
errors++;
}
}
if(data335.entity !== undefined){
let data336 = data335.entity;
if(typeof data336 !== "string"){
const err714 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err714];
}
else {
vErrors.push(err714);
}
errors++;
}
if(!(((data336 === "edge") || (data336 === "node")) || (data336 === "ego"))){
const err715 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err715];
}
else {
vErrors.push(err715);
}
errors++;
}
}
if(data335.type !== undefined){
if(typeof data335.type !== "string"){
const err716 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err716];
}
else {
vErrors.push(err716);
}
errors++;
}
}
}
else {
const err717 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err717];
}
else {
vErrors.push(err717);
}
errors++;
}
}
if(data105.background !== undefined){
let data338 = data105.background;
if(data338 && typeof data338 == "object" && !Array.isArray(data338)){
for(const key80 in data338){
if(!(((key80 === "image") || (key80 === "concentricCircles")) || (key80 === "skewedTowardCenter"))){
const err718 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key80},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err718];
}
else {
vErrors.push(err718);
}
errors++;
}
}
if(data338.image !== undefined){
if(typeof data338.image !== "string"){
const err719 = {instancePath:instancePath+"/stages/" + i3+"/background/image",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/properties/image/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err719];
}
else {
vErrors.push(err719);
}
errors++;
}
}
if(data338.concentricCircles !== undefined){
let data340 = data338.concentricCircles;
if(!(((typeof data340 == "number") && (!(data340 % 1) && !isNaN(data340))) && (isFinite(data340)))){
const err720 = {instancePath:instancePath+"/stages/" + i3+"/background/concentricCircles",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/properties/concentricCircles/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err720];
}
else {
vErrors.push(err720);
}
errors++;
}
}
if(data338.skewedTowardCenter !== undefined){
if(typeof data338.skewedTowardCenter !== "boolean"){
const err721 = {instancePath:instancePath+"/stages/" + i3+"/background/skewedTowardCenter",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/properties/skewedTowardCenter/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err721];
}
else {
vErrors.push(err721);
}
errors++;
}
}
}
else {
const err722 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err722];
}
else {
vErrors.push(err722);
}
errors++;
}
}
if(data105.behaviours !== undefined){
let data342 = data105.behaviours;
if(data342 && typeof data342 == "object" && !Array.isArray(data342)){
if(data342.automaticLayout !== undefined){
let data343 = data342.automaticLayout;
if(data343 && typeof data343 == "object" && !Array.isArray(data343)){
if(data343.enabled === undefined){
const err723 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/required",keyword:"required",params:{missingProperty: "enabled"},message:"must have required property '"+"enabled"+"'"};
if(vErrors === null){
vErrors = [err723];
}
else {
vErrors.push(err723);
}
errors++;
}
for(const key81 in data343){
if(!(key81 === "enabled")){
const err724 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key81},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err724];
}
else {
vErrors.push(err724);
}
errors++;
}
}
if(data343.enabled !== undefined){
if(typeof data343.enabled !== "boolean"){
const err725 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout/enabled",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/properties/enabled/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err725];
}
else {
vErrors.push(err725);
}
errors++;
}
}
}
else {
const err726 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err726];
}
else {
vErrors.push(err726);
}
errors++;
}
}
}
else {
const err727 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err727];
}
else {
vErrors.push(err727);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data345 = data105.prompts;
if(Array.isArray(data345)){
if(data345.length < 1){
const err728 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/6/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err728];
}
else {
vErrors.push(err728);
}
errors++;
}
const len24 = data345.length;
for(let i24=0; i24<len24; i24++){
let data346 = data345[i24];
if(data346 && typeof data346 == "object" && !Array.isArray(data346)){
if(data346.id === undefined){
const err729 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err729];
}
else {
vErrors.push(err729);
}
errors++;
}
if(data346.text === undefined){
const err730 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err730];
}
else {
vErrors.push(err730);
}
errors++;
}
for(const key82 in data346){
if(!((key82 === "id") || (key82 === "text"))){
const err731 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key82},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err731];
}
else {
vErrors.push(err731);
}
errors++;
}
}
if(data346.id !== undefined){
if(typeof data346.id !== "string"){
const err732 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err732];
}
else {
vErrors.push(err732);
}
errors++;
}
}
if(data346.text !== undefined){
if(typeof data346.text !== "string"){
const err733 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err733];
}
else {
vErrors.push(err733);
}
errors++;
}
}
}
else {
const err734 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err734];
}
else {
vErrors.push(err734);
}
errors++;
}
}
}
else {
const err735 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/6/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err735];
}
else {
vErrors.push(err735);
}
errors++;
}
}
}
else {
const err736 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err736];
}
else {
vErrors.push(err736);
}
errors++;
}
var _valid9 = _errs941 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1041 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err737 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err737];
}
else {
vErrors.push(err737);
}
errors++;
}
if(data105.label === undefined){
const err738 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err738];
}
else {
vErrors.push(err738);
}
errors++;
}
if(data105.type === undefined){
const err739 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err739];
}
else {
vErrors.push(err739);
}
errors++;
}
if(data105.prompts === undefined){
const err740 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err740];
}
else {
vErrors.push(err740);
}
errors++;
}
for(const key83 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[7].properties, key83))){
const err741 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key83},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err741];
}
else {
vErrors.push(err741);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err742 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err742];
}
else {
vErrors.push(err742);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err743 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err743];
}
else {
vErrors.push(err743);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err744 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err744];
}
else {
vErrors.push(err744);
}
errors++;
}
}
if(data105.filter !== undefined){
let data352 = data105.filter;
const _errs1055 = errors;
let valid241 = false;
const _errs1056 = errors;
const _errs1057 = errors;
let valid242 = false;
const _errs1058 = errors;
const err745 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err745];
}
else {
vErrors.push(err745);
}
errors++;
var _valid38 = _errs1058 === errors;
valid242 = valid242 || _valid38;
if(!valid242){
const _errs1060 = errors;
if(data352 && typeof data352 == "object" && !Array.isArray(data352)){
for(const key84 in data352){
if(!((key84 === "join") || (key84 === "rules"))){
const err746 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key84},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err746];
}
else {
vErrors.push(err746);
}
errors++;
}
}
if(data352.join !== undefined){
let data353 = data352.join;
if(typeof data353 !== "string"){
const err747 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err747];
}
else {
vErrors.push(err747);
}
errors++;
}
if(!((data353 === "OR") || (data353 === "AND"))){
const err748 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err748];
}
else {
vErrors.push(err748);
}
errors++;
}
}
if(data352.rules !== undefined){
let data354 = data352.rules;
if(Array.isArray(data354)){
const len25 = data354.length;
for(let i25=0; i25<len25; i25++){
let data355 = data354[i25];
if(data355 && typeof data355 == "object" && !Array.isArray(data355)){
if(data355.type === undefined){
const err749 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err749];
}
else {
vErrors.push(err749);
}
errors++;
}
if(data355.id === undefined){
const err750 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err750];
}
else {
vErrors.push(err750);
}
errors++;
}
if(data355.options === undefined){
const err751 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err751];
}
else {
vErrors.push(err751);
}
errors++;
}
for(const key85 in data355){
if(!(((key85 === "type") || (key85 === "id")) || (key85 === "options"))){
const err752 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key85},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err752];
}
else {
vErrors.push(err752);
}
errors++;
}
}
if(data355.type !== undefined){
let data356 = data355.type;
if(typeof data356 !== "string"){
const err753 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err753];
}
else {
vErrors.push(err753);
}
errors++;
}
if(!(((data356 === "alter") || (data356 === "ego")) || (data356 === "edge"))){
const err754 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err754];
}
else {
vErrors.push(err754);
}
errors++;
}
}
if(data355.id !== undefined){
if(typeof data355.id !== "string"){
const err755 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err755];
}
else {
vErrors.push(err755);
}
errors++;
}
}
if(data355.options !== undefined){
let data358 = data355.options;
if(data358 && typeof data358 == "object" && !Array.isArray(data358)){
if(data358.operator === undefined){
const err756 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err756];
}
else {
vErrors.push(err756);
}
errors++;
}
if(data358.type !== undefined){
if(typeof data358.type !== "string"){
const err757 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err757];
}
else {
vErrors.push(err757);
}
errors++;
}
}
if(data358.attribute !== undefined){
if(typeof data358.attribute !== "string"){
const err758 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err758];
}
else {
vErrors.push(err758);
}
errors++;
}
}
if(data358.operator !== undefined){
let data361 = data358.operator;
if(typeof data361 !== "string"){
const err759 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err759];
}
else {
vErrors.push(err759);
}
errors++;
}
if(!((((((((((((((((data361 === "EXISTS") || (data361 === "NOT_EXISTS")) || (data361 === "EXACTLY")) || (data361 === "NOT")) || (data361 === "GREATER_THAN")) || (data361 === "GREATER_THAN_OR_EQUAL")) || (data361 === "LESS_THAN")) || (data361 === "LESS_THAN_OR_EQUAL")) || (data361 === "INCLUDES")) || (data361 === "EXCLUDES")) || (data361 === "OPTIONS_GREATER_THAN")) || (data361 === "OPTIONS_LESS_THAN")) || (data361 === "OPTIONS_EQUALS")) || (data361 === "OPTIONS_NOT_EQUALS")) || (data361 === "CONTAINS")) || (data361 === "DOES NOT CONTAIN"))){
const err760 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err760];
}
else {
vErrors.push(err760);
}
errors++;
}
}
if(data358.value !== undefined){
let data362 = data358.value;
const _errs1084 = errors;
let valid249 = false;
const _errs1085 = errors;
if(!(((typeof data362 == "number") && (!(data362 % 1) && !isNaN(data362))) && (isFinite(data362)))){
const err761 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err761];
}
else {
vErrors.push(err761);
}
errors++;
}
var _valid39 = _errs1085 === errors;
valid249 = valid249 || _valid39;
if(!valid249){
const _errs1087 = errors;
if(typeof data362 !== "string"){
const err762 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err762];
}
else {
vErrors.push(err762);
}
errors++;
}
var _valid39 = _errs1087 === errors;
valid249 = valid249 || _valid39;
if(!valid249){
const _errs1089 = errors;
if(typeof data362 !== "boolean"){
const err763 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err763];
}
else {
vErrors.push(err763);
}
errors++;
}
var _valid39 = _errs1089 === errors;
valid249 = valid249 || _valid39;
if(!valid249){
const _errs1091 = errors;
if(!(Array.isArray(data362))){
const err764 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err764];
}
else {
vErrors.push(err764);
}
errors++;
}
var _valid39 = _errs1091 === errors;
valid249 = valid249 || _valid39;
}
}
}
if(!valid249){
const err765 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err765];
}
else {
vErrors.push(err765);
}
errors++;
}
else {
errors = _errs1084;
if(vErrors !== null){
if(_errs1084){
vErrors.length = _errs1084;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err766 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err766];
}
else {
vErrors.push(err766);
}
errors++;
}
}
}
else {
const err767 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err767];
}
else {
vErrors.push(err767);
}
errors++;
}
}
}
else {
const err768 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err768];
}
else {
vErrors.push(err768);
}
errors++;
}
}
}
else {
const err769 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err769];
}
else {
vErrors.push(err769);
}
errors++;
}
var _valid38 = _errs1060 === errors;
valid242 = valid242 || _valid38;
}
if(!valid242){
const err770 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err770];
}
else {
vErrors.push(err770);
}
errors++;
}
else {
errors = _errs1057;
if(vErrors !== null){
if(_errs1057){
vErrors.length = _errs1057;
}
else {
vErrors = null;
}
}
}
var _valid37 = _errs1056 === errors;
valid241 = valid241 || _valid37;
if(!valid241){
const _errs1093 = errors;
if(data352 !== null){
const err771 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err771];
}
else {
vErrors.push(err771);
}
errors++;
}
var _valid37 = _errs1093 === errors;
valid241 = valid241 || _valid37;
}
if(!valid241){
const err772 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err772];
}
else {
vErrors.push(err772);
}
errors++;
}
else {
errors = _errs1055;
if(vErrors !== null){
if(_errs1055){
vErrors.length = _errs1055;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data364 = data105.introductionPanel;
if(data364 && typeof data364 == "object" && !Array.isArray(data364)){
if(data364.title === undefined){
const err773 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err773];
}
else {
vErrors.push(err773);
}
errors++;
}
if(data364.text === undefined){
const err774 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err774];
}
else {
vErrors.push(err774);
}
errors++;
}
for(const key86 in data364){
if(!((key86 === "title") || (key86 === "text"))){
const err775 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key86},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err775];
}
else {
vErrors.push(err775);
}
errors++;
}
}
if(data364.title !== undefined){
if(typeof data364.title !== "string"){
const err776 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err776];
}
else {
vErrors.push(err776);
}
errors++;
}
}
if(data364.text !== undefined){
if(typeof data364.text !== "string"){
const err777 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err777];
}
else {
vErrors.push(err777);
}
errors++;
}
}
}
else {
const err778 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err778];
}
else {
vErrors.push(err778);
}
errors++;
}
}
if(data105.type !== undefined){
let data367 = data105.type;
if(typeof data367 !== "string"){
const err779 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/7/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err779];
}
else {
vErrors.push(err779);
}
errors++;
}
if("DyadCensus" !== data367){
const err780 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/7/properties/type/const",keyword:"const",params:{allowedValue: "DyadCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err780];
}
else {
vErrors.push(err780);
}
errors++;
}
}
if(data105.subject !== undefined){
let data368 = data105.subject;
if(data368 && typeof data368 == "object" && !Array.isArray(data368)){
if(data368.entity === undefined){
const err781 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err781];
}
else {
vErrors.push(err781);
}
errors++;
}
if(data368.type === undefined){
const err782 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err782];
}
else {
vErrors.push(err782);
}
errors++;
}
for(const key87 in data368){
if(!((key87 === "entity") || (key87 === "type"))){
const err783 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key87},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err783];
}
else {
vErrors.push(err783);
}
errors++;
}
}
if(data368.entity !== undefined){
let data369 = data368.entity;
if(typeof data369 !== "string"){
const err784 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err784];
}
else {
vErrors.push(err784);
}
errors++;
}
if(!(((data369 === "edge") || (data369 === "node")) || (data369 === "ego"))){
const err785 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err785];
}
else {
vErrors.push(err785);
}
errors++;
}
}
if(data368.type !== undefined){
if(typeof data368.type !== "string"){
const err786 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err786];
}
else {
vErrors.push(err786);
}
errors++;
}
}
}
else {
const err787 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err787];
}
else {
vErrors.push(err787);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data371 = data105.prompts;
if(Array.isArray(data371)){
if(data371.length < 1){
const err788 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err788];
}
else {
vErrors.push(err788);
}
errors++;
}
const len26 = data371.length;
for(let i26=0; i26<len26; i26++){
let data372 = data371[i26];
if(data372 && typeof data372 == "object" && !Array.isArray(data372)){
if(data372.id === undefined){
const err789 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err789];
}
else {
vErrors.push(err789);
}
errors++;
}
if(data372.text === undefined){
const err790 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err790];
}
else {
vErrors.push(err790);
}
errors++;
}
if(data372.createEdge === undefined){
const err791 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/required",keyword:"required",params:{missingProperty: "createEdge"},message:"must have required property '"+"createEdge"+"'"};
if(vErrors === null){
vErrors = [err791];
}
else {
vErrors.push(err791);
}
errors++;
}
for(const key88 in data372){
if(!(((key88 === "id") || (key88 === "text")) || (key88 === "createEdge"))){
const err792 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key88},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err792];
}
else {
vErrors.push(err792);
}
errors++;
}
}
if(data372.id !== undefined){
if(typeof data372.id !== "string"){
const err793 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err793];
}
else {
vErrors.push(err793);
}
errors++;
}
}
if(data372.text !== undefined){
if(typeof data372.text !== "string"){
const err794 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err794];
}
else {
vErrors.push(err794);
}
errors++;
}
}
if(data372.createEdge !== undefined){
if(typeof data372.createEdge !== "string"){
const err795 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26+"/createEdge",schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/properties/createEdge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err795];
}
else {
vErrors.push(err795);
}
errors++;
}
}
}
else {
const err796 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err796];
}
else {
vErrors.push(err796);
}
errors++;
}
}
}
else {
const err797 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err797];
}
else {
vErrors.push(err797);
}
errors++;
}
}
}
else {
const err798 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err798];
}
else {
vErrors.push(err798);
}
errors++;
}
var _valid9 = _errs1041 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1127 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err799 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err799];
}
else {
vErrors.push(err799);
}
errors++;
}
if(data105.label === undefined){
const err800 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err800];
}
else {
vErrors.push(err800);
}
errors++;
}
if(data105.type === undefined){
const err801 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err801];
}
else {
vErrors.push(err801);
}
errors++;
}
if(data105.prompts === undefined){
const err802 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err802];
}
else {
vErrors.push(err802);
}
errors++;
}
for(const key89 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[8].properties, key89))){
const err803 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key89},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err803];
}
else {
vErrors.push(err803);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err804 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err804];
}
else {
vErrors.push(err804);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err805 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err805];
}
else {
vErrors.push(err805);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err806 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err806];
}
else {
vErrors.push(err806);
}
errors++;
}
}
if(data105.filter !== undefined){
let data379 = data105.filter;
const _errs1141 = errors;
let valid264 = false;
const _errs1142 = errors;
const _errs1143 = errors;
let valid265 = false;
const _errs1144 = errors;
const err807 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err807];
}
else {
vErrors.push(err807);
}
errors++;
var _valid41 = _errs1144 === errors;
valid265 = valid265 || _valid41;
if(!valid265){
const _errs1146 = errors;
if(data379 && typeof data379 == "object" && !Array.isArray(data379)){
for(const key90 in data379){
if(!((key90 === "join") || (key90 === "rules"))){
const err808 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key90},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err808];
}
else {
vErrors.push(err808);
}
errors++;
}
}
if(data379.join !== undefined){
let data380 = data379.join;
if(typeof data380 !== "string"){
const err809 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err809];
}
else {
vErrors.push(err809);
}
errors++;
}
if(!((data380 === "OR") || (data380 === "AND"))){
const err810 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err810];
}
else {
vErrors.push(err810);
}
errors++;
}
}
if(data379.rules !== undefined){
let data381 = data379.rules;
if(Array.isArray(data381)){
const len27 = data381.length;
for(let i27=0; i27<len27; i27++){
let data382 = data381[i27];
if(data382 && typeof data382 == "object" && !Array.isArray(data382)){
if(data382.type === undefined){
const err811 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err811];
}
else {
vErrors.push(err811);
}
errors++;
}
if(data382.id === undefined){
const err812 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err812];
}
else {
vErrors.push(err812);
}
errors++;
}
if(data382.options === undefined){
const err813 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err813];
}
else {
vErrors.push(err813);
}
errors++;
}
for(const key91 in data382){
if(!(((key91 === "type") || (key91 === "id")) || (key91 === "options"))){
const err814 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key91},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err814];
}
else {
vErrors.push(err814);
}
errors++;
}
}
if(data382.type !== undefined){
let data383 = data382.type;
if(typeof data383 !== "string"){
const err815 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err815];
}
else {
vErrors.push(err815);
}
errors++;
}
if(!(((data383 === "alter") || (data383 === "ego")) || (data383 === "edge"))){
const err816 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err816];
}
else {
vErrors.push(err816);
}
errors++;
}
}
if(data382.id !== undefined){
if(typeof data382.id !== "string"){
const err817 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err817];
}
else {
vErrors.push(err817);
}
errors++;
}
}
if(data382.options !== undefined){
let data385 = data382.options;
if(data385 && typeof data385 == "object" && !Array.isArray(data385)){
if(data385.operator === undefined){
const err818 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err818];
}
else {
vErrors.push(err818);
}
errors++;
}
if(data385.type !== undefined){
if(typeof data385.type !== "string"){
const err819 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err819];
}
else {
vErrors.push(err819);
}
errors++;
}
}
if(data385.attribute !== undefined){
if(typeof data385.attribute !== "string"){
const err820 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err820];
}
else {
vErrors.push(err820);
}
errors++;
}
}
if(data385.operator !== undefined){
let data388 = data385.operator;
if(typeof data388 !== "string"){
const err821 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err821];
}
else {
vErrors.push(err821);
}
errors++;
}
if(!((((((((((((((((data388 === "EXISTS") || (data388 === "NOT_EXISTS")) || (data388 === "EXACTLY")) || (data388 === "NOT")) || (data388 === "GREATER_THAN")) || (data388 === "GREATER_THAN_OR_EQUAL")) || (data388 === "LESS_THAN")) || (data388 === "LESS_THAN_OR_EQUAL")) || (data388 === "INCLUDES")) || (data388 === "EXCLUDES")) || (data388 === "OPTIONS_GREATER_THAN")) || (data388 === "OPTIONS_LESS_THAN")) || (data388 === "OPTIONS_EQUALS")) || (data388 === "OPTIONS_NOT_EQUALS")) || (data388 === "CONTAINS")) || (data388 === "DOES NOT CONTAIN"))){
const err822 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err822];
}
else {
vErrors.push(err822);
}
errors++;
}
}
if(data385.value !== undefined){
let data389 = data385.value;
const _errs1170 = errors;
let valid272 = false;
const _errs1171 = errors;
if(!(((typeof data389 == "number") && (!(data389 % 1) && !isNaN(data389))) && (isFinite(data389)))){
const err823 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err823];
}
else {
vErrors.push(err823);
}
errors++;
}
var _valid42 = _errs1171 === errors;
valid272 = valid272 || _valid42;
if(!valid272){
const _errs1173 = errors;
if(typeof data389 !== "string"){
const err824 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err824];
}
else {
vErrors.push(err824);
}
errors++;
}
var _valid42 = _errs1173 === errors;
valid272 = valid272 || _valid42;
if(!valid272){
const _errs1175 = errors;
if(typeof data389 !== "boolean"){
const err825 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err825];
}
else {
vErrors.push(err825);
}
errors++;
}
var _valid42 = _errs1175 === errors;
valid272 = valid272 || _valid42;
if(!valid272){
const _errs1177 = errors;
if(!(Array.isArray(data389))){
const err826 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err826];
}
else {
vErrors.push(err826);
}
errors++;
}
var _valid42 = _errs1177 === errors;
valid272 = valid272 || _valid42;
}
}
}
if(!valid272){
const err827 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err827];
}
else {
vErrors.push(err827);
}
errors++;
}
else {
errors = _errs1170;
if(vErrors !== null){
if(_errs1170){
vErrors.length = _errs1170;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err828 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err828];
}
else {
vErrors.push(err828);
}
errors++;
}
}
}
else {
const err829 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err829];
}
else {
vErrors.push(err829);
}
errors++;
}
}
}
else {
const err830 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err830];
}
else {
vErrors.push(err830);
}
errors++;
}
}
}
else {
const err831 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err831];
}
else {
vErrors.push(err831);
}
errors++;
}
var _valid41 = _errs1146 === errors;
valid265 = valid265 || _valid41;
}
if(!valid265){
const err832 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err832];
}
else {
vErrors.push(err832);
}
errors++;
}
else {
errors = _errs1143;
if(vErrors !== null){
if(_errs1143){
vErrors.length = _errs1143;
}
else {
vErrors = null;
}
}
}
var _valid40 = _errs1142 === errors;
valid264 = valid264 || _valid40;
if(!valid264){
const _errs1179 = errors;
if(data379 !== null){
const err833 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err833];
}
else {
vErrors.push(err833);
}
errors++;
}
var _valid40 = _errs1179 === errors;
valid264 = valid264 || _valid40;
}
if(!valid264){
const err834 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err834];
}
else {
vErrors.push(err834);
}
errors++;
}
else {
errors = _errs1141;
if(vErrors !== null){
if(_errs1141){
vErrors.length = _errs1141;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data391 = data105.introductionPanel;
if(data391 && typeof data391 == "object" && !Array.isArray(data391)){
if(data391.title === undefined){
const err835 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err835];
}
else {
vErrors.push(err835);
}
errors++;
}
if(data391.text === undefined){
const err836 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err836];
}
else {
vErrors.push(err836);
}
errors++;
}
for(const key92 in data391){
if(!((key92 === "title") || (key92 === "text"))){
const err837 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key92},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err837];
}
else {
vErrors.push(err837);
}
errors++;
}
}
if(data391.title !== undefined){
if(typeof data391.title !== "string"){
const err838 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err838];
}
else {
vErrors.push(err838);
}
errors++;
}
}
if(data391.text !== undefined){
if(typeof data391.text !== "string"){
const err839 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err839];
}
else {
vErrors.push(err839);
}
errors++;
}
}
}
else {
const err840 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err840];
}
else {
vErrors.push(err840);
}
errors++;
}
}
if(data105.type !== undefined){
let data394 = data105.type;
if(typeof data394 !== "string"){
const err841 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/8/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err841];
}
else {
vErrors.push(err841);
}
errors++;
}
if("TieStrengthCensus" !== data394){
const err842 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/8/properties/type/const",keyword:"const",params:{allowedValue: "TieStrengthCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err842];
}
else {
vErrors.push(err842);
}
errors++;
}
}
if(data105.subject !== undefined){
let data395 = data105.subject;
if(data395 && typeof data395 == "object" && !Array.isArray(data395)){
if(data395.entity === undefined){
const err843 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err843];
}
else {
vErrors.push(err843);
}
errors++;
}
if(data395.type === undefined){
const err844 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err844];
}
else {
vErrors.push(err844);
}
errors++;
}
for(const key93 in data395){
if(!((key93 === "entity") || (key93 === "type"))){
const err845 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key93},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err845];
}
else {
vErrors.push(err845);
}
errors++;
}
}
if(data395.entity !== undefined){
let data396 = data395.entity;
if(typeof data396 !== "string"){
const err846 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err846];
}
else {
vErrors.push(err846);
}
errors++;
}
if(!(((data396 === "edge") || (data396 === "node")) || (data396 === "ego"))){
const err847 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err847];
}
else {
vErrors.push(err847);
}
errors++;
}
}
if(data395.type !== undefined){
if(typeof data395.type !== "string"){
const err848 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err848];
}
else {
vErrors.push(err848);
}
errors++;
}
}
}
else {
const err849 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err849];
}
else {
vErrors.push(err849);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data398 = data105.prompts;
if(Array.isArray(data398)){
if(data398.length < 1){
const err850 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err850];
}
else {
vErrors.push(err850);
}
errors++;
}
const len28 = data398.length;
for(let i28=0; i28<len28; i28++){
let data399 = data398[i28];
if(data399 && typeof data399 == "object" && !Array.isArray(data399)){
if(data399.id === undefined){
const err851 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err851];
}
else {
vErrors.push(err851);
}
errors++;
}
if(data399.text === undefined){
const err852 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err852];
}
else {
vErrors.push(err852);
}
errors++;
}
if(data399.createEdge === undefined){
const err853 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "createEdge"},message:"must have required property '"+"createEdge"+"'"};
if(vErrors === null){
vErrors = [err853];
}
else {
vErrors.push(err853);
}
errors++;
}
if(data399.edgeVariable === undefined){
const err854 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "edgeVariable"},message:"must have required property '"+"edgeVariable"+"'"};
if(vErrors === null){
vErrors = [err854];
}
else {
vErrors.push(err854);
}
errors++;
}
if(data399.negativeLabel === undefined){
const err855 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "negativeLabel"},message:"must have required property '"+"negativeLabel"+"'"};
if(vErrors === null){
vErrors = [err855];
}
else {
vErrors.push(err855);
}
errors++;
}
for(const key94 in data399){
if(!(((((key94 === "id") || (key94 === "text")) || (key94 === "createEdge")) || (key94 === "edgeVariable")) || (key94 === "negativeLabel"))){
const err856 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key94},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err856];
}
else {
vErrors.push(err856);
}
errors++;
}
}
if(data399.id !== undefined){
if(typeof data399.id !== "string"){
const err857 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err857];
}
else {
vErrors.push(err857);
}
errors++;
}
}
if(data399.text !== undefined){
if(typeof data399.text !== "string"){
const err858 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err858];
}
else {
vErrors.push(err858);
}
errors++;
}
}
if(data399.createEdge !== undefined){
if(typeof data399.createEdge !== "string"){
const err859 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/createEdge",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/properties/createEdge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err859];
}
else {
vErrors.push(err859);
}
errors++;
}
}
if(data399.edgeVariable !== undefined){
if(typeof data399.edgeVariable !== "string"){
const err860 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/edgeVariable",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/properties/edgeVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err860];
}
else {
vErrors.push(err860);
}
errors++;
}
}
if(data399.negativeLabel !== undefined){
if(typeof data399.negativeLabel !== "string"){
const err861 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/negativeLabel",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/properties/negativeLabel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err861];
}
else {
vErrors.push(err861);
}
errors++;
}
}
}
else {
const err862 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err862];
}
else {
vErrors.push(err862);
}
errors++;
}
}
}
else {
const err863 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err863];
}
else {
vErrors.push(err863);
}
errors++;
}
}
}
else {
const err864 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err864];
}
else {
vErrors.push(err864);
}
errors++;
}
var _valid9 = _errs1127 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1217 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err865 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err865];
}
else {
vErrors.push(err865);
}
errors++;
}
if(data105.label === undefined){
const err866 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err866];
}
else {
vErrors.push(err866);
}
errors++;
}
if(data105.type === undefined){
const err867 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err867];
}
else {
vErrors.push(err867);
}
errors++;
}
if(data105.prompts === undefined){
const err868 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err868];
}
else {
vErrors.push(err868);
}
errors++;
}
for(const key95 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[9].properties, key95))){
const err869 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key95},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err869];
}
else {
vErrors.push(err869);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err870 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err870];
}
else {
vErrors.push(err870);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err871 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err871];
}
else {
vErrors.push(err871);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err872 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err872];
}
else {
vErrors.push(err872);
}
errors++;
}
}
if(data105.filter !== undefined){
let data408 = data105.filter;
const _errs1231 = errors;
let valid287 = false;
const _errs1232 = errors;
const _errs1233 = errors;
let valid288 = false;
const _errs1234 = errors;
const err873 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err873];
}
else {
vErrors.push(err873);
}
errors++;
var _valid44 = _errs1234 === errors;
valid288 = valid288 || _valid44;
if(!valid288){
const _errs1236 = errors;
if(data408 && typeof data408 == "object" && !Array.isArray(data408)){
for(const key96 in data408){
if(!((key96 === "join") || (key96 === "rules"))){
const err874 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key96},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err874];
}
else {
vErrors.push(err874);
}
errors++;
}
}
if(data408.join !== undefined){
let data409 = data408.join;
if(typeof data409 !== "string"){
const err875 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err875];
}
else {
vErrors.push(err875);
}
errors++;
}
if(!((data409 === "OR") || (data409 === "AND"))){
const err876 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err876];
}
else {
vErrors.push(err876);
}
errors++;
}
}
if(data408.rules !== undefined){
let data410 = data408.rules;
if(Array.isArray(data410)){
const len29 = data410.length;
for(let i29=0; i29<len29; i29++){
let data411 = data410[i29];
if(data411 && typeof data411 == "object" && !Array.isArray(data411)){
if(data411.type === undefined){
const err877 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err877];
}
else {
vErrors.push(err877);
}
errors++;
}
if(data411.id === undefined){
const err878 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err878];
}
else {
vErrors.push(err878);
}
errors++;
}
if(data411.options === undefined){
const err879 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err879];
}
else {
vErrors.push(err879);
}
errors++;
}
for(const key97 in data411){
if(!(((key97 === "type") || (key97 === "id")) || (key97 === "options"))){
const err880 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key97},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err880];
}
else {
vErrors.push(err880);
}
errors++;
}
}
if(data411.type !== undefined){
let data412 = data411.type;
if(typeof data412 !== "string"){
const err881 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err881];
}
else {
vErrors.push(err881);
}
errors++;
}
if(!(((data412 === "alter") || (data412 === "ego")) || (data412 === "edge"))){
const err882 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err882];
}
else {
vErrors.push(err882);
}
errors++;
}
}
if(data411.id !== undefined){
if(typeof data411.id !== "string"){
const err883 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err883];
}
else {
vErrors.push(err883);
}
errors++;
}
}
if(data411.options !== undefined){
let data414 = data411.options;
if(data414 && typeof data414 == "object" && !Array.isArray(data414)){
if(data414.operator === undefined){
const err884 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err884];
}
else {
vErrors.push(err884);
}
errors++;
}
if(data414.type !== undefined){
if(typeof data414.type !== "string"){
const err885 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err885];
}
else {
vErrors.push(err885);
}
errors++;
}
}
if(data414.attribute !== undefined){
if(typeof data414.attribute !== "string"){
const err886 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err886];
}
else {
vErrors.push(err886);
}
errors++;
}
}
if(data414.operator !== undefined){
let data417 = data414.operator;
if(typeof data417 !== "string"){
const err887 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err887];
}
else {
vErrors.push(err887);
}
errors++;
}
if(!((((((((((((((((data417 === "EXISTS") || (data417 === "NOT_EXISTS")) || (data417 === "EXACTLY")) || (data417 === "NOT")) || (data417 === "GREATER_THAN")) || (data417 === "GREATER_THAN_OR_EQUAL")) || (data417 === "LESS_THAN")) || (data417 === "LESS_THAN_OR_EQUAL")) || (data417 === "INCLUDES")) || (data417 === "EXCLUDES")) || (data417 === "OPTIONS_GREATER_THAN")) || (data417 === "OPTIONS_LESS_THAN")) || (data417 === "OPTIONS_EQUALS")) || (data417 === "OPTIONS_NOT_EQUALS")) || (data417 === "CONTAINS")) || (data417 === "DOES NOT CONTAIN"))){
const err888 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err888];
}
else {
vErrors.push(err888);
}
errors++;
}
}
if(data414.value !== undefined){
let data418 = data414.value;
const _errs1260 = errors;
let valid295 = false;
const _errs1261 = errors;
if(!(((typeof data418 == "number") && (!(data418 % 1) && !isNaN(data418))) && (isFinite(data418)))){
const err889 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err889];
}
else {
vErrors.push(err889);
}
errors++;
}
var _valid45 = _errs1261 === errors;
valid295 = valid295 || _valid45;
if(!valid295){
const _errs1263 = errors;
if(typeof data418 !== "string"){
const err890 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err890];
}
else {
vErrors.push(err890);
}
errors++;
}
var _valid45 = _errs1263 === errors;
valid295 = valid295 || _valid45;
if(!valid295){
const _errs1265 = errors;
if(typeof data418 !== "boolean"){
const err891 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err891];
}
else {
vErrors.push(err891);
}
errors++;
}
var _valid45 = _errs1265 === errors;
valid295 = valid295 || _valid45;
if(!valid295){
const _errs1267 = errors;
if(!(Array.isArray(data418))){
const err892 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err892];
}
else {
vErrors.push(err892);
}
errors++;
}
var _valid45 = _errs1267 === errors;
valid295 = valid295 || _valid45;
}
}
}
if(!valid295){
const err893 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err893];
}
else {
vErrors.push(err893);
}
errors++;
}
else {
errors = _errs1260;
if(vErrors !== null){
if(_errs1260){
vErrors.length = _errs1260;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err894 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err894];
}
else {
vErrors.push(err894);
}
errors++;
}
}
}
else {
const err895 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err895];
}
else {
vErrors.push(err895);
}
errors++;
}
}
}
else {
const err896 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err896];
}
else {
vErrors.push(err896);
}
errors++;
}
}
}
else {
const err897 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err897];
}
else {
vErrors.push(err897);
}
errors++;
}
var _valid44 = _errs1236 === errors;
valid288 = valid288 || _valid44;
}
if(!valid288){
const err898 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err898];
}
else {
vErrors.push(err898);
}
errors++;
}
else {
errors = _errs1233;
if(vErrors !== null){
if(_errs1233){
vErrors.length = _errs1233;
}
else {
vErrors = null;
}
}
}
var _valid43 = _errs1232 === errors;
valid287 = valid287 || _valid43;
if(!valid287){
const _errs1269 = errors;
if(data408 !== null){
const err899 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err899];
}
else {
vErrors.push(err899);
}
errors++;
}
var _valid43 = _errs1269 === errors;
valid287 = valid287 || _valid43;
}
if(!valid287){
const err900 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err900];
}
else {
vErrors.push(err900);
}
errors++;
}
else {
errors = _errs1231;
if(vErrors !== null){
if(_errs1231){
vErrors.length = _errs1231;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data420 = data105.introductionPanel;
if(data420 && typeof data420 == "object" && !Array.isArray(data420)){
if(data420.title === undefined){
const err901 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err901];
}
else {
vErrors.push(err901);
}
errors++;
}
if(data420.text === undefined){
const err902 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err902];
}
else {
vErrors.push(err902);
}
errors++;
}
for(const key98 in data420){
if(!((key98 === "title") || (key98 === "text"))){
const err903 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key98},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err903];
}
else {
vErrors.push(err903);
}
errors++;
}
}
if(data420.title !== undefined){
if(typeof data420.title !== "string"){
const err904 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err904];
}
else {
vErrors.push(err904);
}
errors++;
}
}
if(data420.text !== undefined){
if(typeof data420.text !== "string"){
const err905 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err905];
}
else {
vErrors.push(err905);
}
errors++;
}
}
}
else {
const err906 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err906];
}
else {
vErrors.push(err906);
}
errors++;
}
}
if(data105.type !== undefined){
let data423 = data105.type;
if(typeof data423 !== "string"){
const err907 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err907];
}
else {
vErrors.push(err907);
}
errors++;
}
if("OrdinalBin" !== data423){
const err908 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/type/const",keyword:"const",params:{allowedValue: "OrdinalBin"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err908];
}
else {
vErrors.push(err908);
}
errors++;
}
}
if(data105.subject !== undefined){
let data424 = data105.subject;
if(data424 && typeof data424 == "object" && !Array.isArray(data424)){
if(data424.entity === undefined){
const err909 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err909];
}
else {
vErrors.push(err909);
}
errors++;
}
if(data424.type === undefined){
const err910 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err910];
}
else {
vErrors.push(err910);
}
errors++;
}
for(const key99 in data424){
if(!((key99 === "entity") || (key99 === "type"))){
const err911 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key99},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err911];
}
else {
vErrors.push(err911);
}
errors++;
}
}
if(data424.entity !== undefined){
let data425 = data424.entity;
if(typeof data425 !== "string"){
const err912 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err912];
}
else {
vErrors.push(err912);
}
errors++;
}
if(!(((data425 === "edge") || (data425 === "node")) || (data425 === "ego"))){
const err913 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err913];
}
else {
vErrors.push(err913);
}
errors++;
}
}
if(data424.type !== undefined){
if(typeof data424.type !== "string"){
const err914 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err914];
}
else {
vErrors.push(err914);
}
errors++;
}
}
}
else {
const err915 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err915];
}
else {
vErrors.push(err915);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data427 = data105.prompts;
if(Array.isArray(data427)){
if(data427.length < 1){
const err916 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err916];
}
else {
vErrors.push(err916);
}
errors++;
}
const len30 = data427.length;
for(let i30=0; i30<len30; i30++){
let data428 = data427[i30];
if(data428 && typeof data428 == "object" && !Array.isArray(data428)){
if(data428.id === undefined){
const err917 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err917];
}
else {
vErrors.push(err917);
}
errors++;
}
if(data428.text === undefined){
const err918 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err918];
}
else {
vErrors.push(err918);
}
errors++;
}
if(data428.variable === undefined){
const err919 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err919];
}
else {
vErrors.push(err919);
}
errors++;
}
for(const key100 in data428){
if(!((((((key100 === "id") || (key100 === "text")) || (key100 === "variable")) || (key100 === "bucketSortOrder")) || (key100 === "binSortOrder")) || (key100 === "color"))){
const err920 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key100},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err920];
}
else {
vErrors.push(err920);
}
errors++;
}
}
if(data428.id !== undefined){
if(typeof data428.id !== "string"){
const err921 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err921];
}
else {
vErrors.push(err921);
}
errors++;
}
}
if(data428.text !== undefined){
if(typeof data428.text !== "string"){
const err922 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err922];
}
else {
vErrors.push(err922);
}
errors++;
}
}
if(data428.variable !== undefined){
if(typeof data428.variable !== "string"){
const err923 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/variable",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err923];
}
else {
vErrors.push(err923);
}
errors++;
}
}
if(data428.bucketSortOrder !== undefined){
let data432 = data428.bucketSortOrder;
if(Array.isArray(data432)){
const len31 = data432.length;
for(let i31=0; i31<len31; i31++){
let data433 = data432[i31];
if(data433 && typeof data433 == "object" && !Array.isArray(data433)){
if(data433.property === undefined){
const err924 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err924];
}
else {
vErrors.push(err924);
}
errors++;
}
for(const key101 in data433){
if(!((((key101 === "property") || (key101 === "direction")) || (key101 === "type")) || (key101 === "hierarchy"))){
const err925 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key101},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err925];
}
else {
vErrors.push(err925);
}
errors++;
}
}
if(data433.property !== undefined){
if(typeof data433.property !== "string"){
const err926 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/property",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err926];
}
else {
vErrors.push(err926);
}
errors++;
}
}
if(data433.direction !== undefined){
let data435 = data433.direction;
if(typeof data435 !== "string"){
const err927 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/direction",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err927];
}
else {
vErrors.push(err927);
}
errors++;
}
if(!((data435 === "desc") || (data435 === "asc"))){
const err928 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/direction",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[9].properties.prompts.items.properties.bucketSortOrder.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err928];
}
else {
vErrors.push(err928);
}
errors++;
}
}
if(data433.type !== undefined){
let data436 = data433.type;
if(typeof data436 !== "string"){
const err929 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err929];
}
else {
vErrors.push(err929);
}
errors++;
}
if(!(((((data436 === "string") || (data436 === "number")) || (data436 === "boolean")) || (data436 === "date")) || (data436 === "hierarchy"))){
const err930 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[9].properties.prompts.items.properties.bucketSortOrder.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err930];
}
else {
vErrors.push(err930);
}
errors++;
}
}
if(data433.hierarchy !== undefined){
let data437 = data433.hierarchy;
if(Array.isArray(data437)){
const len32 = data437.length;
for(let i32=0; i32<len32; i32++){
let data438 = data437[i32];
if(((typeof data438 !== "string") && (!((typeof data438 == "number") && (isFinite(data438))))) && (typeof data438 !== "boolean")){
const err931 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/hierarchy/" + i32,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema329.properties.stages.items.anyOf[9].properties.prompts.items.properties.bucketSortOrder.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err931];
}
else {
vErrors.push(err931);
}
errors++;
}
}
}
else {
const err932 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/hierarchy",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err932];
}
else {
vErrors.push(err932);
}
errors++;
}
}
}
else {
const err933 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err933];
}
else {
vErrors.push(err933);
}
errors++;
}
}
}
else {
const err934 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err934];
}
else {
vErrors.push(err934);
}
errors++;
}
}
if(data428.binSortOrder !== undefined){
let data439 = data428.binSortOrder;
if(Array.isArray(data439)){
const len33 = data439.length;
for(let i33=0; i33<len33; i33++){
let data440 = data439[i33];
if(data440 && typeof data440 == "object" && !Array.isArray(data440)){
if(data440.property === undefined){
const err935 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err935];
}
else {
vErrors.push(err935);
}
errors++;
}
for(const key102 in data440){
if(!((((key102 === "property") || (key102 === "direction")) || (key102 === "type")) || (key102 === "hierarchy"))){
const err936 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key102},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err936];
}
else {
vErrors.push(err936);
}
errors++;
}
}
if(data440.property !== undefined){
if(typeof data440.property !== "string"){
const err937 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err937];
}
else {
vErrors.push(err937);
}
errors++;
}
}
if(data440.direction !== undefined){
let data442 = data440.direction;
if(typeof data442 !== "string"){
const err938 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err938];
}
else {
vErrors.push(err938);
}
errors++;
}
if(!((data442 === "desc") || (data442 === "asc"))){
const err939 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err939];
}
else {
vErrors.push(err939);
}
errors++;
}
}
if(data440.type !== undefined){
let data443 = data440.type;
if(typeof data443 !== "string"){
const err940 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err940];
}
else {
vErrors.push(err940);
}
errors++;
}
if(!(((((data443 === "string") || (data443 === "number")) || (data443 === "boolean")) || (data443 === "date")) || (data443 === "hierarchy"))){
const err941 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err941];
}
else {
vErrors.push(err941);
}
errors++;
}
}
if(data440.hierarchy !== undefined){
let data444 = data440.hierarchy;
if(Array.isArray(data444)){
const len34 = data444.length;
for(let i34=0; i34<len34; i34++){
let data445 = data444[i34];
if(((typeof data445 !== "string") && (!((typeof data445 == "number") && (isFinite(data445))))) && (typeof data445 !== "boolean")){
const err942 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/hierarchy/" + i34,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err942];
}
else {
vErrors.push(err942);
}
errors++;
}
}
}
else {
const err943 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err943];
}
else {
vErrors.push(err943);
}
errors++;
}
}
}
else {
const err944 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err944];
}
else {
vErrors.push(err944);
}
errors++;
}
}
}
else {
const err945 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err945];
}
else {
vErrors.push(err945);
}
errors++;
}
}
if(data428.color !== undefined){
if(typeof data428.color !== "string"){
const err946 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/color",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err946];
}
else {
vErrors.push(err946);
}
errors++;
}
}
}
else {
const err947 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err947];
}
else {
vErrors.push(err947);
}
errors++;
}
}
}
else {
const err948 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err948];
}
else {
vErrors.push(err948);
}
errors++;
}
}
}
else {
const err949 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err949];
}
else {
vErrors.push(err949);
}
errors++;
}
var _valid9 = _errs1217 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1336 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err950 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err950];
}
else {
vErrors.push(err950);
}
errors++;
}
if(data105.label === undefined){
const err951 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err951];
}
else {
vErrors.push(err951);
}
errors++;
}
if(data105.type === undefined){
const err952 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err952];
}
else {
vErrors.push(err952);
}
errors++;
}
if(data105.prompts === undefined){
const err953 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err953];
}
else {
vErrors.push(err953);
}
errors++;
}
for(const key103 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[10].properties, key103))){
const err954 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key103},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err954];
}
else {
vErrors.push(err954);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err955 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err955];
}
else {
vErrors.push(err955);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err956 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err956];
}
else {
vErrors.push(err956);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err957 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err957];
}
else {
vErrors.push(err957);
}
errors++;
}
}
if(data105.filter !== undefined){
let data450 = data105.filter;
const _errs1350 = errors;
let valid321 = false;
const _errs1351 = errors;
const _errs1352 = errors;
let valid322 = false;
const _errs1353 = errors;
const err958 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err958];
}
else {
vErrors.push(err958);
}
errors++;
var _valid47 = _errs1353 === errors;
valid322 = valid322 || _valid47;
if(!valid322){
const _errs1355 = errors;
if(data450 && typeof data450 == "object" && !Array.isArray(data450)){
for(const key104 in data450){
if(!((key104 === "join") || (key104 === "rules"))){
const err959 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key104},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err959];
}
else {
vErrors.push(err959);
}
errors++;
}
}
if(data450.join !== undefined){
let data451 = data450.join;
if(typeof data451 !== "string"){
const err960 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err960];
}
else {
vErrors.push(err960);
}
errors++;
}
if(!((data451 === "OR") || (data451 === "AND"))){
const err961 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err961];
}
else {
vErrors.push(err961);
}
errors++;
}
}
if(data450.rules !== undefined){
let data452 = data450.rules;
if(Array.isArray(data452)){
const len35 = data452.length;
for(let i35=0; i35<len35; i35++){
let data453 = data452[i35];
if(data453 && typeof data453 == "object" && !Array.isArray(data453)){
if(data453.type === undefined){
const err962 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err962];
}
else {
vErrors.push(err962);
}
errors++;
}
if(data453.id === undefined){
const err963 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err963];
}
else {
vErrors.push(err963);
}
errors++;
}
if(data453.options === undefined){
const err964 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err964];
}
else {
vErrors.push(err964);
}
errors++;
}
for(const key105 in data453){
if(!(((key105 === "type") || (key105 === "id")) || (key105 === "options"))){
const err965 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key105},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err965];
}
else {
vErrors.push(err965);
}
errors++;
}
}
if(data453.type !== undefined){
let data454 = data453.type;
if(typeof data454 !== "string"){
const err966 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err966];
}
else {
vErrors.push(err966);
}
errors++;
}
if(!(((data454 === "alter") || (data454 === "ego")) || (data454 === "edge"))){
const err967 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err967];
}
else {
vErrors.push(err967);
}
errors++;
}
}
if(data453.id !== undefined){
if(typeof data453.id !== "string"){
const err968 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err968];
}
else {
vErrors.push(err968);
}
errors++;
}
}
if(data453.options !== undefined){
let data456 = data453.options;
if(data456 && typeof data456 == "object" && !Array.isArray(data456)){
if(data456.operator === undefined){
const err969 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err969];
}
else {
vErrors.push(err969);
}
errors++;
}
if(data456.type !== undefined){
if(typeof data456.type !== "string"){
const err970 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err970];
}
else {
vErrors.push(err970);
}
errors++;
}
}
if(data456.attribute !== undefined){
if(typeof data456.attribute !== "string"){
const err971 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err971];
}
else {
vErrors.push(err971);
}
errors++;
}
}
if(data456.operator !== undefined){
let data459 = data456.operator;
if(typeof data459 !== "string"){
const err972 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err972];
}
else {
vErrors.push(err972);
}
errors++;
}
if(!((((((((((((((((data459 === "EXISTS") || (data459 === "NOT_EXISTS")) || (data459 === "EXACTLY")) || (data459 === "NOT")) || (data459 === "GREATER_THAN")) || (data459 === "GREATER_THAN_OR_EQUAL")) || (data459 === "LESS_THAN")) || (data459 === "LESS_THAN_OR_EQUAL")) || (data459 === "INCLUDES")) || (data459 === "EXCLUDES")) || (data459 === "OPTIONS_GREATER_THAN")) || (data459 === "OPTIONS_LESS_THAN")) || (data459 === "OPTIONS_EQUALS")) || (data459 === "OPTIONS_NOT_EQUALS")) || (data459 === "CONTAINS")) || (data459 === "DOES NOT CONTAIN"))){
const err973 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err973];
}
else {
vErrors.push(err973);
}
errors++;
}
}
if(data456.value !== undefined){
let data460 = data456.value;
const _errs1379 = errors;
let valid329 = false;
const _errs1380 = errors;
if(!(((typeof data460 == "number") && (!(data460 % 1) && !isNaN(data460))) && (isFinite(data460)))){
const err974 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err974];
}
else {
vErrors.push(err974);
}
errors++;
}
var _valid48 = _errs1380 === errors;
valid329 = valid329 || _valid48;
if(!valid329){
const _errs1382 = errors;
if(typeof data460 !== "string"){
const err975 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err975];
}
else {
vErrors.push(err975);
}
errors++;
}
var _valid48 = _errs1382 === errors;
valid329 = valid329 || _valid48;
if(!valid329){
const _errs1384 = errors;
if(typeof data460 !== "boolean"){
const err976 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err976];
}
else {
vErrors.push(err976);
}
errors++;
}
var _valid48 = _errs1384 === errors;
valid329 = valid329 || _valid48;
if(!valid329){
const _errs1386 = errors;
if(!(Array.isArray(data460))){
const err977 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err977];
}
else {
vErrors.push(err977);
}
errors++;
}
var _valid48 = _errs1386 === errors;
valid329 = valid329 || _valid48;
}
}
}
if(!valid329){
const err978 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err978];
}
else {
vErrors.push(err978);
}
errors++;
}
else {
errors = _errs1379;
if(vErrors !== null){
if(_errs1379){
vErrors.length = _errs1379;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err979 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err979];
}
else {
vErrors.push(err979);
}
errors++;
}
}
}
else {
const err980 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err980];
}
else {
vErrors.push(err980);
}
errors++;
}
}
}
else {
const err981 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err981];
}
else {
vErrors.push(err981);
}
errors++;
}
}
}
else {
const err982 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err982];
}
else {
vErrors.push(err982);
}
errors++;
}
var _valid47 = _errs1355 === errors;
valid322 = valid322 || _valid47;
}
if(!valid322){
const err983 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err983];
}
else {
vErrors.push(err983);
}
errors++;
}
else {
errors = _errs1352;
if(vErrors !== null){
if(_errs1352){
vErrors.length = _errs1352;
}
else {
vErrors = null;
}
}
}
var _valid46 = _errs1351 === errors;
valid321 = valid321 || _valid46;
if(!valid321){
const _errs1388 = errors;
if(data450 !== null){
const err984 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err984];
}
else {
vErrors.push(err984);
}
errors++;
}
var _valid46 = _errs1388 === errors;
valid321 = valid321 || _valid46;
}
if(!valid321){
const err985 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err985];
}
else {
vErrors.push(err985);
}
errors++;
}
else {
errors = _errs1350;
if(vErrors !== null){
if(_errs1350){
vErrors.length = _errs1350;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data462 = data105.introductionPanel;
if(data462 && typeof data462 == "object" && !Array.isArray(data462)){
if(data462.title === undefined){
const err986 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err986];
}
else {
vErrors.push(err986);
}
errors++;
}
if(data462.text === undefined){
const err987 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err987];
}
else {
vErrors.push(err987);
}
errors++;
}
for(const key106 in data462){
if(!((key106 === "title") || (key106 === "text"))){
const err988 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key106},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err988];
}
else {
vErrors.push(err988);
}
errors++;
}
}
if(data462.title !== undefined){
if(typeof data462.title !== "string"){
const err989 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err989];
}
else {
vErrors.push(err989);
}
errors++;
}
}
if(data462.text !== undefined){
if(typeof data462.text !== "string"){
const err990 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err990];
}
else {
vErrors.push(err990);
}
errors++;
}
}
}
else {
const err991 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err991];
}
else {
vErrors.push(err991);
}
errors++;
}
}
if(data105.type !== undefined){
let data465 = data105.type;
if(typeof data465 !== "string"){
const err992 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/10/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err992];
}
else {
vErrors.push(err992);
}
errors++;
}
if("CategoricalBin" !== data465){
const err993 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/10/properties/type/const",keyword:"const",params:{allowedValue: "CategoricalBin"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err993];
}
else {
vErrors.push(err993);
}
errors++;
}
}
if(data105.subject !== undefined){
let data466 = data105.subject;
if(data466 && typeof data466 == "object" && !Array.isArray(data466)){
if(data466.entity === undefined){
const err994 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err994];
}
else {
vErrors.push(err994);
}
errors++;
}
if(data466.type === undefined){
const err995 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err995];
}
else {
vErrors.push(err995);
}
errors++;
}
for(const key107 in data466){
if(!((key107 === "entity") || (key107 === "type"))){
const err996 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key107},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err996];
}
else {
vErrors.push(err996);
}
errors++;
}
}
if(data466.entity !== undefined){
let data467 = data466.entity;
if(typeof data467 !== "string"){
const err997 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err997];
}
else {
vErrors.push(err997);
}
errors++;
}
if(!(((data467 === "edge") || (data467 === "node")) || (data467 === "ego"))){
const err998 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err998];
}
else {
vErrors.push(err998);
}
errors++;
}
}
if(data466.type !== undefined){
if(typeof data466.type !== "string"){
const err999 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err999];
}
else {
vErrors.push(err999);
}
errors++;
}
}
}
else {
const err1000 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1000];
}
else {
vErrors.push(err1000);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data469 = data105.prompts;
if(Array.isArray(data469)){
if(data469.length < 1){
const err1001 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1001];
}
else {
vErrors.push(err1001);
}
errors++;
}
const len36 = data469.length;
for(let i36=0; i36<len36; i36++){
let data470 = data469[i36];
if(data470 && typeof data470 == "object" && !Array.isArray(data470)){
if(data470.id === undefined){
const err1002 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1002];
}
else {
vErrors.push(err1002);
}
errors++;
}
if(data470.text === undefined){
const err1003 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1003];
}
else {
vErrors.push(err1003);
}
errors++;
}
if(data470.variable === undefined){
const err1004 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err1004];
}
else {
vErrors.push(err1004);
}
errors++;
}
for(const key108 in data470){
if(!((((((((key108 === "id") || (key108 === "text")) || (key108 === "variable")) || (key108 === "otherVariable")) || (key108 === "otherVariablePrompt")) || (key108 === "otherOptionLabel")) || (key108 === "bucketSortOrder")) || (key108 === "binSortOrder"))){
const err1005 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key108},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1005];
}
else {
vErrors.push(err1005);
}
errors++;
}
}
if(data470.id !== undefined){
if(typeof data470.id !== "string"){
const err1006 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1006];
}
else {
vErrors.push(err1006);
}
errors++;
}
}
if(data470.text !== undefined){
if(typeof data470.text !== "string"){
const err1007 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1007];
}
else {
vErrors.push(err1007);
}
errors++;
}
}
if(data470.variable !== undefined){
if(typeof data470.variable !== "string"){
const err1008 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/variable",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1008];
}
else {
vErrors.push(err1008);
}
errors++;
}
}
if(data470.otherVariable !== undefined){
if(typeof data470.otherVariable !== "string"){
const err1009 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/otherVariable",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/otherVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1009];
}
else {
vErrors.push(err1009);
}
errors++;
}
}
if(data470.otherVariablePrompt !== undefined){
if(typeof data470.otherVariablePrompt !== "string"){
const err1010 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/otherVariablePrompt",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/otherVariablePrompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1010];
}
else {
vErrors.push(err1010);
}
errors++;
}
}
if(data470.otherOptionLabel !== undefined){
if(typeof data470.otherOptionLabel !== "string"){
const err1011 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/otherOptionLabel",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/otherOptionLabel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1011];
}
else {
vErrors.push(err1011);
}
errors++;
}
}
if(data470.bucketSortOrder !== undefined){
let data477 = data470.bucketSortOrder;
if(Array.isArray(data477)){
const len37 = data477.length;
for(let i37=0; i37<len37; i37++){
let data478 = data477[i37];
if(data478 && typeof data478 == "object" && !Array.isArray(data478)){
if(data478.property === undefined){
const err1012 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err1012];
}
else {
vErrors.push(err1012);
}
errors++;
}
for(const key109 in data478){
if(!((((key109 === "property") || (key109 === "direction")) || (key109 === "type")) || (key109 === "hierarchy"))){
const err1013 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key109},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1013];
}
else {
vErrors.push(err1013);
}
errors++;
}
}
if(data478.property !== undefined){
if(typeof data478.property !== "string"){
const err1014 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1014];
}
else {
vErrors.push(err1014);
}
errors++;
}
}
if(data478.direction !== undefined){
let data480 = data478.direction;
if(typeof data480 !== "string"){
const err1015 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1015];
}
else {
vErrors.push(err1015);
}
errors++;
}
if(!((data480 === "desc") || (data480 === "asc"))){
const err1016 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1016];
}
else {
vErrors.push(err1016);
}
errors++;
}
}
if(data478.type !== undefined){
let data481 = data478.type;
if(typeof data481 !== "string"){
const err1017 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1017];
}
else {
vErrors.push(err1017);
}
errors++;
}
if(!(((((data481 === "string") || (data481 === "number")) || (data481 === "boolean")) || (data481 === "date")) || (data481 === "hierarchy"))){
const err1018 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1018];
}
else {
vErrors.push(err1018);
}
errors++;
}
}
if(data478.hierarchy !== undefined){
let data482 = data478.hierarchy;
if(Array.isArray(data482)){
const len38 = data482.length;
for(let i38=0; i38<len38; i38++){
let data483 = data482[i38];
if(((typeof data483 !== "string") && (!((typeof data483 == "number") && (isFinite(data483))))) && (typeof data483 !== "boolean")){
const err1019 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/hierarchy/" + i38,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err1019];
}
else {
vErrors.push(err1019);
}
errors++;
}
}
}
else {
const err1020 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1020];
}
else {
vErrors.push(err1020);
}
errors++;
}
}
}
else {
const err1021 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1021];
}
else {
vErrors.push(err1021);
}
errors++;
}
}
}
else {
const err1022 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1022];
}
else {
vErrors.push(err1022);
}
errors++;
}
}
if(data470.binSortOrder !== undefined){
let data484 = data470.binSortOrder;
if(Array.isArray(data484)){
const len39 = data484.length;
for(let i39=0; i39<len39; i39++){
let data485 = data484[i39];
if(data485 && typeof data485 == "object" && !Array.isArray(data485)){
if(data485.property === undefined){
const err1023 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err1023];
}
else {
vErrors.push(err1023);
}
errors++;
}
for(const key110 in data485){
if(!((((key110 === "property") || (key110 === "direction")) || (key110 === "type")) || (key110 === "hierarchy"))){
const err1024 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key110},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1024];
}
else {
vErrors.push(err1024);
}
errors++;
}
}
if(data485.property !== undefined){
if(typeof data485.property !== "string"){
const err1025 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1025];
}
else {
vErrors.push(err1025);
}
errors++;
}
}
if(data485.direction !== undefined){
let data487 = data485.direction;
if(typeof data487 !== "string"){
const err1026 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1026];
}
else {
vErrors.push(err1026);
}
errors++;
}
if(!((data487 === "desc") || (data487 === "asc"))){
const err1027 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1027];
}
else {
vErrors.push(err1027);
}
errors++;
}
}
if(data485.type !== undefined){
let data488 = data485.type;
if(typeof data488 !== "string"){
const err1028 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1028];
}
else {
vErrors.push(err1028);
}
errors++;
}
if(!(((((data488 === "string") || (data488 === "number")) || (data488 === "boolean")) || (data488 === "date")) || (data488 === "hierarchy"))){
const err1029 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1029];
}
else {
vErrors.push(err1029);
}
errors++;
}
}
if(data485.hierarchy !== undefined){
let data489 = data485.hierarchy;
if(Array.isArray(data489)){
const len40 = data489.length;
for(let i40=0; i40<len40; i40++){
let data490 = data489[i40];
if(((typeof data490 !== "string") && (!((typeof data490 == "number") && (isFinite(data490))))) && (typeof data490 !== "boolean")){
const err1030 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/hierarchy/" + i40,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err1030];
}
else {
vErrors.push(err1030);
}
errors++;
}
}
}
else {
const err1031 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1031];
}
else {
vErrors.push(err1031);
}
errors++;
}
}
}
else {
const err1032 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1032];
}
else {
vErrors.push(err1032);
}
errors++;
}
}
}
else {
const err1033 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1033];
}
else {
vErrors.push(err1033);
}
errors++;
}
}
}
else {
const err1034 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1034];
}
else {
vErrors.push(err1034);
}
errors++;
}
}
}
else {
const err1035 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1035];
}
else {
vErrors.push(err1035);
}
errors++;
}
}
}
else {
const err1036 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1036];
}
else {
vErrors.push(err1036);
}
errors++;
}
var _valid9 = _errs1336 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1460 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err1037 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1037];
}
else {
vErrors.push(err1037);
}
errors++;
}
if(data105.label === undefined){
const err1038 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1038];
}
else {
vErrors.push(err1038);
}
errors++;
}
if(data105.type === undefined){
const err1039 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1039];
}
else {
vErrors.push(err1039);
}
errors++;
}
if(data105.presets === undefined){
const err1040 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "presets"},message:"must have required property '"+"presets"+"'"};
if(vErrors === null){
vErrors = [err1040];
}
else {
vErrors.push(err1040);
}
errors++;
}
for(const key111 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[11].properties, key111))){
const err1041 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key111},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1041];
}
else {
vErrors.push(err1041);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err1042 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1042];
}
else {
vErrors.push(err1042);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err1043 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1043];
}
else {
vErrors.push(err1043);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err1044 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1044];
}
else {
vErrors.push(err1044);
}
errors++;
}
}
if(data105.filter !== undefined){
let data494 = data105.filter;
const _errs1474 = errors;
let valid356 = false;
const _errs1475 = errors;
const _errs1476 = errors;
let valid357 = false;
const _errs1477 = errors;
const err1045 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1045];
}
else {
vErrors.push(err1045);
}
errors++;
var _valid50 = _errs1477 === errors;
valid357 = valid357 || _valid50;
if(!valid357){
const _errs1479 = errors;
if(data494 && typeof data494 == "object" && !Array.isArray(data494)){
for(const key112 in data494){
if(!((key112 === "join") || (key112 === "rules"))){
const err1046 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key112},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1046];
}
else {
vErrors.push(err1046);
}
errors++;
}
}
if(data494.join !== undefined){
let data495 = data494.join;
if(typeof data495 !== "string"){
const err1047 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1047];
}
else {
vErrors.push(err1047);
}
errors++;
}
if(!((data495 === "OR") || (data495 === "AND"))){
const err1048 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1048];
}
else {
vErrors.push(err1048);
}
errors++;
}
}
if(data494.rules !== undefined){
let data496 = data494.rules;
if(Array.isArray(data496)){
const len41 = data496.length;
for(let i41=0; i41<len41; i41++){
let data497 = data496[i41];
if(data497 && typeof data497 == "object" && !Array.isArray(data497)){
if(data497.type === undefined){
const err1049 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1049];
}
else {
vErrors.push(err1049);
}
errors++;
}
if(data497.id === undefined){
const err1050 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1050];
}
else {
vErrors.push(err1050);
}
errors++;
}
if(data497.options === undefined){
const err1051 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1051];
}
else {
vErrors.push(err1051);
}
errors++;
}
for(const key113 in data497){
if(!(((key113 === "type") || (key113 === "id")) || (key113 === "options"))){
const err1052 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key113},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1052];
}
else {
vErrors.push(err1052);
}
errors++;
}
}
if(data497.type !== undefined){
let data498 = data497.type;
if(typeof data498 !== "string"){
const err1053 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1053];
}
else {
vErrors.push(err1053);
}
errors++;
}
if(!(((data498 === "alter") || (data498 === "ego")) || (data498 === "edge"))){
const err1054 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1054];
}
else {
vErrors.push(err1054);
}
errors++;
}
}
if(data497.id !== undefined){
if(typeof data497.id !== "string"){
const err1055 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1055];
}
else {
vErrors.push(err1055);
}
errors++;
}
}
if(data497.options !== undefined){
let data500 = data497.options;
if(data500 && typeof data500 == "object" && !Array.isArray(data500)){
if(data500.operator === undefined){
const err1056 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1056];
}
else {
vErrors.push(err1056);
}
errors++;
}
if(data500.type !== undefined){
if(typeof data500.type !== "string"){
const err1057 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1057];
}
else {
vErrors.push(err1057);
}
errors++;
}
}
if(data500.attribute !== undefined){
if(typeof data500.attribute !== "string"){
const err1058 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1058];
}
else {
vErrors.push(err1058);
}
errors++;
}
}
if(data500.operator !== undefined){
let data503 = data500.operator;
if(typeof data503 !== "string"){
const err1059 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1059];
}
else {
vErrors.push(err1059);
}
errors++;
}
if(!((((((((((((((((data503 === "EXISTS") || (data503 === "NOT_EXISTS")) || (data503 === "EXACTLY")) || (data503 === "NOT")) || (data503 === "GREATER_THAN")) || (data503 === "GREATER_THAN_OR_EQUAL")) || (data503 === "LESS_THAN")) || (data503 === "LESS_THAN_OR_EQUAL")) || (data503 === "INCLUDES")) || (data503 === "EXCLUDES")) || (data503 === "OPTIONS_GREATER_THAN")) || (data503 === "OPTIONS_LESS_THAN")) || (data503 === "OPTIONS_EQUALS")) || (data503 === "OPTIONS_NOT_EQUALS")) || (data503 === "CONTAINS")) || (data503 === "DOES NOT CONTAIN"))){
const err1060 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1060];
}
else {
vErrors.push(err1060);
}
errors++;
}
}
if(data500.value !== undefined){
let data504 = data500.value;
const _errs1503 = errors;
let valid364 = false;
const _errs1504 = errors;
if(!(((typeof data504 == "number") && (!(data504 % 1) && !isNaN(data504))) && (isFinite(data504)))){
const err1061 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1061];
}
else {
vErrors.push(err1061);
}
errors++;
}
var _valid51 = _errs1504 === errors;
valid364 = valid364 || _valid51;
if(!valid364){
const _errs1506 = errors;
if(typeof data504 !== "string"){
const err1062 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1062];
}
else {
vErrors.push(err1062);
}
errors++;
}
var _valid51 = _errs1506 === errors;
valid364 = valid364 || _valid51;
if(!valid364){
const _errs1508 = errors;
if(typeof data504 !== "boolean"){
const err1063 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1063];
}
else {
vErrors.push(err1063);
}
errors++;
}
var _valid51 = _errs1508 === errors;
valid364 = valid364 || _valid51;
if(!valid364){
const _errs1510 = errors;
if(!(Array.isArray(data504))){
const err1064 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1064];
}
else {
vErrors.push(err1064);
}
errors++;
}
var _valid51 = _errs1510 === errors;
valid364 = valid364 || _valid51;
}
}
}
if(!valid364){
const err1065 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1065];
}
else {
vErrors.push(err1065);
}
errors++;
}
else {
errors = _errs1503;
if(vErrors !== null){
if(_errs1503){
vErrors.length = _errs1503;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1066 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1066];
}
else {
vErrors.push(err1066);
}
errors++;
}
}
}
else {
const err1067 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1067];
}
else {
vErrors.push(err1067);
}
errors++;
}
}
}
else {
const err1068 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1068];
}
else {
vErrors.push(err1068);
}
errors++;
}
}
}
else {
const err1069 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1069];
}
else {
vErrors.push(err1069);
}
errors++;
}
var _valid50 = _errs1479 === errors;
valid357 = valid357 || _valid50;
}
if(!valid357){
const err1070 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1070];
}
else {
vErrors.push(err1070);
}
errors++;
}
else {
errors = _errs1476;
if(vErrors !== null){
if(_errs1476){
vErrors.length = _errs1476;
}
else {
vErrors = null;
}
}
}
var _valid49 = _errs1475 === errors;
valid356 = valid356 || _valid49;
if(!valid356){
const _errs1512 = errors;
if(data494 !== null){
const err1071 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1071];
}
else {
vErrors.push(err1071);
}
errors++;
}
var _valid49 = _errs1512 === errors;
valid356 = valid356 || _valid49;
}
if(!valid356){
const err1072 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1072];
}
else {
vErrors.push(err1072);
}
errors++;
}
else {
errors = _errs1474;
if(vErrors !== null){
if(_errs1474){
vErrors.length = _errs1474;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data506 = data105.introductionPanel;
if(data506 && typeof data506 == "object" && !Array.isArray(data506)){
if(data506.title === undefined){
const err1073 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1073];
}
else {
vErrors.push(err1073);
}
errors++;
}
if(data506.text === undefined){
const err1074 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1074];
}
else {
vErrors.push(err1074);
}
errors++;
}
for(const key114 in data506){
if(!((key114 === "title") || (key114 === "text"))){
const err1075 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key114},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1075];
}
else {
vErrors.push(err1075);
}
errors++;
}
}
if(data506.title !== undefined){
if(typeof data506.title !== "string"){
const err1076 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1076];
}
else {
vErrors.push(err1076);
}
errors++;
}
}
if(data506.text !== undefined){
if(typeof data506.text !== "string"){
const err1077 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1077];
}
else {
vErrors.push(err1077);
}
errors++;
}
}
}
else {
const err1078 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1078];
}
else {
vErrors.push(err1078);
}
errors++;
}
}
if(data105.type !== undefined){
let data509 = data105.type;
if(typeof data509 !== "string"){
const err1079 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/11/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1079];
}
else {
vErrors.push(err1079);
}
errors++;
}
if("Narrative" !== data509){
const err1080 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/11/properties/type/const",keyword:"const",params:{allowedValue: "Narrative"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1080];
}
else {
vErrors.push(err1080);
}
errors++;
}
}
if(data105.subject !== undefined){
let data510 = data105.subject;
if(data510 && typeof data510 == "object" && !Array.isArray(data510)){
if(data510.entity === undefined){
const err1081 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err1081];
}
else {
vErrors.push(err1081);
}
errors++;
}
if(data510.type === undefined){
const err1082 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1082];
}
else {
vErrors.push(err1082);
}
errors++;
}
for(const key115 in data510){
if(!((key115 === "entity") || (key115 === "type"))){
const err1083 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key115},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1083];
}
else {
vErrors.push(err1083);
}
errors++;
}
}
if(data510.entity !== undefined){
let data511 = data510.entity;
if(typeof data511 !== "string"){
const err1084 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1084];
}
else {
vErrors.push(err1084);
}
errors++;
}
if(!(((data511 === "edge") || (data511 === "node")) || (data511 === "ego"))){
const err1085 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1085];
}
else {
vErrors.push(err1085);
}
errors++;
}
}
if(data510.type !== undefined){
if(typeof data510.type !== "string"){
const err1086 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1086];
}
else {
vErrors.push(err1086);
}
errors++;
}
}
}
else {
const err1087 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1087];
}
else {
vErrors.push(err1087);
}
errors++;
}
}
if(data105.presets !== undefined){
let data513 = data105.presets;
if(Array.isArray(data513)){
if(data513.length < 1){
const err1088 = {instancePath:instancePath+"/stages/" + i3+"/presets",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1088];
}
else {
vErrors.push(err1088);
}
errors++;
}
const len42 = data513.length;
for(let i42=0; i42<len42; i42++){
let data514 = data513[i42];
if(data514 && typeof data514 == "object" && !Array.isArray(data514)){
if(data514.id === undefined){
const err1089 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1089];
}
else {
vErrors.push(err1089);
}
errors++;
}
if(data514.label === undefined){
const err1090 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1090];
}
else {
vErrors.push(err1090);
}
errors++;
}
if(data514.layoutVariable === undefined){
const err1091 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/required",keyword:"required",params:{missingProperty: "layoutVariable"},message:"must have required property '"+"layoutVariable"+"'"};
if(vErrors === null){
vErrors = [err1091];
}
else {
vErrors.push(err1091);
}
errors++;
}
for(const key116 in data514){
if(!((((((key116 === "id") || (key116 === "label")) || (key116 === "layoutVariable")) || (key116 === "groupVariable")) || (key116 === "edges")) || (key116 === "highlight"))){
const err1092 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key116},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1092];
}
else {
vErrors.push(err1092);
}
errors++;
}
}
if(data514.id !== undefined){
if(typeof data514.id !== "string"){
const err1093 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/id",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1093];
}
else {
vErrors.push(err1093);
}
errors++;
}
}
if(data514.label !== undefined){
if(typeof data514.label !== "string"){
const err1094 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/label",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1094];
}
else {
vErrors.push(err1094);
}
errors++;
}
}
if(data514.layoutVariable !== undefined){
if(typeof data514.layoutVariable !== "string"){
const err1095 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/layoutVariable",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/layoutVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1095];
}
else {
vErrors.push(err1095);
}
errors++;
}
}
if(data514.groupVariable !== undefined){
if(typeof data514.groupVariable !== "string"){
const err1096 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/groupVariable",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/groupVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1096];
}
else {
vErrors.push(err1096);
}
errors++;
}
}
if(data514.edges !== undefined){
let data519 = data514.edges;
if(data519 && typeof data519 == "object" && !Array.isArray(data519)){
for(const key117 in data519){
if(!(key117 === "display")){
const err1097 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key117},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1097];
}
else {
vErrors.push(err1097);
}
errors++;
}
}
if(data519.display !== undefined){
let data520 = data519.display;
if(Array.isArray(data520)){
const len43 = data520.length;
for(let i43=0; i43<len43; i43++){
if(typeof data520[i43] !== "string"){
const err1098 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges/display/" + i43,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/properties/display/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1098];
}
else {
vErrors.push(err1098);
}
errors++;
}
}
}
else {
const err1099 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges/display",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/properties/display/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1099];
}
else {
vErrors.push(err1099);
}
errors++;
}
}
}
else {
const err1100 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1100];
}
else {
vErrors.push(err1100);
}
errors++;
}
}
if(data514.highlight !== undefined){
let data522 = data514.highlight;
if(Array.isArray(data522)){
const len44 = data522.length;
for(let i44=0; i44<len44; i44++){
if(typeof data522[i44] !== "string"){
const err1101 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/highlight/" + i44,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/highlight/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1101];
}
else {
vErrors.push(err1101);
}
errors++;
}
}
}
else {
const err1102 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/highlight",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/highlight/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1102];
}
else {
vErrors.push(err1102);
}
errors++;
}
}
}
else {
const err1103 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1103];
}
else {
vErrors.push(err1103);
}
errors++;
}
}
}
else {
const err1104 = {instancePath:instancePath+"/stages/" + i3+"/presets",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1104];
}
else {
vErrors.push(err1104);
}
errors++;
}
}
if(data105.background !== undefined){
let data524 = data105.background;
if(data524 && typeof data524 == "object" && !Array.isArray(data524)){
for(const key118 in data524){
if(!((key118 === "concentricCircles") || (key118 === "skewedTowardCenter"))){
const err1105 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key118},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1105];
}
else {
vErrors.push(err1105);
}
errors++;
}
}
if(data524.concentricCircles !== undefined){
let data525 = data524.concentricCircles;
if(!(((typeof data525 == "number") && (!(data525 % 1) && !isNaN(data525))) && (isFinite(data525)))){
const err1106 = {instancePath:instancePath+"/stages/" + i3+"/background/concentricCircles",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/properties/concentricCircles/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1106];
}
else {
vErrors.push(err1106);
}
errors++;
}
}
if(data524.skewedTowardCenter !== undefined){
if(typeof data524.skewedTowardCenter !== "boolean"){
const err1107 = {instancePath:instancePath+"/stages/" + i3+"/background/skewedTowardCenter",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/properties/skewedTowardCenter/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1107];
}
else {
vErrors.push(err1107);
}
errors++;
}
}
}
else {
const err1108 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1108];
}
else {
vErrors.push(err1108);
}
errors++;
}
}
if(data105.behaviours !== undefined){
let data527 = data105.behaviours;
if(data527 && typeof data527 == "object" && !Array.isArray(data527)){
for(const key119 in data527){
if(!((key119 === "freeDraw") || (key119 === "allowRepositioning"))){
const err1109 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key119},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1109];
}
else {
vErrors.push(err1109);
}
errors++;
}
}
if(data527.freeDraw !== undefined){
if(typeof data527.freeDraw !== "boolean"){
const err1110 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/freeDraw",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/properties/freeDraw/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1110];
}
else {
vErrors.push(err1110);
}
errors++;
}
}
if(data527.allowRepositioning !== undefined){
if(typeof data527.allowRepositioning !== "boolean"){
const err1111 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/allowRepositioning",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/properties/allowRepositioning/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1111];
}
else {
vErrors.push(err1111);
}
errors++;
}
}
}
else {
const err1112 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1112];
}
else {
vErrors.push(err1112);
}
errors++;
}
}
}
else {
const err1113 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1113];
}
else {
vErrors.push(err1113);
}
errors++;
}
var _valid9 = _errs1460 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1571 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err1114 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1114];
}
else {
vErrors.push(err1114);
}
errors++;
}
if(data105.label === undefined){
const err1115 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1115];
}
else {
vErrors.push(err1115);
}
errors++;
}
if(data105.type === undefined){
const err1116 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1116];
}
else {
vErrors.push(err1116);
}
errors++;
}
if(data105.items === undefined){
const err1117 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "items"},message:"must have required property '"+"items"+"'"};
if(vErrors === null){
vErrors = [err1117];
}
else {
vErrors.push(err1117);
}
errors++;
}
for(const key120 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[12].properties, key120))){
const err1118 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key120},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1118];
}
else {
vErrors.push(err1118);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err1119 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1119];
}
else {
vErrors.push(err1119);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err1120 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1120];
}
else {
vErrors.push(err1120);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err1121 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1121];
}
else {
vErrors.push(err1121);
}
errors++;
}
}
if(data105.filter !== undefined){
let data533 = data105.filter;
const _errs1585 = errors;
let valid384 = false;
const _errs1586 = errors;
const _errs1587 = errors;
let valid385 = false;
const _errs1588 = errors;
const err1122 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1122];
}
else {
vErrors.push(err1122);
}
errors++;
var _valid53 = _errs1588 === errors;
valid385 = valid385 || _valid53;
if(!valid385){
const _errs1590 = errors;
if(data533 && typeof data533 == "object" && !Array.isArray(data533)){
for(const key121 in data533){
if(!((key121 === "join") || (key121 === "rules"))){
const err1123 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key121},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1123];
}
else {
vErrors.push(err1123);
}
errors++;
}
}
if(data533.join !== undefined){
let data534 = data533.join;
if(typeof data534 !== "string"){
const err1124 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1124];
}
else {
vErrors.push(err1124);
}
errors++;
}
if(!((data534 === "OR") || (data534 === "AND"))){
const err1125 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1125];
}
else {
vErrors.push(err1125);
}
errors++;
}
}
if(data533.rules !== undefined){
let data535 = data533.rules;
if(Array.isArray(data535)){
const len45 = data535.length;
for(let i45=0; i45<len45; i45++){
let data536 = data535[i45];
if(data536 && typeof data536 == "object" && !Array.isArray(data536)){
if(data536.type === undefined){
const err1126 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1126];
}
else {
vErrors.push(err1126);
}
errors++;
}
if(data536.id === undefined){
const err1127 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1127];
}
else {
vErrors.push(err1127);
}
errors++;
}
if(data536.options === undefined){
const err1128 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1128];
}
else {
vErrors.push(err1128);
}
errors++;
}
for(const key122 in data536){
if(!(((key122 === "type") || (key122 === "id")) || (key122 === "options"))){
const err1129 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key122},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1129];
}
else {
vErrors.push(err1129);
}
errors++;
}
}
if(data536.type !== undefined){
let data537 = data536.type;
if(typeof data537 !== "string"){
const err1130 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1130];
}
else {
vErrors.push(err1130);
}
errors++;
}
if(!(((data537 === "alter") || (data537 === "ego")) || (data537 === "edge"))){
const err1131 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1131];
}
else {
vErrors.push(err1131);
}
errors++;
}
}
if(data536.id !== undefined){
if(typeof data536.id !== "string"){
const err1132 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1132];
}
else {
vErrors.push(err1132);
}
errors++;
}
}
if(data536.options !== undefined){
let data539 = data536.options;
if(data539 && typeof data539 == "object" && !Array.isArray(data539)){
if(data539.operator === undefined){
const err1133 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1133];
}
else {
vErrors.push(err1133);
}
errors++;
}
if(data539.type !== undefined){
if(typeof data539.type !== "string"){
const err1134 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1134];
}
else {
vErrors.push(err1134);
}
errors++;
}
}
if(data539.attribute !== undefined){
if(typeof data539.attribute !== "string"){
const err1135 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1135];
}
else {
vErrors.push(err1135);
}
errors++;
}
}
if(data539.operator !== undefined){
let data542 = data539.operator;
if(typeof data542 !== "string"){
const err1136 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1136];
}
else {
vErrors.push(err1136);
}
errors++;
}
if(!((((((((((((((((data542 === "EXISTS") || (data542 === "NOT_EXISTS")) || (data542 === "EXACTLY")) || (data542 === "NOT")) || (data542 === "GREATER_THAN")) || (data542 === "GREATER_THAN_OR_EQUAL")) || (data542 === "LESS_THAN")) || (data542 === "LESS_THAN_OR_EQUAL")) || (data542 === "INCLUDES")) || (data542 === "EXCLUDES")) || (data542 === "OPTIONS_GREATER_THAN")) || (data542 === "OPTIONS_LESS_THAN")) || (data542 === "OPTIONS_EQUALS")) || (data542 === "OPTIONS_NOT_EQUALS")) || (data542 === "CONTAINS")) || (data542 === "DOES NOT CONTAIN"))){
const err1137 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1137];
}
else {
vErrors.push(err1137);
}
errors++;
}
}
if(data539.value !== undefined){
let data543 = data539.value;
const _errs1614 = errors;
let valid392 = false;
const _errs1615 = errors;
if(!(((typeof data543 == "number") && (!(data543 % 1) && !isNaN(data543))) && (isFinite(data543)))){
const err1138 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1138];
}
else {
vErrors.push(err1138);
}
errors++;
}
var _valid54 = _errs1615 === errors;
valid392 = valid392 || _valid54;
if(!valid392){
const _errs1617 = errors;
if(typeof data543 !== "string"){
const err1139 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1139];
}
else {
vErrors.push(err1139);
}
errors++;
}
var _valid54 = _errs1617 === errors;
valid392 = valid392 || _valid54;
if(!valid392){
const _errs1619 = errors;
if(typeof data543 !== "boolean"){
const err1140 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1140];
}
else {
vErrors.push(err1140);
}
errors++;
}
var _valid54 = _errs1619 === errors;
valid392 = valid392 || _valid54;
if(!valid392){
const _errs1621 = errors;
if(!(Array.isArray(data543))){
const err1141 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1141];
}
else {
vErrors.push(err1141);
}
errors++;
}
var _valid54 = _errs1621 === errors;
valid392 = valid392 || _valid54;
}
}
}
if(!valid392){
const err1142 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1142];
}
else {
vErrors.push(err1142);
}
errors++;
}
else {
errors = _errs1614;
if(vErrors !== null){
if(_errs1614){
vErrors.length = _errs1614;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1143 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1143];
}
else {
vErrors.push(err1143);
}
errors++;
}
}
}
else {
const err1144 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1144];
}
else {
vErrors.push(err1144);
}
errors++;
}
}
}
else {
const err1145 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1145];
}
else {
vErrors.push(err1145);
}
errors++;
}
}
}
else {
const err1146 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1146];
}
else {
vErrors.push(err1146);
}
errors++;
}
var _valid53 = _errs1590 === errors;
valid385 = valid385 || _valid53;
}
if(!valid385){
const err1147 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1147];
}
else {
vErrors.push(err1147);
}
errors++;
}
else {
errors = _errs1587;
if(vErrors !== null){
if(_errs1587){
vErrors.length = _errs1587;
}
else {
vErrors = null;
}
}
}
var _valid52 = _errs1586 === errors;
valid384 = valid384 || _valid52;
if(!valid384){
const _errs1623 = errors;
if(data533 !== null){
const err1148 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1148];
}
else {
vErrors.push(err1148);
}
errors++;
}
var _valid52 = _errs1623 === errors;
valid384 = valid384 || _valid52;
}
if(!valid384){
const err1149 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1149];
}
else {
vErrors.push(err1149);
}
errors++;
}
else {
errors = _errs1585;
if(vErrors !== null){
if(_errs1585){
vErrors.length = _errs1585;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data545 = data105.introductionPanel;
if(data545 && typeof data545 == "object" && !Array.isArray(data545)){
if(data545.title === undefined){
const err1150 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1150];
}
else {
vErrors.push(err1150);
}
errors++;
}
if(data545.text === undefined){
const err1151 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1151];
}
else {
vErrors.push(err1151);
}
errors++;
}
for(const key123 in data545){
if(!((key123 === "title") || (key123 === "text"))){
const err1152 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key123},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1152];
}
else {
vErrors.push(err1152);
}
errors++;
}
}
if(data545.title !== undefined){
if(typeof data545.title !== "string"){
const err1153 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1153];
}
else {
vErrors.push(err1153);
}
errors++;
}
}
if(data545.text !== undefined){
if(typeof data545.text !== "string"){
const err1154 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1154];
}
else {
vErrors.push(err1154);
}
errors++;
}
}
}
else {
const err1155 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1155];
}
else {
vErrors.push(err1155);
}
errors++;
}
}
if(data105.type !== undefined){
let data548 = data105.type;
if(typeof data548 !== "string"){
const err1156 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1156];
}
else {
vErrors.push(err1156);
}
errors++;
}
if("Information" !== data548){
const err1157 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/type/const",keyword:"const",params:{allowedValue: "Information"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1157];
}
else {
vErrors.push(err1157);
}
errors++;
}
}
if(data105.title !== undefined){
if(typeof data105.title !== "string"){
const err1158 = {instancePath:instancePath+"/stages/" + i3+"/title",schemaPath:"#/properties/stages/items/anyOf/12/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1158];
}
else {
vErrors.push(err1158);
}
errors++;
}
}
if(data105.items !== undefined){
let data550 = data105.items;
if(Array.isArray(data550)){
const len46 = data550.length;
for(let i46=0; i46<len46; i46++){
let data551 = data550[i46];
if(data551 && typeof data551 == "object" && !Array.isArray(data551)){
if(data551.id === undefined){
const err1159 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1159];
}
else {
vErrors.push(err1159);
}
errors++;
}
if(data551.type === undefined){
const err1160 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1160];
}
else {
vErrors.push(err1160);
}
errors++;
}
if(data551.content === undefined){
const err1161 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/required",keyword:"required",params:{missingProperty: "content"},message:"must have required property '"+"content"+"'"};
if(vErrors === null){
vErrors = [err1161];
}
else {
vErrors.push(err1161);
}
errors++;
}
for(const key124 in data551){
if(!((((((key124 === "id") || (key124 === "type")) || (key124 === "content")) || (key124 === "description")) || (key124 === "size")) || (key124 === "loop"))){
const err1162 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key124},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1162];
}
else {
vErrors.push(err1162);
}
errors++;
}
}
if(data551.id !== undefined){
if(typeof data551.id !== "string"){
const err1163 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/id",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1163];
}
else {
vErrors.push(err1163);
}
errors++;
}
}
if(data551.type !== undefined){
let data553 = data551.type;
if(typeof data553 !== "string"){
const err1164 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1164];
}
else {
vErrors.push(err1164);
}
errors++;
}
if(!((data553 === "text") || (data553 === "asset"))){
const err1165 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[12].properties.items.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1165];
}
else {
vErrors.push(err1165);
}
errors++;
}
}
if(data551.content !== undefined){
if(typeof data551.content !== "string"){
const err1166 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/content",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1166];
}
else {
vErrors.push(err1166);
}
errors++;
}
}
if(data551.description !== undefined){
if(typeof data551.description !== "string"){
const err1167 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/description",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1167];
}
else {
vErrors.push(err1167);
}
errors++;
}
}
if(data551.size !== undefined){
if(typeof data551.size !== "string"){
const err1168 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/size",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/size/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1168];
}
else {
vErrors.push(err1168);
}
errors++;
}
}
if(data551.loop !== undefined){
if(typeof data551.loop !== "boolean"){
const err1169 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/loop",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/loop/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1169];
}
else {
vErrors.push(err1169);
}
errors++;
}
}
}
else {
const err1170 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1170];
}
else {
vErrors.push(err1170);
}
errors++;
}
}
}
else {
const err1171 = {instancePath:instancePath+"/stages/" + i3+"/items",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1171];
}
else {
vErrors.push(err1171);
}
errors++;
}
}
}
else {
const err1172 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1172];
}
else {
vErrors.push(err1172);
}
errors++;
}
var _valid9 = _errs1571 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1655 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err1173 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1173];
}
else {
vErrors.push(err1173);
}
errors++;
}
if(data105.label === undefined){
const err1174 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1174];
}
else {
vErrors.push(err1174);
}
errors++;
}
if(data105.type === undefined){
const err1175 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1175];
}
else {
vErrors.push(err1175);
}
errors++;
}
if(data105.items === undefined){
const err1176 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "items"},message:"must have required property '"+"items"+"'"};
if(vErrors === null){
vErrors = [err1176];
}
else {
vErrors.push(err1176);
}
errors++;
}
for(const key125 in data105){
if(!((((((((key125 === "id") || (key125 === "interviewScript")) || (key125 === "label")) || (key125 === "filter")) || (key125 === "skipLogic")) || (key125 === "introductionPanel")) || (key125 === "type")) || (key125 === "items"))){
const err1177 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key125},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1177];
}
else {
vErrors.push(err1177);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err1178 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1178];
}
else {
vErrors.push(err1178);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err1179 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1179];
}
else {
vErrors.push(err1179);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err1180 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1180];
}
else {
vErrors.push(err1180);
}
errors++;
}
}
if(data105.filter !== undefined){
let data561 = data105.filter;
const _errs1669 = errors;
let valid403 = false;
const _errs1670 = errors;
const _errs1671 = errors;
let valid404 = false;
const _errs1672 = errors;
const err1181 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1181];
}
else {
vErrors.push(err1181);
}
errors++;
var _valid56 = _errs1672 === errors;
valid404 = valid404 || _valid56;
if(!valid404){
const _errs1674 = errors;
if(data561 && typeof data561 == "object" && !Array.isArray(data561)){
for(const key126 in data561){
if(!((key126 === "join") || (key126 === "rules"))){
const err1182 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key126},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1182];
}
else {
vErrors.push(err1182);
}
errors++;
}
}
if(data561.join !== undefined){
let data562 = data561.join;
if(typeof data562 !== "string"){
const err1183 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1183];
}
else {
vErrors.push(err1183);
}
errors++;
}
if(!((data562 === "OR") || (data562 === "AND"))){
const err1184 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1184];
}
else {
vErrors.push(err1184);
}
errors++;
}
}
if(data561.rules !== undefined){
let data563 = data561.rules;
if(Array.isArray(data563)){
const len47 = data563.length;
for(let i47=0; i47<len47; i47++){
let data564 = data563[i47];
if(data564 && typeof data564 == "object" && !Array.isArray(data564)){
if(data564.type === undefined){
const err1185 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1185];
}
else {
vErrors.push(err1185);
}
errors++;
}
if(data564.id === undefined){
const err1186 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1186];
}
else {
vErrors.push(err1186);
}
errors++;
}
if(data564.options === undefined){
const err1187 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1187];
}
else {
vErrors.push(err1187);
}
errors++;
}
for(const key127 in data564){
if(!(((key127 === "type") || (key127 === "id")) || (key127 === "options"))){
const err1188 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key127},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1188];
}
else {
vErrors.push(err1188);
}
errors++;
}
}
if(data564.type !== undefined){
let data565 = data564.type;
if(typeof data565 !== "string"){
const err1189 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1189];
}
else {
vErrors.push(err1189);
}
errors++;
}
if(!(((data565 === "alter") || (data565 === "ego")) || (data565 === "edge"))){
const err1190 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1190];
}
else {
vErrors.push(err1190);
}
errors++;
}
}
if(data564.id !== undefined){
if(typeof data564.id !== "string"){
const err1191 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1191];
}
else {
vErrors.push(err1191);
}
errors++;
}
}
if(data564.options !== undefined){
let data567 = data564.options;
if(data567 && typeof data567 == "object" && !Array.isArray(data567)){
if(data567.operator === undefined){
const err1192 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1192];
}
else {
vErrors.push(err1192);
}
errors++;
}
if(data567.type !== undefined){
if(typeof data567.type !== "string"){
const err1193 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1193];
}
else {
vErrors.push(err1193);
}
errors++;
}
}
if(data567.attribute !== undefined){
if(typeof data567.attribute !== "string"){
const err1194 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1194];
}
else {
vErrors.push(err1194);
}
errors++;
}
}
if(data567.operator !== undefined){
let data570 = data567.operator;
if(typeof data570 !== "string"){
const err1195 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1195];
}
else {
vErrors.push(err1195);
}
errors++;
}
if(!((((((((((((((((data570 === "EXISTS") || (data570 === "NOT_EXISTS")) || (data570 === "EXACTLY")) || (data570 === "NOT")) || (data570 === "GREATER_THAN")) || (data570 === "GREATER_THAN_OR_EQUAL")) || (data570 === "LESS_THAN")) || (data570 === "LESS_THAN_OR_EQUAL")) || (data570 === "INCLUDES")) || (data570 === "EXCLUDES")) || (data570 === "OPTIONS_GREATER_THAN")) || (data570 === "OPTIONS_LESS_THAN")) || (data570 === "OPTIONS_EQUALS")) || (data570 === "OPTIONS_NOT_EQUALS")) || (data570 === "CONTAINS")) || (data570 === "DOES NOT CONTAIN"))){
const err1196 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1196];
}
else {
vErrors.push(err1196);
}
errors++;
}
}
if(data567.value !== undefined){
let data571 = data567.value;
const _errs1698 = errors;
let valid411 = false;
const _errs1699 = errors;
if(!(((typeof data571 == "number") && (!(data571 % 1) && !isNaN(data571))) && (isFinite(data571)))){
const err1197 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1197];
}
else {
vErrors.push(err1197);
}
errors++;
}
var _valid57 = _errs1699 === errors;
valid411 = valid411 || _valid57;
if(!valid411){
const _errs1701 = errors;
if(typeof data571 !== "string"){
const err1198 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1198];
}
else {
vErrors.push(err1198);
}
errors++;
}
var _valid57 = _errs1701 === errors;
valid411 = valid411 || _valid57;
if(!valid411){
const _errs1703 = errors;
if(typeof data571 !== "boolean"){
const err1199 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1199];
}
else {
vErrors.push(err1199);
}
errors++;
}
var _valid57 = _errs1703 === errors;
valid411 = valid411 || _valid57;
if(!valid411){
const _errs1705 = errors;
if(!(Array.isArray(data571))){
const err1200 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1200];
}
else {
vErrors.push(err1200);
}
errors++;
}
var _valid57 = _errs1705 === errors;
valid411 = valid411 || _valid57;
}
}
}
if(!valid411){
const err1201 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1201];
}
else {
vErrors.push(err1201);
}
errors++;
}
else {
errors = _errs1698;
if(vErrors !== null){
if(_errs1698){
vErrors.length = _errs1698;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1202 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1202];
}
else {
vErrors.push(err1202);
}
errors++;
}
}
}
else {
const err1203 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1203];
}
else {
vErrors.push(err1203);
}
errors++;
}
}
}
else {
const err1204 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1204];
}
else {
vErrors.push(err1204);
}
errors++;
}
}
}
else {
const err1205 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1205];
}
else {
vErrors.push(err1205);
}
errors++;
}
var _valid56 = _errs1674 === errors;
valid404 = valid404 || _valid56;
}
if(!valid404){
const err1206 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1206];
}
else {
vErrors.push(err1206);
}
errors++;
}
else {
errors = _errs1671;
if(vErrors !== null){
if(_errs1671){
vErrors.length = _errs1671;
}
else {
vErrors = null;
}
}
}
var _valid55 = _errs1670 === errors;
valid403 = valid403 || _valid55;
if(!valid403){
const _errs1707 = errors;
if(data561 !== null){
const err1207 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1207];
}
else {
vErrors.push(err1207);
}
errors++;
}
var _valid55 = _errs1707 === errors;
valid403 = valid403 || _valid55;
}
if(!valid403){
const err1208 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1208];
}
else {
vErrors.push(err1208);
}
errors++;
}
else {
errors = _errs1669;
if(vErrors !== null){
if(_errs1669){
vErrors.length = _errs1669;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data573 = data105.introductionPanel;
if(data573 && typeof data573 == "object" && !Array.isArray(data573)){
if(data573.title === undefined){
const err1209 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1209];
}
else {
vErrors.push(err1209);
}
errors++;
}
if(data573.text === undefined){
const err1210 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1210];
}
else {
vErrors.push(err1210);
}
errors++;
}
for(const key128 in data573){
if(!((key128 === "title") || (key128 === "text"))){
const err1211 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key128},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1211];
}
else {
vErrors.push(err1211);
}
errors++;
}
}
if(data573.title !== undefined){
if(typeof data573.title !== "string"){
const err1212 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1212];
}
else {
vErrors.push(err1212);
}
errors++;
}
}
if(data573.text !== undefined){
if(typeof data573.text !== "string"){
const err1213 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1213];
}
else {
vErrors.push(err1213);
}
errors++;
}
}
}
else {
const err1214 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1214];
}
else {
vErrors.push(err1214);
}
errors++;
}
}
if(data105.type !== undefined){
let data576 = data105.type;
if(typeof data576 !== "string"){
const err1215 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/13/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1215];
}
else {
vErrors.push(err1215);
}
errors++;
}
if("Anonymisation" !== data576){
const err1216 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/13/properties/type/const",keyword:"const",params:{allowedValue: "Anonymisation"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1216];
}
else {
vErrors.push(err1216);
}
errors++;
}
}
if(data105.items !== undefined){
let data577 = data105.items;
if(Array.isArray(data577)){
const len48 = data577.length;
for(let i48=0; i48<len48; i48++){
let data578 = data577[i48];
if(data578 && typeof data578 == "object" && !Array.isArray(data578)){
if(data578.id === undefined){
const err1217 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48,schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1217];
}
else {
vErrors.push(err1217);
}
errors++;
}
if(data578.type === undefined){
const err1218 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48,schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1218];
}
else {
vErrors.push(err1218);
}
errors++;
}
if(data578.content === undefined){
const err1219 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48,schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/required",keyword:"required",params:{missingProperty: "content"},message:"must have required property '"+"content"+"'"};
if(vErrors === null){
vErrors = [err1219];
}
else {
vErrors.push(err1219);
}
errors++;
}
for(const key129 in data578){
if(!((((key129 === "id") || (key129 === "type")) || (key129 === "content")) || (key129 === "size"))){
const err1220 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48,schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key129},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1220];
}
else {
vErrors.push(err1220);
}
errors++;
}
}
if(data578.id !== undefined){
if(typeof data578.id !== "string"){
const err1221 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48+"/id",schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1221];
}
else {
vErrors.push(err1221);
}
errors++;
}
}
if(data578.type !== undefined){
let data580 = data578.type;
if(typeof data580 !== "string"){
const err1222 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48+"/type",schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1222];
}
else {
vErrors.push(err1222);
}
errors++;
}
if(!((data580 === "text") || (data580 === "asset"))){
const err1223 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48+"/type",schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[13].properties.items.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1223];
}
else {
vErrors.push(err1223);
}
errors++;
}
}
if(data578.content !== undefined){
if(typeof data578.content !== "string"){
const err1224 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48+"/content",schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1224];
}
else {
vErrors.push(err1224);
}
errors++;
}
}
if(data578.size !== undefined){
if(typeof data578.size !== "string"){
const err1225 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48+"/size",schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/properties/size/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1225];
}
else {
vErrors.push(err1225);
}
errors++;
}
}
}
else {
const err1226 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i48,schemaPath:"#/properties/stages/items/anyOf/13/properties/items/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1226];
}
else {
vErrors.push(err1226);
}
errors++;
}
}
}
else {
const err1227 = {instancePath:instancePath+"/stages/" + i3+"/items",schemaPath:"#/properties/stages/items/anyOf/13/properties/items/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1227];
}
else {
vErrors.push(err1227);
}
errors++;
}
}
}
else {
const err1228 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1228];
}
else {
vErrors.push(err1228);
}
errors++;
}
var _valid9 = _errs1655 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1733 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err1229 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1229];
}
else {
vErrors.push(err1229);
}
errors++;
}
if(data105.label === undefined){
const err1230 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1230];
}
else {
vErrors.push(err1230);
}
errors++;
}
if(data105.type === undefined){
const err1231 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1231];
}
else {
vErrors.push(err1231);
}
errors++;
}
if(data105.prompts === undefined){
const err1232 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err1232];
}
else {
vErrors.push(err1232);
}
errors++;
}
for(const key130 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[14].properties, key130))){
const err1233 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key130},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1233];
}
else {
vErrors.push(err1233);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err1234 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1234];
}
else {
vErrors.push(err1234);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err1235 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1235];
}
else {
vErrors.push(err1235);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err1236 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1236];
}
else {
vErrors.push(err1236);
}
errors++;
}
}
if(data105.filter !== undefined){
let data586 = data105.filter;
const _errs1747 = errors;
let valid422 = false;
const _errs1748 = errors;
const _errs1749 = errors;
let valid423 = false;
const _errs1750 = errors;
const err1237 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1237];
}
else {
vErrors.push(err1237);
}
errors++;
var _valid59 = _errs1750 === errors;
valid423 = valid423 || _valid59;
if(!valid423){
const _errs1752 = errors;
if(data586 && typeof data586 == "object" && !Array.isArray(data586)){
for(const key131 in data586){
if(!((key131 === "join") || (key131 === "rules"))){
const err1238 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key131},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1238];
}
else {
vErrors.push(err1238);
}
errors++;
}
}
if(data586.join !== undefined){
let data587 = data586.join;
if(typeof data587 !== "string"){
const err1239 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1239];
}
else {
vErrors.push(err1239);
}
errors++;
}
if(!((data587 === "OR") || (data587 === "AND"))){
const err1240 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1240];
}
else {
vErrors.push(err1240);
}
errors++;
}
}
if(data586.rules !== undefined){
let data588 = data586.rules;
if(Array.isArray(data588)){
const len49 = data588.length;
for(let i49=0; i49<len49; i49++){
let data589 = data588[i49];
if(data589 && typeof data589 == "object" && !Array.isArray(data589)){
if(data589.type === undefined){
const err1241 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1241];
}
else {
vErrors.push(err1241);
}
errors++;
}
if(data589.id === undefined){
const err1242 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1242];
}
else {
vErrors.push(err1242);
}
errors++;
}
if(data589.options === undefined){
const err1243 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1243];
}
else {
vErrors.push(err1243);
}
errors++;
}
for(const key132 in data589){
if(!(((key132 === "type") || (key132 === "id")) || (key132 === "options"))){
const err1244 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key132},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1244];
}
else {
vErrors.push(err1244);
}
errors++;
}
}
if(data589.type !== undefined){
let data590 = data589.type;
if(typeof data590 !== "string"){
const err1245 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1245];
}
else {
vErrors.push(err1245);
}
errors++;
}
if(!(((data590 === "alter") || (data590 === "ego")) || (data590 === "edge"))){
const err1246 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1246];
}
else {
vErrors.push(err1246);
}
errors++;
}
}
if(data589.id !== undefined){
if(typeof data589.id !== "string"){
const err1247 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1247];
}
else {
vErrors.push(err1247);
}
errors++;
}
}
if(data589.options !== undefined){
let data592 = data589.options;
if(data592 && typeof data592 == "object" && !Array.isArray(data592)){
if(data592.operator === undefined){
const err1248 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1248];
}
else {
vErrors.push(err1248);
}
errors++;
}
if(data592.type !== undefined){
if(typeof data592.type !== "string"){
const err1249 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1249];
}
else {
vErrors.push(err1249);
}
errors++;
}
}
if(data592.attribute !== undefined){
if(typeof data592.attribute !== "string"){
const err1250 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1250];
}
else {
vErrors.push(err1250);
}
errors++;
}
}
if(data592.operator !== undefined){
let data595 = data592.operator;
if(typeof data595 !== "string"){
const err1251 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1251];
}
else {
vErrors.push(err1251);
}
errors++;
}
if(!((((((((((((((((data595 === "EXISTS") || (data595 === "NOT_EXISTS")) || (data595 === "EXACTLY")) || (data595 === "NOT")) || (data595 === "GREATER_THAN")) || (data595 === "GREATER_THAN_OR_EQUAL")) || (data595 === "LESS_THAN")) || (data595 === "LESS_THAN_OR_EQUAL")) || (data595 === "INCLUDES")) || (data595 === "EXCLUDES")) || (data595 === "OPTIONS_GREATER_THAN")) || (data595 === "OPTIONS_LESS_THAN")) || (data595 === "OPTIONS_EQUALS")) || (data595 === "OPTIONS_NOT_EQUALS")) || (data595 === "CONTAINS")) || (data595 === "DOES NOT CONTAIN"))){
const err1252 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1252];
}
else {
vErrors.push(err1252);
}
errors++;
}
}
if(data592.value !== undefined){
let data596 = data592.value;
const _errs1776 = errors;
let valid430 = false;
const _errs1777 = errors;
if(!(((typeof data596 == "number") && (!(data596 % 1) && !isNaN(data596))) && (isFinite(data596)))){
const err1253 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1253];
}
else {
vErrors.push(err1253);
}
errors++;
}
var _valid60 = _errs1777 === errors;
valid430 = valid430 || _valid60;
if(!valid430){
const _errs1779 = errors;
if(typeof data596 !== "string"){
const err1254 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1254];
}
else {
vErrors.push(err1254);
}
errors++;
}
var _valid60 = _errs1779 === errors;
valid430 = valid430 || _valid60;
if(!valid430){
const _errs1781 = errors;
if(typeof data596 !== "boolean"){
const err1255 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1255];
}
else {
vErrors.push(err1255);
}
errors++;
}
var _valid60 = _errs1781 === errors;
valid430 = valid430 || _valid60;
if(!valid430){
const _errs1783 = errors;
if(!(Array.isArray(data596))){
const err1256 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1256];
}
else {
vErrors.push(err1256);
}
errors++;
}
var _valid60 = _errs1783 === errors;
valid430 = valid430 || _valid60;
}
}
}
if(!valid430){
const err1257 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1257];
}
else {
vErrors.push(err1257);
}
errors++;
}
else {
errors = _errs1776;
if(vErrors !== null){
if(_errs1776){
vErrors.length = _errs1776;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1258 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1258];
}
else {
vErrors.push(err1258);
}
errors++;
}
}
}
else {
const err1259 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i49,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1259];
}
else {
vErrors.push(err1259);
}
errors++;
}
}
}
else {
const err1260 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1260];
}
else {
vErrors.push(err1260);
}
errors++;
}
}
}
else {
const err1261 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1261];
}
else {
vErrors.push(err1261);
}
errors++;
}
var _valid59 = _errs1752 === errors;
valid423 = valid423 || _valid59;
}
if(!valid423){
const err1262 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1262];
}
else {
vErrors.push(err1262);
}
errors++;
}
else {
errors = _errs1749;
if(vErrors !== null){
if(_errs1749){
vErrors.length = _errs1749;
}
else {
vErrors = null;
}
}
}
var _valid58 = _errs1748 === errors;
valid422 = valid422 || _valid58;
if(!valid422){
const _errs1785 = errors;
if(data586 !== null){
const err1263 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1263];
}
else {
vErrors.push(err1263);
}
errors++;
}
var _valid58 = _errs1785 === errors;
valid422 = valid422 || _valid58;
}
if(!valid422){
const err1264 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1264];
}
else {
vErrors.push(err1264);
}
errors++;
}
else {
errors = _errs1747;
if(vErrors !== null){
if(_errs1747){
vErrors.length = _errs1747;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data598 = data105.introductionPanel;
if(data598 && typeof data598 == "object" && !Array.isArray(data598)){
if(data598.title === undefined){
const err1265 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1265];
}
else {
vErrors.push(err1265);
}
errors++;
}
if(data598.text === undefined){
const err1266 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1266];
}
else {
vErrors.push(err1266);
}
errors++;
}
for(const key133 in data598){
if(!((key133 === "title") || (key133 === "text"))){
const err1267 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key133},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1267];
}
else {
vErrors.push(err1267);
}
errors++;
}
}
if(data598.title !== undefined){
if(typeof data598.title !== "string"){
const err1268 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1268];
}
else {
vErrors.push(err1268);
}
errors++;
}
}
if(data598.text !== undefined){
if(typeof data598.text !== "string"){
const err1269 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1269];
}
else {
vErrors.push(err1269);
}
errors++;
}
}
}
else {
const err1270 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1270];
}
else {
vErrors.push(err1270);
}
errors++;
}
}
if(data105.type !== undefined){
let data601 = data105.type;
if(typeof data601 !== "string"){
const err1271 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/14/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1271];
}
else {
vErrors.push(err1271);
}
errors++;
}
if("OneToManyDyadCensus" !== data601){
const err1272 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/14/properties/type/const",keyword:"const",params:{allowedValue: "OneToManyDyadCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1272];
}
else {
vErrors.push(err1272);
}
errors++;
}
}
if(data105.subject !== undefined){
let data602 = data105.subject;
if(data602 && typeof data602 == "object" && !Array.isArray(data602)){
if(data602.entity === undefined){
const err1273 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err1273];
}
else {
vErrors.push(err1273);
}
errors++;
}
if(data602.type === undefined){
const err1274 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1274];
}
else {
vErrors.push(err1274);
}
errors++;
}
for(const key134 in data602){
if(!((key134 === "entity") || (key134 === "type"))){
const err1275 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key134},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1275];
}
else {
vErrors.push(err1275);
}
errors++;
}
}
if(data602.entity !== undefined){
let data603 = data602.entity;
if(typeof data603 !== "string"){
const err1276 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1276];
}
else {
vErrors.push(err1276);
}
errors++;
}
if(!(((data603 === "edge") || (data603 === "node")) || (data603 === "ego"))){
const err1277 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1277];
}
else {
vErrors.push(err1277);
}
errors++;
}
}
if(data602.type !== undefined){
if(typeof data602.type !== "string"){
const err1278 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1278];
}
else {
vErrors.push(err1278);
}
errors++;
}
}
}
else {
const err1279 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1279];
}
else {
vErrors.push(err1279);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data605 = data105.prompts;
if(Array.isArray(data605)){
if(data605.length < 1){
const err1280 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1280];
}
else {
vErrors.push(err1280);
}
errors++;
}
const len50 = data605.length;
for(let i50=0; i50<len50; i50++){
let data606 = data605[i50];
if(data606 && typeof data606 == "object" && !Array.isArray(data606)){
if(data606.id === undefined){
const err1281 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1281];
}
else {
vErrors.push(err1281);
}
errors++;
}
if(data606.text === undefined){
const err1282 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1282];
}
else {
vErrors.push(err1282);
}
errors++;
}
if(data606.createEdge === undefined){
const err1283 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/required",keyword:"required",params:{missingProperty: "createEdge"},message:"must have required property '"+"createEdge"+"'"};
if(vErrors === null){
vErrors = [err1283];
}
else {
vErrors.push(err1283);
}
errors++;
}
for(const key135 in data606){
if(!(((key135 === "id") || (key135 === "text")) || (key135 === "createEdge"))){
const err1284 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key135},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1284];
}
else {
vErrors.push(err1284);
}
errors++;
}
}
if(data606.id !== undefined){
if(typeof data606.id !== "string"){
const err1285 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1285];
}
else {
vErrors.push(err1285);
}
errors++;
}
}
if(data606.text !== undefined){
if(typeof data606.text !== "string"){
const err1286 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1286];
}
else {
vErrors.push(err1286);
}
errors++;
}
}
if(data606.createEdge !== undefined){
if(typeof data606.createEdge !== "string"){
const err1287 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50+"/createEdge",schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/properties/createEdge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1287];
}
else {
vErrors.push(err1287);
}
errors++;
}
}
}
else {
const err1288 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i50,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1288];
}
else {
vErrors.push(err1288);
}
errors++;
}
}
}
else {
const err1289 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1289];
}
else {
vErrors.push(err1289);
}
errors++;
}
}
}
else {
const err1290 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1290];
}
else {
vErrors.push(err1290);
}
errors++;
}
var _valid9 = _errs1733 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1819 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err1291 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1291];
}
else {
vErrors.push(err1291);
}
errors++;
}
if(data105.label === undefined){
const err1292 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1292];
}
else {
vErrors.push(err1292);
}
errors++;
}
if(data105.type === undefined){
const err1293 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1293];
}
else {
vErrors.push(err1293);
}
errors++;
}
for(const key136 in data105){
if(!(((((((key136 === "id") || (key136 === "interviewScript")) || (key136 === "label")) || (key136 === "filter")) || (key136 === "skipLogic")) || (key136 === "introductionPanel")) || (key136 === "type"))){
const err1294 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key136},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1294];
}
else {
vErrors.push(err1294);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err1295 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1295];
}
else {
vErrors.push(err1295);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err1296 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1296];
}
else {
vErrors.push(err1296);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err1297 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1297];
}
else {
vErrors.push(err1297);
}
errors++;
}
}
if(data105.filter !== undefined){
let data613 = data105.filter;
const _errs1833 = errors;
let valid445 = false;
const _errs1834 = errors;
const _errs1835 = errors;
let valid446 = false;
const _errs1836 = errors;
const err1298 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1298];
}
else {
vErrors.push(err1298);
}
errors++;
var _valid62 = _errs1836 === errors;
valid446 = valid446 || _valid62;
if(!valid446){
const _errs1838 = errors;
if(data613 && typeof data613 == "object" && !Array.isArray(data613)){
for(const key137 in data613){
if(!((key137 === "join") || (key137 === "rules"))){
const err1299 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key137},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1299];
}
else {
vErrors.push(err1299);
}
errors++;
}
}
if(data613.join !== undefined){
let data614 = data613.join;
if(typeof data614 !== "string"){
const err1300 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1300];
}
else {
vErrors.push(err1300);
}
errors++;
}
if(!((data614 === "OR") || (data614 === "AND"))){
const err1301 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1301];
}
else {
vErrors.push(err1301);
}
errors++;
}
}
if(data613.rules !== undefined){
let data615 = data613.rules;
if(Array.isArray(data615)){
const len51 = data615.length;
for(let i51=0; i51<len51; i51++){
let data616 = data615[i51];
if(data616 && typeof data616 == "object" && !Array.isArray(data616)){
if(data616.type === undefined){
const err1302 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1302];
}
else {
vErrors.push(err1302);
}
errors++;
}
if(data616.id === undefined){
const err1303 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1303];
}
else {
vErrors.push(err1303);
}
errors++;
}
if(data616.options === undefined){
const err1304 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1304];
}
else {
vErrors.push(err1304);
}
errors++;
}
for(const key138 in data616){
if(!(((key138 === "type") || (key138 === "id")) || (key138 === "options"))){
const err1305 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key138},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1305];
}
else {
vErrors.push(err1305);
}
errors++;
}
}
if(data616.type !== undefined){
let data617 = data616.type;
if(typeof data617 !== "string"){
const err1306 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1306];
}
else {
vErrors.push(err1306);
}
errors++;
}
if(!(((data617 === "alter") || (data617 === "ego")) || (data617 === "edge"))){
const err1307 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1307];
}
else {
vErrors.push(err1307);
}
errors++;
}
}
if(data616.id !== undefined){
if(typeof data616.id !== "string"){
const err1308 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1308];
}
else {
vErrors.push(err1308);
}
errors++;
}
}
if(data616.options !== undefined){
let data619 = data616.options;
if(data619 && typeof data619 == "object" && !Array.isArray(data619)){
if(data619.operator === undefined){
const err1309 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1309];
}
else {
vErrors.push(err1309);
}
errors++;
}
if(data619.type !== undefined){
if(typeof data619.type !== "string"){
const err1310 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1310];
}
else {
vErrors.push(err1310);
}
errors++;
}
}
if(data619.attribute !== undefined){
if(typeof data619.attribute !== "string"){
const err1311 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1311];
}
else {
vErrors.push(err1311);
}
errors++;
}
}
if(data619.operator !== undefined){
let data622 = data619.operator;
if(typeof data622 !== "string"){
const err1312 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1312];
}
else {
vErrors.push(err1312);
}
errors++;
}
if(!((((((((((((((((data622 === "EXISTS") || (data622 === "NOT_EXISTS")) || (data622 === "EXACTLY")) || (data622 === "NOT")) || (data622 === "GREATER_THAN")) || (data622 === "GREATER_THAN_OR_EQUAL")) || (data622 === "LESS_THAN")) || (data622 === "LESS_THAN_OR_EQUAL")) || (data622 === "INCLUDES")) || (data622 === "EXCLUDES")) || (data622 === "OPTIONS_GREATER_THAN")) || (data622 === "OPTIONS_LESS_THAN")) || (data622 === "OPTIONS_EQUALS")) || (data622 === "OPTIONS_NOT_EQUALS")) || (data622 === "CONTAINS")) || (data622 === "DOES NOT CONTAIN"))){
const err1313 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1313];
}
else {
vErrors.push(err1313);
}
errors++;
}
}
if(data619.value !== undefined){
let data623 = data619.value;
const _errs1862 = errors;
let valid453 = false;
const _errs1863 = errors;
if(!(((typeof data623 == "number") && (!(data623 % 1) && !isNaN(data623))) && (isFinite(data623)))){
const err1314 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1314];
}
else {
vErrors.push(err1314);
}
errors++;
}
var _valid63 = _errs1863 === errors;
valid453 = valid453 || _valid63;
if(!valid453){
const _errs1865 = errors;
if(typeof data623 !== "string"){
const err1315 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1315];
}
else {
vErrors.push(err1315);
}
errors++;
}
var _valid63 = _errs1865 === errors;
valid453 = valid453 || _valid63;
if(!valid453){
const _errs1867 = errors;
if(typeof data623 !== "boolean"){
const err1316 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1316];
}
else {
vErrors.push(err1316);
}
errors++;
}
var _valid63 = _errs1867 === errors;
valid453 = valid453 || _valid63;
if(!valid453){
const _errs1869 = errors;
if(!(Array.isArray(data623))){
const err1317 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1317];
}
else {
vErrors.push(err1317);
}
errors++;
}
var _valid63 = _errs1869 === errors;
valid453 = valid453 || _valid63;
}
}
}
if(!valid453){
const err1318 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1318];
}
else {
vErrors.push(err1318);
}
errors++;
}
else {
errors = _errs1862;
if(vErrors !== null){
if(_errs1862){
vErrors.length = _errs1862;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1319 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1319];
}
else {
vErrors.push(err1319);
}
errors++;
}
}
}
else {
const err1320 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i51,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1320];
}
else {
vErrors.push(err1320);
}
errors++;
}
}
}
else {
const err1321 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1321];
}
else {
vErrors.push(err1321);
}
errors++;
}
}
}
else {
const err1322 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1322];
}
else {
vErrors.push(err1322);
}
errors++;
}
var _valid62 = _errs1838 === errors;
valid446 = valid446 || _valid62;
}
if(!valid446){
const err1323 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1323];
}
else {
vErrors.push(err1323);
}
errors++;
}
else {
errors = _errs1835;
if(vErrors !== null){
if(_errs1835){
vErrors.length = _errs1835;
}
else {
vErrors = null;
}
}
}
var _valid61 = _errs1834 === errors;
valid445 = valid445 || _valid61;
if(!valid445){
const _errs1871 = errors;
if(data613 !== null){
const err1324 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1324];
}
else {
vErrors.push(err1324);
}
errors++;
}
var _valid61 = _errs1871 === errors;
valid445 = valid445 || _valid61;
}
if(!valid445){
const err1325 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1325];
}
else {
vErrors.push(err1325);
}
errors++;
}
else {
errors = _errs1833;
if(vErrors !== null){
if(_errs1833){
vErrors.length = _errs1833;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data625 = data105.introductionPanel;
if(data625 && typeof data625 == "object" && !Array.isArray(data625)){
if(data625.title === undefined){
const err1326 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1326];
}
else {
vErrors.push(err1326);
}
errors++;
}
if(data625.text === undefined){
const err1327 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1327];
}
else {
vErrors.push(err1327);
}
errors++;
}
for(const key139 in data625){
if(!((key139 === "title") || (key139 === "text"))){
const err1328 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key139},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1328];
}
else {
vErrors.push(err1328);
}
errors++;
}
}
if(data625.title !== undefined){
if(typeof data625.title !== "string"){
const err1329 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1329];
}
else {
vErrors.push(err1329);
}
errors++;
}
}
if(data625.text !== undefined){
if(typeof data625.text !== "string"){
const err1330 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1330];
}
else {
vErrors.push(err1330);
}
errors++;
}
}
}
else {
const err1331 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1331];
}
else {
vErrors.push(err1331);
}
errors++;
}
}
if(data105.type !== undefined){
let data628 = data105.type;
if(typeof data628 !== "string"){
const err1332 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/15/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1332];
}
else {
vErrors.push(err1332);
}
errors++;
}
if("FamilyTreeCensus" !== data628){
const err1333 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/15/properties/type/const",keyword:"const",params:{allowedValue: "FamilyTreeCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1333];
}
else {
vErrors.push(err1333);
}
errors++;
}
}
}
else {
const err1334 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1334];
}
else {
vErrors.push(err1334);
}
errors++;
}
var _valid9 = _errs1819 === errors;
valid46 = valid46 || _valid9;
if(!valid46){
const _errs1884 = errors;
if(data105 && typeof data105 == "object" && !Array.isArray(data105)){
if(data105.id === undefined){
const err1335 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1335];
}
else {
vErrors.push(err1335);
}
errors++;
}
if(data105.label === undefined){
const err1336 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1336];
}
else {
vErrors.push(err1336);
}
errors++;
}
if(data105.type === undefined){
const err1337 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1337];
}
else {
vErrors.push(err1337);
}
errors++;
}
if(data105.mapOptions === undefined){
const err1338 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "mapOptions"},message:"must have required property '"+"mapOptions"+"'"};
if(vErrors === null){
vErrors = [err1338];
}
else {
vErrors.push(err1338);
}
errors++;
}
if(data105.prompts === undefined){
const err1339 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err1339];
}
else {
vErrors.push(err1339);
}
errors++;
}
for(const key140 in data105){
if(!(func2.call(schema329.properties.stages.items.anyOf[16].properties, key140))){
const err1340 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key140},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1340];
}
else {
vErrors.push(err1340);
}
errors++;
}
}
if(data105.id !== undefined){
if(typeof data105.id !== "string"){
const err1341 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1341];
}
else {
vErrors.push(err1341);
}
errors++;
}
}
if(data105.interviewScript !== undefined){
if(typeof data105.interviewScript !== "string"){
const err1342 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1342];
}
else {
vErrors.push(err1342);
}
errors++;
}
}
if(data105.label !== undefined){
if(typeof data105.label !== "string"){
const err1343 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1343];
}
else {
vErrors.push(err1343);
}
errors++;
}
}
if(data105.filter !== undefined){
let data632 = data105.filter;
const _errs1898 = errors;
let valid461 = false;
const _errs1899 = errors;
const _errs1900 = errors;
let valid462 = false;
const _errs1901 = errors;
const err1344 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1344];
}
else {
vErrors.push(err1344);
}
errors++;
var _valid65 = _errs1901 === errors;
valid462 = valid462 || _valid65;
if(!valid462){
const _errs1903 = errors;
if(data632 && typeof data632 == "object" && !Array.isArray(data632)){
for(const key141 in data632){
if(!((key141 === "join") || (key141 === "rules"))){
const err1345 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key141},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1345];
}
else {
vErrors.push(err1345);
}
errors++;
}
}
if(data632.join !== undefined){
let data633 = data632.join;
if(typeof data633 !== "string"){
const err1346 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1346];
}
else {
vErrors.push(err1346);
}
errors++;
}
if(!((data633 === "OR") || (data633 === "AND"))){
const err1347 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1347];
}
else {
vErrors.push(err1347);
}
errors++;
}
}
if(data632.rules !== undefined){
let data634 = data632.rules;
if(Array.isArray(data634)){
const len52 = data634.length;
for(let i52=0; i52<len52; i52++){
let data635 = data634[i52];
if(data635 && typeof data635 == "object" && !Array.isArray(data635)){
if(data635.type === undefined){
const err1348 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1348];
}
else {
vErrors.push(err1348);
}
errors++;
}
if(data635.id === undefined){
const err1349 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1349];
}
else {
vErrors.push(err1349);
}
errors++;
}
if(data635.options === undefined){
const err1350 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1350];
}
else {
vErrors.push(err1350);
}
errors++;
}
for(const key142 in data635){
if(!(((key142 === "type") || (key142 === "id")) || (key142 === "options"))){
const err1351 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key142},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1351];
}
else {
vErrors.push(err1351);
}
errors++;
}
}
if(data635.type !== undefined){
let data636 = data635.type;
if(typeof data636 !== "string"){
const err1352 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1352];
}
else {
vErrors.push(err1352);
}
errors++;
}
if(!(((data636 === "alter") || (data636 === "ego")) || (data636 === "edge"))){
const err1353 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1353];
}
else {
vErrors.push(err1353);
}
errors++;
}
}
if(data635.id !== undefined){
if(typeof data635.id !== "string"){
const err1354 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1354];
}
else {
vErrors.push(err1354);
}
errors++;
}
}
if(data635.options !== undefined){
let data638 = data635.options;
if(data638 && typeof data638 == "object" && !Array.isArray(data638)){
if(data638.operator === undefined){
const err1355 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1355];
}
else {
vErrors.push(err1355);
}
errors++;
}
if(data638.type !== undefined){
if(typeof data638.type !== "string"){
const err1356 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1356];
}
else {
vErrors.push(err1356);
}
errors++;
}
}
if(data638.attribute !== undefined){
if(typeof data638.attribute !== "string"){
const err1357 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1357];
}
else {
vErrors.push(err1357);
}
errors++;
}
}
if(data638.operator !== undefined){
let data641 = data638.operator;
if(typeof data641 !== "string"){
const err1358 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1358];
}
else {
vErrors.push(err1358);
}
errors++;
}
if(!((((((((((((((((data641 === "EXISTS") || (data641 === "NOT_EXISTS")) || (data641 === "EXACTLY")) || (data641 === "NOT")) || (data641 === "GREATER_THAN")) || (data641 === "GREATER_THAN_OR_EQUAL")) || (data641 === "LESS_THAN")) || (data641 === "LESS_THAN_OR_EQUAL")) || (data641 === "INCLUDES")) || (data641 === "EXCLUDES")) || (data641 === "OPTIONS_GREATER_THAN")) || (data641 === "OPTIONS_LESS_THAN")) || (data641 === "OPTIONS_EQUALS")) || (data641 === "OPTIONS_NOT_EQUALS")) || (data641 === "CONTAINS")) || (data641 === "DOES NOT CONTAIN"))){
const err1359 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1359];
}
else {
vErrors.push(err1359);
}
errors++;
}
}
if(data638.value !== undefined){
let data642 = data638.value;
const _errs1927 = errors;
let valid469 = false;
const _errs1928 = errors;
if(!(((typeof data642 == "number") && (!(data642 % 1) && !isNaN(data642))) && (isFinite(data642)))){
const err1360 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1360];
}
else {
vErrors.push(err1360);
}
errors++;
}
var _valid66 = _errs1928 === errors;
valid469 = valid469 || _valid66;
if(!valid469){
const _errs1930 = errors;
if(typeof data642 !== "string"){
const err1361 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1361];
}
else {
vErrors.push(err1361);
}
errors++;
}
var _valid66 = _errs1930 === errors;
valid469 = valid469 || _valid66;
if(!valid469){
const _errs1932 = errors;
if(typeof data642 !== "boolean"){
const err1362 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1362];
}
else {
vErrors.push(err1362);
}
errors++;
}
var _valid66 = _errs1932 === errors;
valid469 = valid469 || _valid66;
if(!valid469){
const _errs1934 = errors;
if(!(Array.isArray(data642))){
const err1363 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1363];
}
else {
vErrors.push(err1363);
}
errors++;
}
var _valid66 = _errs1934 === errors;
valid469 = valid469 || _valid66;
}
}
}
if(!valid469){
const err1364 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1364];
}
else {
vErrors.push(err1364);
}
errors++;
}
else {
errors = _errs1927;
if(vErrors !== null){
if(_errs1927){
vErrors.length = _errs1927;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1365 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1365];
}
else {
vErrors.push(err1365);
}
errors++;
}
}
}
else {
const err1366 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1366];
}
else {
vErrors.push(err1366);
}
errors++;
}
}
}
else {
const err1367 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1367];
}
else {
vErrors.push(err1367);
}
errors++;
}
}
}
else {
const err1368 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1368];
}
else {
vErrors.push(err1368);
}
errors++;
}
var _valid65 = _errs1903 === errors;
valid462 = valid462 || _valid65;
}
if(!valid462){
const err1369 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1369];
}
else {
vErrors.push(err1369);
}
errors++;
}
else {
errors = _errs1900;
if(vErrors !== null){
if(_errs1900){
vErrors.length = _errs1900;
}
else {
vErrors = null;
}
}
}
var _valid64 = _errs1899 === errors;
valid461 = valid461 || _valid64;
if(!valid461){
const _errs1936 = errors;
if(data632 !== null){
const err1370 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1370];
}
else {
vErrors.push(err1370);
}
errors++;
}
var _valid64 = _errs1936 === errors;
valid461 = valid461 || _valid64;
}
if(!valid461){
const err1371 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1371];
}
else {
vErrors.push(err1371);
}
errors++;
}
else {
errors = _errs1898;
if(vErrors !== null){
if(_errs1898){
vErrors.length = _errs1898;
}
else {
vErrors = null;
}
}
}
}
if(data105.skipLogic !== undefined){
if(!(validate407(data105.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data105,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data105.introductionPanel !== undefined){
let data644 = data105.introductionPanel;
if(data644 && typeof data644 == "object" && !Array.isArray(data644)){
if(data644.title === undefined){
const err1372 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1372];
}
else {
vErrors.push(err1372);
}
errors++;
}
if(data644.text === undefined){
const err1373 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1373];
}
else {
vErrors.push(err1373);
}
errors++;
}
for(const key143 in data644){
if(!((key143 === "title") || (key143 === "text"))){
const err1374 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key143},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1374];
}
else {
vErrors.push(err1374);
}
errors++;
}
}
if(data644.title !== undefined){
if(typeof data644.title !== "string"){
const err1375 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1375];
}
else {
vErrors.push(err1375);
}
errors++;
}
}
if(data644.text !== undefined){
if(typeof data644.text !== "string"){
const err1376 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1376];
}
else {
vErrors.push(err1376);
}
errors++;
}
}
}
else {
const err1377 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1377];
}
else {
vErrors.push(err1377);
}
errors++;
}
}
if(data105.type !== undefined){
let data647 = data105.type;
if(typeof data647 !== "string"){
const err1378 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/16/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1378];
}
else {
vErrors.push(err1378);
}
errors++;
}
if("Geospatial" !== data647){
const err1379 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/16/properties/type/const",keyword:"const",params:{allowedValue: "Geospatial"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1379];
}
else {
vErrors.push(err1379);
}
errors++;
}
}
if(data105.subject !== undefined){
let data648 = data105.subject;
if(data648 && typeof data648 == "object" && !Array.isArray(data648)){
if(data648.entity === undefined){
const err1380 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err1380];
}
else {
vErrors.push(err1380);
}
errors++;
}
if(data648.type === undefined){
const err1381 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1381];
}
else {
vErrors.push(err1381);
}
errors++;
}
for(const key144 in data648){
if(!((key144 === "entity") || (key144 === "type"))){
const err1382 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key144},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1382];
}
else {
vErrors.push(err1382);
}
errors++;
}
}
if(data648.entity !== undefined){
let data649 = data648.entity;
if(typeof data649 !== "string"){
const err1383 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1383];
}
else {
vErrors.push(err1383);
}
errors++;
}
if(!(((data649 === "edge") || (data649 === "node")) || (data649 === "ego"))){
const err1384 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1384];
}
else {
vErrors.push(err1384);
}
errors++;
}
}
if(data648.type !== undefined){
if(typeof data648.type !== "string"){
const err1385 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1385];
}
else {
vErrors.push(err1385);
}
errors++;
}
}
}
else {
const err1386 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1386];
}
else {
vErrors.push(err1386);
}
errors++;
}
}
if(data105.mapOptions !== undefined){
let data651 = data105.mapOptions;
if(data651 && typeof data651 == "object" && !Array.isArray(data651)){
if(data651.tokenAssetId === undefined){
const err1387 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "tokenAssetId"},message:"must have required property '"+"tokenAssetId"+"'"};
if(vErrors === null){
vErrors = [err1387];
}
else {
vErrors.push(err1387);
}
errors++;
}
if(data651.style === undefined){
const err1388 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "style"},message:"must have required property '"+"style"+"'"};
if(vErrors === null){
vErrors = [err1388];
}
else {
vErrors.push(err1388);
}
errors++;
}
if(data651.center === undefined){
const err1389 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "center"},message:"must have required property '"+"center"+"'"};
if(vErrors === null){
vErrors = [err1389];
}
else {
vErrors.push(err1389);
}
errors++;
}
if(data651.initialZoom === undefined){
const err1390 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "initialZoom"},message:"must have required property '"+"initialZoom"+"'"};
if(vErrors === null){
vErrors = [err1390];
}
else {
vErrors.push(err1390);
}
errors++;
}
if(data651.dataSourceAssetId === undefined){
const err1391 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "dataSourceAssetId"},message:"must have required property '"+"dataSourceAssetId"+"'"};
if(vErrors === null){
vErrors = [err1391];
}
else {
vErrors.push(err1391);
}
errors++;
}
if(data651.color === undefined){
const err1392 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "color"},message:"must have required property '"+"color"+"'"};
if(vErrors === null){
vErrors = [err1392];
}
else {
vErrors.push(err1392);
}
errors++;
}
if(data651.targetFeatureProperty === undefined){
const err1393 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "targetFeatureProperty"},message:"must have required property '"+"targetFeatureProperty"+"'"};
if(vErrors === null){
vErrors = [err1393];
}
else {
vErrors.push(err1393);
}
errors++;
}
for(const key145 in data651){
if(!(((((((key145 === "tokenAssetId") || (key145 === "style")) || (key145 === "center")) || (key145 === "initialZoom")) || (key145 === "dataSourceAssetId")) || (key145 === "color")) || (key145 === "targetFeatureProperty"))){
const err1394 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key145},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1394];
}
else {
vErrors.push(err1394);
}
errors++;
}
}
if(data651.tokenAssetId !== undefined){
if(typeof data651.tokenAssetId !== "string"){
const err1395 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/tokenAssetId",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/tokenAssetId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1395];
}
else {
vErrors.push(err1395);
}
errors++;
}
}
if(data651.style !== undefined){
let data653 = data651.style;
if(typeof data653 !== "string"){
const err1396 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/style",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/style/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1396];
}
else {
vErrors.push(err1396);
}
errors++;
}
if(!((((((((((data653 === "mapbox://styles/mapbox/standard") || (data653 === "mapbox://styles/mapbox/standard-satellite")) || (data653 === "mapbox://styles/mapbox/streets-v12")) || (data653 === "mapbox://styles/mapbox/outdoors-v12")) || (data653 === "mapbox://styles/mapbox/light-v11")) || (data653 === "mapbox://styles/mapbox/dark-v11")) || (data653 === "mapbox://styles/mapbox/satellite-v9")) || (data653 === "mapbox://styles/mapbox/satellite-streets-v12")) || (data653 === "mapbox://styles/mapbox/navigation-day-v1")) || (data653 === "mapbox://styles/mapbox/navigation-night-v1"))){
const err1397 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/style",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/style/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[16].properties.mapOptions.properties.style.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1397];
}
else {
vErrors.push(err1397);
}
errors++;
}
}
if(data651.center !== undefined){
let data654 = data651.center;
if(Array.isArray(data654)){
if(data654.length > 2){
const err1398 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err1398];
}
else {
vErrors.push(err1398);
}
errors++;
}
if(data654.length < 2){
const err1399 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err1399];
}
else {
vErrors.push(err1399);
}
errors++;
}
const len53 = data654.length;
if(len53 > 0){
let data655 = data654[0];
if(!((typeof data655 == "number") && (isFinite(data655)))){
const err1400 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center/0",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/items/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1400];
}
else {
vErrors.push(err1400);
}
errors++;
}
}
if(len53 > 1){
let data656 = data654[1];
if(!((typeof data656 == "number") && (isFinite(data656)))){
const err1401 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center/1",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/items/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1401];
}
else {
vErrors.push(err1401);
}
errors++;
}
}
}
else {
const err1402 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1402];
}
else {
vErrors.push(err1402);
}
errors++;
}
}
if(data651.initialZoom !== undefined){
let data657 = data651.initialZoom;
if((typeof data657 == "number") && (isFinite(data657))){
if(data657 > 22 || isNaN(data657)){
const err1403 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/initialZoom",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/initialZoom/maximum",keyword:"maximum",params:{comparison: "<=", limit: 22},message:"must be <= 22"};
if(vErrors === null){
vErrors = [err1403];
}
else {
vErrors.push(err1403);
}
errors++;
}
if(data657 < 0 || isNaN(data657)){
const err1404 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/initialZoom",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/initialZoom/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err1404];
}
else {
vErrors.push(err1404);
}
errors++;
}
}
else {
const err1405 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/initialZoom",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/initialZoom/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1405];
}
else {
vErrors.push(err1405);
}
errors++;
}
}
if(data651.dataSourceAssetId !== undefined){
if(typeof data651.dataSourceAssetId !== "string"){
const err1406 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/dataSourceAssetId",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/dataSourceAssetId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1406];
}
else {
vErrors.push(err1406);
}
errors++;
}
}
if(data651.color !== undefined){
if(typeof data651.color !== "string"){
const err1407 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/color",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1407];
}
else {
vErrors.push(err1407);
}
errors++;
}
}
if(data651.targetFeatureProperty !== undefined){
if(typeof data651.targetFeatureProperty !== "string"){
const err1408 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/targetFeatureProperty",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/targetFeatureProperty/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1408];
}
else {
vErrors.push(err1408);
}
errors++;
}
}
}
else {
const err1409 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1409];
}
else {
vErrors.push(err1409);
}
errors++;
}
}
if(data105.prompts !== undefined){
let data661 = data105.prompts;
if(Array.isArray(data661)){
if(data661.length < 1){
const err1410 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1410];
}
else {
vErrors.push(err1410);
}
errors++;
}
const len54 = data661.length;
for(let i53=0; i53<len54; i53++){
let data662 = data661[i53];
if(data662 && typeof data662 == "object" && !Array.isArray(data662)){
if(data662.id === undefined){
const err1411 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1411];
}
else {
vErrors.push(err1411);
}
errors++;
}
if(data662.text === undefined){
const err1412 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1412];
}
else {
vErrors.push(err1412);
}
errors++;
}
if(data662.variable === undefined){
const err1413 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err1413];
}
else {
vErrors.push(err1413);
}
errors++;
}
for(const key146 in data662){
if(!(((key146 === "id") || (key146 === "text")) || (key146 === "variable"))){
const err1414 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key146},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1414];
}
else {
vErrors.push(err1414);
}
errors++;
}
}
if(data662.id !== undefined){
if(typeof data662.id !== "string"){
const err1415 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1415];
}
else {
vErrors.push(err1415);
}
errors++;
}
}
if(data662.text !== undefined){
if(typeof data662.text !== "string"){
const err1416 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1416];
}
else {
vErrors.push(err1416);
}
errors++;
}
}
if(data662.variable !== undefined){
if(typeof data662.variable !== "string"){
const err1417 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53+"/variable",schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1417];
}
else {
vErrors.push(err1417);
}
errors++;
}
}
}
else {
const err1418 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i53,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1418];
}
else {
vErrors.push(err1418);
}
errors++;
}
}
}
else {
const err1419 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1419];
}
else {
vErrors.push(err1419);
}
errors++;
}
}
}
else {
const err1420 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1420];
}
else {
vErrors.push(err1420);
}
errors++;
}
var _valid9 = _errs1884 === errors;
valid46 = valid46 || _valid9;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid46){
const err1421 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1421];
}
else {
vErrors.push(err1421);
}
errors++;
}
else {
errors = _errs292;
if(vErrors !== null){
if(_errs292){
vErrors.length = _errs292;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1422 = {instancePath:instancePath+"/stages",schemaPath:"#/properties/stages/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1422];
}
else {
vErrors.push(err1422);
}
errors++;
}
}
}
else {
const err1423 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1423];
}
else {
vErrors.push(err1423);
}
errors++;
}
validate406.errors = vErrors;
return errors === 0;
}


function validate405(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(!(validate406(data, {instancePath,parentData,parentDataProperty,rootData}))){
vErrors = vErrors === null ? validate406.errors : vErrors.concat(validate406.errors);
errors = vErrors.length;
}
validate405.errors = vErrors;
return errors === 0;
}
