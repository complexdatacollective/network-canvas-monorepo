"use strict";
export const validate = validate405;
export default validate405;
const schema328 = {"$ref":"#/definitions/Protocol","definitions":{"Protocol":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"experiments":{"type":"object","properties":{"encryptNames":{"type":"boolean"}},"additionalProperties":false},"lastModified":{"type":"string","format":"date-time"},"schemaVersion":{"type":"number","const":8},"codebook":{"type":"object","properties":{"node":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"displayVariable":{"type":"string"},"iconVariant":{"type":"string"},"variables":{"type":"object","additionalProperties":{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},"type":{"type":"string","enum":["boolean","text","number","datetime","ordinal","scalar","categorical","layout","location"]},"encrypted":{"type":"boolean"},"component":{"type":"string","enum":["Boolean","CheckboxGroup","Number","RadioGroup","Text","TextArea","Toggle","ToggleButtonGroup","Slider","VisualAnalogScale","LikertScale","DatePicker","RelativeDatePicker"]},"options":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"label":{"type":"string"},"value":{"anyOf":[{"type":"integer"},{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},{"type":"boolean"}]},"negative":{"type":"boolean"}},"required":["label","value"],"additionalProperties":false},{"type":"integer"},{"type":"string"}]}},"parameters":{"type":"object","additionalProperties":{}},"validation":{"type":"object","properties":{"required":{"type":"boolean"},"requiredAcceptsNull":{"type":"boolean"},"minLength":{"type":"integer"},"maxLength":{"type":"integer"},"minValue":{"type":"integer"},"maxValue":{"type":"integer"},"minSelected":{"type":"integer"},"maxSelected":{"type":"integer"},"unique":{"type":"boolean"},"differentFrom":{"type":"string"},"sameAs":{"type":"string"},"greaterThanVariable":{"type":"string"},"lessThanVariable":{"type":"string"}},"additionalProperties":false}},"required":["name","type"],"additionalProperties":false},"propertyNames":{"pattern":"^[a-zA-Z0-9._:-]+$"}},"color":{"type":"string"}},"required":["name","variables","color"],"additionalProperties":false},{"not":{}}]}},"edge":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"color":{"type":"string"},"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["name","color","variables"],"additionalProperties":false},{"not":{}}]}},"ego":{"type":"object","properties":{"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["variables"],"additionalProperties":false}},"required":["node"],"additionalProperties":false},"assetManifest":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["image","video","network","geojson"]},"name":{"type":"string"},"source":{"type":"string"}},"required":["id","type","name","source"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/id"},"type":{"type":"string","enum":["apikey"]},"name":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/name"},"value":{"type":"string"}},"required":["id","type","name","value"],"additionalProperties":false}]}},"stages":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"interviewScript":{"type":"string"},"label":{"type":"string"},"filter":{"anyOf":[{"anyOf":[{"not":{}},{"type":"object","properties":{"join":{"type":"string","enum":["OR","AND"]},"rules":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["alter","ego","edge"]},"id":{"type":"string"},"options":{"allOf":[{"type":"object","properties":{"type":{"type":"string"},"attribute":{"type":"string"},"operator":{"type":"string","enum":["EXISTS","NOT_EXISTS","EXACTLY","NOT","GREATER_THAN","GREATER_THAN_OR_EQUAL","LESS_THAN","LESS_THAN_OR_EQUAL","INCLUDES","EXCLUDES","OPTIONS_GREATER_THAN","OPTIONS_LESS_THAN","OPTIONS_EQUALS","OPTIONS_NOT_EQUALS","CONTAINS","DOES NOT CONTAIN"]},"value":{"anyOf":[{"type":"integer"},{"type":"string"},{"type":"boolean"},{"type":"array"}]}},"required":["operator"]},{}]}},"required":["type","id","options"],"additionalProperties":false}}},"additionalProperties":false}]},{"type":"null"}]},"skipLogic":{"type":"object","properties":{"action":{"type":"string","enum":["SHOW","SKIP"]},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]}},"required":["action"],"additionalProperties":false},"introductionPanel":{"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false},"type":{"type":"string","const":"EgoForm"},"form":{"type":"object","properties":{"title":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"variable":{"type":"string"},"prompt":{"type":"string"}},"required":["variable","prompt"],"additionalProperties":false}}},"required":["fields"],"additionalProperties":false}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterForm"},"subject":{"type":"object","properties":{"entity":{"type":"string","enum":["edge","node","ego"]},"type":{"type":"string"}},"required":["entity","type"],"additionalProperties":false},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterEdgeForm"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGenerator"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]},"dataSource":{"type":["string","null"]}},"required":["id","title","dataSource"],"additionalProperties":false}},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"}},"required":["id","text"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","form","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorQuickAdd"},"quickAdd":{"type":"string"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/panels/items"}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1},"behaviours":{"type":"object","properties":{"minNodes":{"type":"integer"},"maxNodes":{"type":"integer"}},"additionalProperties":false}},"required":["id","label","type","quickAdd","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorRoster"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"dataSource":{"type":"string"},"cardOptions":{"type":"object","properties":{"displayLabel":{"type":"string"},"additionalProperties":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"variable":{"type":"string"}},"required":["label","variable"],"additionalProperties":false}}},"additionalProperties":false},"searchOptions":{"type":"object","properties":{"fuzziness":{"type":"number"},"matchProperties":{"type":"array","items":{"type":"string"}}},"required":["fuzziness","matchProperties"],"additionalProperties":false},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","dataSource","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Sociogram"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"background":{"type":"object","properties":{"image":{"type":"string"},"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"automaticLayout":{"type":"object","properties":{"enabled":{"type":"boolean"}},"required":["enabled"],"additionalProperties":false}},"additionalProperties":{}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"DyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"TieStrengthCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"},"edgeVariable":{"type":"string"},"negativeLabel":{"type":"string"}},"required":["id","text","createEdge","edgeVariable","negativeLabel"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OrdinalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"bucketSortOrder":{"type":"array","items":{"type":"object","properties":{"property":{"type":"string"},"direction":{"type":"string","enum":["desc","asc"]},"type":{"type":"string","enum":["string","number","boolean","date","hierarchy"]},"hierarchy":{"type":"array","items":{"type":["string","number","boolean"]}}},"required":["property"],"additionalProperties":false}},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"color":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"CategoricalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"otherVariable":{"type":"string"},"otherVariablePrompt":{"type":"string"},"otherOptionLabel":{"type":"string"},"bucketSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Narrative"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"presets":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"label":{"type":"string"},"layoutVariable":{"type":"string"},"groupVariable":{"type":"string"},"edges":{"type":"object","properties":{"display":{"type":"array","items":{"type":"string"}}},"additionalProperties":false},"highlight":{"type":"array","items":{"type":"string"}}},"required":["id","label","layoutVariable"],"additionalProperties":false},"minItems":1},"background":{"type":"object","properties":{"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"freeDraw":{"type":"boolean"},"allowRepositioning":{"type":"boolean"}},"additionalProperties":false}},"required":["id","label","type","presets"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Information"},"title":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["text","asset"]},"content":{"type":"string"},"description":{"type":"string"},"size":{"type":"string"},"loop":{"type":"boolean"}},"required":["id","type","content"],"additionalProperties":false}}},"required":["id","label","type","items"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false},"type":{"type":"string","const":"Anonymisation"},"validation":{"type":"object","properties":{"minLength":{"type":"integer"},"maxLength":{"type":"integer"}},"additionalProperties":false}},"required":["id","label","type"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OneToManyDyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"behaviours":{"type":"object","properties":{"removeAfterConsideration":{"type":"boolean"}},"required":["removeAfterConsideration"],"additionalProperties":false},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"},"bucketSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","behaviours","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"FamilyTreeCensus"}},"required":["id","label","type"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Geospatial"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"mapOptions":{"type":"object","properties":{"tokenAssetId":{"type":"string"},"style":{"type":"string","enum":["mapbox://styles/mapbox/standard","mapbox://styles/mapbox/standard-satellite","mapbox://styles/mapbox/streets-v12","mapbox://styles/mapbox/outdoors-v12","mapbox://styles/mapbox/light-v11","mapbox://styles/mapbox/dark-v11","mapbox://styles/mapbox/satellite-v9","mapbox://styles/mapbox/satellite-streets-v12","mapbox://styles/mapbox/navigation-day-v1","mapbox://styles/mapbox/navigation-night-v1"]},"center":{"type":"array","minItems":2,"maxItems":2,"items":[{"type":"number"},{"type":"number"}]},"initialZoom":{"type":"number","minimum":0,"maximum":22},"dataSourceAssetId":{"type":"string"},"color":{"type":"string"},"targetFeatureProperty":{"type":"string"}},"required":["tokenAssetId","style","center","initialZoom","dataSourceAssetId","color","targetFeatureProperty"],"additionalProperties":false},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","mapOptions","prompts"],"additionalProperties":false}]}}},"required":["schemaVersion","codebook","stages"],"additionalProperties":false}},"$schema":"http://json-schema.org/draft-07/schema#"};
const schema329 = {"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"experiments":{"type":"object","properties":{"encryptNames":{"type":"boolean"}},"additionalProperties":false},"lastModified":{"type":"string","format":"date-time"},"schemaVersion":{"type":"number","const":8},"codebook":{"type":"object","properties":{"node":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"displayVariable":{"type":"string"},"iconVariant":{"type":"string"},"variables":{"type":"object","additionalProperties":{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},"type":{"type":"string","enum":["boolean","text","number","datetime","ordinal","scalar","categorical","layout","location"]},"encrypted":{"type":"boolean"},"component":{"type":"string","enum":["Boolean","CheckboxGroup","Number","RadioGroup","Text","TextArea","Toggle","ToggleButtonGroup","Slider","VisualAnalogScale","LikertScale","DatePicker","RelativeDatePicker"]},"options":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"label":{"type":"string"},"value":{"anyOf":[{"type":"integer"},{"type":"string","pattern":"^[a-zA-Z0-9._:-]+$"},{"type":"boolean"}]},"negative":{"type":"boolean"}},"required":["label","value"],"additionalProperties":false},{"type":"integer"},{"type":"string"}]}},"parameters":{"type":"object","additionalProperties":{}},"validation":{"type":"object","properties":{"required":{"type":"boolean"},"requiredAcceptsNull":{"type":"boolean"},"minLength":{"type":"integer"},"maxLength":{"type":"integer"},"minValue":{"type":"integer"},"maxValue":{"type":"integer"},"minSelected":{"type":"integer"},"maxSelected":{"type":"integer"},"unique":{"type":"boolean"},"differentFrom":{"type":"string"},"sameAs":{"type":"string"},"greaterThanVariable":{"type":"string"},"lessThanVariable":{"type":"string"}},"additionalProperties":false}},"required":["name","type"],"additionalProperties":false},"propertyNames":{"pattern":"^[a-zA-Z0-9._:-]+$"}},"color":{"type":"string"}},"required":["name","variables","color"],"additionalProperties":false},{"not":{}}]}},"edge":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"name":{"type":"string"},"color":{"type":"string"},"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["name","color","variables"],"additionalProperties":false},{"not":{}}]}},"ego":{"type":"object","properties":{"variables":{"$ref":"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables"}},"required":["variables"],"additionalProperties":false}},"required":["node"],"additionalProperties":false},"assetManifest":{"type":"object","additionalProperties":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["image","video","network","geojson"]},"name":{"type":"string"},"source":{"type":"string"}},"required":["id","type","name","source"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/id"},"type":{"type":"string","enum":["apikey"]},"name":{"$ref":"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/name"},"value":{"type":"string"}},"required":["id","type","name","value"],"additionalProperties":false}]}},"stages":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"interviewScript":{"type":"string"},"label":{"type":"string"},"filter":{"anyOf":[{"anyOf":[{"not":{}},{"type":"object","properties":{"join":{"type":"string","enum":["OR","AND"]},"rules":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["alter","ego","edge"]},"id":{"type":"string"},"options":{"allOf":[{"type":"object","properties":{"type":{"type":"string"},"attribute":{"type":"string"},"operator":{"type":"string","enum":["EXISTS","NOT_EXISTS","EXACTLY","NOT","GREATER_THAN","GREATER_THAN_OR_EQUAL","LESS_THAN","LESS_THAN_OR_EQUAL","INCLUDES","EXCLUDES","OPTIONS_GREATER_THAN","OPTIONS_LESS_THAN","OPTIONS_EQUALS","OPTIONS_NOT_EQUALS","CONTAINS","DOES NOT CONTAIN"]},"value":{"anyOf":[{"type":"integer"},{"type":"string"},{"type":"boolean"},{"type":"array"}]}},"required":["operator"]},{}]}},"required":["type","id","options"],"additionalProperties":false}}},"additionalProperties":false}]},{"type":"null"}]},"skipLogic":{"type":"object","properties":{"action":{"type":"string","enum":["SHOW","SKIP"]},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]}},"required":["action"],"additionalProperties":false},"introductionPanel":{"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false},"type":{"type":"string","const":"EgoForm"},"form":{"type":"object","properties":{"title":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"variable":{"type":"string"},"prompt":{"type":"string"}},"required":["variable","prompt"],"additionalProperties":false}}},"required":["fields"],"additionalProperties":false}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterForm"},"subject":{"type":"object","properties":{"entity":{"type":"string","enum":["edge","node","ego"]},"type":{"type":"string"}},"required":["entity","type"],"additionalProperties":false},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"AlterEdgeForm"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"}},"required":["id","label","type","form"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGenerator"},"form":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"filter":{"anyOf":[{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0"},{"type":"null"}]},"dataSource":{"type":["string","null"]}},"required":["id","title","dataSource"],"additionalProperties":false}},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"}},"required":["id","text"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","form","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorQuickAdd"},"quickAdd":{"type":"string"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"panels":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/panels/items"}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1},"behaviours":{"type":"object","properties":{"minNodes":{"type":"integer"},"maxNodes":{"type":"integer"}},"additionalProperties":false}},"required":["id","label","type","quickAdd","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"NameGeneratorRoster"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"dataSource":{"type":"string"},"cardOptions":{"type":"object","properties":{"displayLabel":{"type":"string"},"additionalProperties":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"variable":{"type":"string"}},"required":["label","variable"],"additionalProperties":false}}},"additionalProperties":false},"searchOptions":{"type":"object","properties":{"fuzziness":{"type":"number"},"matchProperties":{"type":"array","items":{"type":"string"}}},"required":["fuzziness","matchProperties"],"additionalProperties":false},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","dataSource","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Sociogram"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"background":{"type":"object","properties":{"image":{"type":"string"},"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"automaticLayout":{"type":"object","properties":{"enabled":{"type":"boolean"}},"required":["enabled"],"additionalProperties":false}},"additionalProperties":{}},"prompts":{"type":"array","items":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items"},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"DyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"TieStrengthCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"},"edgeVariable":{"type":"string"},"negativeLabel":{"type":"string"}},"required":["id","text","createEdge","edgeVariable","negativeLabel"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OrdinalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"bucketSortOrder":{"type":"array","items":{"type":"object","properties":{"property":{"type":"string"},"direction":{"type":"string","enum":["desc","asc"]},"type":{"type":"string","enum":["string","number","boolean","date","hierarchy"]},"hierarchy":{"type":"array","items":{"type":["string","number","boolean"]}}},"required":["property"],"additionalProperties":false}},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"color":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"CategoricalBin"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"},"otherVariable":{"type":"string"},"otherVariablePrompt":{"type":"string"},"otherOptionLabel":{"type":"string"},"bucketSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Narrative"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"presets":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"label":{"type":"string"},"layoutVariable":{"type":"string"},"groupVariable":{"type":"string"},"edges":{"type":"object","properties":{"display":{"type":"array","items":{"type":"string"}}},"additionalProperties":false},"highlight":{"type":"array","items":{"type":"string"}}},"required":["id","label","layoutVariable"],"additionalProperties":false},"minItems":1},"background":{"type":"object","properties":{"concentricCircles":{"type":"integer"},"skewedTowardCenter":{"type":"boolean"}},"additionalProperties":false},"behaviours":{"type":"object","properties":{"freeDraw":{"type":"boolean"},"allowRepositioning":{"type":"boolean"}},"additionalProperties":false}},"required":["id","label","type","presets"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Information"},"title":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string","enum":["text","asset"]},"content":{"type":"string"},"description":{"type":"string"},"size":{"type":"string"},"loop":{"type":"boolean"}},"required":["id","type","content"],"additionalProperties":false}}},"required":["id","label","type","items"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"type":"object","properties":{"title":{"type":"string"},"text":{"type":"string"}},"required":["title","text"],"additionalProperties":false},"type":{"type":"string","const":"Anonymisation"},"validation":{"type":"object","properties":{"minLength":{"type":"integer"},"maxLength":{"type":"integer"}},"additionalProperties":false}},"required":["id","label","type"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"OneToManyDyadCensus"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"behaviours":{"type":"object","properties":{"removeAfterConsideration":{"type":"boolean"}},"required":["removeAfterConsideration"],"additionalProperties":false},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"createEdge":{"type":"string"},"bucketSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"},"binSortOrder":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder"}},"required":["id","text","createEdge"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","behaviours","prompts"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"FamilyTreeCensus"}},"required":["id","label","type"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id"},"interviewScript":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript"},"label":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label"},"filter":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter"},"skipLogic":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/skipLogic"},"introductionPanel":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel"},"type":{"type":"string","const":"Geospatial"},"subject":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject"},"mapOptions":{"type":"object","properties":{"tokenAssetId":{"type":"string"},"style":{"type":"string","enum":["mapbox://styles/mapbox/standard","mapbox://styles/mapbox/standard-satellite","mapbox://styles/mapbox/streets-v12","mapbox://styles/mapbox/outdoors-v12","mapbox://styles/mapbox/light-v11","mapbox://styles/mapbox/dark-v11","mapbox://styles/mapbox/satellite-v9","mapbox://styles/mapbox/satellite-streets-v12","mapbox://styles/mapbox/navigation-day-v1","mapbox://styles/mapbox/navigation-night-v1"]},"center":{"type":"array","minItems":2,"maxItems":2,"items":[{"type":"number"},{"type":"number"}]},"initialZoom":{"type":"number","minimum":0,"maximum":22},"dataSourceAssetId":{"type":"string"},"color":{"type":"string"},"targetFeatureProperty":{"type":"string"}},"required":["tokenAssetId","style","center","initialZoom","dataSourceAssetId","color","targetFeatureProperty"],"additionalProperties":false},"prompts":{"type":"array","items":{"type":"object","properties":{"id":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id"},"text":{"$ref":"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text"},"variable":{"type":"string"}},"required":["id","text","variable"],"additionalProperties":false},"minItems":1}},"required":["id","label","type","mapOptions","prompts"],"additionalProperties":false}]}}},"required":["schemaVersion","codebook","stages"],"additionalProperties":false};
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
if(!((((((((key0 === "name") || (key0 === "description")) || (key0 === "experiments")) || (key0 === "lastModified")) || (key0 === "schemaVersion")) || (key0 === "codebook")) || (key0 === "assetManifest")) || (key0 === "stages"))){
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
if(data.experiments !== undefined){
let data2 = data.experiments;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
for(const key1 in data2){
if(!(key1 === "encryptNames")){
const err6 = {instancePath:instancePath+"/experiments",schemaPath:"#/properties/experiments/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data2.encryptNames !== undefined){
if(typeof data2.encryptNames !== "boolean"){
const err7 = {instancePath:instancePath+"/experiments/encryptNames",schemaPath:"#/properties/experiments/properties/encryptNames/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath:instancePath+"/experiments",schemaPath:"#/properties/experiments/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.lastModified !== undefined){
let data4 = data.lastModified;
if(typeof data4 === "string"){
if(!(formats0.test(data4))){
const err9 = {instancePath:instancePath+"/lastModified",schemaPath:"#/properties/lastModified/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/lastModified",schemaPath:"#/properties/lastModified/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data5 = data.schemaVersion;
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(8 !== data5){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: 8},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.codebook !== undefined){
let data6 = data.codebook;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.node === undefined){
const err13 = {instancePath:instancePath+"/codebook",schemaPath:"#/properties/codebook/required",keyword:"required",params:{missingProperty: "node"},message:"must have required property '"+"node"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key2 in data6){
if(!(((key2 === "node") || (key2 === "edge")) || (key2 === "ego"))){
const err14 = {instancePath:instancePath+"/codebook",schemaPath:"#/properties/codebook/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data6.node !== undefined){
let data7 = data6.node;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
for(const key3 in data7){
let data8 = data7[key3];
const _errs22 = errors;
let valid4 = false;
const _errs23 = errors;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.name === undefined){
const err15 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data8.variables === undefined){
const err16 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "variables"},message:"must have required property '"+"variables"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data8.color === undefined){
const err17 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "color"},message:"must have required property '"+"color"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
for(const key4 in data8){
if(!(((((key4 === "name") || (key4 === "displayVariable")) || (key4 === "iconVariant")) || (key4 === "variables")) || (key4 === "color"))){
const err18 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data8.name !== undefined){
if(typeof data8.name !== "string"){
const err19 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data8.displayVariable !== undefined){
if(typeof data8.displayVariable !== "string"){
const err20 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/displayVariable",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/displayVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data8.iconVariant !== undefined){
if(typeof data8.iconVariant !== "string"){
const err21 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/iconVariant",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/iconVariant/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data8.variables !== undefined){
let data12 = data8.variables;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
for(const key5 in data12){
const _errs34 = errors;
if(typeof key5 === "string"){
if(!pattern22.test(key5)){
const err22 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\"",propertyName:key5};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var valid6 = _errs34 === errors;
if(!valid6){
const err23 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames",keyword:"propertyNames",params:{propertyName: key5},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
for(const key6 in data12){
let data13 = data12[key6];
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.name === undefined){
const err24 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data13.type === undefined){
const err25 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
for(const key7 in data13){
if(!(((((((key7 === "name") || (key7 === "type")) || (key7 === "encrypted")) || (key7 === "component")) || (key7 === "options")) || (key7 === "parameters")) || (key7 === "validation"))){
const err26 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data13.name !== undefined){
let data14 = data13.name;
if(typeof data14 === "string"){
if(!pattern22.test(data14)){
const err27 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data13.type !== undefined){
let data15 = data13.type;
if(typeof data15 !== "string"){
const err29 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(!(((((((((data15 === "boolean") || (data15 === "text")) || (data15 === "number")) || (data15 === "datetime")) || (data15 === "ordinal")) || (data15 === "scalar")) || (data15 === "categorical")) || (data15 === "layout")) || (data15 === "location"))){
const err30 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.codebook.properties.node.additionalProperties.anyOf[0].properties.variables.additionalProperties.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data13.encrypted !== undefined){
if(typeof data13.encrypted !== "boolean"){
const err31 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/encrypted",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/encrypted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data13.component !== undefined){
let data17 = data13.component;
if(typeof data17 !== "string"){
const err32 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!(((((((((((((data17 === "Boolean") || (data17 === "CheckboxGroup")) || (data17 === "Number")) || (data17 === "RadioGroup")) || (data17 === "Text")) || (data17 === "TextArea")) || (data17 === "Toggle")) || (data17 === "ToggleButtonGroup")) || (data17 === "Slider")) || (data17 === "VisualAnalogScale")) || (data17 === "LikertScale")) || (data17 === "DatePicker")) || (data17 === "RelativeDatePicker"))){
const err33 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/enum",keyword:"enum",params:{allowedValues: schema329.properties.codebook.properties.node.additionalProperties.anyOf[0].properties.variables.additionalProperties.properties.component.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data13.options !== undefined){
let data18 = data13.options;
if(Array.isArray(data18)){
const len0 = data18.length;
for(let i0=0; i0<len0; i0++){
let data19 = data18[i0];
const _errs50 = errors;
let valid11 = false;
const _errs51 = errors;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.label === undefined){
const err34 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(data19.value === undefined){
const err35 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
for(const key8 in data19){
if(!(((key8 === "label") || (key8 === "value")) || (key8 === "negative"))){
const err36 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data19.label !== undefined){
if(typeof data19.label !== "string"){
const err37 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/label",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data19.value !== undefined){
let data21 = data19.value;
const _errs57 = errors;
let valid13 = false;
const _errs58 = errors;
if(!(((typeof data21 == "number") && (!(data21 % 1) && !isNaN(data21))) && (isFinite(data21)))){
const err38 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var _valid2 = _errs58 === errors;
valid13 = valid13 || _valid2;
if(!valid13){
const _errs60 = errors;
if(typeof data21 === "string"){
if(!pattern22.test(data21)){
const err39 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var _valid2 = _errs60 === errors;
valid13 = valid13 || _valid2;
if(!valid13){
const _errs62 = errors;
if(typeof data21 !== "boolean"){
const err41 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var _valid2 = _errs62 === errors;
valid13 = valid13 || _valid2;
}
}
if(!valid13){
const err42 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/value",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
else {
errors = _errs57;
if(vErrors !== null){
if(_errs57){
vErrors.length = _errs57;
}
else {
vErrors = null;
}
}
}
}
if(data19.negative !== undefined){
if(typeof data19.negative !== "boolean"){
const err43 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0+"/negative",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/negative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid1 = _errs51 === errors;
valid11 = valid11 || _valid1;
if(!valid11){
const _errs66 = errors;
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err45 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var _valid1 = _errs66 === errors;
valid11 = valid11 || _valid1;
if(!valid11){
const _errs68 = errors;
if(typeof data19 !== "string"){
const err46 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var _valid1 = _errs68 === errors;
valid11 = valid11 || _valid1;
}
}
if(!valid11){
const err47 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i0,schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
else {
errors = _errs50;
if(vErrors !== null){
if(_errs50){
vErrors.length = _errs50;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err48 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/options",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data13.parameters !== undefined){
let data23 = data13.parameters;
if(data23 && typeof data23 == "object" && !Array.isArray(data23)){
}
else {
const err49 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/parameters",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data13.validation !== undefined){
let data24 = data13.validation;
if(data24 && typeof data24 == "object" && !Array.isArray(data24)){
for(const key9 in data24){
if(!(func2.call(schema329.properties.codebook.properties.node.additionalProperties.anyOf[0].properties.variables.additionalProperties.properties.validation.properties, key9))){
const err50 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data24.required !== undefined){
if(typeof data24.required !== "boolean"){
const err51 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/required",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data24.requiredAcceptsNull !== undefined){
if(typeof data24.requiredAcceptsNull !== "boolean"){
const err52 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/requiredAcceptsNull",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/requiredAcceptsNull/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data24.minLength !== undefined){
let data27 = data24.minLength;
if(!(((typeof data27 == "number") && (!(data27 % 1) && !isNaN(data27))) && (isFinite(data27)))){
const err53 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minLength",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data24.maxLength !== undefined){
let data28 = data24.maxLength;
if(!(((typeof data28 == "number") && (!(data28 % 1) && !isNaN(data28))) && (isFinite(data28)))){
const err54 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxLength",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data24.minValue !== undefined){
let data29 = data24.minValue;
if(!(((typeof data29 == "number") && (!(data29 % 1) && !isNaN(data29))) && (isFinite(data29)))){
const err55 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minValue",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data24.maxValue !== undefined){
let data30 = data24.maxValue;
if(!(((typeof data30 == "number") && (!(data30 % 1) && !isNaN(data30))) && (isFinite(data30)))){
const err56 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxValue",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data24.minSelected !== undefined){
let data31 = data24.minSelected;
if(!(((typeof data31 == "number") && (!(data31 % 1) && !isNaN(data31))) && (isFinite(data31)))){
const err57 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minSelected",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data24.maxSelected !== undefined){
let data32 = data24.maxSelected;
if(!(((typeof data32 == "number") && (!(data32 % 1) && !isNaN(data32))) && (isFinite(data32)))){
const err58 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxSelected",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data24.unique !== undefined){
if(typeof data24.unique !== "boolean"){
const err59 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/unique",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/unique/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data24.differentFrom !== undefined){
if(typeof data24.differentFrom !== "string"){
const err60 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/differentFrom",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/differentFrom/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data24.sameAs !== undefined){
if(typeof data24.sameAs !== "string"){
const err61 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/sameAs",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/sameAs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data24.greaterThanVariable !== undefined){
if(typeof data24.greaterThanVariable !== "string"){
const err62 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/greaterThanVariable",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/greaterThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data24.lessThanVariable !== undefined){
if(typeof data24.lessThanVariable !== "string"){
const err63 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/lessThanVariable",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/lessThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
}
else {
const err64 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err65 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
else {
const err66 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data8.color !== undefined){
if(typeof data8.color !== "string"){
const err67 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1")+"/color",schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
}
else {
const err68 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
var _valid0 = _errs23 === errors;
valid4 = valid4 || _valid0;
if(!valid4){
const _errs104 = errors;
const err69 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf/1/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
var _valid0 = _errs104 === errors;
valid4 = valid4 || _valid0;
}
if(!valid4){
const err70 = {instancePath:instancePath+"/codebook/node/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/node/additionalProperties/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
else {
errors = _errs22;
if(vErrors !== null){
if(_errs22){
vErrors.length = _errs22;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err71 = {instancePath:instancePath+"/codebook/node",schemaPath:"#/properties/codebook/properties/node/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data6.edge !== undefined){
let data39 = data6.edge;
if(data39 && typeof data39 == "object" && !Array.isArray(data39)){
for(const key10 in data39){
let data40 = data39[key10];
const _errs110 = errors;
let valid16 = false;
const _errs111 = errors;
if(data40 && typeof data40 == "object" && !Array.isArray(data40)){
if(data40.name === undefined){
const err72 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if(data40.color === undefined){
const err73 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "color"},message:"must have required property '"+"color"+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data40.variables === undefined){
const err74 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "variables"},message:"must have required property '"+"variables"+"'"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
for(const key11 in data40){
if(!(((key11 === "name") || (key11 === "color")) || (key11 === "variables"))){
const err75 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data40.name !== undefined){
if(typeof data40.name !== "string"){
const err76 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data40.color !== undefined){
if(typeof data40.color !== "string"){
const err77 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/color",schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data40.variables !== undefined){
let data43 = data40.variables;
if(data43 && typeof data43 == "object" && !Array.isArray(data43)){
for(const key12 in data43){
const _errs121 = errors;
if(typeof key12 === "string"){
if(!pattern22.test(key12)){
const err78 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\"",propertyName:key12};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
var valid19 = _errs121 === errors;
if(!valid19){
const err79 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames",keyword:"propertyNames",params:{propertyName: key12},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
for(const key13 in data43){
let data44 = data43[key13];
if(data44 && typeof data44 == "object" && !Array.isArray(data44)){
if(data44.name === undefined){
const err80 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
if(data44.type === undefined){
const err81 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
for(const key14 in data44){
if(!(((((((key14 === "name") || (key14 === "type")) || (key14 === "encrypted")) || (key14 === "component")) || (key14 === "options")) || (key14 === "parameters")) || (key14 === "validation"))){
const err82 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
if(data44.name !== undefined){
let data45 = data44.name;
if(typeof data45 === "string"){
if(!pattern22.test(data45)){
const err83 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
else {
const err84 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data44.type !== undefined){
let data46 = data44.type;
if(typeof data46 !== "string"){
const err85 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(!(((((((((data46 === "boolean") || (data46 === "text")) || (data46 === "number")) || (data46 === "datetime")) || (data46 === "ordinal")) || (data46 === "scalar")) || (data46 === "categorical")) || (data46 === "layout")) || (data46 === "location"))){
const err86 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data44.encrypted !== undefined){
if(typeof data44.encrypted !== "boolean"){
const err87 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/encrypted",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/encrypted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data44.component !== undefined){
let data48 = data44.component;
if(typeof data48 !== "string"){
const err88 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(!(((((((((((((data48 === "Boolean") || (data48 === "CheckboxGroup")) || (data48 === "Number")) || (data48 === "RadioGroup")) || (data48 === "Text")) || (data48 === "TextArea")) || (data48 === "Toggle")) || (data48 === "ToggleButtonGroup")) || (data48 === "Slider")) || (data48 === "VisualAnalogScale")) || (data48 === "LikertScale")) || (data48 === "DatePicker")) || (data48 === "RelativeDatePicker"))){
const err89 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.component.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data44.options !== undefined){
let data49 = data44.options;
if(Array.isArray(data49)){
const len1 = data49.length;
for(let i1=0; i1<len1; i1++){
let data50 = data49[i1];
const _errs137 = errors;
let valid24 = false;
const _errs138 = errors;
if(data50 && typeof data50 == "object" && !Array.isArray(data50)){
if(data50.label === undefined){
const err90 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
if(data50.value === undefined){
const err91 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
for(const key15 in data50){
if(!(((key15 === "label") || (key15 === "value")) || (key15 === "negative"))){
const err92 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data50.label !== undefined){
if(typeof data50.label !== "string"){
const err93 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/label",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data50.value !== undefined){
let data52 = data50.value;
const _errs144 = errors;
let valid26 = false;
const _errs145 = errors;
if(!(((typeof data52 == "number") && (!(data52 % 1) && !isNaN(data52))) && (isFinite(data52)))){
const err94 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var _valid5 = _errs145 === errors;
valid26 = valid26 || _valid5;
if(!valid26){
const _errs147 = errors;
if(typeof data52 === "string"){
if(!pattern22.test(data52)){
const err95 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
else {
const err96 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
var _valid5 = _errs147 === errors;
valid26 = valid26 || _valid5;
if(!valid26){
const _errs149 = errors;
if(typeof data52 !== "boolean"){
const err97 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var _valid5 = _errs149 === errors;
valid26 = valid26 || _valid5;
}
}
if(!valid26){
const err98 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
else {
errors = _errs144;
if(vErrors !== null){
if(_errs144){
vErrors.length = _errs144;
}
else {
vErrors = null;
}
}
}
}
if(data50.negative !== undefined){
if(typeof data50.negative !== "boolean"){
const err99 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1+"/negative",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/negative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
else {
const err100 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var _valid4 = _errs138 === errors;
valid24 = valid24 || _valid4;
if(!valid24){
const _errs153 = errors;
if(!(((typeof data50 == "number") && (!(data50 % 1) && !isNaN(data50))) && (isFinite(data50)))){
const err101 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
var _valid4 = _errs153 === errors;
valid24 = valid24 || _valid4;
if(!valid24){
const _errs155 = errors;
if(typeof data50 !== "string"){
const err102 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
var _valid4 = _errs155 === errors;
valid24 = valid24 || _valid4;
}
}
if(!valid24){
const err103 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i1,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
else {
errors = _errs137;
if(vErrors !== null){
if(_errs137){
vErrors.length = _errs137;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err104 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/options",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data44.parameters !== undefined){
let data54 = data44.parameters;
if(data54 && typeof data54 == "object" && !Array.isArray(data54)){
}
else {
const err105 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/parameters",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
if(data44.validation !== undefined){
let data55 = data44.validation;
if(data55 && typeof data55 == "object" && !Array.isArray(data55)){
for(const key16 in data55){
if(!(func2.call(schema330.additionalProperties.properties.validation.properties, key16))){
const err106 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
if(data55.required !== undefined){
if(typeof data55.required !== "boolean"){
const err107 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/required",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
if(data55.requiredAcceptsNull !== undefined){
if(typeof data55.requiredAcceptsNull !== "boolean"){
const err108 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/requiredAcceptsNull",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/requiredAcceptsNull/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data55.minLength !== undefined){
let data58 = data55.minLength;
if(!(((typeof data58 == "number") && (!(data58 % 1) && !isNaN(data58))) && (isFinite(data58)))){
const err109 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
if(data55.maxLength !== undefined){
let data59 = data55.maxLength;
if(!(((typeof data59 == "number") && (!(data59 % 1) && !isNaN(data59))) && (isFinite(data59)))){
const err110 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
if(data55.minValue !== undefined){
let data60 = data55.minValue;
if(!(((typeof data60 == "number") && (!(data60 % 1) && !isNaN(data60))) && (isFinite(data60)))){
const err111 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
if(data55.maxValue !== undefined){
let data61 = data55.maxValue;
if(!(((typeof data61 == "number") && (!(data61 % 1) && !isNaN(data61))) && (isFinite(data61)))){
const err112 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
if(data55.minSelected !== undefined){
let data62 = data55.minSelected;
if(!(((typeof data62 == "number") && (!(data62 % 1) && !isNaN(data62))) && (isFinite(data62)))){
const err113 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
if(data55.maxSelected !== undefined){
let data63 = data55.maxSelected;
if(!(((typeof data63 == "number") && (!(data63 % 1) && !isNaN(data63))) && (isFinite(data63)))){
const err114 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
if(data55.unique !== undefined){
if(typeof data55.unique !== "boolean"){
const err115 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/unique",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/unique/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
if(data55.differentFrom !== undefined){
if(typeof data55.differentFrom !== "string"){
const err116 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/differentFrom",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/differentFrom/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data55.sameAs !== undefined){
if(typeof data55.sameAs !== "string"){
const err117 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/sameAs",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/sameAs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
if(data55.greaterThanVariable !== undefined){
if(typeof data55.greaterThanVariable !== "string"){
const err118 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/greaterThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/greaterThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
if(data55.lessThanVariable !== undefined){
if(typeof data55.lessThanVariable !== "string"){
const err119 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/lessThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/lessThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err120 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
}
}
else {
const err121 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
}
}
else {
const err122 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1")+"/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
}
else {
const err123 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
var _valid3 = _errs111 === errors;
valid16 = valid16 || _valid3;
if(!valid16){
const _errs189 = errors;
const err124 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf/1/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
var _valid3 = _errs189 === errors;
valid16 = valid16 || _valid3;
}
if(!valid16){
const err125 = {instancePath:instancePath+"/codebook/edge/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/codebook/properties/edge/additionalProperties/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
else {
errors = _errs110;
if(vErrors !== null){
if(_errs110){
vErrors.length = _errs110;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err126 = {instancePath:instancePath+"/codebook/edge",schemaPath:"#/properties/codebook/properties/edge/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
if(data6.ego !== undefined){
let data69 = data6.ego;
if(data69 && typeof data69 == "object" && !Array.isArray(data69)){
if(data69.variables === undefined){
const err127 = {instancePath:instancePath+"/codebook/ego",schemaPath:"#/properties/codebook/properties/ego/required",keyword:"required",params:{missingProperty: "variables"},message:"must have required property '"+"variables"+"'"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
for(const key17 in data69){
if(!(key17 === "variables")){
const err128 = {instancePath:instancePath+"/codebook/ego",schemaPath:"#/properties/codebook/properties/ego/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
if(data69.variables !== undefined){
let data70 = data69.variables;
if(data70 && typeof data70 == "object" && !Array.isArray(data70)){
for(const key18 in data70){
const _errs197 = errors;
if(typeof key18 === "string"){
if(!pattern22.test(key18)){
const err129 = {instancePath:instancePath+"/codebook/ego/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\"",propertyName:key18};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
var valid30 = _errs197 === errors;
if(!valid30){
const err130 = {instancePath:instancePath+"/codebook/ego/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/propertyNames",keyword:"propertyNames",params:{propertyName: key18},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
for(const key19 in data70){
let data71 = data70[key19];
if(data71 && typeof data71 == "object" && !Array.isArray(data71)){
if(data71.name === undefined){
const err131 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if(data71.type === undefined){
const err132 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
for(const key20 in data71){
if(!(((((((key20 === "name") || (key20 === "type")) || (key20 === "encrypted")) || (key20 === "component")) || (key20 === "options")) || (key20 === "parameters")) || (key20 === "validation"))){
const err133 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
if(data71.name !== undefined){
let data72 = data71.name;
if(typeof data72 === "string"){
if(!pattern22.test(data72)){
const err134 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
else {
const err135 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
if(data71.type !== undefined){
let data73 = data71.type;
if(typeof data73 !== "string"){
const err136 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
if(!(((((((((data73 === "boolean") || (data73 === "text")) || (data73 === "number")) || (data73 === "datetime")) || (data73 === "ordinal")) || (data73 === "scalar")) || (data73 === "categorical")) || (data73 === "layout")) || (data73 === "location"))){
const err137 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/type/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
if(data71.encrypted !== undefined){
if(typeof data71.encrypted !== "boolean"){
const err138 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/encrypted",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/encrypted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
if(data71.component !== undefined){
let data75 = data71.component;
if(typeof data75 !== "string"){
const err139 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
if(!(((((((((((((data75 === "Boolean") || (data75 === "CheckboxGroup")) || (data75 === "Number")) || (data75 === "RadioGroup")) || (data75 === "Text")) || (data75 === "TextArea")) || (data75 === "Toggle")) || (data75 === "ToggleButtonGroup")) || (data75 === "Slider")) || (data75 === "VisualAnalogScale")) || (data75 === "LikertScale")) || (data75 === "DatePicker")) || (data75 === "RelativeDatePicker"))){
const err140 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/component",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/component/enum",keyword:"enum",params:{allowedValues: schema330.additionalProperties.properties.component.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
if(data71.options !== undefined){
let data76 = data71.options;
if(Array.isArray(data76)){
const len2 = data76.length;
for(let i2=0; i2<len2; i2++){
let data77 = data76[i2];
const _errs213 = errors;
let valid35 = false;
const _errs214 = errors;
if(data77 && typeof data77 == "object" && !Array.isArray(data77)){
if(data77.label === undefined){
const err141 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
if(data77.value === undefined){
const err142 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
for(const key21 in data77){
if(!(((key21 === "label") || (key21 === "value")) || (key21 === "negative"))){
const err143 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
if(data77.label !== undefined){
if(typeof data77.label !== "string"){
const err144 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/label",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
if(data77.value !== undefined){
let data79 = data77.value;
const _errs220 = errors;
let valid37 = false;
const _errs221 = errors;
if(!(((typeof data79 == "number") && (!(data79 % 1) && !isNaN(data79))) && (isFinite(data79)))){
const err145 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
var _valid7 = _errs221 === errors;
valid37 = valid37 || _valid7;
if(!valid37){
const _errs223 = errors;
if(typeof data79 === "string"){
if(!pattern22.test(data79)){
const err146 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/pattern",keyword:"pattern",params:{pattern: "^[a-zA-Z0-9._:-]+$"},message:"must match pattern \""+"^[a-zA-Z0-9._:-]+$"+"\""};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
}
else {
const err147 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var _valid7 = _errs223 === errors;
valid37 = valid37 || _valid7;
if(!valid37){
const _errs225 = errors;
if(typeof data79 !== "boolean"){
const err148 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
var _valid7 = _errs225 === errors;
valid37 = valid37 || _valid7;
}
}
if(!valid37){
const err149 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/value",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
else {
errors = _errs220;
if(vErrors !== null){
if(_errs220){
vErrors.length = _errs220;
}
else {
vErrors = null;
}
}
}
}
if(data77.negative !== undefined){
if(typeof data77.negative !== "boolean"){
const err150 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2+"/negative",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/properties/negative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
}
}
else {
const err151 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
var _valid6 = _errs214 === errors;
valid35 = valid35 || _valid6;
if(!valid35){
const _errs229 = errors;
if(!(((typeof data77 == "number") && (!(data77 % 1) && !isNaN(data77))) && (isFinite(data77)))){
const err152 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
var _valid6 = _errs229 === errors;
valid35 = valid35 || _valid6;
if(!valid35){
const _errs231 = errors;
if(typeof data77 !== "string"){
const err153 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
var _valid6 = _errs231 === errors;
valid35 = valid35 || _valid6;
}
}
if(!valid35){
const err154 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options/" + i2,schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
else {
errors = _errs213;
if(vErrors !== null){
if(_errs213){
vErrors.length = _errs213;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err155 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/options",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
if(data71.parameters !== undefined){
let data81 = data71.parameters;
if(data81 && typeof data81 == "object" && !Array.isArray(data81)){
}
else {
const err156 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/parameters",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
}
if(data71.validation !== undefined){
let data82 = data71.validation;
if(data82 && typeof data82 == "object" && !Array.isArray(data82)){
for(const key22 in data82){
if(!(func2.call(schema330.additionalProperties.properties.validation.properties, key22))){
const err157 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
if(data82.required !== undefined){
if(typeof data82.required !== "boolean"){
const err158 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/required",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
if(data82.requiredAcceptsNull !== undefined){
if(typeof data82.requiredAcceptsNull !== "boolean"){
const err159 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/requiredAcceptsNull",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/requiredAcceptsNull/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
}
if(data82.minLength !== undefined){
let data85 = data82.minLength;
if(!(((typeof data85 == "number") && (!(data85 % 1) && !isNaN(data85))) && (isFinite(data85)))){
const err160 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
}
if(data82.maxLength !== undefined){
let data86 = data82.maxLength;
if(!(((typeof data86 == "number") && (!(data86 % 1) && !isNaN(data86))) && (isFinite(data86)))){
const err161 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxLength",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
}
if(data82.minValue !== undefined){
let data87 = data82.minValue;
if(!(((typeof data87 == "number") && (!(data87 % 1) && !isNaN(data87))) && (isFinite(data87)))){
const err162 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
if(data82.maxValue !== undefined){
let data88 = data82.maxValue;
if(!(((typeof data88 == "number") && (!(data88 % 1) && !isNaN(data88))) && (isFinite(data88)))){
const err163 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxValue",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxValue/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
}
if(data82.minSelected !== undefined){
let data89 = data82.minSelected;
if(!(((typeof data89 == "number") && (!(data89 % 1) && !isNaN(data89))) && (isFinite(data89)))){
const err164 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/minSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/minSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
if(data82.maxSelected !== undefined){
let data90 = data82.maxSelected;
if(!(((typeof data90 == "number") && (!(data90 % 1) && !isNaN(data90))) && (isFinite(data90)))){
const err165 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/maxSelected",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/maxSelected/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
if(data82.unique !== undefined){
if(typeof data82.unique !== "boolean"){
const err166 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/unique",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/unique/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
}
if(data82.differentFrom !== undefined){
if(typeof data82.differentFrom !== "string"){
const err167 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/differentFrom",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/differentFrom/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
}
if(data82.sameAs !== undefined){
if(typeof data82.sameAs !== "string"){
const err168 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/sameAs",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/sameAs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
}
if(data82.greaterThanVariable !== undefined){
if(typeof data82.greaterThanVariable !== "string"){
const err169 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/greaterThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/greaterThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
if(data82.lessThanVariable !== undefined){
if(typeof data82.lessThanVariable !== "string"){
const err170 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation/lessThanVariable",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/properties/lessThanVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err171 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1")+"/validation",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err172 = {instancePath:instancePath+"/codebook/ego/variables/" + key19.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/additionalProperties/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
}
}
else {
const err173 = {instancePath:instancePath+"/codebook/ego/variables",schemaPath:"#/definitions/Protocol/properties/codebook/properties/node/additionalProperties/anyOf/0/properties/variables/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
}
}
else {
const err174 = {instancePath:instancePath+"/codebook/ego",schemaPath:"#/properties/codebook/properties/ego/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
}
}
else {
const err175 = {instancePath:instancePath+"/codebook",schemaPath:"#/properties/codebook/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
}
if(data.assetManifest !== undefined){
let data96 = data.assetManifest;
if(data96 && typeof data96 == "object" && !Array.isArray(data96)){
for(const key23 in data96){
let data97 = data96[key23];
const _errs269 = errors;
let valid40 = false;
const _errs270 = errors;
if(data97 && typeof data97 == "object" && !Array.isArray(data97)){
if(data97.id === undefined){
const err176 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
if(data97.type === undefined){
const err177 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
if(data97.name === undefined){
const err178 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
if(data97.source === undefined){
const err179 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
for(const key24 in data97){
if(!((((key24 === "id") || (key24 === "type")) || (key24 === "name")) || (key24 === "source"))){
const err180 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
if(data97.id !== undefined){
if(typeof data97.id !== "string"){
const err181 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/id",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
if(data97.type !== undefined){
let data99 = data97.type;
if(typeof data99 !== "string"){
const err182 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
if(!((((data99 === "image") || (data99 === "video")) || (data99 === "network")) || (data99 === "geojson"))){
const err183 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.assetManifest.additionalProperties.anyOf[0].properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
if(data97.name !== undefined){
if(typeof data97.name !== "string"){
const err184 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
}
if(data97.source !== undefined){
if(typeof data97.source !== "string"){
const err185 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/source",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
}
}
}
else {
const err186 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
var _valid8 = _errs270 === errors;
valid40 = valid40 || _valid8;
if(!valid40){
const _errs281 = errors;
if(data97 && typeof data97 == "object" && !Array.isArray(data97)){
if(data97.id === undefined){
const err187 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
if(data97.type === undefined){
const err188 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
if(data97.name === undefined){
const err189 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
if(data97.value === undefined){
const err190 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
for(const key25 in data97){
if(!((((key25 === "id") || (key25 === "type")) || (key25 === "name")) || (key25 === "value"))){
const err191 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
}
if(data97.id !== undefined){
if(typeof data97.id !== "string"){
const err192 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/id",schemaPath:"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
}
if(data97.type !== undefined){
let data103 = data97.type;
if(typeof data103 !== "string"){
const err193 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
if(!(data103 === "apikey")){
const err194 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/type",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.assetManifest.additionalProperties.anyOf[1].properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
}
if(data97.name !== undefined){
if(typeof data97.name !== "string"){
const err195 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/name",schemaPath:"#/definitions/Protocol/properties/assetManifest/additionalProperties/anyOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
if(data97.value !== undefined){
if(typeof data97.value !== "string"){
const err196 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1")+"/value",schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
}
}
else {
const err197 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
}
var _valid8 = _errs281 === errors;
valid40 = valid40 || _valid8;
}
if(!valid40){
const err198 = {instancePath:instancePath+"/assetManifest/" + key23.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/assetManifest/additionalProperties/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
else {
errors = _errs269;
if(vErrors !== null){
if(_errs269){
vErrors.length = _errs269;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err199 = {instancePath:instancePath+"/assetManifest",schemaPath:"#/properties/assetManifest/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
}
if(data.stages !== undefined){
let data106 = data.stages;
if(Array.isArray(data106)){
const len3 = data106.length;
for(let i3=0; i3<len3; i3++){
let data107 = data106[i3];
const _errs297 = errors;
let valid47 = false;
const _errs298 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err200 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
if(data107.label === undefined){
const err201 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
if(data107.type === undefined){
const err202 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
if(data107.form === undefined){
const err203 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
for(const key26 in data107){
if(!((((((((key26 === "id") || (key26 === "interviewScript")) || (key26 === "label")) || (key26 === "filter")) || (key26 === "skipLogic")) || (key26 === "introductionPanel")) || (key26 === "type")) || (key26 === "form"))){
const err204 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err205 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err206 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err207 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err207];
}
else {
vErrors.push(err207);
}
errors++;
}
}
if(data107.filter !== undefined){
let data111 = data107.filter;
const _errs308 = errors;
let valid49 = false;
const _errs309 = errors;
const _errs310 = errors;
let valid50 = false;
const _errs311 = errors;
const err208 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err208];
}
else {
vErrors.push(err208);
}
errors++;
var _valid11 = _errs311 === errors;
valid50 = valid50 || _valid11;
if(!valid50){
const _errs313 = errors;
if(data111 && typeof data111 == "object" && !Array.isArray(data111)){
for(const key27 in data111){
if(!((key27 === "join") || (key27 === "rules"))){
const err209 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key27},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err209];
}
else {
vErrors.push(err209);
}
errors++;
}
}
if(data111.join !== undefined){
let data112 = data111.join;
if(typeof data112 !== "string"){
const err210 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err210];
}
else {
vErrors.push(err210);
}
errors++;
}
if(!((data112 === "OR") || (data112 === "AND"))){
const err211 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.filter.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err211];
}
else {
vErrors.push(err211);
}
errors++;
}
}
if(data111.rules !== undefined){
let data113 = data111.rules;
if(Array.isArray(data113)){
const len4 = data113.length;
for(let i4=0; i4<len4; i4++){
let data114 = data113[i4];
if(data114 && typeof data114 == "object" && !Array.isArray(data114)){
if(data114.type === undefined){
const err212 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err212];
}
else {
vErrors.push(err212);
}
errors++;
}
if(data114.id === undefined){
const err213 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err213];
}
else {
vErrors.push(err213);
}
errors++;
}
if(data114.options === undefined){
const err214 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err214];
}
else {
vErrors.push(err214);
}
errors++;
}
for(const key28 in data114){
if(!(((key28 === "type") || (key28 === "id")) || (key28 === "options"))){
const err215 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key28},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err215];
}
else {
vErrors.push(err215);
}
errors++;
}
}
if(data114.type !== undefined){
let data115 = data114.type;
if(typeof data115 !== "string"){
const err216 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err216];
}
else {
vErrors.push(err216);
}
errors++;
}
if(!(((data115 === "alter") || (data115 === "ego")) || (data115 === "edge"))){
const err217 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.filter.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err217];
}
else {
vErrors.push(err217);
}
errors++;
}
}
if(data114.id !== undefined){
if(typeof data114.id !== "string"){
const err218 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/id",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err218];
}
else {
vErrors.push(err218);
}
errors++;
}
}
if(data114.options !== undefined){
let data117 = data114.options;
if(data117 && typeof data117 == "object" && !Array.isArray(data117)){
if(data117.operator === undefined){
const err219 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err219];
}
else {
vErrors.push(err219);
}
errors++;
}
if(data117.type !== undefined){
if(typeof data117.type !== "string"){
const err220 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err220];
}
else {
vErrors.push(err220);
}
errors++;
}
}
if(data117.attribute !== undefined){
if(typeof data117.attribute !== "string"){
const err221 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/attribute",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err221];
}
else {
vErrors.push(err221);
}
errors++;
}
}
if(data117.operator !== undefined){
let data120 = data117.operator;
if(typeof data120 !== "string"){
const err222 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/operator",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err222];
}
else {
vErrors.push(err222);
}
errors++;
}
if(!((((((((((((((((data120 === "EXISTS") || (data120 === "NOT_EXISTS")) || (data120 === "EXACTLY")) || (data120 === "NOT")) || (data120 === "GREATER_THAN")) || (data120 === "GREATER_THAN_OR_EQUAL")) || (data120 === "LESS_THAN")) || (data120 === "LESS_THAN_OR_EQUAL")) || (data120 === "INCLUDES")) || (data120 === "EXCLUDES")) || (data120 === "OPTIONS_GREATER_THAN")) || (data120 === "OPTIONS_LESS_THAN")) || (data120 === "OPTIONS_EQUALS")) || (data120 === "OPTIONS_NOT_EQUALS")) || (data120 === "CONTAINS")) || (data120 === "DOES NOT CONTAIN"))){
const err223 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/operator",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.filter.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err223];
}
else {
vErrors.push(err223);
}
errors++;
}
}
if(data117.value !== undefined){
let data121 = data117.value;
const _errs337 = errors;
let valid57 = false;
const _errs338 = errors;
if(!(((typeof data121 == "number") && (!(data121 % 1) && !isNaN(data121))) && (isFinite(data121)))){
const err224 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err224];
}
else {
vErrors.push(err224);
}
errors++;
}
var _valid12 = _errs338 === errors;
valid57 = valid57 || _valid12;
if(!valid57){
const _errs340 = errors;
if(typeof data121 !== "string"){
const err225 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err225];
}
else {
vErrors.push(err225);
}
errors++;
}
var _valid12 = _errs340 === errors;
valid57 = valid57 || _valid12;
if(!valid57){
const _errs342 = errors;
if(typeof data121 !== "boolean"){
const err226 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err226];
}
else {
vErrors.push(err226);
}
errors++;
}
var _valid12 = _errs342 === errors;
valid57 = valid57 || _valid12;
if(!valid57){
const _errs344 = errors;
if(!(Array.isArray(data121))){
const err227 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err227];
}
else {
vErrors.push(err227);
}
errors++;
}
var _valid12 = _errs344 === errors;
valid57 = valid57 || _valid12;
}
}
}
if(!valid57){
const err228 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options/value",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err228];
}
else {
vErrors.push(err228);
}
errors++;
}
else {
errors = _errs337;
if(vErrors !== null){
if(_errs337){
vErrors.length = _errs337;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err229 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4+"/options",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err229];
}
else {
vErrors.push(err229);
}
errors++;
}
}
}
else {
const err230 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i4,schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err230];
}
else {
vErrors.push(err230);
}
errors++;
}
}
}
else {
const err231 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err231];
}
else {
vErrors.push(err231);
}
errors++;
}
}
}
else {
const err232 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err232];
}
else {
vErrors.push(err232);
}
errors++;
}
var _valid11 = _errs313 === errors;
valid50 = valid50 || _valid11;
}
if(!valid50){
const err233 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err233];
}
else {
vErrors.push(err233);
}
errors++;
}
else {
errors = _errs310;
if(vErrors !== null){
if(_errs310){
vErrors.length = _errs310;
}
else {
vErrors = null;
}
}
}
var _valid10 = _errs309 === errors;
valid49 = valid49 || _valid10;
if(!valid49){
const _errs346 = errors;
if(data111 !== null){
const err234 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err234];
}
else {
vErrors.push(err234);
}
errors++;
}
var _valid10 = _errs346 === errors;
valid49 = valid49 || _valid10;
}
if(!valid49){
const err235 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err235];
}
else {
vErrors.push(err235);
}
errors++;
}
else {
errors = _errs308;
if(vErrors !== null){
if(_errs308){
vErrors.length = _errs308;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
let data122 = data107.skipLogic;
if(data122 && typeof data122 == "object" && !Array.isArray(data122)){
if(data122.action === undefined){
const err236 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err236];
}
else {
vErrors.push(err236);
}
errors++;
}
for(const key29 in data122){
if(!((key29 === "action") || (key29 === "filter"))){
const err237 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key29},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err237];
}
else {
vErrors.push(err237);
}
errors++;
}
}
if(data122.action !== undefined){
let data123 = data122.action;
if(typeof data123 !== "string"){
const err238 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/action",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err238];
}
else {
vErrors.push(err238);
}
errors++;
}
if(!((data123 === "SHOW") || (data123 === "SKIP"))){
const err239 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/action",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/action/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[0].properties.skipLogic.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err239];
}
else {
vErrors.push(err239);
}
errors++;
}
}
if(data122.filter !== undefined){
let data124 = data122.filter;
const _errs354 = errors;
let valid59 = false;
const _errs355 = errors;
const _errs357 = errors;
let valid61 = false;
const _errs358 = errors;
const err240 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err240];
}
else {
vErrors.push(err240);
}
errors++;
var _valid14 = _errs358 === errors;
valid61 = valid61 || _valid14;
if(!valid61){
const _errs360 = errors;
if(data124 && typeof data124 == "object" && !Array.isArray(data124)){
for(const key30 in data124){
if(!((key30 === "join") || (key30 === "rules"))){
const err241 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key30},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err241];
}
else {
vErrors.push(err241);
}
errors++;
}
}
if(data124.join !== undefined){
let data125 = data124.join;
if(typeof data125 !== "string"){
const err242 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err242];
}
else {
vErrors.push(err242);
}
errors++;
}
if(!((data125 === "OR") || (data125 === "AND"))){
const err243 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err243];
}
else {
vErrors.push(err243);
}
errors++;
}
}
if(data124.rules !== undefined){
let data126 = data124.rules;
if(Array.isArray(data126)){
const len5 = data126.length;
for(let i5=0; i5<len5; i5++){
let data127 = data126[i5];
if(data127 && typeof data127 == "object" && !Array.isArray(data127)){
if(data127.type === undefined){
const err244 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err244];
}
else {
vErrors.push(err244);
}
errors++;
}
if(data127.id === undefined){
const err245 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err245];
}
else {
vErrors.push(err245);
}
errors++;
}
if(data127.options === undefined){
const err246 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err246];
}
else {
vErrors.push(err246);
}
errors++;
}
for(const key31 in data127){
if(!(((key31 === "type") || (key31 === "id")) || (key31 === "options"))){
const err247 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key31},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err247];
}
else {
vErrors.push(err247);
}
errors++;
}
}
if(data127.type !== undefined){
let data128 = data127.type;
if(typeof data128 !== "string"){
const err248 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err248];
}
else {
vErrors.push(err248);
}
errors++;
}
if(!(((data128 === "alter") || (data128 === "ego")) || (data128 === "edge"))){
const err249 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err249];
}
else {
vErrors.push(err249);
}
errors++;
}
}
if(data127.id !== undefined){
if(typeof data127.id !== "string"){
const err250 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err250];
}
else {
vErrors.push(err250);
}
errors++;
}
}
if(data127.options !== undefined){
let data130 = data127.options;
if(data130 && typeof data130 == "object" && !Array.isArray(data130)){
if(data130.operator === undefined){
const err251 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err251];
}
else {
vErrors.push(err251);
}
errors++;
}
if(data130.type !== undefined){
if(typeof data130.type !== "string"){
const err252 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err252];
}
else {
vErrors.push(err252);
}
errors++;
}
}
if(data130.attribute !== undefined){
if(typeof data130.attribute !== "string"){
const err253 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err253];
}
else {
vErrors.push(err253);
}
errors++;
}
}
if(data130.operator !== undefined){
let data133 = data130.operator;
if(typeof data133 !== "string"){
const err254 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err254];
}
else {
vErrors.push(err254);
}
errors++;
}
if(!((((((((((((((((data133 === "EXISTS") || (data133 === "NOT_EXISTS")) || (data133 === "EXACTLY")) || (data133 === "NOT")) || (data133 === "GREATER_THAN")) || (data133 === "GREATER_THAN_OR_EQUAL")) || (data133 === "LESS_THAN")) || (data133 === "LESS_THAN_OR_EQUAL")) || (data133 === "INCLUDES")) || (data133 === "EXCLUDES")) || (data133 === "OPTIONS_GREATER_THAN")) || (data133 === "OPTIONS_LESS_THAN")) || (data133 === "OPTIONS_EQUALS")) || (data133 === "OPTIONS_NOT_EQUALS")) || (data133 === "CONTAINS")) || (data133 === "DOES NOT CONTAIN"))){
const err255 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err255];
}
else {
vErrors.push(err255);
}
errors++;
}
}
if(data130.value !== undefined){
let data134 = data130.value;
const _errs384 = errors;
let valid68 = false;
const _errs385 = errors;
if(!(((typeof data134 == "number") && (!(data134 % 1) && !isNaN(data134))) && (isFinite(data134)))){
const err256 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err256];
}
else {
vErrors.push(err256);
}
errors++;
}
var _valid15 = _errs385 === errors;
valid68 = valid68 || _valid15;
if(!valid68){
const _errs387 = errors;
if(typeof data134 !== "string"){
const err257 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err257];
}
else {
vErrors.push(err257);
}
errors++;
}
var _valid15 = _errs387 === errors;
valid68 = valid68 || _valid15;
if(!valid68){
const _errs389 = errors;
if(typeof data134 !== "boolean"){
const err258 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err258];
}
else {
vErrors.push(err258);
}
errors++;
}
var _valid15 = _errs389 === errors;
valid68 = valid68 || _valid15;
if(!valid68){
const _errs391 = errors;
if(!(Array.isArray(data134))){
const err259 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err259];
}
else {
vErrors.push(err259);
}
errors++;
}
var _valid15 = _errs391 === errors;
valid68 = valid68 || _valid15;
}
}
}
if(!valid68){
const err260 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err260];
}
else {
vErrors.push(err260);
}
errors++;
}
else {
errors = _errs384;
if(vErrors !== null){
if(_errs384){
vErrors.length = _errs384;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err261 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err261];
}
else {
vErrors.push(err261);
}
errors++;
}
}
}
else {
const err262 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules/" + i5,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err262];
}
else {
vErrors.push(err262);
}
errors++;
}
}
}
else {
const err263 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err263];
}
else {
vErrors.push(err263);
}
errors++;
}
}
}
else {
const err264 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err264];
}
else {
vErrors.push(err264);
}
errors++;
}
var _valid14 = _errs360 === errors;
valid61 = valid61 || _valid14;
}
if(!valid61){
const err265 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err265];
}
else {
vErrors.push(err265);
}
errors++;
}
else {
errors = _errs357;
if(vErrors !== null){
if(_errs357){
vErrors.length = _errs357;
}
else {
vErrors = null;
}
}
}
var _valid13 = _errs355 === errors;
valid59 = valid59 || _valid13;
if(!valid59){
const _errs393 = errors;
if(data124 !== null){
const err266 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err266];
}
else {
vErrors.push(err266);
}
errors++;
}
var _valid13 = _errs393 === errors;
valid59 = valid59 || _valid13;
}
if(!valid59){
const err267 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic/filter",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err267];
}
else {
vErrors.push(err267);
}
errors++;
}
else {
errors = _errs354;
if(vErrors !== null){
if(_errs354){
vErrors.length = _errs354;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err268 = {instancePath:instancePath+"/stages/" + i3+"/skipLogic",schemaPath:"#/properties/stages/items/anyOf/0/properties/skipLogic/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err268];
}
else {
vErrors.push(err268);
}
errors++;
}
}
if(data107.introductionPanel !== undefined){
let data135 = data107.introductionPanel;
if(data135 && typeof data135 == "object" && !Array.isArray(data135)){
if(data135.title === undefined){
const err269 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err269];
}
else {
vErrors.push(err269);
}
errors++;
}
if(data135.text === undefined){
const err270 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err270];
}
else {
vErrors.push(err270);
}
errors++;
}
for(const key32 in data135){
if(!((key32 === "title") || (key32 === "text"))){
const err271 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key32},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err271];
}
else {
vErrors.push(err271);
}
errors++;
}
}
if(data135.title !== undefined){
if(typeof data135.title !== "string"){
const err272 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err272];
}
else {
vErrors.push(err272);
}
errors++;
}
}
if(data135.text !== undefined){
if(typeof data135.text !== "string"){
const err273 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err273];
}
else {
vErrors.push(err273);
}
errors++;
}
}
}
else {
const err274 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err274];
}
else {
vErrors.push(err274);
}
errors++;
}
}
if(data107.type !== undefined){
let data138 = data107.type;
if(typeof data138 !== "string"){
const err275 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err275];
}
else {
vErrors.push(err275);
}
errors++;
}
if("EgoForm" !== data138){
const err276 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/0/properties/type/const",keyword:"const",params:{allowedValue: "EgoForm"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err276];
}
else {
vErrors.push(err276);
}
errors++;
}
}
if(data107.form !== undefined){
let data139 = data107.form;
if(data139 && typeof data139 == "object" && !Array.isArray(data139)){
if(data139.fields === undefined){
const err277 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err277];
}
else {
vErrors.push(err277);
}
errors++;
}
for(const key33 in data139){
if(!((key33 === "title") || (key33 === "fields"))){
const err278 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key33},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err278];
}
else {
vErrors.push(err278);
}
errors++;
}
}
if(data139.title !== undefined){
if(typeof data139.title !== "string"){
const err279 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err279];
}
else {
vErrors.push(err279);
}
errors++;
}
}
if(data139.fields !== undefined){
let data141 = data139.fields;
if(Array.isArray(data141)){
const len6 = data141.length;
for(let i6=0; i6<len6; i6++){
let data142 = data141[i6];
if(data142 && typeof data142 == "object" && !Array.isArray(data142)){
if(data142.variable === undefined){
const err280 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err280];
}
else {
vErrors.push(err280);
}
errors++;
}
if(data142.prompt === undefined){
const err281 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err281];
}
else {
vErrors.push(err281);
}
errors++;
}
for(const key34 in data142){
if(!((key34 === "variable") || (key34 === "prompt"))){
const err282 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key34},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err282];
}
else {
vErrors.push(err282);
}
errors++;
}
}
if(data142.variable !== undefined){
if(typeof data142.variable !== "string"){
const err283 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6+"/variable",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err283];
}
else {
vErrors.push(err283);
}
errors++;
}
}
if(data142.prompt !== undefined){
if(typeof data142.prompt !== "string"){
const err284 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6+"/prompt",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err285 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i6,schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err285];
}
else {
vErrors.push(err285);
}
errors++;
}
}
}
else {
const err286 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err286];
}
else {
vErrors.push(err286);
}
errors++;
}
}
}
else {
const err287 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err287];
}
else {
vErrors.push(err287);
}
errors++;
}
}
}
else {
const err288 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err288];
}
else {
vErrors.push(err288);
}
errors++;
}
var _valid9 = _errs298 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs418 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err289 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err289];
}
else {
vErrors.push(err289);
}
errors++;
}
if(data107.label === undefined){
const err290 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err290];
}
else {
vErrors.push(err290);
}
errors++;
}
if(data107.type === undefined){
const err291 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err291];
}
else {
vErrors.push(err291);
}
errors++;
}
if(data107.form === undefined){
const err292 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err292];
}
else {
vErrors.push(err292);
}
errors++;
}
for(const key35 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[1].properties, key35))){
const err293 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key35},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err293];
}
else {
vErrors.push(err293);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err294 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err294];
}
else {
vErrors.push(err294);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err295 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err295];
}
else {
vErrors.push(err295);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err296 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err296];
}
else {
vErrors.push(err296);
}
errors++;
}
}
if(data107.filter !== undefined){
let data148 = data107.filter;
const _errs432 = errors;
let valid79 = false;
const _errs433 = errors;
const _errs434 = errors;
let valid80 = false;
const _errs435 = errors;
const err297 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err297];
}
else {
vErrors.push(err297);
}
errors++;
var _valid17 = _errs435 === errors;
valid80 = valid80 || _valid17;
if(!valid80){
const _errs437 = errors;
if(data148 && typeof data148 == "object" && !Array.isArray(data148)){
for(const key36 in data148){
if(!((key36 === "join") || (key36 === "rules"))){
const err298 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key36},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err298];
}
else {
vErrors.push(err298);
}
errors++;
}
}
if(data148.join !== undefined){
let data149 = data148.join;
if(typeof data149 !== "string"){
const err299 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err299];
}
else {
vErrors.push(err299);
}
errors++;
}
if(!((data149 === "OR") || (data149 === "AND"))){
const err300 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err300];
}
else {
vErrors.push(err300);
}
errors++;
}
}
if(data148.rules !== undefined){
let data150 = data148.rules;
if(Array.isArray(data150)){
const len7 = data150.length;
for(let i7=0; i7<len7; i7++){
let data151 = data150[i7];
if(data151 && typeof data151 == "object" && !Array.isArray(data151)){
if(data151.type === undefined){
const err301 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err301];
}
else {
vErrors.push(err301);
}
errors++;
}
if(data151.id === undefined){
const err302 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err302];
}
else {
vErrors.push(err302);
}
errors++;
}
if(data151.options === undefined){
const err303 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err303];
}
else {
vErrors.push(err303);
}
errors++;
}
for(const key37 in data151){
if(!(((key37 === "type") || (key37 === "id")) || (key37 === "options"))){
const err304 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key37},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err304];
}
else {
vErrors.push(err304);
}
errors++;
}
}
if(data151.type !== undefined){
let data152 = data151.type;
if(typeof data152 !== "string"){
const err305 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err305];
}
else {
vErrors.push(err305);
}
errors++;
}
if(!(((data152 === "alter") || (data152 === "ego")) || (data152 === "edge"))){
const err306 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err306];
}
else {
vErrors.push(err306);
}
errors++;
}
}
if(data151.id !== undefined){
if(typeof data151.id !== "string"){
const err307 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err307];
}
else {
vErrors.push(err307);
}
errors++;
}
}
if(data151.options !== undefined){
let data154 = data151.options;
if(data154 && typeof data154 == "object" && !Array.isArray(data154)){
if(data154.operator === undefined){
const err308 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err308];
}
else {
vErrors.push(err308);
}
errors++;
}
if(data154.type !== undefined){
if(typeof data154.type !== "string"){
const err309 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err309];
}
else {
vErrors.push(err309);
}
errors++;
}
}
if(data154.attribute !== undefined){
if(typeof data154.attribute !== "string"){
const err310 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err310];
}
else {
vErrors.push(err310);
}
errors++;
}
}
if(data154.operator !== undefined){
let data157 = data154.operator;
if(typeof data157 !== "string"){
const err311 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err311];
}
else {
vErrors.push(err311);
}
errors++;
}
if(!((((((((((((((((data157 === "EXISTS") || (data157 === "NOT_EXISTS")) || (data157 === "EXACTLY")) || (data157 === "NOT")) || (data157 === "GREATER_THAN")) || (data157 === "GREATER_THAN_OR_EQUAL")) || (data157 === "LESS_THAN")) || (data157 === "LESS_THAN_OR_EQUAL")) || (data157 === "INCLUDES")) || (data157 === "EXCLUDES")) || (data157 === "OPTIONS_GREATER_THAN")) || (data157 === "OPTIONS_LESS_THAN")) || (data157 === "OPTIONS_EQUALS")) || (data157 === "OPTIONS_NOT_EQUALS")) || (data157 === "CONTAINS")) || (data157 === "DOES NOT CONTAIN"))){
const err312 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err312];
}
else {
vErrors.push(err312);
}
errors++;
}
}
if(data154.value !== undefined){
let data158 = data154.value;
const _errs461 = errors;
let valid87 = false;
const _errs462 = errors;
if(!(((typeof data158 == "number") && (!(data158 % 1) && !isNaN(data158))) && (isFinite(data158)))){
const err313 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err313];
}
else {
vErrors.push(err313);
}
errors++;
}
var _valid18 = _errs462 === errors;
valid87 = valid87 || _valid18;
if(!valid87){
const _errs464 = errors;
if(typeof data158 !== "string"){
const err314 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err314];
}
else {
vErrors.push(err314);
}
errors++;
}
var _valid18 = _errs464 === errors;
valid87 = valid87 || _valid18;
if(!valid87){
const _errs466 = errors;
if(typeof data158 !== "boolean"){
const err315 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err315];
}
else {
vErrors.push(err315);
}
errors++;
}
var _valid18 = _errs466 === errors;
valid87 = valid87 || _valid18;
if(!valid87){
const _errs468 = errors;
if(!(Array.isArray(data158))){
const err316 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err316];
}
else {
vErrors.push(err316);
}
errors++;
}
var _valid18 = _errs468 === errors;
valid87 = valid87 || _valid18;
}
}
}
if(!valid87){
const err317 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err317];
}
else {
vErrors.push(err317);
}
errors++;
}
else {
errors = _errs461;
if(vErrors !== null){
if(_errs461){
vErrors.length = _errs461;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err318 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err318];
}
else {
vErrors.push(err318);
}
errors++;
}
}
}
else {
const err319 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i7,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err319];
}
else {
vErrors.push(err319);
}
errors++;
}
}
}
else {
const err320 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err320];
}
else {
vErrors.push(err320);
}
errors++;
}
}
}
else {
const err321 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err321];
}
else {
vErrors.push(err321);
}
errors++;
}
var _valid17 = _errs437 === errors;
valid80 = valid80 || _valid17;
}
if(!valid80){
const err322 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err322];
}
else {
vErrors.push(err322);
}
errors++;
}
else {
errors = _errs434;
if(vErrors !== null){
if(_errs434){
vErrors.length = _errs434;
}
else {
vErrors = null;
}
}
}
var _valid16 = _errs433 === errors;
valid79 = valid79 || _valid16;
if(!valid79){
const _errs470 = errors;
if(data148 !== null){
const err323 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err323];
}
else {
vErrors.push(err323);
}
errors++;
}
var _valid16 = _errs470 === errors;
valid79 = valid79 || _valid16;
}
if(!valid79){
const err324 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err324];
}
else {
vErrors.push(err324);
}
errors++;
}
else {
errors = _errs432;
if(vErrors !== null){
if(_errs432){
vErrors.length = _errs432;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data160 = data107.introductionPanel;
if(data160 && typeof data160 == "object" && !Array.isArray(data160)){
if(data160.title === undefined){
const err325 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err325];
}
else {
vErrors.push(err325);
}
errors++;
}
if(data160.text === undefined){
const err326 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err326];
}
else {
vErrors.push(err326);
}
errors++;
}
for(const key38 in data160){
if(!((key38 === "title") || (key38 === "text"))){
const err327 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key38},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err327];
}
else {
vErrors.push(err327);
}
errors++;
}
}
if(data160.title !== undefined){
if(typeof data160.title !== "string"){
const err328 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err328];
}
else {
vErrors.push(err328);
}
errors++;
}
}
if(data160.text !== undefined){
if(typeof data160.text !== "string"){
const err329 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err329];
}
else {
vErrors.push(err329);
}
errors++;
}
}
}
else {
const err330 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err330];
}
else {
vErrors.push(err330);
}
errors++;
}
}
if(data107.type !== undefined){
let data163 = data107.type;
if(typeof data163 !== "string"){
const err331 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/1/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err331];
}
else {
vErrors.push(err331);
}
errors++;
}
if("AlterForm" !== data163){
const err332 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/1/properties/type/const",keyword:"const",params:{allowedValue: "AlterForm"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err332];
}
else {
vErrors.push(err332);
}
errors++;
}
}
if(data107.subject !== undefined){
let data164 = data107.subject;
if(data164 && typeof data164 == "object" && !Array.isArray(data164)){
if(data164.entity === undefined){
const err333 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err333];
}
else {
vErrors.push(err333);
}
errors++;
}
if(data164.type === undefined){
const err334 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err334];
}
else {
vErrors.push(err334);
}
errors++;
}
for(const key39 in data164){
if(!((key39 === "entity") || (key39 === "type"))){
const err335 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key39},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err335];
}
else {
vErrors.push(err335);
}
errors++;
}
}
if(data164.entity !== undefined){
let data165 = data164.entity;
if(typeof data165 !== "string"){
const err336 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err336];
}
else {
vErrors.push(err336);
}
errors++;
}
if(!(((data165 === "edge") || (data165 === "node")) || (data165 === "ego"))){
const err337 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[1].properties.subject.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err337];
}
else {
vErrors.push(err337);
}
errors++;
}
}
if(data164.type !== undefined){
if(typeof data164.type !== "string"){
const err338 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err338];
}
else {
vErrors.push(err338);
}
errors++;
}
}
}
else {
const err339 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err339];
}
else {
vErrors.push(err339);
}
errors++;
}
}
if(data107.form !== undefined){
let data167 = data107.form;
if(data167 && typeof data167 == "object" && !Array.isArray(data167)){
if(data167.fields === undefined){
const err340 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err340];
}
else {
vErrors.push(err340);
}
errors++;
}
for(const key40 in data167){
if(!((key40 === "title") || (key40 === "fields"))){
const err341 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key40},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err341];
}
else {
vErrors.push(err341);
}
errors++;
}
}
if(data167.title !== undefined){
if(typeof data167.title !== "string"){
const err342 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err342];
}
else {
vErrors.push(err342);
}
errors++;
}
}
if(data167.fields !== undefined){
let data169 = data167.fields;
if(Array.isArray(data169)){
const len8 = data169.length;
for(let i8=0; i8<len8; i8++){
let data170 = data169[i8];
if(data170 && typeof data170 == "object" && !Array.isArray(data170)){
if(data170.variable === undefined){
const err343 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err343];
}
else {
vErrors.push(err343);
}
errors++;
}
if(data170.prompt === undefined){
const err344 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err344];
}
else {
vErrors.push(err344);
}
errors++;
}
for(const key41 in data170){
if(!((key41 === "variable") || (key41 === "prompt"))){
const err345 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key41},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err345];
}
else {
vErrors.push(err345);
}
errors++;
}
}
if(data170.variable !== undefined){
if(typeof data170.variable !== "string"){
const err346 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8+"/variable",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err346];
}
else {
vErrors.push(err346);
}
errors++;
}
}
if(data170.prompt !== undefined){
if(typeof data170.prompt !== "string"){
const err347 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8+"/prompt",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err348 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i8,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err348];
}
else {
vErrors.push(err348);
}
errors++;
}
}
}
else {
const err349 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err349];
}
else {
vErrors.push(err349);
}
errors++;
}
}
}
else {
const err350 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err350];
}
else {
vErrors.push(err350);
}
errors++;
}
}
}
else {
const err351 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err351];
}
else {
vErrors.push(err351);
}
errors++;
}
var _valid9 = _errs418 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs505 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err352 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err352];
}
else {
vErrors.push(err352);
}
errors++;
}
if(data107.label === undefined){
const err353 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err353];
}
else {
vErrors.push(err353);
}
errors++;
}
if(data107.type === undefined){
const err354 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err354];
}
else {
vErrors.push(err354);
}
errors++;
}
if(data107.form === undefined){
const err355 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err355];
}
else {
vErrors.push(err355);
}
errors++;
}
for(const key42 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[2].properties, key42))){
const err356 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key42},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err356];
}
else {
vErrors.push(err356);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err357 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err357];
}
else {
vErrors.push(err357);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err358 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err358];
}
else {
vErrors.push(err358);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err359 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err359];
}
else {
vErrors.push(err359);
}
errors++;
}
}
if(data107.filter !== undefined){
let data176 = data107.filter;
const _errs519 = errors;
let valid101 = false;
const _errs520 = errors;
const _errs521 = errors;
let valid102 = false;
const _errs522 = errors;
const err360 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err360];
}
else {
vErrors.push(err360);
}
errors++;
var _valid20 = _errs522 === errors;
valid102 = valid102 || _valid20;
if(!valid102){
const _errs524 = errors;
if(data176 && typeof data176 == "object" && !Array.isArray(data176)){
for(const key43 in data176){
if(!((key43 === "join") || (key43 === "rules"))){
const err361 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key43},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err361];
}
else {
vErrors.push(err361);
}
errors++;
}
}
if(data176.join !== undefined){
let data177 = data176.join;
if(typeof data177 !== "string"){
const err362 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err362];
}
else {
vErrors.push(err362);
}
errors++;
}
if(!((data177 === "OR") || (data177 === "AND"))){
const err363 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err363];
}
else {
vErrors.push(err363);
}
errors++;
}
}
if(data176.rules !== undefined){
let data178 = data176.rules;
if(Array.isArray(data178)){
const len9 = data178.length;
for(let i9=0; i9<len9; i9++){
let data179 = data178[i9];
if(data179 && typeof data179 == "object" && !Array.isArray(data179)){
if(data179.type === undefined){
const err364 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err364];
}
else {
vErrors.push(err364);
}
errors++;
}
if(data179.id === undefined){
const err365 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err365];
}
else {
vErrors.push(err365);
}
errors++;
}
if(data179.options === undefined){
const err366 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err366];
}
else {
vErrors.push(err366);
}
errors++;
}
for(const key44 in data179){
if(!(((key44 === "type") || (key44 === "id")) || (key44 === "options"))){
const err367 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key44},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err367];
}
else {
vErrors.push(err367);
}
errors++;
}
}
if(data179.type !== undefined){
let data180 = data179.type;
if(typeof data180 !== "string"){
const err368 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err368];
}
else {
vErrors.push(err368);
}
errors++;
}
if(!(((data180 === "alter") || (data180 === "ego")) || (data180 === "edge"))){
const err369 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err369];
}
else {
vErrors.push(err369);
}
errors++;
}
}
if(data179.id !== undefined){
if(typeof data179.id !== "string"){
const err370 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err370];
}
else {
vErrors.push(err370);
}
errors++;
}
}
if(data179.options !== undefined){
let data182 = data179.options;
if(data182 && typeof data182 == "object" && !Array.isArray(data182)){
if(data182.operator === undefined){
const err371 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err371];
}
else {
vErrors.push(err371);
}
errors++;
}
if(data182.type !== undefined){
if(typeof data182.type !== "string"){
const err372 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err372];
}
else {
vErrors.push(err372);
}
errors++;
}
}
if(data182.attribute !== undefined){
if(typeof data182.attribute !== "string"){
const err373 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err373];
}
else {
vErrors.push(err373);
}
errors++;
}
}
if(data182.operator !== undefined){
let data185 = data182.operator;
if(typeof data185 !== "string"){
const err374 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err374];
}
else {
vErrors.push(err374);
}
errors++;
}
if(!((((((((((((((((data185 === "EXISTS") || (data185 === "NOT_EXISTS")) || (data185 === "EXACTLY")) || (data185 === "NOT")) || (data185 === "GREATER_THAN")) || (data185 === "GREATER_THAN_OR_EQUAL")) || (data185 === "LESS_THAN")) || (data185 === "LESS_THAN_OR_EQUAL")) || (data185 === "INCLUDES")) || (data185 === "EXCLUDES")) || (data185 === "OPTIONS_GREATER_THAN")) || (data185 === "OPTIONS_LESS_THAN")) || (data185 === "OPTIONS_EQUALS")) || (data185 === "OPTIONS_NOT_EQUALS")) || (data185 === "CONTAINS")) || (data185 === "DOES NOT CONTAIN"))){
const err375 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err375];
}
else {
vErrors.push(err375);
}
errors++;
}
}
if(data182.value !== undefined){
let data186 = data182.value;
const _errs548 = errors;
let valid109 = false;
const _errs549 = errors;
if(!(((typeof data186 == "number") && (!(data186 % 1) && !isNaN(data186))) && (isFinite(data186)))){
const err376 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err376];
}
else {
vErrors.push(err376);
}
errors++;
}
var _valid21 = _errs549 === errors;
valid109 = valid109 || _valid21;
if(!valid109){
const _errs551 = errors;
if(typeof data186 !== "string"){
const err377 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err377];
}
else {
vErrors.push(err377);
}
errors++;
}
var _valid21 = _errs551 === errors;
valid109 = valid109 || _valid21;
if(!valid109){
const _errs553 = errors;
if(typeof data186 !== "boolean"){
const err378 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err378];
}
else {
vErrors.push(err378);
}
errors++;
}
var _valid21 = _errs553 === errors;
valid109 = valid109 || _valid21;
if(!valid109){
const _errs555 = errors;
if(!(Array.isArray(data186))){
const err379 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err379];
}
else {
vErrors.push(err379);
}
errors++;
}
var _valid21 = _errs555 === errors;
valid109 = valid109 || _valid21;
}
}
}
if(!valid109){
const err380 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err380];
}
else {
vErrors.push(err380);
}
errors++;
}
else {
errors = _errs548;
if(vErrors !== null){
if(_errs548){
vErrors.length = _errs548;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err381 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err381];
}
else {
vErrors.push(err381);
}
errors++;
}
}
}
else {
const err382 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i9,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err382];
}
else {
vErrors.push(err382);
}
errors++;
}
}
}
else {
const err383 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err383];
}
else {
vErrors.push(err383);
}
errors++;
}
}
}
else {
const err384 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err384];
}
else {
vErrors.push(err384);
}
errors++;
}
var _valid20 = _errs524 === errors;
valid102 = valid102 || _valid20;
}
if(!valid102){
const err385 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err385];
}
else {
vErrors.push(err385);
}
errors++;
}
else {
errors = _errs521;
if(vErrors !== null){
if(_errs521){
vErrors.length = _errs521;
}
else {
vErrors = null;
}
}
}
var _valid19 = _errs520 === errors;
valid101 = valid101 || _valid19;
if(!valid101){
const _errs557 = errors;
if(data176 !== null){
const err386 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err386];
}
else {
vErrors.push(err386);
}
errors++;
}
var _valid19 = _errs557 === errors;
valid101 = valid101 || _valid19;
}
if(!valid101){
const err387 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err387];
}
else {
vErrors.push(err387);
}
errors++;
}
else {
errors = _errs519;
if(vErrors !== null){
if(_errs519){
vErrors.length = _errs519;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data188 = data107.introductionPanel;
if(data188 && typeof data188 == "object" && !Array.isArray(data188)){
if(data188.title === undefined){
const err388 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err388];
}
else {
vErrors.push(err388);
}
errors++;
}
if(data188.text === undefined){
const err389 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err389];
}
else {
vErrors.push(err389);
}
errors++;
}
for(const key45 in data188){
if(!((key45 === "title") || (key45 === "text"))){
const err390 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key45},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err390];
}
else {
vErrors.push(err390);
}
errors++;
}
}
if(data188.title !== undefined){
if(typeof data188.title !== "string"){
const err391 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err391];
}
else {
vErrors.push(err391);
}
errors++;
}
}
if(data188.text !== undefined){
if(typeof data188.text !== "string"){
const err392 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err392];
}
else {
vErrors.push(err392);
}
errors++;
}
}
}
else {
const err393 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err393];
}
else {
vErrors.push(err393);
}
errors++;
}
}
if(data107.type !== undefined){
let data191 = data107.type;
if(typeof data191 !== "string"){
const err394 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/2/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err394];
}
else {
vErrors.push(err394);
}
errors++;
}
if("AlterEdgeForm" !== data191){
const err395 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/2/properties/type/const",keyword:"const",params:{allowedValue: "AlterEdgeForm"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err395];
}
else {
vErrors.push(err395);
}
errors++;
}
}
if(data107.subject !== undefined){
let data192 = data107.subject;
if(data192 && typeof data192 == "object" && !Array.isArray(data192)){
if(data192.entity === undefined){
const err396 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err396];
}
else {
vErrors.push(err396);
}
errors++;
}
if(data192.type === undefined){
const err397 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err397];
}
else {
vErrors.push(err397);
}
errors++;
}
for(const key46 in data192){
if(!((key46 === "entity") || (key46 === "type"))){
const err398 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key46},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err398];
}
else {
vErrors.push(err398);
}
errors++;
}
}
if(data192.entity !== undefined){
let data193 = data192.entity;
if(typeof data193 !== "string"){
const err399 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err399];
}
else {
vErrors.push(err399);
}
errors++;
}
if(!(((data193 === "edge") || (data193 === "node")) || (data193 === "ego"))){
const err400 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err400];
}
else {
vErrors.push(err400);
}
errors++;
}
}
if(data192.type !== undefined){
if(typeof data192.type !== "string"){
const err401 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err401];
}
else {
vErrors.push(err401);
}
errors++;
}
}
}
else {
const err402 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err402];
}
else {
vErrors.push(err402);
}
errors++;
}
}
if(data107.form !== undefined){
let data195 = data107.form;
if(data195 && typeof data195 == "object" && !Array.isArray(data195)){
if(data195.fields === undefined){
const err403 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err403];
}
else {
vErrors.push(err403);
}
errors++;
}
for(const key47 in data195){
if(!((key47 === "title") || (key47 === "fields"))){
const err404 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key47},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err404];
}
else {
vErrors.push(err404);
}
errors++;
}
}
if(data195.title !== undefined){
if(typeof data195.title !== "string"){
const err405 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err405];
}
else {
vErrors.push(err405);
}
errors++;
}
}
if(data195.fields !== undefined){
let data197 = data195.fields;
if(Array.isArray(data197)){
const len10 = data197.length;
for(let i10=0; i10<len10; i10++){
let data198 = data197[i10];
if(data198 && typeof data198 == "object" && !Array.isArray(data198)){
if(data198.variable === undefined){
const err406 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err406];
}
else {
vErrors.push(err406);
}
errors++;
}
if(data198.prompt === undefined){
const err407 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err407];
}
else {
vErrors.push(err407);
}
errors++;
}
for(const key48 in data198){
if(!((key48 === "variable") || (key48 === "prompt"))){
const err408 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key48},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err408];
}
else {
vErrors.push(err408);
}
errors++;
}
}
if(data198.variable !== undefined){
if(typeof data198.variable !== "string"){
const err409 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10+"/variable",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err409];
}
else {
vErrors.push(err409);
}
errors++;
}
}
if(data198.prompt !== undefined){
if(typeof data198.prompt !== "string"){
const err410 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10+"/prompt",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err411 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i10,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err411];
}
else {
vErrors.push(err411);
}
errors++;
}
}
}
else {
const err412 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err412];
}
else {
vErrors.push(err412);
}
errors++;
}
}
}
else {
const err413 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err413];
}
else {
vErrors.push(err413);
}
errors++;
}
}
}
else {
const err414 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err414];
}
else {
vErrors.push(err414);
}
errors++;
}
var _valid9 = _errs505 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs593 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err415 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err415];
}
else {
vErrors.push(err415);
}
errors++;
}
if(data107.label === undefined){
const err416 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err416];
}
else {
vErrors.push(err416);
}
errors++;
}
if(data107.type === undefined){
const err417 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err417];
}
else {
vErrors.push(err417);
}
errors++;
}
if(data107.form === undefined){
const err418 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "form"},message:"must have required property '"+"form"+"'"};
if(vErrors === null){
vErrors = [err418];
}
else {
vErrors.push(err418);
}
errors++;
}
if(data107.prompts === undefined){
const err419 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err419];
}
else {
vErrors.push(err419);
}
errors++;
}
for(const key49 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[3].properties, key49))){
const err420 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key49},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err420];
}
else {
vErrors.push(err420);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err421 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err421];
}
else {
vErrors.push(err421);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err422 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err422];
}
else {
vErrors.push(err422);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err423 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err423];
}
else {
vErrors.push(err423);
}
errors++;
}
}
if(data107.filter !== undefined){
let data204 = data107.filter;
const _errs607 = errors;
let valid124 = false;
const _errs608 = errors;
const _errs609 = errors;
let valid125 = false;
const _errs610 = errors;
const err424 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err424];
}
else {
vErrors.push(err424);
}
errors++;
var _valid23 = _errs610 === errors;
valid125 = valid125 || _valid23;
if(!valid125){
const _errs612 = errors;
if(data204 && typeof data204 == "object" && !Array.isArray(data204)){
for(const key50 in data204){
if(!((key50 === "join") || (key50 === "rules"))){
const err425 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key50},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err425];
}
else {
vErrors.push(err425);
}
errors++;
}
}
if(data204.join !== undefined){
let data205 = data204.join;
if(typeof data205 !== "string"){
const err426 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err426];
}
else {
vErrors.push(err426);
}
errors++;
}
if(!((data205 === "OR") || (data205 === "AND"))){
const err427 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err427];
}
else {
vErrors.push(err427);
}
errors++;
}
}
if(data204.rules !== undefined){
let data206 = data204.rules;
if(Array.isArray(data206)){
const len11 = data206.length;
for(let i11=0; i11<len11; i11++){
let data207 = data206[i11];
if(data207 && typeof data207 == "object" && !Array.isArray(data207)){
if(data207.type === undefined){
const err428 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err428];
}
else {
vErrors.push(err428);
}
errors++;
}
if(data207.id === undefined){
const err429 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err429];
}
else {
vErrors.push(err429);
}
errors++;
}
if(data207.options === undefined){
const err430 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err430];
}
else {
vErrors.push(err430);
}
errors++;
}
for(const key51 in data207){
if(!(((key51 === "type") || (key51 === "id")) || (key51 === "options"))){
const err431 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key51},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err431];
}
else {
vErrors.push(err431);
}
errors++;
}
}
if(data207.type !== undefined){
let data208 = data207.type;
if(typeof data208 !== "string"){
const err432 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err432];
}
else {
vErrors.push(err432);
}
errors++;
}
if(!(((data208 === "alter") || (data208 === "ego")) || (data208 === "edge"))){
const err433 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err433];
}
else {
vErrors.push(err433);
}
errors++;
}
}
if(data207.id !== undefined){
if(typeof data207.id !== "string"){
const err434 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err434];
}
else {
vErrors.push(err434);
}
errors++;
}
}
if(data207.options !== undefined){
let data210 = data207.options;
if(data210 && typeof data210 == "object" && !Array.isArray(data210)){
if(data210.operator === undefined){
const err435 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err435];
}
else {
vErrors.push(err435);
}
errors++;
}
if(data210.type !== undefined){
if(typeof data210.type !== "string"){
const err436 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err436];
}
else {
vErrors.push(err436);
}
errors++;
}
}
if(data210.attribute !== undefined){
if(typeof data210.attribute !== "string"){
const err437 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err437];
}
else {
vErrors.push(err437);
}
errors++;
}
}
if(data210.operator !== undefined){
let data213 = data210.operator;
if(typeof data213 !== "string"){
const err438 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err438];
}
else {
vErrors.push(err438);
}
errors++;
}
if(!((((((((((((((((data213 === "EXISTS") || (data213 === "NOT_EXISTS")) || (data213 === "EXACTLY")) || (data213 === "NOT")) || (data213 === "GREATER_THAN")) || (data213 === "GREATER_THAN_OR_EQUAL")) || (data213 === "LESS_THAN")) || (data213 === "LESS_THAN_OR_EQUAL")) || (data213 === "INCLUDES")) || (data213 === "EXCLUDES")) || (data213 === "OPTIONS_GREATER_THAN")) || (data213 === "OPTIONS_LESS_THAN")) || (data213 === "OPTIONS_EQUALS")) || (data213 === "OPTIONS_NOT_EQUALS")) || (data213 === "CONTAINS")) || (data213 === "DOES NOT CONTAIN"))){
const err439 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err439];
}
else {
vErrors.push(err439);
}
errors++;
}
}
if(data210.value !== undefined){
let data214 = data210.value;
const _errs636 = errors;
let valid132 = false;
const _errs637 = errors;
if(!(((typeof data214 == "number") && (!(data214 % 1) && !isNaN(data214))) && (isFinite(data214)))){
const err440 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err440];
}
else {
vErrors.push(err440);
}
errors++;
}
var _valid24 = _errs637 === errors;
valid132 = valid132 || _valid24;
if(!valid132){
const _errs639 = errors;
if(typeof data214 !== "string"){
const err441 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err441];
}
else {
vErrors.push(err441);
}
errors++;
}
var _valid24 = _errs639 === errors;
valid132 = valid132 || _valid24;
if(!valid132){
const _errs641 = errors;
if(typeof data214 !== "boolean"){
const err442 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err442];
}
else {
vErrors.push(err442);
}
errors++;
}
var _valid24 = _errs641 === errors;
valid132 = valid132 || _valid24;
if(!valid132){
const _errs643 = errors;
if(!(Array.isArray(data214))){
const err443 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err443];
}
else {
vErrors.push(err443);
}
errors++;
}
var _valid24 = _errs643 === errors;
valid132 = valid132 || _valid24;
}
}
}
if(!valid132){
const err444 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err444];
}
else {
vErrors.push(err444);
}
errors++;
}
else {
errors = _errs636;
if(vErrors !== null){
if(_errs636){
vErrors.length = _errs636;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err445 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err445];
}
else {
vErrors.push(err445);
}
errors++;
}
}
}
else {
const err446 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i11,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err446];
}
else {
vErrors.push(err446);
}
errors++;
}
}
}
else {
const err447 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err447];
}
else {
vErrors.push(err447);
}
errors++;
}
}
}
else {
const err448 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err448];
}
else {
vErrors.push(err448);
}
errors++;
}
var _valid23 = _errs612 === errors;
valid125 = valid125 || _valid23;
}
if(!valid125){
const err449 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err449];
}
else {
vErrors.push(err449);
}
errors++;
}
else {
errors = _errs609;
if(vErrors !== null){
if(_errs609){
vErrors.length = _errs609;
}
else {
vErrors = null;
}
}
}
var _valid22 = _errs608 === errors;
valid124 = valid124 || _valid22;
if(!valid124){
const _errs645 = errors;
if(data204 !== null){
const err450 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err450];
}
else {
vErrors.push(err450);
}
errors++;
}
var _valid22 = _errs645 === errors;
valid124 = valid124 || _valid22;
}
if(!valid124){
const err451 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err451];
}
else {
vErrors.push(err451);
}
errors++;
}
else {
errors = _errs607;
if(vErrors !== null){
if(_errs607){
vErrors.length = _errs607;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data216 = data107.introductionPanel;
if(data216 && typeof data216 == "object" && !Array.isArray(data216)){
if(data216.title === undefined){
const err452 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err452];
}
else {
vErrors.push(err452);
}
errors++;
}
if(data216.text === undefined){
const err453 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err453];
}
else {
vErrors.push(err453);
}
errors++;
}
for(const key52 in data216){
if(!((key52 === "title") || (key52 === "text"))){
const err454 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key52},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err454];
}
else {
vErrors.push(err454);
}
errors++;
}
}
if(data216.title !== undefined){
if(typeof data216.title !== "string"){
const err455 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err455];
}
else {
vErrors.push(err455);
}
errors++;
}
}
if(data216.text !== undefined){
if(typeof data216.text !== "string"){
const err456 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err456];
}
else {
vErrors.push(err456);
}
errors++;
}
}
}
else {
const err457 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err457];
}
else {
vErrors.push(err457);
}
errors++;
}
}
if(data107.type !== undefined){
let data219 = data107.type;
if(typeof data219 !== "string"){
const err458 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/3/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err458];
}
else {
vErrors.push(err458);
}
errors++;
}
if("NameGenerator" !== data219){
const err459 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/3/properties/type/const",keyword:"const",params:{allowedValue: "NameGenerator"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err459];
}
else {
vErrors.push(err459);
}
errors++;
}
}
if(data107.form !== undefined){
let data220 = data107.form;
if(data220 && typeof data220 == "object" && !Array.isArray(data220)){
if(data220.fields === undefined){
const err460 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err460];
}
else {
vErrors.push(err460);
}
errors++;
}
for(const key53 in data220){
if(!((key53 === "title") || (key53 === "fields"))){
const err461 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key53},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err461];
}
else {
vErrors.push(err461);
}
errors++;
}
}
if(data220.title !== undefined){
if(typeof data220.title !== "string"){
const err462 = {instancePath:instancePath+"/stages/" + i3+"/form/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err462];
}
else {
vErrors.push(err462);
}
errors++;
}
}
if(data220.fields !== undefined){
let data222 = data220.fields;
if(Array.isArray(data222)){
const len12 = data222.length;
for(let i12=0; i12<len12; i12++){
let data223 = data222[i12];
if(data223 && typeof data223 == "object" && !Array.isArray(data223)){
if(data223.variable === undefined){
const err463 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err463];
}
else {
vErrors.push(err463);
}
errors++;
}
if(data223.prompt === undefined){
const err464 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/required",keyword:"required",params:{missingProperty: "prompt"},message:"must have required property '"+"prompt"+"'"};
if(vErrors === null){
vErrors = [err464];
}
else {
vErrors.push(err464);
}
errors++;
}
for(const key54 in data223){
if(!((key54 === "variable") || (key54 === "prompt"))){
const err465 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key54},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err465];
}
else {
vErrors.push(err465);
}
errors++;
}
}
if(data223.variable !== undefined){
if(typeof data223.variable !== "string"){
const err466 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12+"/variable",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err466];
}
else {
vErrors.push(err466);
}
errors++;
}
}
if(data223.prompt !== undefined){
if(typeof data223.prompt !== "string"){
const err467 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12+"/prompt",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/properties/prompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err467];
}
else {
vErrors.push(err467);
}
errors++;
}
}
}
else {
const err468 = {instancePath:instancePath+"/stages/" + i3+"/form/fields/" + i12,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err468];
}
else {
vErrors.push(err468);
}
errors++;
}
}
}
else {
const err469 = {instancePath:instancePath+"/stages/" + i3+"/form/fields",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/properties/fields/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err469];
}
else {
vErrors.push(err469);
}
errors++;
}
}
}
else {
const err470 = {instancePath:instancePath+"/stages/" + i3+"/form",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/form/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err470];
}
else {
vErrors.push(err470);
}
errors++;
}
}
if(data107.subject !== undefined){
let data226 = data107.subject;
if(data226 && typeof data226 == "object" && !Array.isArray(data226)){
if(data226.entity === undefined){
const err471 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err471];
}
else {
vErrors.push(err471);
}
errors++;
}
if(data226.type === undefined){
const err472 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err472];
}
else {
vErrors.push(err472);
}
errors++;
}
for(const key55 in data226){
if(!((key55 === "entity") || (key55 === "type"))){
const err473 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key55},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err473];
}
else {
vErrors.push(err473);
}
errors++;
}
}
if(data226.entity !== undefined){
let data227 = data226.entity;
if(typeof data227 !== "string"){
const err474 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err474];
}
else {
vErrors.push(err474);
}
errors++;
}
if(!(((data227 === "edge") || (data227 === "node")) || (data227 === "ego"))){
const err475 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err475];
}
else {
vErrors.push(err475);
}
errors++;
}
}
if(data226.type !== undefined){
if(typeof data226.type !== "string"){
const err476 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err476];
}
else {
vErrors.push(err476);
}
errors++;
}
}
}
else {
const err477 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err477];
}
else {
vErrors.push(err477);
}
errors++;
}
}
if(data107.panels !== undefined){
let data229 = data107.panels;
if(Array.isArray(data229)){
const len13 = data229.length;
for(let i13=0; i13<len13; i13++){
let data230 = data229[i13];
if(data230 && typeof data230 == "object" && !Array.isArray(data230)){
if(data230.id === undefined){
const err478 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err478];
}
else {
vErrors.push(err478);
}
errors++;
}
if(data230.title === undefined){
const err479 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err479];
}
else {
vErrors.push(err479);
}
errors++;
}
if(data230.dataSource === undefined){
const err480 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/required",keyword:"required",params:{missingProperty: "dataSource"},message:"must have required property '"+"dataSource"+"'"};
if(vErrors === null){
vErrors = [err480];
}
else {
vErrors.push(err480);
}
errors++;
}
for(const key56 in data230){
if(!((((key56 === "id") || (key56 === "title")) || (key56 === "filter")) || (key56 === "dataSource"))){
const err481 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key56},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err481];
}
else {
vErrors.push(err481);
}
errors++;
}
}
if(data230.id !== undefined){
if(typeof data230.id !== "string"){
const err482 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/id",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err482];
}
else {
vErrors.push(err482);
}
errors++;
}
}
if(data230.title !== undefined){
if(typeof data230.title !== "string"){
const err483 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/title",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err483];
}
else {
vErrors.push(err483);
}
errors++;
}
}
if(data230.filter !== undefined){
let data233 = data230.filter;
const _errs691 = errors;
let valid145 = false;
const _errs692 = errors;
const _errs694 = errors;
let valid147 = false;
const _errs695 = errors;
const err484 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err484];
}
else {
vErrors.push(err484);
}
errors++;
var _valid26 = _errs695 === errors;
valid147 = valid147 || _valid26;
if(!valid147){
const _errs697 = errors;
if(data233 && typeof data233 == "object" && !Array.isArray(data233)){
for(const key57 in data233){
if(!((key57 === "join") || (key57 === "rules"))){
const err485 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key57},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err485];
}
else {
vErrors.push(err485);
}
errors++;
}
}
if(data233.join !== undefined){
let data234 = data233.join;
if(typeof data234 !== "string"){
const err486 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err486];
}
else {
vErrors.push(err486);
}
errors++;
}
if(!((data234 === "OR") || (data234 === "AND"))){
const err487 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err487];
}
else {
vErrors.push(err487);
}
errors++;
}
}
if(data233.rules !== undefined){
let data235 = data233.rules;
if(Array.isArray(data235)){
const len14 = data235.length;
for(let i14=0; i14<len14; i14++){
let data236 = data235[i14];
if(data236 && typeof data236 == "object" && !Array.isArray(data236)){
if(data236.type === undefined){
const err488 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err488];
}
else {
vErrors.push(err488);
}
errors++;
}
if(data236.id === undefined){
const err489 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err489];
}
else {
vErrors.push(err489);
}
errors++;
}
if(data236.options === undefined){
const err490 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err490];
}
else {
vErrors.push(err490);
}
errors++;
}
for(const key58 in data236){
if(!(((key58 === "type") || (key58 === "id")) || (key58 === "options"))){
const err491 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key58},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err491];
}
else {
vErrors.push(err491);
}
errors++;
}
}
if(data236.type !== undefined){
let data237 = data236.type;
if(typeof data237 !== "string"){
const err492 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err492];
}
else {
vErrors.push(err492);
}
errors++;
}
if(!(((data237 === "alter") || (data237 === "ego")) || (data237 === "edge"))){
const err493 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err493];
}
else {
vErrors.push(err493);
}
errors++;
}
}
if(data236.id !== undefined){
if(typeof data236.id !== "string"){
const err494 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err494];
}
else {
vErrors.push(err494);
}
errors++;
}
}
if(data236.options !== undefined){
let data239 = data236.options;
if(data239 && typeof data239 == "object" && !Array.isArray(data239)){
if(data239.operator === undefined){
const err495 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err495];
}
else {
vErrors.push(err495);
}
errors++;
}
if(data239.type !== undefined){
if(typeof data239.type !== "string"){
const err496 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err496];
}
else {
vErrors.push(err496);
}
errors++;
}
}
if(data239.attribute !== undefined){
if(typeof data239.attribute !== "string"){
const err497 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err497];
}
else {
vErrors.push(err497);
}
errors++;
}
}
if(data239.operator !== undefined){
let data242 = data239.operator;
if(typeof data242 !== "string"){
const err498 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err498];
}
else {
vErrors.push(err498);
}
errors++;
}
if(!((((((((((((((((data242 === "EXISTS") || (data242 === "NOT_EXISTS")) || (data242 === "EXACTLY")) || (data242 === "NOT")) || (data242 === "GREATER_THAN")) || (data242 === "GREATER_THAN_OR_EQUAL")) || (data242 === "LESS_THAN")) || (data242 === "LESS_THAN_OR_EQUAL")) || (data242 === "INCLUDES")) || (data242 === "EXCLUDES")) || (data242 === "OPTIONS_GREATER_THAN")) || (data242 === "OPTIONS_LESS_THAN")) || (data242 === "OPTIONS_EQUALS")) || (data242 === "OPTIONS_NOT_EQUALS")) || (data242 === "CONTAINS")) || (data242 === "DOES NOT CONTAIN"))){
const err499 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema334.anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err499];
}
else {
vErrors.push(err499);
}
errors++;
}
}
if(data239.value !== undefined){
let data243 = data239.value;
const _errs721 = errors;
let valid154 = false;
const _errs722 = errors;
if(!(((typeof data243 == "number") && (!(data243 % 1) && !isNaN(data243))) && (isFinite(data243)))){
const err500 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err500];
}
else {
vErrors.push(err500);
}
errors++;
}
var _valid27 = _errs722 === errors;
valid154 = valid154 || _valid27;
if(!valid154){
const _errs724 = errors;
if(typeof data243 !== "string"){
const err501 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err501];
}
else {
vErrors.push(err501);
}
errors++;
}
var _valid27 = _errs724 === errors;
valid154 = valid154 || _valid27;
if(!valid154){
const _errs726 = errors;
if(typeof data243 !== "boolean"){
const err502 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err502];
}
else {
vErrors.push(err502);
}
errors++;
}
var _valid27 = _errs726 === errors;
valid154 = valid154 || _valid27;
if(!valid154){
const _errs728 = errors;
if(!(Array.isArray(data243))){
const err503 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err503];
}
else {
vErrors.push(err503);
}
errors++;
}
var _valid27 = _errs728 === errors;
valid154 = valid154 || _valid27;
}
}
}
if(!valid154){
const err504 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err504];
}
else {
vErrors.push(err504);
}
errors++;
}
else {
errors = _errs721;
if(vErrors !== null){
if(_errs721){
vErrors.length = _errs721;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err505 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err505];
}
else {
vErrors.push(err505);
}
errors++;
}
}
}
else {
const err506 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules/" + i14,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err506];
}
else {
vErrors.push(err506);
}
errors++;
}
}
}
else {
const err507 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err507];
}
else {
vErrors.push(err507);
}
errors++;
}
}
}
else {
const err508 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err508];
}
else {
vErrors.push(err508);
}
errors++;
}
var _valid26 = _errs697 === errors;
valid147 = valid147 || _valid26;
}
if(!valid147){
const err509 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err509];
}
else {
vErrors.push(err509);
}
errors++;
}
else {
errors = _errs694;
if(vErrors !== null){
if(_errs694){
vErrors.length = _errs694;
}
else {
vErrors = null;
}
}
}
var _valid25 = _errs692 === errors;
valid145 = valid145 || _valid25;
if(!valid145){
const _errs730 = errors;
if(data233 !== null){
const err510 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err510];
}
else {
vErrors.push(err510);
}
errors++;
}
var _valid25 = _errs730 === errors;
valid145 = valid145 || _valid25;
}
if(!valid145){
const err511 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/filter",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err511];
}
else {
vErrors.push(err511);
}
errors++;
}
else {
errors = _errs691;
if(vErrors !== null){
if(_errs691){
vErrors.length = _errs691;
}
else {
vErrors = null;
}
}
}
}
if(data230.dataSource !== undefined){
let data244 = data230.dataSource;
if((typeof data244 !== "string") && (data244 !== null)){
const err512 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13+"/dataSource",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/properties/dataSource/type",keyword:"type",params:{type: schema329.properties.stages.items.anyOf[3].properties.panels.items.properties.dataSource.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err512];
}
else {
vErrors.push(err512);
}
errors++;
}
}
}
else {
const err513 = {instancePath:instancePath+"/stages/" + i3+"/panels/" + i13,schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err513];
}
else {
vErrors.push(err513);
}
errors++;
}
}
}
else {
const err514 = {instancePath:instancePath+"/stages/" + i3+"/panels",schemaPath:"#/properties/stages/items/anyOf/3/properties/panels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err514];
}
else {
vErrors.push(err514);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data245 = data107.prompts;
if(Array.isArray(data245)){
if(data245.length < 1){
const err515 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err515];
}
else {
vErrors.push(err515);
}
errors++;
}
const len15 = data245.length;
for(let i15=0; i15<len15; i15++){
let data246 = data245[i15];
if(data246 && typeof data246 == "object" && !Array.isArray(data246)){
if(data246.id === undefined){
const err516 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err516];
}
else {
vErrors.push(err516);
}
errors++;
}
if(data246.text === undefined){
const err517 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err517];
}
else {
vErrors.push(err517);
}
errors++;
}
for(const key59 in data246){
if(!((key59 === "id") || (key59 === "text"))){
const err518 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key59},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err518];
}
else {
vErrors.push(err518);
}
errors++;
}
}
if(data246.id !== undefined){
if(typeof data246.id !== "string"){
const err519 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15+"/id",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err519];
}
else {
vErrors.push(err519);
}
errors++;
}
}
if(data246.text !== undefined){
if(typeof data246.text !== "string"){
const err520 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15+"/text",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err520];
}
else {
vErrors.push(err520);
}
errors++;
}
}
}
else {
const err521 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i15,schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err521];
}
else {
vErrors.push(err521);
}
errors++;
}
}
}
else {
const err522 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/3/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err522];
}
else {
vErrors.push(err522);
}
errors++;
}
}
}
else {
const err523 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err523];
}
else {
vErrors.push(err523);
}
errors++;
}
var _valid9 = _errs593 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs743 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err524 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err524];
}
else {
vErrors.push(err524);
}
errors++;
}
if(data107.label === undefined){
const err525 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err525];
}
else {
vErrors.push(err525);
}
errors++;
}
if(data107.type === undefined){
const err526 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err526];
}
else {
vErrors.push(err526);
}
errors++;
}
if(data107.quickAdd === undefined){
const err527 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "quickAdd"},message:"must have required property '"+"quickAdd"+"'"};
if(vErrors === null){
vErrors = [err527];
}
else {
vErrors.push(err527);
}
errors++;
}
if(data107.prompts === undefined){
const err528 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err528];
}
else {
vErrors.push(err528);
}
errors++;
}
for(const key60 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[4].properties, key60))){
const err529 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key60},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err529];
}
else {
vErrors.push(err529);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err530 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err530];
}
else {
vErrors.push(err530);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err531 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err531];
}
else {
vErrors.push(err531);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err532 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err532];
}
else {
vErrors.push(err532);
}
errors++;
}
}
if(data107.filter !== undefined){
let data252 = data107.filter;
const _errs757 = errors;
let valid163 = false;
const _errs758 = errors;
const _errs759 = errors;
let valid164 = false;
const _errs760 = errors;
const err533 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err533];
}
else {
vErrors.push(err533);
}
errors++;
var _valid29 = _errs760 === errors;
valid164 = valid164 || _valid29;
if(!valid164){
const _errs762 = errors;
if(data252 && typeof data252 == "object" && !Array.isArray(data252)){
for(const key61 in data252){
if(!((key61 === "join") || (key61 === "rules"))){
const err534 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key61},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err534];
}
else {
vErrors.push(err534);
}
errors++;
}
}
if(data252.join !== undefined){
let data253 = data252.join;
if(typeof data253 !== "string"){
const err535 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err535];
}
else {
vErrors.push(err535);
}
errors++;
}
if(!((data253 === "OR") || (data253 === "AND"))){
const err536 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err536];
}
else {
vErrors.push(err536);
}
errors++;
}
}
if(data252.rules !== undefined){
let data254 = data252.rules;
if(Array.isArray(data254)){
const len16 = data254.length;
for(let i16=0; i16<len16; i16++){
let data255 = data254[i16];
if(data255 && typeof data255 == "object" && !Array.isArray(data255)){
if(data255.type === undefined){
const err537 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err537];
}
else {
vErrors.push(err537);
}
errors++;
}
if(data255.id === undefined){
const err538 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err538];
}
else {
vErrors.push(err538);
}
errors++;
}
if(data255.options === undefined){
const err539 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err539];
}
else {
vErrors.push(err539);
}
errors++;
}
for(const key62 in data255){
if(!(((key62 === "type") || (key62 === "id")) || (key62 === "options"))){
const err540 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key62},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err540];
}
else {
vErrors.push(err540);
}
errors++;
}
}
if(data255.type !== undefined){
let data256 = data255.type;
if(typeof data256 !== "string"){
const err541 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err541];
}
else {
vErrors.push(err541);
}
errors++;
}
if(!(((data256 === "alter") || (data256 === "ego")) || (data256 === "edge"))){
const err542 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err542];
}
else {
vErrors.push(err542);
}
errors++;
}
}
if(data255.id !== undefined){
if(typeof data255.id !== "string"){
const err543 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err543];
}
else {
vErrors.push(err543);
}
errors++;
}
}
if(data255.options !== undefined){
let data258 = data255.options;
if(data258 && typeof data258 == "object" && !Array.isArray(data258)){
if(data258.operator === undefined){
const err544 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err544];
}
else {
vErrors.push(err544);
}
errors++;
}
if(data258.type !== undefined){
if(typeof data258.type !== "string"){
const err545 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err545];
}
else {
vErrors.push(err545);
}
errors++;
}
}
if(data258.attribute !== undefined){
if(typeof data258.attribute !== "string"){
const err546 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err546];
}
else {
vErrors.push(err546);
}
errors++;
}
}
if(data258.operator !== undefined){
let data261 = data258.operator;
if(typeof data261 !== "string"){
const err547 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err547];
}
else {
vErrors.push(err547);
}
errors++;
}
if(!((((((((((((((((data261 === "EXISTS") || (data261 === "NOT_EXISTS")) || (data261 === "EXACTLY")) || (data261 === "NOT")) || (data261 === "GREATER_THAN")) || (data261 === "GREATER_THAN_OR_EQUAL")) || (data261 === "LESS_THAN")) || (data261 === "LESS_THAN_OR_EQUAL")) || (data261 === "INCLUDES")) || (data261 === "EXCLUDES")) || (data261 === "OPTIONS_GREATER_THAN")) || (data261 === "OPTIONS_LESS_THAN")) || (data261 === "OPTIONS_EQUALS")) || (data261 === "OPTIONS_NOT_EQUALS")) || (data261 === "CONTAINS")) || (data261 === "DOES NOT CONTAIN"))){
const err548 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err548];
}
else {
vErrors.push(err548);
}
errors++;
}
}
if(data258.value !== undefined){
let data262 = data258.value;
const _errs786 = errors;
let valid171 = false;
const _errs787 = errors;
if(!(((typeof data262 == "number") && (!(data262 % 1) && !isNaN(data262))) && (isFinite(data262)))){
const err549 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err549];
}
else {
vErrors.push(err549);
}
errors++;
}
var _valid30 = _errs787 === errors;
valid171 = valid171 || _valid30;
if(!valid171){
const _errs789 = errors;
if(typeof data262 !== "string"){
const err550 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err550];
}
else {
vErrors.push(err550);
}
errors++;
}
var _valid30 = _errs789 === errors;
valid171 = valid171 || _valid30;
if(!valid171){
const _errs791 = errors;
if(typeof data262 !== "boolean"){
const err551 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err551];
}
else {
vErrors.push(err551);
}
errors++;
}
var _valid30 = _errs791 === errors;
valid171 = valid171 || _valid30;
if(!valid171){
const _errs793 = errors;
if(!(Array.isArray(data262))){
const err552 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err552];
}
else {
vErrors.push(err552);
}
errors++;
}
var _valid30 = _errs793 === errors;
valid171 = valid171 || _valid30;
}
}
}
if(!valid171){
const err553 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err553];
}
else {
vErrors.push(err553);
}
errors++;
}
else {
errors = _errs786;
if(vErrors !== null){
if(_errs786){
vErrors.length = _errs786;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err554 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err554];
}
else {
vErrors.push(err554);
}
errors++;
}
}
}
else {
const err555 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i16,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err555];
}
else {
vErrors.push(err555);
}
errors++;
}
}
}
else {
const err556 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err556];
}
else {
vErrors.push(err556);
}
errors++;
}
}
}
else {
const err557 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err557];
}
else {
vErrors.push(err557);
}
errors++;
}
var _valid29 = _errs762 === errors;
valid164 = valid164 || _valid29;
}
if(!valid164){
const err558 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err558];
}
else {
vErrors.push(err558);
}
errors++;
}
else {
errors = _errs759;
if(vErrors !== null){
if(_errs759){
vErrors.length = _errs759;
}
else {
vErrors = null;
}
}
}
var _valid28 = _errs758 === errors;
valid163 = valid163 || _valid28;
if(!valid163){
const _errs795 = errors;
if(data252 !== null){
const err559 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err559];
}
else {
vErrors.push(err559);
}
errors++;
}
var _valid28 = _errs795 === errors;
valid163 = valid163 || _valid28;
}
if(!valid163){
const err560 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err560];
}
else {
vErrors.push(err560);
}
errors++;
}
else {
errors = _errs757;
if(vErrors !== null){
if(_errs757){
vErrors.length = _errs757;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data264 = data107.introductionPanel;
if(data264 && typeof data264 == "object" && !Array.isArray(data264)){
if(data264.title === undefined){
const err561 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err561];
}
else {
vErrors.push(err561);
}
errors++;
}
if(data264.text === undefined){
const err562 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err562];
}
else {
vErrors.push(err562);
}
errors++;
}
for(const key63 in data264){
if(!((key63 === "title") || (key63 === "text"))){
const err563 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key63},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err563];
}
else {
vErrors.push(err563);
}
errors++;
}
}
if(data264.title !== undefined){
if(typeof data264.title !== "string"){
const err564 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err564];
}
else {
vErrors.push(err564);
}
errors++;
}
}
if(data264.text !== undefined){
if(typeof data264.text !== "string"){
const err565 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err565];
}
else {
vErrors.push(err565);
}
errors++;
}
}
}
else {
const err566 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err566];
}
else {
vErrors.push(err566);
}
errors++;
}
}
if(data107.type !== undefined){
let data267 = data107.type;
if(typeof data267 !== "string"){
const err567 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/4/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err567];
}
else {
vErrors.push(err567);
}
errors++;
}
if("NameGeneratorQuickAdd" !== data267){
const err568 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/4/properties/type/const",keyword:"const",params:{allowedValue: "NameGeneratorQuickAdd"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err568];
}
else {
vErrors.push(err568);
}
errors++;
}
}
if(data107.quickAdd !== undefined){
if(typeof data107.quickAdd !== "string"){
const err569 = {instancePath:instancePath+"/stages/" + i3+"/quickAdd",schemaPath:"#/properties/stages/items/anyOf/4/properties/quickAdd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err569];
}
else {
vErrors.push(err569);
}
errors++;
}
}
if(data107.subject !== undefined){
let data269 = data107.subject;
if(data269 && typeof data269 == "object" && !Array.isArray(data269)){
if(data269.entity === undefined){
const err570 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err570];
}
else {
vErrors.push(err570);
}
errors++;
}
if(data269.type === undefined){
const err571 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err571];
}
else {
vErrors.push(err571);
}
errors++;
}
for(const key64 in data269){
if(!((key64 === "entity") || (key64 === "type"))){
const err572 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key64},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err572];
}
else {
vErrors.push(err572);
}
errors++;
}
}
if(data269.entity !== undefined){
let data270 = data269.entity;
if(typeof data270 !== "string"){
const err573 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err573];
}
else {
vErrors.push(err573);
}
errors++;
}
if(!(((data270 === "edge") || (data270 === "node")) || (data270 === "ego"))){
const err574 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err574];
}
else {
vErrors.push(err574);
}
errors++;
}
}
if(data269.type !== undefined){
if(typeof data269.type !== "string"){
const err575 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err575];
}
else {
vErrors.push(err575);
}
errors++;
}
}
}
else {
const err576 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err576];
}
else {
vErrors.push(err576);
}
errors++;
}
}
if(data107.panels !== undefined){
let data272 = data107.panels;
if(Array.isArray(data272)){
const len17 = data272.length;
for(let i17=0; i17<len17; i17++){
if(!(validate412(data272[i17], {instancePath:instancePath+"/stages/" + i3+"/panels/" + i17,parentData:data272,parentDataProperty:i17,rootData}))){
vErrors = vErrors === null ? validate412.errors : vErrors.concat(validate412.errors);
errors = vErrors.length;
}
}
}
else {
const err577 = {instancePath:instancePath+"/stages/" + i3+"/panels",schemaPath:"#/properties/stages/items/anyOf/4/properties/panels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err577];
}
else {
vErrors.push(err577);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data274 = data107.prompts;
if(Array.isArray(data274)){
if(data274.length < 1){
const err578 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/4/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err578];
}
else {
vErrors.push(err578);
}
errors++;
}
const len18 = data274.length;
for(let i18=0; i18<len18; i18++){
let data275 = data274[i18];
if(data275 && typeof data275 == "object" && !Array.isArray(data275)){
if(data275.id === undefined){
const err579 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err579];
}
else {
vErrors.push(err579);
}
errors++;
}
if(data275.text === undefined){
const err580 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err580];
}
else {
vErrors.push(err580);
}
errors++;
}
for(const key65 in data275){
if(!((key65 === "id") || (key65 === "text"))){
const err581 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key65},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err581];
}
else {
vErrors.push(err581);
}
errors++;
}
}
if(data275.id !== undefined){
if(typeof data275.id !== "string"){
const err582 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err582];
}
else {
vErrors.push(err582);
}
errors++;
}
}
if(data275.text !== undefined){
if(typeof data275.text !== "string"){
const err583 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err583];
}
else {
vErrors.push(err583);
}
errors++;
}
}
}
else {
const err584 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i18,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err584];
}
else {
vErrors.push(err584);
}
errors++;
}
}
}
else {
const err585 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/4/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err585];
}
else {
vErrors.push(err585);
}
errors++;
}
}
if(data107.behaviours !== undefined){
let data278 = data107.behaviours;
if(data278 && typeof data278 == "object" && !Array.isArray(data278)){
for(const key66 in data278){
if(!((key66 === "minNodes") || (key66 === "maxNodes"))){
const err586 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key66},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err586];
}
else {
vErrors.push(err586);
}
errors++;
}
}
if(data278.minNodes !== undefined){
let data279 = data278.minNodes;
if(!(((typeof data279 == "number") && (!(data279 % 1) && !isNaN(data279))) && (isFinite(data279)))){
const err587 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/minNodes",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/properties/minNodes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err587];
}
else {
vErrors.push(err587);
}
errors++;
}
}
if(data278.maxNodes !== undefined){
let data280 = data278.maxNodes;
if(!(((typeof data280 == "number") && (!(data280 % 1) && !isNaN(data280))) && (isFinite(data280)))){
const err588 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/maxNodes",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/properties/maxNodes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err588];
}
else {
vErrors.push(err588);
}
errors++;
}
}
}
else {
const err589 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/4/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err589];
}
else {
vErrors.push(err589);
}
errors++;
}
}
}
else {
const err590 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err590];
}
else {
vErrors.push(err590);
}
errors++;
}
var _valid9 = _errs743 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs838 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err591 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err591];
}
else {
vErrors.push(err591);
}
errors++;
}
if(data107.label === undefined){
const err592 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err592];
}
else {
vErrors.push(err592);
}
errors++;
}
if(data107.type === undefined){
const err593 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err593];
}
else {
vErrors.push(err593);
}
errors++;
}
if(data107.dataSource === undefined){
const err594 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "dataSource"},message:"must have required property '"+"dataSource"+"'"};
if(vErrors === null){
vErrors = [err594];
}
else {
vErrors.push(err594);
}
errors++;
}
if(data107.prompts === undefined){
const err595 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err595];
}
else {
vErrors.push(err595);
}
errors++;
}
for(const key67 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[5].properties, key67))){
const err596 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key67},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err596];
}
else {
vErrors.push(err596);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err597 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err597];
}
else {
vErrors.push(err597);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err598 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err598];
}
else {
vErrors.push(err598);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err599 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err599];
}
else {
vErrors.push(err599);
}
errors++;
}
}
if(data107.filter !== undefined){
let data284 = data107.filter;
const _errs852 = errors;
let valid188 = false;
const _errs853 = errors;
const _errs854 = errors;
let valid189 = false;
const _errs855 = errors;
const err600 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err600];
}
else {
vErrors.push(err600);
}
errors++;
var _valid32 = _errs855 === errors;
valid189 = valid189 || _valid32;
if(!valid189){
const _errs857 = errors;
if(data284 && typeof data284 == "object" && !Array.isArray(data284)){
for(const key68 in data284){
if(!((key68 === "join") || (key68 === "rules"))){
const err601 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key68},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err601];
}
else {
vErrors.push(err601);
}
errors++;
}
}
if(data284.join !== undefined){
let data285 = data284.join;
if(typeof data285 !== "string"){
const err602 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err602];
}
else {
vErrors.push(err602);
}
errors++;
}
if(!((data285 === "OR") || (data285 === "AND"))){
const err603 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err603];
}
else {
vErrors.push(err603);
}
errors++;
}
}
if(data284.rules !== undefined){
let data286 = data284.rules;
if(Array.isArray(data286)){
const len19 = data286.length;
for(let i19=0; i19<len19; i19++){
let data287 = data286[i19];
if(data287 && typeof data287 == "object" && !Array.isArray(data287)){
if(data287.type === undefined){
const err604 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err604];
}
else {
vErrors.push(err604);
}
errors++;
}
if(data287.id === undefined){
const err605 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err605];
}
else {
vErrors.push(err605);
}
errors++;
}
if(data287.options === undefined){
const err606 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err606];
}
else {
vErrors.push(err606);
}
errors++;
}
for(const key69 in data287){
if(!(((key69 === "type") || (key69 === "id")) || (key69 === "options"))){
const err607 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key69},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err607];
}
else {
vErrors.push(err607);
}
errors++;
}
}
if(data287.type !== undefined){
let data288 = data287.type;
if(typeof data288 !== "string"){
const err608 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err608];
}
else {
vErrors.push(err608);
}
errors++;
}
if(!(((data288 === "alter") || (data288 === "ego")) || (data288 === "edge"))){
const err609 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err609];
}
else {
vErrors.push(err609);
}
errors++;
}
}
if(data287.id !== undefined){
if(typeof data287.id !== "string"){
const err610 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err610];
}
else {
vErrors.push(err610);
}
errors++;
}
}
if(data287.options !== undefined){
let data290 = data287.options;
if(data290 && typeof data290 == "object" && !Array.isArray(data290)){
if(data290.operator === undefined){
const err611 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err611];
}
else {
vErrors.push(err611);
}
errors++;
}
if(data290.type !== undefined){
if(typeof data290.type !== "string"){
const err612 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err612];
}
else {
vErrors.push(err612);
}
errors++;
}
}
if(data290.attribute !== undefined){
if(typeof data290.attribute !== "string"){
const err613 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err613];
}
else {
vErrors.push(err613);
}
errors++;
}
}
if(data290.operator !== undefined){
let data293 = data290.operator;
if(typeof data293 !== "string"){
const err614 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err614];
}
else {
vErrors.push(err614);
}
errors++;
}
if(!((((((((((((((((data293 === "EXISTS") || (data293 === "NOT_EXISTS")) || (data293 === "EXACTLY")) || (data293 === "NOT")) || (data293 === "GREATER_THAN")) || (data293 === "GREATER_THAN_OR_EQUAL")) || (data293 === "LESS_THAN")) || (data293 === "LESS_THAN_OR_EQUAL")) || (data293 === "INCLUDES")) || (data293 === "EXCLUDES")) || (data293 === "OPTIONS_GREATER_THAN")) || (data293 === "OPTIONS_LESS_THAN")) || (data293 === "OPTIONS_EQUALS")) || (data293 === "OPTIONS_NOT_EQUALS")) || (data293 === "CONTAINS")) || (data293 === "DOES NOT CONTAIN"))){
const err615 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err615];
}
else {
vErrors.push(err615);
}
errors++;
}
}
if(data290.value !== undefined){
let data294 = data290.value;
const _errs881 = errors;
let valid196 = false;
const _errs882 = errors;
if(!(((typeof data294 == "number") && (!(data294 % 1) && !isNaN(data294))) && (isFinite(data294)))){
const err616 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err616];
}
else {
vErrors.push(err616);
}
errors++;
}
var _valid33 = _errs882 === errors;
valid196 = valid196 || _valid33;
if(!valid196){
const _errs884 = errors;
if(typeof data294 !== "string"){
const err617 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err617];
}
else {
vErrors.push(err617);
}
errors++;
}
var _valid33 = _errs884 === errors;
valid196 = valid196 || _valid33;
if(!valid196){
const _errs886 = errors;
if(typeof data294 !== "boolean"){
const err618 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err618];
}
else {
vErrors.push(err618);
}
errors++;
}
var _valid33 = _errs886 === errors;
valid196 = valid196 || _valid33;
if(!valid196){
const _errs888 = errors;
if(!(Array.isArray(data294))){
const err619 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err619];
}
else {
vErrors.push(err619);
}
errors++;
}
var _valid33 = _errs888 === errors;
valid196 = valid196 || _valid33;
}
}
}
if(!valid196){
const err620 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err620];
}
else {
vErrors.push(err620);
}
errors++;
}
else {
errors = _errs881;
if(vErrors !== null){
if(_errs881){
vErrors.length = _errs881;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err621 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err621];
}
else {
vErrors.push(err621);
}
errors++;
}
}
}
else {
const err622 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i19,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err622];
}
else {
vErrors.push(err622);
}
errors++;
}
}
}
else {
const err623 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err623];
}
else {
vErrors.push(err623);
}
errors++;
}
}
}
else {
const err624 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err624];
}
else {
vErrors.push(err624);
}
errors++;
}
var _valid32 = _errs857 === errors;
valid189 = valid189 || _valid32;
}
if(!valid189){
const err625 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err625];
}
else {
vErrors.push(err625);
}
errors++;
}
else {
errors = _errs854;
if(vErrors !== null){
if(_errs854){
vErrors.length = _errs854;
}
else {
vErrors = null;
}
}
}
var _valid31 = _errs853 === errors;
valid188 = valid188 || _valid31;
if(!valid188){
const _errs890 = errors;
if(data284 !== null){
const err626 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err626];
}
else {
vErrors.push(err626);
}
errors++;
}
var _valid31 = _errs890 === errors;
valid188 = valid188 || _valid31;
}
if(!valid188){
const err627 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err627];
}
else {
vErrors.push(err627);
}
errors++;
}
else {
errors = _errs852;
if(vErrors !== null){
if(_errs852){
vErrors.length = _errs852;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data296 = data107.introductionPanel;
if(data296 && typeof data296 == "object" && !Array.isArray(data296)){
if(data296.title === undefined){
const err628 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err628];
}
else {
vErrors.push(err628);
}
errors++;
}
if(data296.text === undefined){
const err629 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err629];
}
else {
vErrors.push(err629);
}
errors++;
}
for(const key70 in data296){
if(!((key70 === "title") || (key70 === "text"))){
const err630 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key70},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err630];
}
else {
vErrors.push(err630);
}
errors++;
}
}
if(data296.title !== undefined){
if(typeof data296.title !== "string"){
const err631 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err631];
}
else {
vErrors.push(err631);
}
errors++;
}
}
if(data296.text !== undefined){
if(typeof data296.text !== "string"){
const err632 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err632];
}
else {
vErrors.push(err632);
}
errors++;
}
}
}
else {
const err633 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err633];
}
else {
vErrors.push(err633);
}
errors++;
}
}
if(data107.type !== undefined){
let data299 = data107.type;
if(typeof data299 !== "string"){
const err634 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/5/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err634];
}
else {
vErrors.push(err634);
}
errors++;
}
if("NameGeneratorRoster" !== data299){
const err635 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/5/properties/type/const",keyword:"const",params:{allowedValue: "NameGeneratorRoster"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err635];
}
else {
vErrors.push(err635);
}
errors++;
}
}
if(data107.subject !== undefined){
let data300 = data107.subject;
if(data300 && typeof data300 == "object" && !Array.isArray(data300)){
if(data300.entity === undefined){
const err636 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err636];
}
else {
vErrors.push(err636);
}
errors++;
}
if(data300.type === undefined){
const err637 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err637];
}
else {
vErrors.push(err637);
}
errors++;
}
for(const key71 in data300){
if(!((key71 === "entity") || (key71 === "type"))){
const err638 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key71},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err638];
}
else {
vErrors.push(err638);
}
errors++;
}
}
if(data300.entity !== undefined){
let data301 = data300.entity;
if(typeof data301 !== "string"){
const err639 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err639];
}
else {
vErrors.push(err639);
}
errors++;
}
if(!(((data301 === "edge") || (data301 === "node")) || (data301 === "ego"))){
const err640 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err640];
}
else {
vErrors.push(err640);
}
errors++;
}
}
if(data300.type !== undefined){
if(typeof data300.type !== "string"){
const err641 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err641];
}
else {
vErrors.push(err641);
}
errors++;
}
}
}
else {
const err642 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err642];
}
else {
vErrors.push(err642);
}
errors++;
}
}
if(data107.dataSource !== undefined){
if(typeof data107.dataSource !== "string"){
const err643 = {instancePath:instancePath+"/stages/" + i3+"/dataSource",schemaPath:"#/properties/stages/items/anyOf/5/properties/dataSource/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err643];
}
else {
vErrors.push(err643);
}
errors++;
}
}
if(data107.cardOptions !== undefined){
let data304 = data107.cardOptions;
if(data304 && typeof data304 == "object" && !Array.isArray(data304)){
for(const key72 in data304){
if(!((key72 === "displayLabel") || (key72 === "additionalProperties"))){
const err644 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key72},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err644];
}
else {
vErrors.push(err644);
}
errors++;
}
}
if(data304.displayLabel !== undefined){
if(typeof data304.displayLabel !== "string"){
const err645 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/displayLabel",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/displayLabel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err645];
}
else {
vErrors.push(err645);
}
errors++;
}
}
if(data304.additionalProperties !== undefined){
let data306 = data304.additionalProperties;
if(Array.isArray(data306)){
const len20 = data306.length;
for(let i20=0; i20<len20; i20++){
let data307 = data306[i20];
if(data307 && typeof data307 == "object" && !Array.isArray(data307)){
if(data307.label === undefined){
const err646 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err646];
}
else {
vErrors.push(err646);
}
errors++;
}
if(data307.variable === undefined){
const err647 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err647];
}
else {
vErrors.push(err647);
}
errors++;
}
for(const key73 in data307){
if(!((key73 === "label") || (key73 === "variable"))){
const err648 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key73},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err648];
}
else {
vErrors.push(err648);
}
errors++;
}
}
if(data307.label !== undefined){
if(typeof data307.label !== "string"){
const err649 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20+"/label",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err649];
}
else {
vErrors.push(err649);
}
errors++;
}
}
if(data307.variable !== undefined){
if(typeof data307.variable !== "string"){
const err650 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20+"/variable",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err650];
}
else {
vErrors.push(err650);
}
errors++;
}
}
}
else {
const err651 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties/" + i20,schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err651];
}
else {
vErrors.push(err651);
}
errors++;
}
}
}
else {
const err652 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions/additionalProperties",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/properties/additionalProperties/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err652];
}
else {
vErrors.push(err652);
}
errors++;
}
}
}
else {
const err653 = {instancePath:instancePath+"/stages/" + i3+"/cardOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/cardOptions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err653];
}
else {
vErrors.push(err653);
}
errors++;
}
}
if(data107.searchOptions !== undefined){
let data310 = data107.searchOptions;
if(data310 && typeof data310 == "object" && !Array.isArray(data310)){
if(data310.fuzziness === undefined){
const err654 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/required",keyword:"required",params:{missingProperty: "fuzziness"},message:"must have required property '"+"fuzziness"+"'"};
if(vErrors === null){
vErrors = [err654];
}
else {
vErrors.push(err654);
}
errors++;
}
if(data310.matchProperties === undefined){
const err655 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/required",keyword:"required",params:{missingProperty: "matchProperties"},message:"must have required property '"+"matchProperties"+"'"};
if(vErrors === null){
vErrors = [err655];
}
else {
vErrors.push(err655);
}
errors++;
}
for(const key74 in data310){
if(!((key74 === "fuzziness") || (key74 === "matchProperties"))){
const err656 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key74},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err656];
}
else {
vErrors.push(err656);
}
errors++;
}
}
if(data310.fuzziness !== undefined){
let data311 = data310.fuzziness;
if(!((typeof data311 == "number") && (isFinite(data311)))){
const err657 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions/fuzziness",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/properties/fuzziness/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err657];
}
else {
vErrors.push(err657);
}
errors++;
}
}
if(data310.matchProperties !== undefined){
let data312 = data310.matchProperties;
if(Array.isArray(data312)){
const len21 = data312.length;
for(let i21=0; i21<len21; i21++){
if(typeof data312[i21] !== "string"){
const err658 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions/matchProperties/" + i21,schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/properties/matchProperties/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err658];
}
else {
vErrors.push(err658);
}
errors++;
}
}
}
else {
const err659 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions/matchProperties",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/properties/matchProperties/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err659];
}
else {
vErrors.push(err659);
}
errors++;
}
}
}
else {
const err660 = {instancePath:instancePath+"/stages/" + i3+"/searchOptions",schemaPath:"#/properties/stages/items/anyOf/5/properties/searchOptions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err660];
}
else {
vErrors.push(err660);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data314 = data107.prompts;
if(Array.isArray(data314)){
if(data314.length < 1){
const err661 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/5/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err661];
}
else {
vErrors.push(err661);
}
errors++;
}
const len22 = data314.length;
for(let i22=0; i22<len22; i22++){
let data315 = data314[i22];
if(data315 && typeof data315 == "object" && !Array.isArray(data315)){
if(data315.id === undefined){
const err662 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err662];
}
else {
vErrors.push(err662);
}
errors++;
}
if(data315.text === undefined){
const err663 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err663];
}
else {
vErrors.push(err663);
}
errors++;
}
for(const key75 in data315){
if(!((key75 === "id") || (key75 === "text"))){
const err664 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key75},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err664];
}
else {
vErrors.push(err664);
}
errors++;
}
}
if(data315.id !== undefined){
if(typeof data315.id !== "string"){
const err665 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err665];
}
else {
vErrors.push(err665);
}
errors++;
}
}
if(data315.text !== undefined){
if(typeof data315.text !== "string"){
const err666 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err666];
}
else {
vErrors.push(err666);
}
errors++;
}
}
}
else {
const err667 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i22,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err667];
}
else {
vErrors.push(err667);
}
errors++;
}
}
}
else {
const err668 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/5/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err668];
}
else {
vErrors.push(err668);
}
errors++;
}
}
}
else {
const err669 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err669];
}
else {
vErrors.push(err669);
}
errors++;
}
var _valid9 = _errs838 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs946 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err670 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err670];
}
else {
vErrors.push(err670);
}
errors++;
}
if(data107.label === undefined){
const err671 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err671];
}
else {
vErrors.push(err671);
}
errors++;
}
if(data107.type === undefined){
const err672 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err672];
}
else {
vErrors.push(err672);
}
errors++;
}
if(data107.prompts === undefined){
const err673 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err673];
}
else {
vErrors.push(err673);
}
errors++;
}
for(const key76 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[6].properties, key76))){
const err674 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key76},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err674];
}
else {
vErrors.push(err674);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err675 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err675];
}
else {
vErrors.push(err675);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err676 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err676];
}
else {
vErrors.push(err676);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err677 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err677];
}
else {
vErrors.push(err677);
}
errors++;
}
}
if(data107.filter !== undefined){
let data321 = data107.filter;
const _errs960 = errors;
let valid217 = false;
const _errs961 = errors;
const _errs962 = errors;
let valid218 = false;
const _errs963 = errors;
const err678 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err678];
}
else {
vErrors.push(err678);
}
errors++;
var _valid35 = _errs963 === errors;
valid218 = valid218 || _valid35;
if(!valid218){
const _errs965 = errors;
if(data321 && typeof data321 == "object" && !Array.isArray(data321)){
for(const key77 in data321){
if(!((key77 === "join") || (key77 === "rules"))){
const err679 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key77},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err679];
}
else {
vErrors.push(err679);
}
errors++;
}
}
if(data321.join !== undefined){
let data322 = data321.join;
if(typeof data322 !== "string"){
const err680 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err680];
}
else {
vErrors.push(err680);
}
errors++;
}
if(!((data322 === "OR") || (data322 === "AND"))){
const err681 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err681];
}
else {
vErrors.push(err681);
}
errors++;
}
}
if(data321.rules !== undefined){
let data323 = data321.rules;
if(Array.isArray(data323)){
const len23 = data323.length;
for(let i23=0; i23<len23; i23++){
let data324 = data323[i23];
if(data324 && typeof data324 == "object" && !Array.isArray(data324)){
if(data324.type === undefined){
const err682 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err682];
}
else {
vErrors.push(err682);
}
errors++;
}
if(data324.id === undefined){
const err683 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err683];
}
else {
vErrors.push(err683);
}
errors++;
}
if(data324.options === undefined){
const err684 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err684];
}
else {
vErrors.push(err684);
}
errors++;
}
for(const key78 in data324){
if(!(((key78 === "type") || (key78 === "id")) || (key78 === "options"))){
const err685 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key78},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err685];
}
else {
vErrors.push(err685);
}
errors++;
}
}
if(data324.type !== undefined){
let data325 = data324.type;
if(typeof data325 !== "string"){
const err686 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err686];
}
else {
vErrors.push(err686);
}
errors++;
}
if(!(((data325 === "alter") || (data325 === "ego")) || (data325 === "edge"))){
const err687 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err687];
}
else {
vErrors.push(err687);
}
errors++;
}
}
if(data324.id !== undefined){
if(typeof data324.id !== "string"){
const err688 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err688];
}
else {
vErrors.push(err688);
}
errors++;
}
}
if(data324.options !== undefined){
let data327 = data324.options;
if(data327 && typeof data327 == "object" && !Array.isArray(data327)){
if(data327.operator === undefined){
const err689 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err689];
}
else {
vErrors.push(err689);
}
errors++;
}
if(data327.type !== undefined){
if(typeof data327.type !== "string"){
const err690 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err690];
}
else {
vErrors.push(err690);
}
errors++;
}
}
if(data327.attribute !== undefined){
if(typeof data327.attribute !== "string"){
const err691 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err691];
}
else {
vErrors.push(err691);
}
errors++;
}
}
if(data327.operator !== undefined){
let data330 = data327.operator;
if(typeof data330 !== "string"){
const err692 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err692];
}
else {
vErrors.push(err692);
}
errors++;
}
if(!((((((((((((((((data330 === "EXISTS") || (data330 === "NOT_EXISTS")) || (data330 === "EXACTLY")) || (data330 === "NOT")) || (data330 === "GREATER_THAN")) || (data330 === "GREATER_THAN_OR_EQUAL")) || (data330 === "LESS_THAN")) || (data330 === "LESS_THAN_OR_EQUAL")) || (data330 === "INCLUDES")) || (data330 === "EXCLUDES")) || (data330 === "OPTIONS_GREATER_THAN")) || (data330 === "OPTIONS_LESS_THAN")) || (data330 === "OPTIONS_EQUALS")) || (data330 === "OPTIONS_NOT_EQUALS")) || (data330 === "CONTAINS")) || (data330 === "DOES NOT CONTAIN"))){
const err693 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err693];
}
else {
vErrors.push(err693);
}
errors++;
}
}
if(data327.value !== undefined){
let data331 = data327.value;
const _errs989 = errors;
let valid225 = false;
const _errs990 = errors;
if(!(((typeof data331 == "number") && (!(data331 % 1) && !isNaN(data331))) && (isFinite(data331)))){
const err694 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err694];
}
else {
vErrors.push(err694);
}
errors++;
}
var _valid36 = _errs990 === errors;
valid225 = valid225 || _valid36;
if(!valid225){
const _errs992 = errors;
if(typeof data331 !== "string"){
const err695 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err695];
}
else {
vErrors.push(err695);
}
errors++;
}
var _valid36 = _errs992 === errors;
valid225 = valid225 || _valid36;
if(!valid225){
const _errs994 = errors;
if(typeof data331 !== "boolean"){
const err696 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err696];
}
else {
vErrors.push(err696);
}
errors++;
}
var _valid36 = _errs994 === errors;
valid225 = valid225 || _valid36;
if(!valid225){
const _errs996 = errors;
if(!(Array.isArray(data331))){
const err697 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err697];
}
else {
vErrors.push(err697);
}
errors++;
}
var _valid36 = _errs996 === errors;
valid225 = valid225 || _valid36;
}
}
}
if(!valid225){
const err698 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err698];
}
else {
vErrors.push(err698);
}
errors++;
}
else {
errors = _errs989;
if(vErrors !== null){
if(_errs989){
vErrors.length = _errs989;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err699 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err699];
}
else {
vErrors.push(err699);
}
errors++;
}
}
}
else {
const err700 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i23,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err700];
}
else {
vErrors.push(err700);
}
errors++;
}
}
}
else {
const err701 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err701];
}
else {
vErrors.push(err701);
}
errors++;
}
}
}
else {
const err702 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err702];
}
else {
vErrors.push(err702);
}
errors++;
}
var _valid35 = _errs965 === errors;
valid218 = valid218 || _valid35;
}
if(!valid218){
const err703 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err703];
}
else {
vErrors.push(err703);
}
errors++;
}
else {
errors = _errs962;
if(vErrors !== null){
if(_errs962){
vErrors.length = _errs962;
}
else {
vErrors = null;
}
}
}
var _valid34 = _errs961 === errors;
valid217 = valid217 || _valid34;
if(!valid217){
const _errs998 = errors;
if(data321 !== null){
const err704 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err704];
}
else {
vErrors.push(err704);
}
errors++;
}
var _valid34 = _errs998 === errors;
valid217 = valid217 || _valid34;
}
if(!valid217){
const err705 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err705];
}
else {
vErrors.push(err705);
}
errors++;
}
else {
errors = _errs960;
if(vErrors !== null){
if(_errs960){
vErrors.length = _errs960;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data333 = data107.introductionPanel;
if(data333 && typeof data333 == "object" && !Array.isArray(data333)){
if(data333.title === undefined){
const err706 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err706];
}
else {
vErrors.push(err706);
}
errors++;
}
if(data333.text === undefined){
const err707 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err707];
}
else {
vErrors.push(err707);
}
errors++;
}
for(const key79 in data333){
if(!((key79 === "title") || (key79 === "text"))){
const err708 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key79},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err708];
}
else {
vErrors.push(err708);
}
errors++;
}
}
if(data333.title !== undefined){
if(typeof data333.title !== "string"){
const err709 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err709];
}
else {
vErrors.push(err709);
}
errors++;
}
}
if(data333.text !== undefined){
if(typeof data333.text !== "string"){
const err710 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err710];
}
else {
vErrors.push(err710);
}
errors++;
}
}
}
else {
const err711 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err711];
}
else {
vErrors.push(err711);
}
errors++;
}
}
if(data107.type !== undefined){
let data336 = data107.type;
if(typeof data336 !== "string"){
const err712 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/6/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err712];
}
else {
vErrors.push(err712);
}
errors++;
}
if("Sociogram" !== data336){
const err713 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/6/properties/type/const",keyword:"const",params:{allowedValue: "Sociogram"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err713];
}
else {
vErrors.push(err713);
}
errors++;
}
}
if(data107.subject !== undefined){
let data337 = data107.subject;
if(data337 && typeof data337 == "object" && !Array.isArray(data337)){
if(data337.entity === undefined){
const err714 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err714];
}
else {
vErrors.push(err714);
}
errors++;
}
if(data337.type === undefined){
const err715 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err715];
}
else {
vErrors.push(err715);
}
errors++;
}
for(const key80 in data337){
if(!((key80 === "entity") || (key80 === "type"))){
const err716 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key80},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err716];
}
else {
vErrors.push(err716);
}
errors++;
}
}
if(data337.entity !== undefined){
let data338 = data337.entity;
if(typeof data338 !== "string"){
const err717 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err717];
}
else {
vErrors.push(err717);
}
errors++;
}
if(!(((data338 === "edge") || (data338 === "node")) || (data338 === "ego"))){
const err718 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err718];
}
else {
vErrors.push(err718);
}
errors++;
}
}
if(data337.type !== undefined){
if(typeof data337.type !== "string"){
const err719 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err719];
}
else {
vErrors.push(err719);
}
errors++;
}
}
}
else {
const err720 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err720];
}
else {
vErrors.push(err720);
}
errors++;
}
}
if(data107.background !== undefined){
let data340 = data107.background;
if(data340 && typeof data340 == "object" && !Array.isArray(data340)){
for(const key81 in data340){
if(!(((key81 === "image") || (key81 === "concentricCircles")) || (key81 === "skewedTowardCenter"))){
const err721 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key81},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err721];
}
else {
vErrors.push(err721);
}
errors++;
}
}
if(data340.image !== undefined){
if(typeof data340.image !== "string"){
const err722 = {instancePath:instancePath+"/stages/" + i3+"/background/image",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/properties/image/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err722];
}
else {
vErrors.push(err722);
}
errors++;
}
}
if(data340.concentricCircles !== undefined){
let data342 = data340.concentricCircles;
if(!(((typeof data342 == "number") && (!(data342 % 1) && !isNaN(data342))) && (isFinite(data342)))){
const err723 = {instancePath:instancePath+"/stages/" + i3+"/background/concentricCircles",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/properties/concentricCircles/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err723];
}
else {
vErrors.push(err723);
}
errors++;
}
}
if(data340.skewedTowardCenter !== undefined){
if(typeof data340.skewedTowardCenter !== "boolean"){
const err724 = {instancePath:instancePath+"/stages/" + i3+"/background/skewedTowardCenter",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/properties/skewedTowardCenter/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err724];
}
else {
vErrors.push(err724);
}
errors++;
}
}
}
else {
const err725 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/6/properties/background/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err725];
}
else {
vErrors.push(err725);
}
errors++;
}
}
if(data107.behaviours !== undefined){
let data344 = data107.behaviours;
if(data344 && typeof data344 == "object" && !Array.isArray(data344)){
if(data344.automaticLayout !== undefined){
let data345 = data344.automaticLayout;
if(data345 && typeof data345 == "object" && !Array.isArray(data345)){
if(data345.enabled === undefined){
const err726 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/required",keyword:"required",params:{missingProperty: "enabled"},message:"must have required property '"+"enabled"+"'"};
if(vErrors === null){
vErrors = [err726];
}
else {
vErrors.push(err726);
}
errors++;
}
for(const key82 in data345){
if(!(key82 === "enabled")){
const err727 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key82},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err727];
}
else {
vErrors.push(err727);
}
errors++;
}
}
if(data345.enabled !== undefined){
if(typeof data345.enabled !== "boolean"){
const err728 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout/enabled",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/properties/enabled/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err728];
}
else {
vErrors.push(err728);
}
errors++;
}
}
}
else {
const err729 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/automaticLayout",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/properties/automaticLayout/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err729];
}
else {
vErrors.push(err729);
}
errors++;
}
}
}
else {
const err730 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/6/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err730];
}
else {
vErrors.push(err730);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data347 = data107.prompts;
if(Array.isArray(data347)){
if(data347.length < 1){
const err731 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/6/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err731];
}
else {
vErrors.push(err731);
}
errors++;
}
const len24 = data347.length;
for(let i24=0; i24<len24; i24++){
let data348 = data347[i24];
if(data348 && typeof data348 == "object" && !Array.isArray(data348)){
if(data348.id === undefined){
const err732 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err732];
}
else {
vErrors.push(err732);
}
errors++;
}
if(data348.text === undefined){
const err733 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err733];
}
else {
vErrors.push(err733);
}
errors++;
}
for(const key83 in data348){
if(!((key83 === "id") || (key83 === "text"))){
const err734 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key83},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err734];
}
else {
vErrors.push(err734);
}
errors++;
}
}
if(data348.id !== undefined){
if(typeof data348.id !== "string"){
const err735 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err735];
}
else {
vErrors.push(err735);
}
errors++;
}
}
if(data348.text !== undefined){
if(typeof data348.text !== "string"){
const err736 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err736];
}
else {
vErrors.push(err736);
}
errors++;
}
}
}
else {
const err737 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i24,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err737];
}
else {
vErrors.push(err737);
}
errors++;
}
}
}
else {
const err738 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/6/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err738];
}
else {
vErrors.push(err738);
}
errors++;
}
}
}
else {
const err739 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err739];
}
else {
vErrors.push(err739);
}
errors++;
}
var _valid9 = _errs946 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1046 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err740 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err740];
}
else {
vErrors.push(err740);
}
errors++;
}
if(data107.label === undefined){
const err741 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err741];
}
else {
vErrors.push(err741);
}
errors++;
}
if(data107.type === undefined){
const err742 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err742];
}
else {
vErrors.push(err742);
}
errors++;
}
if(data107.prompts === undefined){
const err743 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err743];
}
else {
vErrors.push(err743);
}
errors++;
}
for(const key84 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[7].properties, key84))){
const err744 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key84},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err744];
}
else {
vErrors.push(err744);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err745 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err745];
}
else {
vErrors.push(err745);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err746 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err746];
}
else {
vErrors.push(err746);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err747 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err747];
}
else {
vErrors.push(err747);
}
errors++;
}
}
if(data107.filter !== undefined){
let data354 = data107.filter;
const _errs1060 = errors;
let valid242 = false;
const _errs1061 = errors;
const _errs1062 = errors;
let valid243 = false;
const _errs1063 = errors;
const err748 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err748];
}
else {
vErrors.push(err748);
}
errors++;
var _valid38 = _errs1063 === errors;
valid243 = valid243 || _valid38;
if(!valid243){
const _errs1065 = errors;
if(data354 && typeof data354 == "object" && !Array.isArray(data354)){
for(const key85 in data354){
if(!((key85 === "join") || (key85 === "rules"))){
const err749 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key85},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err749];
}
else {
vErrors.push(err749);
}
errors++;
}
}
if(data354.join !== undefined){
let data355 = data354.join;
if(typeof data355 !== "string"){
const err750 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err750];
}
else {
vErrors.push(err750);
}
errors++;
}
if(!((data355 === "OR") || (data355 === "AND"))){
const err751 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err751];
}
else {
vErrors.push(err751);
}
errors++;
}
}
if(data354.rules !== undefined){
let data356 = data354.rules;
if(Array.isArray(data356)){
const len25 = data356.length;
for(let i25=0; i25<len25; i25++){
let data357 = data356[i25];
if(data357 && typeof data357 == "object" && !Array.isArray(data357)){
if(data357.type === undefined){
const err752 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err752];
}
else {
vErrors.push(err752);
}
errors++;
}
if(data357.id === undefined){
const err753 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err753];
}
else {
vErrors.push(err753);
}
errors++;
}
if(data357.options === undefined){
const err754 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err754];
}
else {
vErrors.push(err754);
}
errors++;
}
for(const key86 in data357){
if(!(((key86 === "type") || (key86 === "id")) || (key86 === "options"))){
const err755 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key86},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err755];
}
else {
vErrors.push(err755);
}
errors++;
}
}
if(data357.type !== undefined){
let data358 = data357.type;
if(typeof data358 !== "string"){
const err756 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err756];
}
else {
vErrors.push(err756);
}
errors++;
}
if(!(((data358 === "alter") || (data358 === "ego")) || (data358 === "edge"))){
const err757 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err757];
}
else {
vErrors.push(err757);
}
errors++;
}
}
if(data357.id !== undefined){
if(typeof data357.id !== "string"){
const err758 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err758];
}
else {
vErrors.push(err758);
}
errors++;
}
}
if(data357.options !== undefined){
let data360 = data357.options;
if(data360 && typeof data360 == "object" && !Array.isArray(data360)){
if(data360.operator === undefined){
const err759 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err759];
}
else {
vErrors.push(err759);
}
errors++;
}
if(data360.type !== undefined){
if(typeof data360.type !== "string"){
const err760 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err760];
}
else {
vErrors.push(err760);
}
errors++;
}
}
if(data360.attribute !== undefined){
if(typeof data360.attribute !== "string"){
const err761 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err761];
}
else {
vErrors.push(err761);
}
errors++;
}
}
if(data360.operator !== undefined){
let data363 = data360.operator;
if(typeof data363 !== "string"){
const err762 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err762];
}
else {
vErrors.push(err762);
}
errors++;
}
if(!((((((((((((((((data363 === "EXISTS") || (data363 === "NOT_EXISTS")) || (data363 === "EXACTLY")) || (data363 === "NOT")) || (data363 === "GREATER_THAN")) || (data363 === "GREATER_THAN_OR_EQUAL")) || (data363 === "LESS_THAN")) || (data363 === "LESS_THAN_OR_EQUAL")) || (data363 === "INCLUDES")) || (data363 === "EXCLUDES")) || (data363 === "OPTIONS_GREATER_THAN")) || (data363 === "OPTIONS_LESS_THAN")) || (data363 === "OPTIONS_EQUALS")) || (data363 === "OPTIONS_NOT_EQUALS")) || (data363 === "CONTAINS")) || (data363 === "DOES NOT CONTAIN"))){
const err763 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err763];
}
else {
vErrors.push(err763);
}
errors++;
}
}
if(data360.value !== undefined){
let data364 = data360.value;
const _errs1089 = errors;
let valid250 = false;
const _errs1090 = errors;
if(!(((typeof data364 == "number") && (!(data364 % 1) && !isNaN(data364))) && (isFinite(data364)))){
const err764 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err764];
}
else {
vErrors.push(err764);
}
errors++;
}
var _valid39 = _errs1090 === errors;
valid250 = valid250 || _valid39;
if(!valid250){
const _errs1092 = errors;
if(typeof data364 !== "string"){
const err765 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err765];
}
else {
vErrors.push(err765);
}
errors++;
}
var _valid39 = _errs1092 === errors;
valid250 = valid250 || _valid39;
if(!valid250){
const _errs1094 = errors;
if(typeof data364 !== "boolean"){
const err766 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err766];
}
else {
vErrors.push(err766);
}
errors++;
}
var _valid39 = _errs1094 === errors;
valid250 = valid250 || _valid39;
if(!valid250){
const _errs1096 = errors;
if(!(Array.isArray(data364))){
const err767 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err767];
}
else {
vErrors.push(err767);
}
errors++;
}
var _valid39 = _errs1096 === errors;
valid250 = valid250 || _valid39;
}
}
}
if(!valid250){
const err768 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err768];
}
else {
vErrors.push(err768);
}
errors++;
}
else {
errors = _errs1089;
if(vErrors !== null){
if(_errs1089){
vErrors.length = _errs1089;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err769 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err769];
}
else {
vErrors.push(err769);
}
errors++;
}
}
}
else {
const err770 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i25,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err770];
}
else {
vErrors.push(err770);
}
errors++;
}
}
}
else {
const err771 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err771];
}
else {
vErrors.push(err771);
}
errors++;
}
}
}
else {
const err772 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err772];
}
else {
vErrors.push(err772);
}
errors++;
}
var _valid38 = _errs1065 === errors;
valid243 = valid243 || _valid38;
}
if(!valid243){
const err773 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err773];
}
else {
vErrors.push(err773);
}
errors++;
}
else {
errors = _errs1062;
if(vErrors !== null){
if(_errs1062){
vErrors.length = _errs1062;
}
else {
vErrors = null;
}
}
}
var _valid37 = _errs1061 === errors;
valid242 = valid242 || _valid37;
if(!valid242){
const _errs1098 = errors;
if(data354 !== null){
const err774 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err774];
}
else {
vErrors.push(err774);
}
errors++;
}
var _valid37 = _errs1098 === errors;
valid242 = valid242 || _valid37;
}
if(!valid242){
const err775 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err775];
}
else {
vErrors.push(err775);
}
errors++;
}
else {
errors = _errs1060;
if(vErrors !== null){
if(_errs1060){
vErrors.length = _errs1060;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data366 = data107.introductionPanel;
if(data366 && typeof data366 == "object" && !Array.isArray(data366)){
if(data366.title === undefined){
const err776 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err776];
}
else {
vErrors.push(err776);
}
errors++;
}
if(data366.text === undefined){
const err777 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err777];
}
else {
vErrors.push(err777);
}
errors++;
}
for(const key87 in data366){
if(!((key87 === "title") || (key87 === "text"))){
const err778 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key87},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err778];
}
else {
vErrors.push(err778);
}
errors++;
}
}
if(data366.title !== undefined){
if(typeof data366.title !== "string"){
const err779 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err779];
}
else {
vErrors.push(err779);
}
errors++;
}
}
if(data366.text !== undefined){
if(typeof data366.text !== "string"){
const err780 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err780];
}
else {
vErrors.push(err780);
}
errors++;
}
}
}
else {
const err781 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err781];
}
else {
vErrors.push(err781);
}
errors++;
}
}
if(data107.type !== undefined){
let data369 = data107.type;
if(typeof data369 !== "string"){
const err782 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/7/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err782];
}
else {
vErrors.push(err782);
}
errors++;
}
if("DyadCensus" !== data369){
const err783 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/7/properties/type/const",keyword:"const",params:{allowedValue: "DyadCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err783];
}
else {
vErrors.push(err783);
}
errors++;
}
}
if(data107.subject !== undefined){
let data370 = data107.subject;
if(data370 && typeof data370 == "object" && !Array.isArray(data370)){
if(data370.entity === undefined){
const err784 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err784];
}
else {
vErrors.push(err784);
}
errors++;
}
if(data370.type === undefined){
const err785 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err785];
}
else {
vErrors.push(err785);
}
errors++;
}
for(const key88 in data370){
if(!((key88 === "entity") || (key88 === "type"))){
const err786 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key88},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err786];
}
else {
vErrors.push(err786);
}
errors++;
}
}
if(data370.entity !== undefined){
let data371 = data370.entity;
if(typeof data371 !== "string"){
const err787 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err787];
}
else {
vErrors.push(err787);
}
errors++;
}
if(!(((data371 === "edge") || (data371 === "node")) || (data371 === "ego"))){
const err788 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err788];
}
else {
vErrors.push(err788);
}
errors++;
}
}
if(data370.type !== undefined){
if(typeof data370.type !== "string"){
const err789 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err789];
}
else {
vErrors.push(err789);
}
errors++;
}
}
}
else {
const err790 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err790];
}
else {
vErrors.push(err790);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data373 = data107.prompts;
if(Array.isArray(data373)){
if(data373.length < 1){
const err791 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err791];
}
else {
vErrors.push(err791);
}
errors++;
}
const len26 = data373.length;
for(let i26=0; i26<len26; i26++){
let data374 = data373[i26];
if(data374 && typeof data374 == "object" && !Array.isArray(data374)){
if(data374.id === undefined){
const err792 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err792];
}
else {
vErrors.push(err792);
}
errors++;
}
if(data374.text === undefined){
const err793 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err793];
}
else {
vErrors.push(err793);
}
errors++;
}
if(data374.createEdge === undefined){
const err794 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/required",keyword:"required",params:{missingProperty: "createEdge"},message:"must have required property '"+"createEdge"+"'"};
if(vErrors === null){
vErrors = [err794];
}
else {
vErrors.push(err794);
}
errors++;
}
for(const key89 in data374){
if(!(((key89 === "id") || (key89 === "text")) || (key89 === "createEdge"))){
const err795 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key89},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err795];
}
else {
vErrors.push(err795);
}
errors++;
}
}
if(data374.id !== undefined){
if(typeof data374.id !== "string"){
const err796 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err796];
}
else {
vErrors.push(err796);
}
errors++;
}
}
if(data374.text !== undefined){
if(typeof data374.text !== "string"){
const err797 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err797];
}
else {
vErrors.push(err797);
}
errors++;
}
}
if(data374.createEdge !== undefined){
if(typeof data374.createEdge !== "string"){
const err798 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26+"/createEdge",schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/properties/createEdge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err798];
}
else {
vErrors.push(err798);
}
errors++;
}
}
}
else {
const err799 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i26,schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err799];
}
else {
vErrors.push(err799);
}
errors++;
}
}
}
else {
const err800 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/7/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err800];
}
else {
vErrors.push(err800);
}
errors++;
}
}
}
else {
const err801 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err801];
}
else {
vErrors.push(err801);
}
errors++;
}
var _valid9 = _errs1046 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1132 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err802 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err802];
}
else {
vErrors.push(err802);
}
errors++;
}
if(data107.label === undefined){
const err803 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err803];
}
else {
vErrors.push(err803);
}
errors++;
}
if(data107.type === undefined){
const err804 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err804];
}
else {
vErrors.push(err804);
}
errors++;
}
if(data107.prompts === undefined){
const err805 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err805];
}
else {
vErrors.push(err805);
}
errors++;
}
for(const key90 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[8].properties, key90))){
const err806 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key90},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err806];
}
else {
vErrors.push(err806);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err807 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err807];
}
else {
vErrors.push(err807);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err808 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err808];
}
else {
vErrors.push(err808);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err809 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err809];
}
else {
vErrors.push(err809);
}
errors++;
}
}
if(data107.filter !== undefined){
let data381 = data107.filter;
const _errs1146 = errors;
let valid265 = false;
const _errs1147 = errors;
const _errs1148 = errors;
let valid266 = false;
const _errs1149 = errors;
const err810 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err810];
}
else {
vErrors.push(err810);
}
errors++;
var _valid41 = _errs1149 === errors;
valid266 = valid266 || _valid41;
if(!valid266){
const _errs1151 = errors;
if(data381 && typeof data381 == "object" && !Array.isArray(data381)){
for(const key91 in data381){
if(!((key91 === "join") || (key91 === "rules"))){
const err811 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key91},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err811];
}
else {
vErrors.push(err811);
}
errors++;
}
}
if(data381.join !== undefined){
let data382 = data381.join;
if(typeof data382 !== "string"){
const err812 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err812];
}
else {
vErrors.push(err812);
}
errors++;
}
if(!((data382 === "OR") || (data382 === "AND"))){
const err813 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err813];
}
else {
vErrors.push(err813);
}
errors++;
}
}
if(data381.rules !== undefined){
let data383 = data381.rules;
if(Array.isArray(data383)){
const len27 = data383.length;
for(let i27=0; i27<len27; i27++){
let data384 = data383[i27];
if(data384 && typeof data384 == "object" && !Array.isArray(data384)){
if(data384.type === undefined){
const err814 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err814];
}
else {
vErrors.push(err814);
}
errors++;
}
if(data384.id === undefined){
const err815 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err815];
}
else {
vErrors.push(err815);
}
errors++;
}
if(data384.options === undefined){
const err816 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err816];
}
else {
vErrors.push(err816);
}
errors++;
}
for(const key92 in data384){
if(!(((key92 === "type") || (key92 === "id")) || (key92 === "options"))){
const err817 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key92},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err817];
}
else {
vErrors.push(err817);
}
errors++;
}
}
if(data384.type !== undefined){
let data385 = data384.type;
if(typeof data385 !== "string"){
const err818 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err818];
}
else {
vErrors.push(err818);
}
errors++;
}
if(!(((data385 === "alter") || (data385 === "ego")) || (data385 === "edge"))){
const err819 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err819];
}
else {
vErrors.push(err819);
}
errors++;
}
}
if(data384.id !== undefined){
if(typeof data384.id !== "string"){
const err820 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err820];
}
else {
vErrors.push(err820);
}
errors++;
}
}
if(data384.options !== undefined){
let data387 = data384.options;
if(data387 && typeof data387 == "object" && !Array.isArray(data387)){
if(data387.operator === undefined){
const err821 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err821];
}
else {
vErrors.push(err821);
}
errors++;
}
if(data387.type !== undefined){
if(typeof data387.type !== "string"){
const err822 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err822];
}
else {
vErrors.push(err822);
}
errors++;
}
}
if(data387.attribute !== undefined){
if(typeof data387.attribute !== "string"){
const err823 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err823];
}
else {
vErrors.push(err823);
}
errors++;
}
}
if(data387.operator !== undefined){
let data390 = data387.operator;
if(typeof data390 !== "string"){
const err824 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err824];
}
else {
vErrors.push(err824);
}
errors++;
}
if(!((((((((((((((((data390 === "EXISTS") || (data390 === "NOT_EXISTS")) || (data390 === "EXACTLY")) || (data390 === "NOT")) || (data390 === "GREATER_THAN")) || (data390 === "GREATER_THAN_OR_EQUAL")) || (data390 === "LESS_THAN")) || (data390 === "LESS_THAN_OR_EQUAL")) || (data390 === "INCLUDES")) || (data390 === "EXCLUDES")) || (data390 === "OPTIONS_GREATER_THAN")) || (data390 === "OPTIONS_LESS_THAN")) || (data390 === "OPTIONS_EQUALS")) || (data390 === "OPTIONS_NOT_EQUALS")) || (data390 === "CONTAINS")) || (data390 === "DOES NOT CONTAIN"))){
const err825 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err825];
}
else {
vErrors.push(err825);
}
errors++;
}
}
if(data387.value !== undefined){
let data391 = data387.value;
const _errs1175 = errors;
let valid273 = false;
const _errs1176 = errors;
if(!(((typeof data391 == "number") && (!(data391 % 1) && !isNaN(data391))) && (isFinite(data391)))){
const err826 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err826];
}
else {
vErrors.push(err826);
}
errors++;
}
var _valid42 = _errs1176 === errors;
valid273 = valid273 || _valid42;
if(!valid273){
const _errs1178 = errors;
if(typeof data391 !== "string"){
const err827 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err827];
}
else {
vErrors.push(err827);
}
errors++;
}
var _valid42 = _errs1178 === errors;
valid273 = valid273 || _valid42;
if(!valid273){
const _errs1180 = errors;
if(typeof data391 !== "boolean"){
const err828 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err828];
}
else {
vErrors.push(err828);
}
errors++;
}
var _valid42 = _errs1180 === errors;
valid273 = valid273 || _valid42;
if(!valid273){
const _errs1182 = errors;
if(!(Array.isArray(data391))){
const err829 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err829];
}
else {
vErrors.push(err829);
}
errors++;
}
var _valid42 = _errs1182 === errors;
valid273 = valid273 || _valid42;
}
}
}
if(!valid273){
const err830 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err830];
}
else {
vErrors.push(err830);
}
errors++;
}
else {
errors = _errs1175;
if(vErrors !== null){
if(_errs1175){
vErrors.length = _errs1175;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err831 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err831];
}
else {
vErrors.push(err831);
}
errors++;
}
}
}
else {
const err832 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i27,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err832];
}
else {
vErrors.push(err832);
}
errors++;
}
}
}
else {
const err833 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err833];
}
else {
vErrors.push(err833);
}
errors++;
}
}
}
else {
const err834 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err834];
}
else {
vErrors.push(err834);
}
errors++;
}
var _valid41 = _errs1151 === errors;
valid266 = valid266 || _valid41;
}
if(!valid266){
const err835 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err835];
}
else {
vErrors.push(err835);
}
errors++;
}
else {
errors = _errs1148;
if(vErrors !== null){
if(_errs1148){
vErrors.length = _errs1148;
}
else {
vErrors = null;
}
}
}
var _valid40 = _errs1147 === errors;
valid265 = valid265 || _valid40;
if(!valid265){
const _errs1184 = errors;
if(data381 !== null){
const err836 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err836];
}
else {
vErrors.push(err836);
}
errors++;
}
var _valid40 = _errs1184 === errors;
valid265 = valid265 || _valid40;
}
if(!valid265){
const err837 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err837];
}
else {
vErrors.push(err837);
}
errors++;
}
else {
errors = _errs1146;
if(vErrors !== null){
if(_errs1146){
vErrors.length = _errs1146;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data393 = data107.introductionPanel;
if(data393 && typeof data393 == "object" && !Array.isArray(data393)){
if(data393.title === undefined){
const err838 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err838];
}
else {
vErrors.push(err838);
}
errors++;
}
if(data393.text === undefined){
const err839 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err839];
}
else {
vErrors.push(err839);
}
errors++;
}
for(const key93 in data393){
if(!((key93 === "title") || (key93 === "text"))){
const err840 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key93},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err840];
}
else {
vErrors.push(err840);
}
errors++;
}
}
if(data393.title !== undefined){
if(typeof data393.title !== "string"){
const err841 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err841];
}
else {
vErrors.push(err841);
}
errors++;
}
}
if(data393.text !== undefined){
if(typeof data393.text !== "string"){
const err842 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err842];
}
else {
vErrors.push(err842);
}
errors++;
}
}
}
else {
const err843 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err843];
}
else {
vErrors.push(err843);
}
errors++;
}
}
if(data107.type !== undefined){
let data396 = data107.type;
if(typeof data396 !== "string"){
const err844 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/8/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err844];
}
else {
vErrors.push(err844);
}
errors++;
}
if("TieStrengthCensus" !== data396){
const err845 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/8/properties/type/const",keyword:"const",params:{allowedValue: "TieStrengthCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err845];
}
else {
vErrors.push(err845);
}
errors++;
}
}
if(data107.subject !== undefined){
let data397 = data107.subject;
if(data397 && typeof data397 == "object" && !Array.isArray(data397)){
if(data397.entity === undefined){
const err846 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err846];
}
else {
vErrors.push(err846);
}
errors++;
}
if(data397.type === undefined){
const err847 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err847];
}
else {
vErrors.push(err847);
}
errors++;
}
for(const key94 in data397){
if(!((key94 === "entity") || (key94 === "type"))){
const err848 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key94},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err848];
}
else {
vErrors.push(err848);
}
errors++;
}
}
if(data397.entity !== undefined){
let data398 = data397.entity;
if(typeof data398 !== "string"){
const err849 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err849];
}
else {
vErrors.push(err849);
}
errors++;
}
if(!(((data398 === "edge") || (data398 === "node")) || (data398 === "ego"))){
const err850 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err850];
}
else {
vErrors.push(err850);
}
errors++;
}
}
if(data397.type !== undefined){
if(typeof data397.type !== "string"){
const err851 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err851];
}
else {
vErrors.push(err851);
}
errors++;
}
}
}
else {
const err852 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err852];
}
else {
vErrors.push(err852);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data400 = data107.prompts;
if(Array.isArray(data400)){
if(data400.length < 1){
const err853 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err853];
}
else {
vErrors.push(err853);
}
errors++;
}
const len28 = data400.length;
for(let i28=0; i28<len28; i28++){
let data401 = data400[i28];
if(data401 && typeof data401 == "object" && !Array.isArray(data401)){
if(data401.id === undefined){
const err854 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err854];
}
else {
vErrors.push(err854);
}
errors++;
}
if(data401.text === undefined){
const err855 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err855];
}
else {
vErrors.push(err855);
}
errors++;
}
if(data401.createEdge === undefined){
const err856 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "createEdge"},message:"must have required property '"+"createEdge"+"'"};
if(vErrors === null){
vErrors = [err856];
}
else {
vErrors.push(err856);
}
errors++;
}
if(data401.edgeVariable === undefined){
const err857 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "edgeVariable"},message:"must have required property '"+"edgeVariable"+"'"};
if(vErrors === null){
vErrors = [err857];
}
else {
vErrors.push(err857);
}
errors++;
}
if(data401.negativeLabel === undefined){
const err858 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/required",keyword:"required",params:{missingProperty: "negativeLabel"},message:"must have required property '"+"negativeLabel"+"'"};
if(vErrors === null){
vErrors = [err858];
}
else {
vErrors.push(err858);
}
errors++;
}
for(const key95 in data401){
if(!(((((key95 === "id") || (key95 === "text")) || (key95 === "createEdge")) || (key95 === "edgeVariable")) || (key95 === "negativeLabel"))){
const err859 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key95},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err859];
}
else {
vErrors.push(err859);
}
errors++;
}
}
if(data401.id !== undefined){
if(typeof data401.id !== "string"){
const err860 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err860];
}
else {
vErrors.push(err860);
}
errors++;
}
}
if(data401.text !== undefined){
if(typeof data401.text !== "string"){
const err861 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err861];
}
else {
vErrors.push(err861);
}
errors++;
}
}
if(data401.createEdge !== undefined){
if(typeof data401.createEdge !== "string"){
const err862 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/createEdge",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/properties/createEdge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err862];
}
else {
vErrors.push(err862);
}
errors++;
}
}
if(data401.edgeVariable !== undefined){
if(typeof data401.edgeVariable !== "string"){
const err863 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/edgeVariable",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/properties/edgeVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err863];
}
else {
vErrors.push(err863);
}
errors++;
}
}
if(data401.negativeLabel !== undefined){
if(typeof data401.negativeLabel !== "string"){
const err864 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28+"/negativeLabel",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/properties/negativeLabel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err864];
}
else {
vErrors.push(err864);
}
errors++;
}
}
}
else {
const err865 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i28,schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err865];
}
else {
vErrors.push(err865);
}
errors++;
}
}
}
else {
const err866 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/8/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err866];
}
else {
vErrors.push(err866);
}
errors++;
}
}
}
else {
const err867 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err867];
}
else {
vErrors.push(err867);
}
errors++;
}
var _valid9 = _errs1132 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1222 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err868 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err868];
}
else {
vErrors.push(err868);
}
errors++;
}
if(data107.label === undefined){
const err869 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err869];
}
else {
vErrors.push(err869);
}
errors++;
}
if(data107.type === undefined){
const err870 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err870];
}
else {
vErrors.push(err870);
}
errors++;
}
if(data107.prompts === undefined){
const err871 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err871];
}
else {
vErrors.push(err871);
}
errors++;
}
for(const key96 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[9].properties, key96))){
const err872 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key96},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err872];
}
else {
vErrors.push(err872);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err873 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err873];
}
else {
vErrors.push(err873);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err874 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err874];
}
else {
vErrors.push(err874);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err875 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err875];
}
else {
vErrors.push(err875);
}
errors++;
}
}
if(data107.filter !== undefined){
let data410 = data107.filter;
const _errs1236 = errors;
let valid288 = false;
const _errs1237 = errors;
const _errs1238 = errors;
let valid289 = false;
const _errs1239 = errors;
const err876 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err876];
}
else {
vErrors.push(err876);
}
errors++;
var _valid44 = _errs1239 === errors;
valid289 = valid289 || _valid44;
if(!valid289){
const _errs1241 = errors;
if(data410 && typeof data410 == "object" && !Array.isArray(data410)){
for(const key97 in data410){
if(!((key97 === "join") || (key97 === "rules"))){
const err877 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key97},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err877];
}
else {
vErrors.push(err877);
}
errors++;
}
}
if(data410.join !== undefined){
let data411 = data410.join;
if(typeof data411 !== "string"){
const err878 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err878];
}
else {
vErrors.push(err878);
}
errors++;
}
if(!((data411 === "OR") || (data411 === "AND"))){
const err879 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err879];
}
else {
vErrors.push(err879);
}
errors++;
}
}
if(data410.rules !== undefined){
let data412 = data410.rules;
if(Array.isArray(data412)){
const len29 = data412.length;
for(let i29=0; i29<len29; i29++){
let data413 = data412[i29];
if(data413 && typeof data413 == "object" && !Array.isArray(data413)){
if(data413.type === undefined){
const err880 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err880];
}
else {
vErrors.push(err880);
}
errors++;
}
if(data413.id === undefined){
const err881 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err881];
}
else {
vErrors.push(err881);
}
errors++;
}
if(data413.options === undefined){
const err882 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err882];
}
else {
vErrors.push(err882);
}
errors++;
}
for(const key98 in data413){
if(!(((key98 === "type") || (key98 === "id")) || (key98 === "options"))){
const err883 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key98},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err883];
}
else {
vErrors.push(err883);
}
errors++;
}
}
if(data413.type !== undefined){
let data414 = data413.type;
if(typeof data414 !== "string"){
const err884 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err884];
}
else {
vErrors.push(err884);
}
errors++;
}
if(!(((data414 === "alter") || (data414 === "ego")) || (data414 === "edge"))){
const err885 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err885];
}
else {
vErrors.push(err885);
}
errors++;
}
}
if(data413.id !== undefined){
if(typeof data413.id !== "string"){
const err886 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err886];
}
else {
vErrors.push(err886);
}
errors++;
}
}
if(data413.options !== undefined){
let data416 = data413.options;
if(data416 && typeof data416 == "object" && !Array.isArray(data416)){
if(data416.operator === undefined){
const err887 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err887];
}
else {
vErrors.push(err887);
}
errors++;
}
if(data416.type !== undefined){
if(typeof data416.type !== "string"){
const err888 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err888];
}
else {
vErrors.push(err888);
}
errors++;
}
}
if(data416.attribute !== undefined){
if(typeof data416.attribute !== "string"){
const err889 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err889];
}
else {
vErrors.push(err889);
}
errors++;
}
}
if(data416.operator !== undefined){
let data419 = data416.operator;
if(typeof data419 !== "string"){
const err890 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err890];
}
else {
vErrors.push(err890);
}
errors++;
}
if(!((((((((((((((((data419 === "EXISTS") || (data419 === "NOT_EXISTS")) || (data419 === "EXACTLY")) || (data419 === "NOT")) || (data419 === "GREATER_THAN")) || (data419 === "GREATER_THAN_OR_EQUAL")) || (data419 === "LESS_THAN")) || (data419 === "LESS_THAN_OR_EQUAL")) || (data419 === "INCLUDES")) || (data419 === "EXCLUDES")) || (data419 === "OPTIONS_GREATER_THAN")) || (data419 === "OPTIONS_LESS_THAN")) || (data419 === "OPTIONS_EQUALS")) || (data419 === "OPTIONS_NOT_EQUALS")) || (data419 === "CONTAINS")) || (data419 === "DOES NOT CONTAIN"))){
const err891 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err891];
}
else {
vErrors.push(err891);
}
errors++;
}
}
if(data416.value !== undefined){
let data420 = data416.value;
const _errs1265 = errors;
let valid296 = false;
const _errs1266 = errors;
if(!(((typeof data420 == "number") && (!(data420 % 1) && !isNaN(data420))) && (isFinite(data420)))){
const err892 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err892];
}
else {
vErrors.push(err892);
}
errors++;
}
var _valid45 = _errs1266 === errors;
valid296 = valid296 || _valid45;
if(!valid296){
const _errs1268 = errors;
if(typeof data420 !== "string"){
const err893 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err893];
}
else {
vErrors.push(err893);
}
errors++;
}
var _valid45 = _errs1268 === errors;
valid296 = valid296 || _valid45;
if(!valid296){
const _errs1270 = errors;
if(typeof data420 !== "boolean"){
const err894 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err894];
}
else {
vErrors.push(err894);
}
errors++;
}
var _valid45 = _errs1270 === errors;
valid296 = valid296 || _valid45;
if(!valid296){
const _errs1272 = errors;
if(!(Array.isArray(data420))){
const err895 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err895];
}
else {
vErrors.push(err895);
}
errors++;
}
var _valid45 = _errs1272 === errors;
valid296 = valid296 || _valid45;
}
}
}
if(!valid296){
const err896 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err896];
}
else {
vErrors.push(err896);
}
errors++;
}
else {
errors = _errs1265;
if(vErrors !== null){
if(_errs1265){
vErrors.length = _errs1265;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err897 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err897];
}
else {
vErrors.push(err897);
}
errors++;
}
}
}
else {
const err898 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i29,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err898];
}
else {
vErrors.push(err898);
}
errors++;
}
}
}
else {
const err899 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err899];
}
else {
vErrors.push(err899);
}
errors++;
}
}
}
else {
const err900 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err900];
}
else {
vErrors.push(err900);
}
errors++;
}
var _valid44 = _errs1241 === errors;
valid289 = valid289 || _valid44;
}
if(!valid289){
const err901 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err901];
}
else {
vErrors.push(err901);
}
errors++;
}
else {
errors = _errs1238;
if(vErrors !== null){
if(_errs1238){
vErrors.length = _errs1238;
}
else {
vErrors = null;
}
}
}
var _valid43 = _errs1237 === errors;
valid288 = valid288 || _valid43;
if(!valid288){
const _errs1274 = errors;
if(data410 !== null){
const err902 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err902];
}
else {
vErrors.push(err902);
}
errors++;
}
var _valid43 = _errs1274 === errors;
valid288 = valid288 || _valid43;
}
if(!valid288){
const err903 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err903];
}
else {
vErrors.push(err903);
}
errors++;
}
else {
errors = _errs1236;
if(vErrors !== null){
if(_errs1236){
vErrors.length = _errs1236;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data422 = data107.introductionPanel;
if(data422 && typeof data422 == "object" && !Array.isArray(data422)){
if(data422.title === undefined){
const err904 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err904];
}
else {
vErrors.push(err904);
}
errors++;
}
if(data422.text === undefined){
const err905 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err905];
}
else {
vErrors.push(err905);
}
errors++;
}
for(const key99 in data422){
if(!((key99 === "title") || (key99 === "text"))){
const err906 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key99},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err906];
}
else {
vErrors.push(err906);
}
errors++;
}
}
if(data422.title !== undefined){
if(typeof data422.title !== "string"){
const err907 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err907];
}
else {
vErrors.push(err907);
}
errors++;
}
}
if(data422.text !== undefined){
if(typeof data422.text !== "string"){
const err908 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err908];
}
else {
vErrors.push(err908);
}
errors++;
}
}
}
else {
const err909 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err909];
}
else {
vErrors.push(err909);
}
errors++;
}
}
if(data107.type !== undefined){
let data425 = data107.type;
if(typeof data425 !== "string"){
const err910 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err910];
}
else {
vErrors.push(err910);
}
errors++;
}
if("OrdinalBin" !== data425){
const err911 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/type/const",keyword:"const",params:{allowedValue: "OrdinalBin"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err911];
}
else {
vErrors.push(err911);
}
errors++;
}
}
if(data107.subject !== undefined){
let data426 = data107.subject;
if(data426 && typeof data426 == "object" && !Array.isArray(data426)){
if(data426.entity === undefined){
const err912 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err912];
}
else {
vErrors.push(err912);
}
errors++;
}
if(data426.type === undefined){
const err913 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err913];
}
else {
vErrors.push(err913);
}
errors++;
}
for(const key100 in data426){
if(!((key100 === "entity") || (key100 === "type"))){
const err914 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key100},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err914];
}
else {
vErrors.push(err914);
}
errors++;
}
}
if(data426.entity !== undefined){
let data427 = data426.entity;
if(typeof data427 !== "string"){
const err915 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err915];
}
else {
vErrors.push(err915);
}
errors++;
}
if(!(((data427 === "edge") || (data427 === "node")) || (data427 === "ego"))){
const err916 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err916];
}
else {
vErrors.push(err916);
}
errors++;
}
}
if(data426.type !== undefined){
if(typeof data426.type !== "string"){
const err917 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err917];
}
else {
vErrors.push(err917);
}
errors++;
}
}
}
else {
const err918 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err918];
}
else {
vErrors.push(err918);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data429 = data107.prompts;
if(Array.isArray(data429)){
if(data429.length < 1){
const err919 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err919];
}
else {
vErrors.push(err919);
}
errors++;
}
const len30 = data429.length;
for(let i30=0; i30<len30; i30++){
let data430 = data429[i30];
if(data430 && typeof data430 == "object" && !Array.isArray(data430)){
if(data430.id === undefined){
const err920 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err920];
}
else {
vErrors.push(err920);
}
errors++;
}
if(data430.text === undefined){
const err921 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err921];
}
else {
vErrors.push(err921);
}
errors++;
}
if(data430.variable === undefined){
const err922 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err922];
}
else {
vErrors.push(err922);
}
errors++;
}
for(const key101 in data430){
if(!((((((key101 === "id") || (key101 === "text")) || (key101 === "variable")) || (key101 === "bucketSortOrder")) || (key101 === "binSortOrder")) || (key101 === "color"))){
const err923 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key101},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err923];
}
else {
vErrors.push(err923);
}
errors++;
}
}
if(data430.id !== undefined){
if(typeof data430.id !== "string"){
const err924 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err924];
}
else {
vErrors.push(err924);
}
errors++;
}
}
if(data430.text !== undefined){
if(typeof data430.text !== "string"){
const err925 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err925];
}
else {
vErrors.push(err925);
}
errors++;
}
}
if(data430.variable !== undefined){
if(typeof data430.variable !== "string"){
const err926 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/variable",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err926];
}
else {
vErrors.push(err926);
}
errors++;
}
}
if(data430.bucketSortOrder !== undefined){
let data434 = data430.bucketSortOrder;
if(Array.isArray(data434)){
const len31 = data434.length;
for(let i31=0; i31<len31; i31++){
let data435 = data434[i31];
if(data435 && typeof data435 == "object" && !Array.isArray(data435)){
if(data435.property === undefined){
const err927 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err927];
}
else {
vErrors.push(err927);
}
errors++;
}
for(const key102 in data435){
if(!((((key102 === "property") || (key102 === "direction")) || (key102 === "type")) || (key102 === "hierarchy"))){
const err928 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key102},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err928];
}
else {
vErrors.push(err928);
}
errors++;
}
}
if(data435.property !== undefined){
if(typeof data435.property !== "string"){
const err929 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/property",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err929];
}
else {
vErrors.push(err929);
}
errors++;
}
}
if(data435.direction !== undefined){
let data437 = data435.direction;
if(typeof data437 !== "string"){
const err930 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/direction",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err930];
}
else {
vErrors.push(err930);
}
errors++;
}
if(!((data437 === "desc") || (data437 === "asc"))){
const err931 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/direction",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[9].properties.prompts.items.properties.bucketSortOrder.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err931];
}
else {
vErrors.push(err931);
}
errors++;
}
}
if(data435.type !== undefined){
let data438 = data435.type;
if(typeof data438 !== "string"){
const err932 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err932];
}
else {
vErrors.push(err932);
}
errors++;
}
if(!(((((data438 === "string") || (data438 === "number")) || (data438 === "boolean")) || (data438 === "date")) || (data438 === "hierarchy"))){
const err933 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/type",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[9].properties.prompts.items.properties.bucketSortOrder.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err933];
}
else {
vErrors.push(err933);
}
errors++;
}
}
if(data435.hierarchy !== undefined){
let data439 = data435.hierarchy;
if(Array.isArray(data439)){
const len32 = data439.length;
for(let i32=0; i32<len32; i32++){
let data440 = data439[i32];
if(((typeof data440 !== "string") && (!((typeof data440 == "number") && (isFinite(data440))))) && (typeof data440 !== "boolean")){
const err934 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/hierarchy/" + i32,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema329.properties.stages.items.anyOf[9].properties.prompts.items.properties.bucketSortOrder.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err934];
}
else {
vErrors.push(err934);
}
errors++;
}
}
}
else {
const err935 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31+"/hierarchy",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err935];
}
else {
vErrors.push(err935);
}
errors++;
}
}
}
else {
const err936 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder/" + i31,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err936];
}
else {
vErrors.push(err936);
}
errors++;
}
}
}
else {
const err937 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/bucketSortOrder",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err937];
}
else {
vErrors.push(err937);
}
errors++;
}
}
if(data430.binSortOrder !== undefined){
let data441 = data430.binSortOrder;
if(Array.isArray(data441)){
const len33 = data441.length;
for(let i33=0; i33<len33; i33++){
let data442 = data441[i33];
if(data442 && typeof data442 == "object" && !Array.isArray(data442)){
if(data442.property === undefined){
const err938 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err938];
}
else {
vErrors.push(err938);
}
errors++;
}
for(const key103 in data442){
if(!((((key103 === "property") || (key103 === "direction")) || (key103 === "type")) || (key103 === "hierarchy"))){
const err939 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key103},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err939];
}
else {
vErrors.push(err939);
}
errors++;
}
}
if(data442.property !== undefined){
if(typeof data442.property !== "string"){
const err940 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err940];
}
else {
vErrors.push(err940);
}
errors++;
}
}
if(data442.direction !== undefined){
let data444 = data442.direction;
if(typeof data444 !== "string"){
const err941 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err941];
}
else {
vErrors.push(err941);
}
errors++;
}
if(!((data444 === "desc") || (data444 === "asc"))){
const err942 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err942];
}
else {
vErrors.push(err942);
}
errors++;
}
}
if(data442.type !== undefined){
let data445 = data442.type;
if(typeof data445 !== "string"){
const err943 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err943];
}
else {
vErrors.push(err943);
}
errors++;
}
if(!(((((data445 === "string") || (data445 === "number")) || (data445 === "boolean")) || (data445 === "date")) || (data445 === "hierarchy"))){
const err944 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err944];
}
else {
vErrors.push(err944);
}
errors++;
}
}
if(data442.hierarchy !== undefined){
let data446 = data442.hierarchy;
if(Array.isArray(data446)){
const len34 = data446.length;
for(let i34=0; i34<len34; i34++){
let data447 = data446[i34];
if(((typeof data447 !== "string") && (!((typeof data447 == "number") && (isFinite(data447))))) && (typeof data447 !== "boolean")){
const err945 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/hierarchy/" + i34,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err945];
}
else {
vErrors.push(err945);
}
errors++;
}
}
}
else {
const err946 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
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
const err947 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder/" + i33,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err948 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/binSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err948];
}
else {
vErrors.push(err948);
}
errors++;
}
}
if(data430.color !== undefined){
if(typeof data430.color !== "string"){
const err949 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30+"/color",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err949];
}
else {
vErrors.push(err949);
}
errors++;
}
}
}
else {
const err950 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i30,schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err950];
}
else {
vErrors.push(err950);
}
errors++;
}
}
}
else {
const err951 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/9/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err951];
}
else {
vErrors.push(err951);
}
errors++;
}
}
}
else {
const err952 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err952];
}
else {
vErrors.push(err952);
}
errors++;
}
var _valid9 = _errs1222 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1341 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err953 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err953];
}
else {
vErrors.push(err953);
}
errors++;
}
if(data107.label === undefined){
const err954 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err954];
}
else {
vErrors.push(err954);
}
errors++;
}
if(data107.type === undefined){
const err955 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err955];
}
else {
vErrors.push(err955);
}
errors++;
}
if(data107.prompts === undefined){
const err956 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err956];
}
else {
vErrors.push(err956);
}
errors++;
}
for(const key104 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[10].properties, key104))){
const err957 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key104},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err957];
}
else {
vErrors.push(err957);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err958 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err958];
}
else {
vErrors.push(err958);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err959 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err959];
}
else {
vErrors.push(err959);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err960 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err960];
}
else {
vErrors.push(err960);
}
errors++;
}
}
if(data107.filter !== undefined){
let data452 = data107.filter;
const _errs1355 = errors;
let valid322 = false;
const _errs1356 = errors;
const _errs1357 = errors;
let valid323 = false;
const _errs1358 = errors;
const err961 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err961];
}
else {
vErrors.push(err961);
}
errors++;
var _valid47 = _errs1358 === errors;
valid323 = valid323 || _valid47;
if(!valid323){
const _errs1360 = errors;
if(data452 && typeof data452 == "object" && !Array.isArray(data452)){
for(const key105 in data452){
if(!((key105 === "join") || (key105 === "rules"))){
const err962 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key105},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err962];
}
else {
vErrors.push(err962);
}
errors++;
}
}
if(data452.join !== undefined){
let data453 = data452.join;
if(typeof data453 !== "string"){
const err963 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err963];
}
else {
vErrors.push(err963);
}
errors++;
}
if(!((data453 === "OR") || (data453 === "AND"))){
const err964 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err964];
}
else {
vErrors.push(err964);
}
errors++;
}
}
if(data452.rules !== undefined){
let data454 = data452.rules;
if(Array.isArray(data454)){
const len35 = data454.length;
for(let i35=0; i35<len35; i35++){
let data455 = data454[i35];
if(data455 && typeof data455 == "object" && !Array.isArray(data455)){
if(data455.type === undefined){
const err965 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err965];
}
else {
vErrors.push(err965);
}
errors++;
}
if(data455.id === undefined){
const err966 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err966];
}
else {
vErrors.push(err966);
}
errors++;
}
if(data455.options === undefined){
const err967 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err967];
}
else {
vErrors.push(err967);
}
errors++;
}
for(const key106 in data455){
if(!(((key106 === "type") || (key106 === "id")) || (key106 === "options"))){
const err968 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key106},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err968];
}
else {
vErrors.push(err968);
}
errors++;
}
}
if(data455.type !== undefined){
let data456 = data455.type;
if(typeof data456 !== "string"){
const err969 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err969];
}
else {
vErrors.push(err969);
}
errors++;
}
if(!(((data456 === "alter") || (data456 === "ego")) || (data456 === "edge"))){
const err970 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err970];
}
else {
vErrors.push(err970);
}
errors++;
}
}
if(data455.id !== undefined){
if(typeof data455.id !== "string"){
const err971 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err971];
}
else {
vErrors.push(err971);
}
errors++;
}
}
if(data455.options !== undefined){
let data458 = data455.options;
if(data458 && typeof data458 == "object" && !Array.isArray(data458)){
if(data458.operator === undefined){
const err972 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err972];
}
else {
vErrors.push(err972);
}
errors++;
}
if(data458.type !== undefined){
if(typeof data458.type !== "string"){
const err973 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err973];
}
else {
vErrors.push(err973);
}
errors++;
}
}
if(data458.attribute !== undefined){
if(typeof data458.attribute !== "string"){
const err974 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err974];
}
else {
vErrors.push(err974);
}
errors++;
}
}
if(data458.operator !== undefined){
let data461 = data458.operator;
if(typeof data461 !== "string"){
const err975 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err975];
}
else {
vErrors.push(err975);
}
errors++;
}
if(!((((((((((((((((data461 === "EXISTS") || (data461 === "NOT_EXISTS")) || (data461 === "EXACTLY")) || (data461 === "NOT")) || (data461 === "GREATER_THAN")) || (data461 === "GREATER_THAN_OR_EQUAL")) || (data461 === "LESS_THAN")) || (data461 === "LESS_THAN_OR_EQUAL")) || (data461 === "INCLUDES")) || (data461 === "EXCLUDES")) || (data461 === "OPTIONS_GREATER_THAN")) || (data461 === "OPTIONS_LESS_THAN")) || (data461 === "OPTIONS_EQUALS")) || (data461 === "OPTIONS_NOT_EQUALS")) || (data461 === "CONTAINS")) || (data461 === "DOES NOT CONTAIN"))){
const err976 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err976];
}
else {
vErrors.push(err976);
}
errors++;
}
}
if(data458.value !== undefined){
let data462 = data458.value;
const _errs1384 = errors;
let valid330 = false;
const _errs1385 = errors;
if(!(((typeof data462 == "number") && (!(data462 % 1) && !isNaN(data462))) && (isFinite(data462)))){
const err977 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err977];
}
else {
vErrors.push(err977);
}
errors++;
}
var _valid48 = _errs1385 === errors;
valid330 = valid330 || _valid48;
if(!valid330){
const _errs1387 = errors;
if(typeof data462 !== "string"){
const err978 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err978];
}
else {
vErrors.push(err978);
}
errors++;
}
var _valid48 = _errs1387 === errors;
valid330 = valid330 || _valid48;
if(!valid330){
const _errs1389 = errors;
if(typeof data462 !== "boolean"){
const err979 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err979];
}
else {
vErrors.push(err979);
}
errors++;
}
var _valid48 = _errs1389 === errors;
valid330 = valid330 || _valid48;
if(!valid330){
const _errs1391 = errors;
if(!(Array.isArray(data462))){
const err980 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err980];
}
else {
vErrors.push(err980);
}
errors++;
}
var _valid48 = _errs1391 === errors;
valid330 = valid330 || _valid48;
}
}
}
if(!valid330){
const err981 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err981];
}
else {
vErrors.push(err981);
}
errors++;
}
else {
errors = _errs1384;
if(vErrors !== null){
if(_errs1384){
vErrors.length = _errs1384;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err982 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err982];
}
else {
vErrors.push(err982);
}
errors++;
}
}
}
else {
const err983 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i35,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err983];
}
else {
vErrors.push(err983);
}
errors++;
}
}
}
else {
const err984 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err984];
}
else {
vErrors.push(err984);
}
errors++;
}
}
}
else {
const err985 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err985];
}
else {
vErrors.push(err985);
}
errors++;
}
var _valid47 = _errs1360 === errors;
valid323 = valid323 || _valid47;
}
if(!valid323){
const err986 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err986];
}
else {
vErrors.push(err986);
}
errors++;
}
else {
errors = _errs1357;
if(vErrors !== null){
if(_errs1357){
vErrors.length = _errs1357;
}
else {
vErrors = null;
}
}
}
var _valid46 = _errs1356 === errors;
valid322 = valid322 || _valid46;
if(!valid322){
const _errs1393 = errors;
if(data452 !== null){
const err987 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err987];
}
else {
vErrors.push(err987);
}
errors++;
}
var _valid46 = _errs1393 === errors;
valid322 = valid322 || _valid46;
}
if(!valid322){
const err988 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err988];
}
else {
vErrors.push(err988);
}
errors++;
}
else {
errors = _errs1355;
if(vErrors !== null){
if(_errs1355){
vErrors.length = _errs1355;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data464 = data107.introductionPanel;
if(data464 && typeof data464 == "object" && !Array.isArray(data464)){
if(data464.title === undefined){
const err989 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err989];
}
else {
vErrors.push(err989);
}
errors++;
}
if(data464.text === undefined){
const err990 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err990];
}
else {
vErrors.push(err990);
}
errors++;
}
for(const key107 in data464){
if(!((key107 === "title") || (key107 === "text"))){
const err991 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key107},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err991];
}
else {
vErrors.push(err991);
}
errors++;
}
}
if(data464.title !== undefined){
if(typeof data464.title !== "string"){
const err992 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err992];
}
else {
vErrors.push(err992);
}
errors++;
}
}
if(data464.text !== undefined){
if(typeof data464.text !== "string"){
const err993 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err993];
}
else {
vErrors.push(err993);
}
errors++;
}
}
}
else {
const err994 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err994];
}
else {
vErrors.push(err994);
}
errors++;
}
}
if(data107.type !== undefined){
let data467 = data107.type;
if(typeof data467 !== "string"){
const err995 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/10/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err995];
}
else {
vErrors.push(err995);
}
errors++;
}
if("CategoricalBin" !== data467){
const err996 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/10/properties/type/const",keyword:"const",params:{allowedValue: "CategoricalBin"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err996];
}
else {
vErrors.push(err996);
}
errors++;
}
}
if(data107.subject !== undefined){
let data468 = data107.subject;
if(data468 && typeof data468 == "object" && !Array.isArray(data468)){
if(data468.entity === undefined){
const err997 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err997];
}
else {
vErrors.push(err997);
}
errors++;
}
if(data468.type === undefined){
const err998 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err998];
}
else {
vErrors.push(err998);
}
errors++;
}
for(const key108 in data468){
if(!((key108 === "entity") || (key108 === "type"))){
const err999 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key108},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err999];
}
else {
vErrors.push(err999);
}
errors++;
}
}
if(data468.entity !== undefined){
let data469 = data468.entity;
if(typeof data469 !== "string"){
const err1000 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1000];
}
else {
vErrors.push(err1000);
}
errors++;
}
if(!(((data469 === "edge") || (data469 === "node")) || (data469 === "ego"))){
const err1001 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1001];
}
else {
vErrors.push(err1001);
}
errors++;
}
}
if(data468.type !== undefined){
if(typeof data468.type !== "string"){
const err1002 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1002];
}
else {
vErrors.push(err1002);
}
errors++;
}
}
}
else {
const err1003 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1003];
}
else {
vErrors.push(err1003);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data471 = data107.prompts;
if(Array.isArray(data471)){
if(data471.length < 1){
const err1004 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1004];
}
else {
vErrors.push(err1004);
}
errors++;
}
const len36 = data471.length;
for(let i36=0; i36<len36; i36++){
let data472 = data471[i36];
if(data472 && typeof data472 == "object" && !Array.isArray(data472)){
if(data472.id === undefined){
const err1005 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1005];
}
else {
vErrors.push(err1005);
}
errors++;
}
if(data472.text === undefined){
const err1006 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1006];
}
else {
vErrors.push(err1006);
}
errors++;
}
if(data472.variable === undefined){
const err1007 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err1007];
}
else {
vErrors.push(err1007);
}
errors++;
}
for(const key109 in data472){
if(!((((((((key109 === "id") || (key109 === "text")) || (key109 === "variable")) || (key109 === "otherVariable")) || (key109 === "otherVariablePrompt")) || (key109 === "otherOptionLabel")) || (key109 === "bucketSortOrder")) || (key109 === "binSortOrder"))){
const err1008 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key109},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1008];
}
else {
vErrors.push(err1008);
}
errors++;
}
}
if(data472.id !== undefined){
if(typeof data472.id !== "string"){
const err1009 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1009];
}
else {
vErrors.push(err1009);
}
errors++;
}
}
if(data472.text !== undefined){
if(typeof data472.text !== "string"){
const err1010 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1010];
}
else {
vErrors.push(err1010);
}
errors++;
}
}
if(data472.variable !== undefined){
if(typeof data472.variable !== "string"){
const err1011 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/variable",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1011];
}
else {
vErrors.push(err1011);
}
errors++;
}
}
if(data472.otherVariable !== undefined){
if(typeof data472.otherVariable !== "string"){
const err1012 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/otherVariable",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/otherVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1012];
}
else {
vErrors.push(err1012);
}
errors++;
}
}
if(data472.otherVariablePrompt !== undefined){
if(typeof data472.otherVariablePrompt !== "string"){
const err1013 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/otherVariablePrompt",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/otherVariablePrompt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1013];
}
else {
vErrors.push(err1013);
}
errors++;
}
}
if(data472.otherOptionLabel !== undefined){
if(typeof data472.otherOptionLabel !== "string"){
const err1014 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/otherOptionLabel",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/properties/otherOptionLabel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1014];
}
else {
vErrors.push(err1014);
}
errors++;
}
}
if(data472.bucketSortOrder !== undefined){
let data479 = data472.bucketSortOrder;
if(Array.isArray(data479)){
const len37 = data479.length;
for(let i37=0; i37<len37; i37++){
let data480 = data479[i37];
if(data480 && typeof data480 == "object" && !Array.isArray(data480)){
if(data480.property === undefined){
const err1015 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err1015];
}
else {
vErrors.push(err1015);
}
errors++;
}
for(const key110 in data480){
if(!((((key110 === "property") || (key110 === "direction")) || (key110 === "type")) || (key110 === "hierarchy"))){
const err1016 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key110},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1016];
}
else {
vErrors.push(err1016);
}
errors++;
}
}
if(data480.property !== undefined){
if(typeof data480.property !== "string"){
const err1017 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1017];
}
else {
vErrors.push(err1017);
}
errors++;
}
}
if(data480.direction !== undefined){
let data482 = data480.direction;
if(typeof data482 !== "string"){
const err1018 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1018];
}
else {
vErrors.push(err1018);
}
errors++;
}
if(!((data482 === "desc") || (data482 === "asc"))){
const err1019 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1019];
}
else {
vErrors.push(err1019);
}
errors++;
}
}
if(data480.type !== undefined){
let data483 = data480.type;
if(typeof data483 !== "string"){
const err1020 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1020];
}
else {
vErrors.push(err1020);
}
errors++;
}
if(!(((((data483 === "string") || (data483 === "number")) || (data483 === "boolean")) || (data483 === "date")) || (data483 === "hierarchy"))){
const err1021 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1021];
}
else {
vErrors.push(err1021);
}
errors++;
}
}
if(data480.hierarchy !== undefined){
let data484 = data480.hierarchy;
if(Array.isArray(data484)){
const len38 = data484.length;
for(let i38=0; i38<len38; i38++){
let data485 = data484[i38];
if(((typeof data485 !== "string") && (!((typeof data485 == "number") && (isFinite(data485))))) && (typeof data485 !== "boolean")){
const err1022 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/hierarchy/" + i38,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err1022];
}
else {
vErrors.push(err1022);
}
errors++;
}
}
}
else {
const err1023 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1023];
}
else {
vErrors.push(err1023);
}
errors++;
}
}
}
else {
const err1024 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder/" + i37,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1024];
}
else {
vErrors.push(err1024);
}
errors++;
}
}
}
else {
const err1025 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/bucketSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1025];
}
else {
vErrors.push(err1025);
}
errors++;
}
}
if(data472.binSortOrder !== undefined){
let data486 = data472.binSortOrder;
if(Array.isArray(data486)){
const len39 = data486.length;
for(let i39=0; i39<len39; i39++){
let data487 = data486[i39];
if(data487 && typeof data487 == "object" && !Array.isArray(data487)){
if(data487.property === undefined){
const err1026 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err1026];
}
else {
vErrors.push(err1026);
}
errors++;
}
for(const key111 in data487){
if(!((((key111 === "property") || (key111 === "direction")) || (key111 === "type")) || (key111 === "hierarchy"))){
const err1027 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key111},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1027];
}
else {
vErrors.push(err1027);
}
errors++;
}
}
if(data487.property !== undefined){
if(typeof data487.property !== "string"){
const err1028 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1028];
}
else {
vErrors.push(err1028);
}
errors++;
}
}
if(data487.direction !== undefined){
let data489 = data487.direction;
if(typeof data489 !== "string"){
const err1029 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1029];
}
else {
vErrors.push(err1029);
}
errors++;
}
if(!((data489 === "desc") || (data489 === "asc"))){
const err1030 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1030];
}
else {
vErrors.push(err1030);
}
errors++;
}
}
if(data487.type !== undefined){
let data490 = data487.type;
if(typeof data490 !== "string"){
const err1031 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1031];
}
else {
vErrors.push(err1031);
}
errors++;
}
if(!(((((data490 === "string") || (data490 === "number")) || (data490 === "boolean")) || (data490 === "date")) || (data490 === "hierarchy"))){
const err1032 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1032];
}
else {
vErrors.push(err1032);
}
errors++;
}
}
if(data487.hierarchy !== undefined){
let data491 = data487.hierarchy;
if(Array.isArray(data491)){
const len40 = data491.length;
for(let i40=0; i40<len40; i40++){
let data492 = data491[i40];
if(((typeof data492 !== "string") && (!((typeof data492 == "number") && (isFinite(data492))))) && (typeof data492 !== "boolean")){
const err1033 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/hierarchy/" + i40,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
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
const err1034 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
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
const err1035 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder/" + i39,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err1036 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36+"/binSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1036];
}
else {
vErrors.push(err1036);
}
errors++;
}
}
}
else {
const err1037 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i36,schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1037];
}
else {
vErrors.push(err1037);
}
errors++;
}
}
}
else {
const err1038 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/10/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1038];
}
else {
vErrors.push(err1038);
}
errors++;
}
}
}
else {
const err1039 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1039];
}
else {
vErrors.push(err1039);
}
errors++;
}
var _valid9 = _errs1341 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1465 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err1040 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1040];
}
else {
vErrors.push(err1040);
}
errors++;
}
if(data107.label === undefined){
const err1041 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1041];
}
else {
vErrors.push(err1041);
}
errors++;
}
if(data107.type === undefined){
const err1042 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1042];
}
else {
vErrors.push(err1042);
}
errors++;
}
if(data107.presets === undefined){
const err1043 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/required",keyword:"required",params:{missingProperty: "presets"},message:"must have required property '"+"presets"+"'"};
if(vErrors === null){
vErrors = [err1043];
}
else {
vErrors.push(err1043);
}
errors++;
}
for(const key112 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[11].properties, key112))){
const err1044 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key112},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1044];
}
else {
vErrors.push(err1044);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err1045 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1045];
}
else {
vErrors.push(err1045);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err1046 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1046];
}
else {
vErrors.push(err1046);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err1047 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1047];
}
else {
vErrors.push(err1047);
}
errors++;
}
}
if(data107.filter !== undefined){
let data496 = data107.filter;
const _errs1479 = errors;
let valid357 = false;
const _errs1480 = errors;
const _errs1481 = errors;
let valid358 = false;
const _errs1482 = errors;
const err1048 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1048];
}
else {
vErrors.push(err1048);
}
errors++;
var _valid50 = _errs1482 === errors;
valid358 = valid358 || _valid50;
if(!valid358){
const _errs1484 = errors;
if(data496 && typeof data496 == "object" && !Array.isArray(data496)){
for(const key113 in data496){
if(!((key113 === "join") || (key113 === "rules"))){
const err1049 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key113},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1049];
}
else {
vErrors.push(err1049);
}
errors++;
}
}
if(data496.join !== undefined){
let data497 = data496.join;
if(typeof data497 !== "string"){
const err1050 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1050];
}
else {
vErrors.push(err1050);
}
errors++;
}
if(!((data497 === "OR") || (data497 === "AND"))){
const err1051 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1051];
}
else {
vErrors.push(err1051);
}
errors++;
}
}
if(data496.rules !== undefined){
let data498 = data496.rules;
if(Array.isArray(data498)){
const len41 = data498.length;
for(let i41=0; i41<len41; i41++){
let data499 = data498[i41];
if(data499 && typeof data499 == "object" && !Array.isArray(data499)){
if(data499.type === undefined){
const err1052 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1052];
}
else {
vErrors.push(err1052);
}
errors++;
}
if(data499.id === undefined){
const err1053 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1053];
}
else {
vErrors.push(err1053);
}
errors++;
}
if(data499.options === undefined){
const err1054 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1054];
}
else {
vErrors.push(err1054);
}
errors++;
}
for(const key114 in data499){
if(!(((key114 === "type") || (key114 === "id")) || (key114 === "options"))){
const err1055 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key114},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1055];
}
else {
vErrors.push(err1055);
}
errors++;
}
}
if(data499.type !== undefined){
let data500 = data499.type;
if(typeof data500 !== "string"){
const err1056 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1056];
}
else {
vErrors.push(err1056);
}
errors++;
}
if(!(((data500 === "alter") || (data500 === "ego")) || (data500 === "edge"))){
const err1057 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1057];
}
else {
vErrors.push(err1057);
}
errors++;
}
}
if(data499.id !== undefined){
if(typeof data499.id !== "string"){
const err1058 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1058];
}
else {
vErrors.push(err1058);
}
errors++;
}
}
if(data499.options !== undefined){
let data502 = data499.options;
if(data502 && typeof data502 == "object" && !Array.isArray(data502)){
if(data502.operator === undefined){
const err1059 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1059];
}
else {
vErrors.push(err1059);
}
errors++;
}
if(data502.type !== undefined){
if(typeof data502.type !== "string"){
const err1060 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1060];
}
else {
vErrors.push(err1060);
}
errors++;
}
}
if(data502.attribute !== undefined){
if(typeof data502.attribute !== "string"){
const err1061 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1061];
}
else {
vErrors.push(err1061);
}
errors++;
}
}
if(data502.operator !== undefined){
let data505 = data502.operator;
if(typeof data505 !== "string"){
const err1062 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1062];
}
else {
vErrors.push(err1062);
}
errors++;
}
if(!((((((((((((((((data505 === "EXISTS") || (data505 === "NOT_EXISTS")) || (data505 === "EXACTLY")) || (data505 === "NOT")) || (data505 === "GREATER_THAN")) || (data505 === "GREATER_THAN_OR_EQUAL")) || (data505 === "LESS_THAN")) || (data505 === "LESS_THAN_OR_EQUAL")) || (data505 === "INCLUDES")) || (data505 === "EXCLUDES")) || (data505 === "OPTIONS_GREATER_THAN")) || (data505 === "OPTIONS_LESS_THAN")) || (data505 === "OPTIONS_EQUALS")) || (data505 === "OPTIONS_NOT_EQUALS")) || (data505 === "CONTAINS")) || (data505 === "DOES NOT CONTAIN"))){
const err1063 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1063];
}
else {
vErrors.push(err1063);
}
errors++;
}
}
if(data502.value !== undefined){
let data506 = data502.value;
const _errs1508 = errors;
let valid365 = false;
const _errs1509 = errors;
if(!(((typeof data506 == "number") && (!(data506 % 1) && !isNaN(data506))) && (isFinite(data506)))){
const err1064 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1064];
}
else {
vErrors.push(err1064);
}
errors++;
}
var _valid51 = _errs1509 === errors;
valid365 = valid365 || _valid51;
if(!valid365){
const _errs1511 = errors;
if(typeof data506 !== "string"){
const err1065 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1065];
}
else {
vErrors.push(err1065);
}
errors++;
}
var _valid51 = _errs1511 === errors;
valid365 = valid365 || _valid51;
if(!valid365){
const _errs1513 = errors;
if(typeof data506 !== "boolean"){
const err1066 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1066];
}
else {
vErrors.push(err1066);
}
errors++;
}
var _valid51 = _errs1513 === errors;
valid365 = valid365 || _valid51;
if(!valid365){
const _errs1515 = errors;
if(!(Array.isArray(data506))){
const err1067 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1067];
}
else {
vErrors.push(err1067);
}
errors++;
}
var _valid51 = _errs1515 === errors;
valid365 = valid365 || _valid51;
}
}
}
if(!valid365){
const err1068 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1068];
}
else {
vErrors.push(err1068);
}
errors++;
}
else {
errors = _errs1508;
if(vErrors !== null){
if(_errs1508){
vErrors.length = _errs1508;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1069 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1069];
}
else {
vErrors.push(err1069);
}
errors++;
}
}
}
else {
const err1070 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i41,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1070];
}
else {
vErrors.push(err1070);
}
errors++;
}
}
}
else {
const err1071 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1071];
}
else {
vErrors.push(err1071);
}
errors++;
}
}
}
else {
const err1072 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1072];
}
else {
vErrors.push(err1072);
}
errors++;
}
var _valid50 = _errs1484 === errors;
valid358 = valid358 || _valid50;
}
if(!valid358){
const err1073 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1073];
}
else {
vErrors.push(err1073);
}
errors++;
}
else {
errors = _errs1481;
if(vErrors !== null){
if(_errs1481){
vErrors.length = _errs1481;
}
else {
vErrors = null;
}
}
}
var _valid49 = _errs1480 === errors;
valid357 = valid357 || _valid49;
if(!valid357){
const _errs1517 = errors;
if(data496 !== null){
const err1074 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1074];
}
else {
vErrors.push(err1074);
}
errors++;
}
var _valid49 = _errs1517 === errors;
valid357 = valid357 || _valid49;
}
if(!valid357){
const err1075 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1075];
}
else {
vErrors.push(err1075);
}
errors++;
}
else {
errors = _errs1479;
if(vErrors !== null){
if(_errs1479){
vErrors.length = _errs1479;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data508 = data107.introductionPanel;
if(data508 && typeof data508 == "object" && !Array.isArray(data508)){
if(data508.title === undefined){
const err1076 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1076];
}
else {
vErrors.push(err1076);
}
errors++;
}
if(data508.text === undefined){
const err1077 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1077];
}
else {
vErrors.push(err1077);
}
errors++;
}
for(const key115 in data508){
if(!((key115 === "title") || (key115 === "text"))){
const err1078 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key115},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1078];
}
else {
vErrors.push(err1078);
}
errors++;
}
}
if(data508.title !== undefined){
if(typeof data508.title !== "string"){
const err1079 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1079];
}
else {
vErrors.push(err1079);
}
errors++;
}
}
if(data508.text !== undefined){
if(typeof data508.text !== "string"){
const err1080 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1080];
}
else {
vErrors.push(err1080);
}
errors++;
}
}
}
else {
const err1081 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1081];
}
else {
vErrors.push(err1081);
}
errors++;
}
}
if(data107.type !== undefined){
let data511 = data107.type;
if(typeof data511 !== "string"){
const err1082 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/11/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1082];
}
else {
vErrors.push(err1082);
}
errors++;
}
if("Narrative" !== data511){
const err1083 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/11/properties/type/const",keyword:"const",params:{allowedValue: "Narrative"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1083];
}
else {
vErrors.push(err1083);
}
errors++;
}
}
if(data107.subject !== undefined){
let data512 = data107.subject;
if(data512 && typeof data512 == "object" && !Array.isArray(data512)){
if(data512.entity === undefined){
const err1084 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err1084];
}
else {
vErrors.push(err1084);
}
errors++;
}
if(data512.type === undefined){
const err1085 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1085];
}
else {
vErrors.push(err1085);
}
errors++;
}
for(const key116 in data512){
if(!((key116 === "entity") || (key116 === "type"))){
const err1086 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key116},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1086];
}
else {
vErrors.push(err1086);
}
errors++;
}
}
if(data512.entity !== undefined){
let data513 = data512.entity;
if(typeof data513 !== "string"){
const err1087 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1087];
}
else {
vErrors.push(err1087);
}
errors++;
}
if(!(((data513 === "edge") || (data513 === "node")) || (data513 === "ego"))){
const err1088 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1088];
}
else {
vErrors.push(err1088);
}
errors++;
}
}
if(data512.type !== undefined){
if(typeof data512.type !== "string"){
const err1089 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1089];
}
else {
vErrors.push(err1089);
}
errors++;
}
}
}
else {
const err1090 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1090];
}
else {
vErrors.push(err1090);
}
errors++;
}
}
if(data107.presets !== undefined){
let data515 = data107.presets;
if(Array.isArray(data515)){
if(data515.length < 1){
const err1091 = {instancePath:instancePath+"/stages/" + i3+"/presets",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1091];
}
else {
vErrors.push(err1091);
}
errors++;
}
const len42 = data515.length;
for(let i42=0; i42<len42; i42++){
let data516 = data515[i42];
if(data516 && typeof data516 == "object" && !Array.isArray(data516)){
if(data516.id === undefined){
const err1092 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1092];
}
else {
vErrors.push(err1092);
}
errors++;
}
if(data516.label === undefined){
const err1093 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1093];
}
else {
vErrors.push(err1093);
}
errors++;
}
if(data516.layoutVariable === undefined){
const err1094 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/required",keyword:"required",params:{missingProperty: "layoutVariable"},message:"must have required property '"+"layoutVariable"+"'"};
if(vErrors === null){
vErrors = [err1094];
}
else {
vErrors.push(err1094);
}
errors++;
}
for(const key117 in data516){
if(!((((((key117 === "id") || (key117 === "label")) || (key117 === "layoutVariable")) || (key117 === "groupVariable")) || (key117 === "edges")) || (key117 === "highlight"))){
const err1095 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key117},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1095];
}
else {
vErrors.push(err1095);
}
errors++;
}
}
if(data516.id !== undefined){
if(typeof data516.id !== "string"){
const err1096 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/id",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1096];
}
else {
vErrors.push(err1096);
}
errors++;
}
}
if(data516.label !== undefined){
if(typeof data516.label !== "string"){
const err1097 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/label",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1097];
}
else {
vErrors.push(err1097);
}
errors++;
}
}
if(data516.layoutVariable !== undefined){
if(typeof data516.layoutVariable !== "string"){
const err1098 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/layoutVariable",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/layoutVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1098];
}
else {
vErrors.push(err1098);
}
errors++;
}
}
if(data516.groupVariable !== undefined){
if(typeof data516.groupVariable !== "string"){
const err1099 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/groupVariable",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/groupVariable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1099];
}
else {
vErrors.push(err1099);
}
errors++;
}
}
if(data516.edges !== undefined){
let data521 = data516.edges;
if(data521 && typeof data521 == "object" && !Array.isArray(data521)){
for(const key118 in data521){
if(!(key118 === "display")){
const err1100 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key118},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1100];
}
else {
vErrors.push(err1100);
}
errors++;
}
}
if(data521.display !== undefined){
let data522 = data521.display;
if(Array.isArray(data522)){
const len43 = data522.length;
for(let i43=0; i43<len43; i43++){
if(typeof data522[i43] !== "string"){
const err1101 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges/display/" + i43,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/properties/display/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err1102 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges/display",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/properties/display/type",keyword:"type",params:{type: "array"},message:"must be array"};
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
const err1103 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/edges",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/edges/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1103];
}
else {
vErrors.push(err1103);
}
errors++;
}
}
if(data516.highlight !== undefined){
let data524 = data516.highlight;
if(Array.isArray(data524)){
const len44 = data524.length;
for(let i44=0; i44<len44; i44++){
if(typeof data524[i44] !== "string"){
const err1104 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/highlight/" + i44,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/highlight/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1104];
}
else {
vErrors.push(err1104);
}
errors++;
}
}
}
else {
const err1105 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42+"/highlight",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/properties/highlight/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1105];
}
else {
vErrors.push(err1105);
}
errors++;
}
}
}
else {
const err1106 = {instancePath:instancePath+"/stages/" + i3+"/presets/" + i42,schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1106];
}
else {
vErrors.push(err1106);
}
errors++;
}
}
}
else {
const err1107 = {instancePath:instancePath+"/stages/" + i3+"/presets",schemaPath:"#/properties/stages/items/anyOf/11/properties/presets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1107];
}
else {
vErrors.push(err1107);
}
errors++;
}
}
if(data107.background !== undefined){
let data526 = data107.background;
if(data526 && typeof data526 == "object" && !Array.isArray(data526)){
for(const key119 in data526){
if(!((key119 === "concentricCircles") || (key119 === "skewedTowardCenter"))){
const err1108 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key119},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1108];
}
else {
vErrors.push(err1108);
}
errors++;
}
}
if(data526.concentricCircles !== undefined){
let data527 = data526.concentricCircles;
if(!(((typeof data527 == "number") && (!(data527 % 1) && !isNaN(data527))) && (isFinite(data527)))){
const err1109 = {instancePath:instancePath+"/stages/" + i3+"/background/concentricCircles",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/properties/concentricCircles/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1109];
}
else {
vErrors.push(err1109);
}
errors++;
}
}
if(data526.skewedTowardCenter !== undefined){
if(typeof data526.skewedTowardCenter !== "boolean"){
const err1110 = {instancePath:instancePath+"/stages/" + i3+"/background/skewedTowardCenter",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/properties/skewedTowardCenter/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1110];
}
else {
vErrors.push(err1110);
}
errors++;
}
}
}
else {
const err1111 = {instancePath:instancePath+"/stages/" + i3+"/background",schemaPath:"#/properties/stages/items/anyOf/11/properties/background/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1111];
}
else {
vErrors.push(err1111);
}
errors++;
}
}
if(data107.behaviours !== undefined){
let data529 = data107.behaviours;
if(data529 && typeof data529 == "object" && !Array.isArray(data529)){
for(const key120 in data529){
if(!((key120 === "freeDraw") || (key120 === "allowRepositioning"))){
const err1112 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key120},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1112];
}
else {
vErrors.push(err1112);
}
errors++;
}
}
if(data529.freeDraw !== undefined){
if(typeof data529.freeDraw !== "boolean"){
const err1113 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/freeDraw",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/properties/freeDraw/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1113];
}
else {
vErrors.push(err1113);
}
errors++;
}
}
if(data529.allowRepositioning !== undefined){
if(typeof data529.allowRepositioning !== "boolean"){
const err1114 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/allowRepositioning",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/properties/allowRepositioning/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1114];
}
else {
vErrors.push(err1114);
}
errors++;
}
}
}
else {
const err1115 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/11/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1115];
}
else {
vErrors.push(err1115);
}
errors++;
}
}
}
else {
const err1116 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1116];
}
else {
vErrors.push(err1116);
}
errors++;
}
var _valid9 = _errs1465 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1576 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err1117 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1117];
}
else {
vErrors.push(err1117);
}
errors++;
}
if(data107.label === undefined){
const err1118 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1118];
}
else {
vErrors.push(err1118);
}
errors++;
}
if(data107.type === undefined){
const err1119 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1119];
}
else {
vErrors.push(err1119);
}
errors++;
}
if(data107.items === undefined){
const err1120 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/required",keyword:"required",params:{missingProperty: "items"},message:"must have required property '"+"items"+"'"};
if(vErrors === null){
vErrors = [err1120];
}
else {
vErrors.push(err1120);
}
errors++;
}
for(const key121 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[12].properties, key121))){
const err1121 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key121},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1121];
}
else {
vErrors.push(err1121);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err1122 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1122];
}
else {
vErrors.push(err1122);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err1123 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1123];
}
else {
vErrors.push(err1123);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err1124 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1124];
}
else {
vErrors.push(err1124);
}
errors++;
}
}
if(data107.filter !== undefined){
let data535 = data107.filter;
const _errs1590 = errors;
let valid385 = false;
const _errs1591 = errors;
const _errs1592 = errors;
let valid386 = false;
const _errs1593 = errors;
const err1125 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1125];
}
else {
vErrors.push(err1125);
}
errors++;
var _valid53 = _errs1593 === errors;
valid386 = valid386 || _valid53;
if(!valid386){
const _errs1595 = errors;
if(data535 && typeof data535 == "object" && !Array.isArray(data535)){
for(const key122 in data535){
if(!((key122 === "join") || (key122 === "rules"))){
const err1126 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key122},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1126];
}
else {
vErrors.push(err1126);
}
errors++;
}
}
if(data535.join !== undefined){
let data536 = data535.join;
if(typeof data536 !== "string"){
const err1127 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1127];
}
else {
vErrors.push(err1127);
}
errors++;
}
if(!((data536 === "OR") || (data536 === "AND"))){
const err1128 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1128];
}
else {
vErrors.push(err1128);
}
errors++;
}
}
if(data535.rules !== undefined){
let data537 = data535.rules;
if(Array.isArray(data537)){
const len45 = data537.length;
for(let i45=0; i45<len45; i45++){
let data538 = data537[i45];
if(data538 && typeof data538 == "object" && !Array.isArray(data538)){
if(data538.type === undefined){
const err1129 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1129];
}
else {
vErrors.push(err1129);
}
errors++;
}
if(data538.id === undefined){
const err1130 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1130];
}
else {
vErrors.push(err1130);
}
errors++;
}
if(data538.options === undefined){
const err1131 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1131];
}
else {
vErrors.push(err1131);
}
errors++;
}
for(const key123 in data538){
if(!(((key123 === "type") || (key123 === "id")) || (key123 === "options"))){
const err1132 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key123},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1132];
}
else {
vErrors.push(err1132);
}
errors++;
}
}
if(data538.type !== undefined){
let data539 = data538.type;
if(typeof data539 !== "string"){
const err1133 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1133];
}
else {
vErrors.push(err1133);
}
errors++;
}
if(!(((data539 === "alter") || (data539 === "ego")) || (data539 === "edge"))){
const err1134 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1134];
}
else {
vErrors.push(err1134);
}
errors++;
}
}
if(data538.id !== undefined){
if(typeof data538.id !== "string"){
const err1135 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1135];
}
else {
vErrors.push(err1135);
}
errors++;
}
}
if(data538.options !== undefined){
let data541 = data538.options;
if(data541 && typeof data541 == "object" && !Array.isArray(data541)){
if(data541.operator === undefined){
const err1136 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1136];
}
else {
vErrors.push(err1136);
}
errors++;
}
if(data541.type !== undefined){
if(typeof data541.type !== "string"){
const err1137 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1137];
}
else {
vErrors.push(err1137);
}
errors++;
}
}
if(data541.attribute !== undefined){
if(typeof data541.attribute !== "string"){
const err1138 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1138];
}
else {
vErrors.push(err1138);
}
errors++;
}
}
if(data541.operator !== undefined){
let data544 = data541.operator;
if(typeof data544 !== "string"){
const err1139 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1139];
}
else {
vErrors.push(err1139);
}
errors++;
}
if(!((((((((((((((((data544 === "EXISTS") || (data544 === "NOT_EXISTS")) || (data544 === "EXACTLY")) || (data544 === "NOT")) || (data544 === "GREATER_THAN")) || (data544 === "GREATER_THAN_OR_EQUAL")) || (data544 === "LESS_THAN")) || (data544 === "LESS_THAN_OR_EQUAL")) || (data544 === "INCLUDES")) || (data544 === "EXCLUDES")) || (data544 === "OPTIONS_GREATER_THAN")) || (data544 === "OPTIONS_LESS_THAN")) || (data544 === "OPTIONS_EQUALS")) || (data544 === "OPTIONS_NOT_EQUALS")) || (data544 === "CONTAINS")) || (data544 === "DOES NOT CONTAIN"))){
const err1140 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1140];
}
else {
vErrors.push(err1140);
}
errors++;
}
}
if(data541.value !== undefined){
let data545 = data541.value;
const _errs1619 = errors;
let valid393 = false;
const _errs1620 = errors;
if(!(((typeof data545 == "number") && (!(data545 % 1) && !isNaN(data545))) && (isFinite(data545)))){
const err1141 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1141];
}
else {
vErrors.push(err1141);
}
errors++;
}
var _valid54 = _errs1620 === errors;
valid393 = valid393 || _valid54;
if(!valid393){
const _errs1622 = errors;
if(typeof data545 !== "string"){
const err1142 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1142];
}
else {
vErrors.push(err1142);
}
errors++;
}
var _valid54 = _errs1622 === errors;
valid393 = valid393 || _valid54;
if(!valid393){
const _errs1624 = errors;
if(typeof data545 !== "boolean"){
const err1143 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1143];
}
else {
vErrors.push(err1143);
}
errors++;
}
var _valid54 = _errs1624 === errors;
valid393 = valid393 || _valid54;
if(!valid393){
const _errs1626 = errors;
if(!(Array.isArray(data545))){
const err1144 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1144];
}
else {
vErrors.push(err1144);
}
errors++;
}
var _valid54 = _errs1626 === errors;
valid393 = valid393 || _valid54;
}
}
}
if(!valid393){
const err1145 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1145];
}
else {
vErrors.push(err1145);
}
errors++;
}
else {
errors = _errs1619;
if(vErrors !== null){
if(_errs1619){
vErrors.length = _errs1619;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1146 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1146];
}
else {
vErrors.push(err1146);
}
errors++;
}
}
}
else {
const err1147 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i45,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1147];
}
else {
vErrors.push(err1147);
}
errors++;
}
}
}
else {
const err1148 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1148];
}
else {
vErrors.push(err1148);
}
errors++;
}
}
}
else {
const err1149 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1149];
}
else {
vErrors.push(err1149);
}
errors++;
}
var _valid53 = _errs1595 === errors;
valid386 = valid386 || _valid53;
}
if(!valid386){
const err1150 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1150];
}
else {
vErrors.push(err1150);
}
errors++;
}
else {
errors = _errs1592;
if(vErrors !== null){
if(_errs1592){
vErrors.length = _errs1592;
}
else {
vErrors = null;
}
}
}
var _valid52 = _errs1591 === errors;
valid385 = valid385 || _valid52;
if(!valid385){
const _errs1628 = errors;
if(data535 !== null){
const err1151 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1151];
}
else {
vErrors.push(err1151);
}
errors++;
}
var _valid52 = _errs1628 === errors;
valid385 = valid385 || _valid52;
}
if(!valid385){
const err1152 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1152];
}
else {
vErrors.push(err1152);
}
errors++;
}
else {
errors = _errs1590;
if(vErrors !== null){
if(_errs1590){
vErrors.length = _errs1590;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data547 = data107.introductionPanel;
if(data547 && typeof data547 == "object" && !Array.isArray(data547)){
if(data547.title === undefined){
const err1153 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1153];
}
else {
vErrors.push(err1153);
}
errors++;
}
if(data547.text === undefined){
const err1154 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1154];
}
else {
vErrors.push(err1154);
}
errors++;
}
for(const key124 in data547){
if(!((key124 === "title") || (key124 === "text"))){
const err1155 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key124},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1155];
}
else {
vErrors.push(err1155);
}
errors++;
}
}
if(data547.title !== undefined){
if(typeof data547.title !== "string"){
const err1156 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1156];
}
else {
vErrors.push(err1156);
}
errors++;
}
}
if(data547.text !== undefined){
if(typeof data547.text !== "string"){
const err1157 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1157];
}
else {
vErrors.push(err1157);
}
errors++;
}
}
}
else {
const err1158 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1158];
}
else {
vErrors.push(err1158);
}
errors++;
}
}
if(data107.type !== undefined){
let data550 = data107.type;
if(typeof data550 !== "string"){
const err1159 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1159];
}
else {
vErrors.push(err1159);
}
errors++;
}
if("Information" !== data550){
const err1160 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/type/const",keyword:"const",params:{allowedValue: "Information"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1160];
}
else {
vErrors.push(err1160);
}
errors++;
}
}
if(data107.title !== undefined){
if(typeof data107.title !== "string"){
const err1161 = {instancePath:instancePath+"/stages/" + i3+"/title",schemaPath:"#/properties/stages/items/anyOf/12/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1161];
}
else {
vErrors.push(err1161);
}
errors++;
}
}
if(data107.items !== undefined){
let data552 = data107.items;
if(Array.isArray(data552)){
const len46 = data552.length;
for(let i46=0; i46<len46; i46++){
let data553 = data552[i46];
if(data553 && typeof data553 == "object" && !Array.isArray(data553)){
if(data553.id === undefined){
const err1162 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1162];
}
else {
vErrors.push(err1162);
}
errors++;
}
if(data553.type === undefined){
const err1163 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1163];
}
else {
vErrors.push(err1163);
}
errors++;
}
if(data553.content === undefined){
const err1164 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/required",keyword:"required",params:{missingProperty: "content"},message:"must have required property '"+"content"+"'"};
if(vErrors === null){
vErrors = [err1164];
}
else {
vErrors.push(err1164);
}
errors++;
}
for(const key125 in data553){
if(!((((((key125 === "id") || (key125 === "type")) || (key125 === "content")) || (key125 === "description")) || (key125 === "size")) || (key125 === "loop"))){
const err1165 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key125},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1165];
}
else {
vErrors.push(err1165);
}
errors++;
}
}
if(data553.id !== undefined){
if(typeof data553.id !== "string"){
const err1166 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/id",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1166];
}
else {
vErrors.push(err1166);
}
errors++;
}
}
if(data553.type !== undefined){
let data555 = data553.type;
if(typeof data555 !== "string"){
const err1167 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1167];
}
else {
vErrors.push(err1167);
}
errors++;
}
if(!((data555 === "text") || (data555 === "asset"))){
const err1168 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/type",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[12].properties.items.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1168];
}
else {
vErrors.push(err1168);
}
errors++;
}
}
if(data553.content !== undefined){
if(typeof data553.content !== "string"){
const err1169 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/content",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1169];
}
else {
vErrors.push(err1169);
}
errors++;
}
}
if(data553.description !== undefined){
if(typeof data553.description !== "string"){
const err1170 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/description",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1170];
}
else {
vErrors.push(err1170);
}
errors++;
}
}
if(data553.size !== undefined){
if(typeof data553.size !== "string"){
const err1171 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/size",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/size/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1171];
}
else {
vErrors.push(err1171);
}
errors++;
}
}
if(data553.loop !== undefined){
if(typeof data553.loop !== "boolean"){
const err1172 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46+"/loop",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/properties/loop/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1172];
}
else {
vErrors.push(err1172);
}
errors++;
}
}
}
else {
const err1173 = {instancePath:instancePath+"/stages/" + i3+"/items/" + i46,schemaPath:"#/properties/stages/items/anyOf/12/properties/items/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1173];
}
else {
vErrors.push(err1173);
}
errors++;
}
}
}
else {
const err1174 = {instancePath:instancePath+"/stages/" + i3+"/items",schemaPath:"#/properties/stages/items/anyOf/12/properties/items/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1174];
}
else {
vErrors.push(err1174);
}
errors++;
}
}
}
else {
const err1175 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1175];
}
else {
vErrors.push(err1175);
}
errors++;
}
var _valid9 = _errs1576 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1660 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err1176 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1176];
}
else {
vErrors.push(err1176);
}
errors++;
}
if(data107.label === undefined){
const err1177 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1177];
}
else {
vErrors.push(err1177);
}
errors++;
}
if(data107.type === undefined){
const err1178 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1178];
}
else {
vErrors.push(err1178);
}
errors++;
}
for(const key126 in data107){
if(!((((((((key126 === "id") || (key126 === "interviewScript")) || (key126 === "label")) || (key126 === "filter")) || (key126 === "skipLogic")) || (key126 === "introductionPanel")) || (key126 === "type")) || (key126 === "validation"))){
const err1179 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key126},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1179];
}
else {
vErrors.push(err1179);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err1180 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1180];
}
else {
vErrors.push(err1180);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err1181 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1181];
}
else {
vErrors.push(err1181);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err1182 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1182];
}
else {
vErrors.push(err1182);
}
errors++;
}
}
if(data107.filter !== undefined){
let data563 = data107.filter;
const _errs1674 = errors;
let valid404 = false;
const _errs1675 = errors;
const _errs1676 = errors;
let valid405 = false;
const _errs1677 = errors;
const err1183 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1183];
}
else {
vErrors.push(err1183);
}
errors++;
var _valid56 = _errs1677 === errors;
valid405 = valid405 || _valid56;
if(!valid405){
const _errs1679 = errors;
if(data563 && typeof data563 == "object" && !Array.isArray(data563)){
for(const key127 in data563){
if(!((key127 === "join") || (key127 === "rules"))){
const err1184 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key127},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1184];
}
else {
vErrors.push(err1184);
}
errors++;
}
}
if(data563.join !== undefined){
let data564 = data563.join;
if(typeof data564 !== "string"){
const err1185 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1185];
}
else {
vErrors.push(err1185);
}
errors++;
}
if(!((data564 === "OR") || (data564 === "AND"))){
const err1186 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1186];
}
else {
vErrors.push(err1186);
}
errors++;
}
}
if(data563.rules !== undefined){
let data565 = data563.rules;
if(Array.isArray(data565)){
const len47 = data565.length;
for(let i47=0; i47<len47; i47++){
let data566 = data565[i47];
if(data566 && typeof data566 == "object" && !Array.isArray(data566)){
if(data566.type === undefined){
const err1187 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1187];
}
else {
vErrors.push(err1187);
}
errors++;
}
if(data566.id === undefined){
const err1188 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1188];
}
else {
vErrors.push(err1188);
}
errors++;
}
if(data566.options === undefined){
const err1189 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1189];
}
else {
vErrors.push(err1189);
}
errors++;
}
for(const key128 in data566){
if(!(((key128 === "type") || (key128 === "id")) || (key128 === "options"))){
const err1190 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key128},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1190];
}
else {
vErrors.push(err1190);
}
errors++;
}
}
if(data566.type !== undefined){
let data567 = data566.type;
if(typeof data567 !== "string"){
const err1191 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1191];
}
else {
vErrors.push(err1191);
}
errors++;
}
if(!(((data567 === "alter") || (data567 === "ego")) || (data567 === "edge"))){
const err1192 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1192];
}
else {
vErrors.push(err1192);
}
errors++;
}
}
if(data566.id !== undefined){
if(typeof data566.id !== "string"){
const err1193 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1193];
}
else {
vErrors.push(err1193);
}
errors++;
}
}
if(data566.options !== undefined){
let data569 = data566.options;
if(data569 && typeof data569 == "object" && !Array.isArray(data569)){
if(data569.operator === undefined){
const err1194 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1194];
}
else {
vErrors.push(err1194);
}
errors++;
}
if(data569.type !== undefined){
if(typeof data569.type !== "string"){
const err1195 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1195];
}
else {
vErrors.push(err1195);
}
errors++;
}
}
if(data569.attribute !== undefined){
if(typeof data569.attribute !== "string"){
const err1196 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1196];
}
else {
vErrors.push(err1196);
}
errors++;
}
}
if(data569.operator !== undefined){
let data572 = data569.operator;
if(typeof data572 !== "string"){
const err1197 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1197];
}
else {
vErrors.push(err1197);
}
errors++;
}
if(!((((((((((((((((data572 === "EXISTS") || (data572 === "NOT_EXISTS")) || (data572 === "EXACTLY")) || (data572 === "NOT")) || (data572 === "GREATER_THAN")) || (data572 === "GREATER_THAN_OR_EQUAL")) || (data572 === "LESS_THAN")) || (data572 === "LESS_THAN_OR_EQUAL")) || (data572 === "INCLUDES")) || (data572 === "EXCLUDES")) || (data572 === "OPTIONS_GREATER_THAN")) || (data572 === "OPTIONS_LESS_THAN")) || (data572 === "OPTIONS_EQUALS")) || (data572 === "OPTIONS_NOT_EQUALS")) || (data572 === "CONTAINS")) || (data572 === "DOES NOT CONTAIN"))){
const err1198 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1198];
}
else {
vErrors.push(err1198);
}
errors++;
}
}
if(data569.value !== undefined){
let data573 = data569.value;
const _errs1703 = errors;
let valid412 = false;
const _errs1704 = errors;
if(!(((typeof data573 == "number") && (!(data573 % 1) && !isNaN(data573))) && (isFinite(data573)))){
const err1199 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1199];
}
else {
vErrors.push(err1199);
}
errors++;
}
var _valid57 = _errs1704 === errors;
valid412 = valid412 || _valid57;
if(!valid412){
const _errs1706 = errors;
if(typeof data573 !== "string"){
const err1200 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1200];
}
else {
vErrors.push(err1200);
}
errors++;
}
var _valid57 = _errs1706 === errors;
valid412 = valid412 || _valid57;
if(!valid412){
const _errs1708 = errors;
if(typeof data573 !== "boolean"){
const err1201 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1201];
}
else {
vErrors.push(err1201);
}
errors++;
}
var _valid57 = _errs1708 === errors;
valid412 = valid412 || _valid57;
if(!valid412){
const _errs1710 = errors;
if(!(Array.isArray(data573))){
const err1202 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1202];
}
else {
vErrors.push(err1202);
}
errors++;
}
var _valid57 = _errs1710 === errors;
valid412 = valid412 || _valid57;
}
}
}
if(!valid412){
const err1203 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1203];
}
else {
vErrors.push(err1203);
}
errors++;
}
else {
errors = _errs1703;
if(vErrors !== null){
if(_errs1703){
vErrors.length = _errs1703;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1204 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err1205 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i47,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1205];
}
else {
vErrors.push(err1205);
}
errors++;
}
}
}
else {
const err1206 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1206];
}
else {
vErrors.push(err1206);
}
errors++;
}
}
}
else {
const err1207 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1207];
}
else {
vErrors.push(err1207);
}
errors++;
}
var _valid56 = _errs1679 === errors;
valid405 = valid405 || _valid56;
}
if(!valid405){
const err1208 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1208];
}
else {
vErrors.push(err1208);
}
errors++;
}
else {
errors = _errs1676;
if(vErrors !== null){
if(_errs1676){
vErrors.length = _errs1676;
}
else {
vErrors = null;
}
}
}
var _valid55 = _errs1675 === errors;
valid404 = valid404 || _valid55;
if(!valid404){
const _errs1712 = errors;
if(data563 !== null){
const err1209 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1209];
}
else {
vErrors.push(err1209);
}
errors++;
}
var _valid55 = _errs1712 === errors;
valid404 = valid404 || _valid55;
}
if(!valid404){
const err1210 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1210];
}
else {
vErrors.push(err1210);
}
errors++;
}
else {
errors = _errs1674;
if(vErrors !== null){
if(_errs1674){
vErrors.length = _errs1674;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data575 = data107.introductionPanel;
if(data575 && typeof data575 == "object" && !Array.isArray(data575)){
if(data575.title === undefined){
const err1211 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/13/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1211];
}
else {
vErrors.push(err1211);
}
errors++;
}
if(data575.text === undefined){
const err1212 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/13/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1212];
}
else {
vErrors.push(err1212);
}
errors++;
}
for(const key129 in data575){
if(!((key129 === "title") || (key129 === "text"))){
const err1213 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/13/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key129},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1213];
}
else {
vErrors.push(err1213);
}
errors++;
}
}
if(data575.title !== undefined){
if(typeof data575.title !== "string"){
const err1214 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/properties/stages/items/anyOf/13/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1214];
}
else {
vErrors.push(err1214);
}
errors++;
}
}
if(data575.text !== undefined){
if(typeof data575.text !== "string"){
const err1215 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/properties/stages/items/anyOf/13/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1215];
}
else {
vErrors.push(err1215);
}
errors++;
}
}
}
else {
const err1216 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/properties/stages/items/anyOf/13/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1216];
}
else {
vErrors.push(err1216);
}
errors++;
}
}
if(data107.type !== undefined){
let data578 = data107.type;
if(typeof data578 !== "string"){
const err1217 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/13/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1217];
}
else {
vErrors.push(err1217);
}
errors++;
}
if("Anonymisation" !== data578){
const err1218 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/13/properties/type/const",keyword:"const",params:{allowedValue: "Anonymisation"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1218];
}
else {
vErrors.push(err1218);
}
errors++;
}
}
if(data107.validation !== undefined){
let data579 = data107.validation;
if(data579 && typeof data579 == "object" && !Array.isArray(data579)){
for(const key130 in data579){
if(!((key130 === "minLength") || (key130 === "maxLength"))){
const err1219 = {instancePath:instancePath+"/stages/" + i3+"/validation",schemaPath:"#/properties/stages/items/anyOf/13/properties/validation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key130},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1219];
}
else {
vErrors.push(err1219);
}
errors++;
}
}
if(data579.minLength !== undefined){
let data580 = data579.minLength;
if(!(((typeof data580 == "number") && (!(data580 % 1) && !isNaN(data580))) && (isFinite(data580)))){
const err1220 = {instancePath:instancePath+"/stages/" + i3+"/validation/minLength",schemaPath:"#/properties/stages/items/anyOf/13/properties/validation/properties/minLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1220];
}
else {
vErrors.push(err1220);
}
errors++;
}
}
if(data579.maxLength !== undefined){
let data581 = data579.maxLength;
if(!(((typeof data581 == "number") && (!(data581 % 1) && !isNaN(data581))) && (isFinite(data581)))){
const err1221 = {instancePath:instancePath+"/stages/" + i3+"/validation/maxLength",schemaPath:"#/properties/stages/items/anyOf/13/properties/validation/properties/maxLength/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1221];
}
else {
vErrors.push(err1221);
}
errors++;
}
}
}
else {
const err1222 = {instancePath:instancePath+"/stages/" + i3+"/validation",schemaPath:"#/properties/stages/items/anyOf/13/properties/validation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1222];
}
else {
vErrors.push(err1222);
}
errors++;
}
}
}
else {
const err1223 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1223];
}
else {
vErrors.push(err1223);
}
errors++;
}
var _valid9 = _errs1660 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1731 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err1224 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1224];
}
else {
vErrors.push(err1224);
}
errors++;
}
if(data107.label === undefined){
const err1225 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1225];
}
else {
vErrors.push(err1225);
}
errors++;
}
if(data107.type === undefined){
const err1226 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1226];
}
else {
vErrors.push(err1226);
}
errors++;
}
if(data107.behaviours === undefined){
const err1227 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "behaviours"},message:"must have required property '"+"behaviours"+"'"};
if(vErrors === null){
vErrors = [err1227];
}
else {
vErrors.push(err1227);
}
errors++;
}
if(data107.prompts === undefined){
const err1228 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err1228];
}
else {
vErrors.push(err1228);
}
errors++;
}
for(const key131 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[14].properties, key131))){
const err1229 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key131},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1229];
}
else {
vErrors.push(err1229);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err1230 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1230];
}
else {
vErrors.push(err1230);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err1231 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1231];
}
else {
vErrors.push(err1231);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err1232 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1232];
}
else {
vErrors.push(err1232);
}
errors++;
}
}
if(data107.filter !== undefined){
let data585 = data107.filter;
const _errs1745 = errors;
let valid420 = false;
const _errs1746 = errors;
const _errs1747 = errors;
let valid421 = false;
const _errs1748 = errors;
const err1233 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1233];
}
else {
vErrors.push(err1233);
}
errors++;
var _valid59 = _errs1748 === errors;
valid421 = valid421 || _valid59;
if(!valid421){
const _errs1750 = errors;
if(data585 && typeof data585 == "object" && !Array.isArray(data585)){
for(const key132 in data585){
if(!((key132 === "join") || (key132 === "rules"))){
const err1234 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key132},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1234];
}
else {
vErrors.push(err1234);
}
errors++;
}
}
if(data585.join !== undefined){
let data586 = data585.join;
if(typeof data586 !== "string"){
const err1235 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1235];
}
else {
vErrors.push(err1235);
}
errors++;
}
if(!((data586 === "OR") || (data586 === "AND"))){
const err1236 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1236];
}
else {
vErrors.push(err1236);
}
errors++;
}
}
if(data585.rules !== undefined){
let data587 = data585.rules;
if(Array.isArray(data587)){
const len48 = data587.length;
for(let i48=0; i48<len48; i48++){
let data588 = data587[i48];
if(data588 && typeof data588 == "object" && !Array.isArray(data588)){
if(data588.type === undefined){
const err1237 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1237];
}
else {
vErrors.push(err1237);
}
errors++;
}
if(data588.id === undefined){
const err1238 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1238];
}
else {
vErrors.push(err1238);
}
errors++;
}
if(data588.options === undefined){
const err1239 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1239];
}
else {
vErrors.push(err1239);
}
errors++;
}
for(const key133 in data588){
if(!(((key133 === "type") || (key133 === "id")) || (key133 === "options"))){
const err1240 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key133},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1240];
}
else {
vErrors.push(err1240);
}
errors++;
}
}
if(data588.type !== undefined){
let data589 = data588.type;
if(typeof data589 !== "string"){
const err1241 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1241];
}
else {
vErrors.push(err1241);
}
errors++;
}
if(!(((data589 === "alter") || (data589 === "ego")) || (data589 === "edge"))){
const err1242 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1242];
}
else {
vErrors.push(err1242);
}
errors++;
}
}
if(data588.id !== undefined){
if(typeof data588.id !== "string"){
const err1243 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1243];
}
else {
vErrors.push(err1243);
}
errors++;
}
}
if(data588.options !== undefined){
let data591 = data588.options;
if(data591 && typeof data591 == "object" && !Array.isArray(data591)){
if(data591.operator === undefined){
const err1244 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1244];
}
else {
vErrors.push(err1244);
}
errors++;
}
if(data591.type !== undefined){
if(typeof data591.type !== "string"){
const err1245 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1245];
}
else {
vErrors.push(err1245);
}
errors++;
}
}
if(data591.attribute !== undefined){
if(typeof data591.attribute !== "string"){
const err1246 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1246];
}
else {
vErrors.push(err1246);
}
errors++;
}
}
if(data591.operator !== undefined){
let data594 = data591.operator;
if(typeof data594 !== "string"){
const err1247 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1247];
}
else {
vErrors.push(err1247);
}
errors++;
}
if(!((((((((((((((((data594 === "EXISTS") || (data594 === "NOT_EXISTS")) || (data594 === "EXACTLY")) || (data594 === "NOT")) || (data594 === "GREATER_THAN")) || (data594 === "GREATER_THAN_OR_EQUAL")) || (data594 === "LESS_THAN")) || (data594 === "LESS_THAN_OR_EQUAL")) || (data594 === "INCLUDES")) || (data594 === "EXCLUDES")) || (data594 === "OPTIONS_GREATER_THAN")) || (data594 === "OPTIONS_LESS_THAN")) || (data594 === "OPTIONS_EQUALS")) || (data594 === "OPTIONS_NOT_EQUALS")) || (data594 === "CONTAINS")) || (data594 === "DOES NOT CONTAIN"))){
const err1248 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1248];
}
else {
vErrors.push(err1248);
}
errors++;
}
}
if(data591.value !== undefined){
let data595 = data591.value;
const _errs1774 = errors;
let valid428 = false;
const _errs1775 = errors;
if(!(((typeof data595 == "number") && (!(data595 % 1) && !isNaN(data595))) && (isFinite(data595)))){
const err1249 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1249];
}
else {
vErrors.push(err1249);
}
errors++;
}
var _valid60 = _errs1775 === errors;
valid428 = valid428 || _valid60;
if(!valid428){
const _errs1777 = errors;
if(typeof data595 !== "string"){
const err1250 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1250];
}
else {
vErrors.push(err1250);
}
errors++;
}
var _valid60 = _errs1777 === errors;
valid428 = valid428 || _valid60;
if(!valid428){
const _errs1779 = errors;
if(typeof data595 !== "boolean"){
const err1251 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1251];
}
else {
vErrors.push(err1251);
}
errors++;
}
var _valid60 = _errs1779 === errors;
valid428 = valid428 || _valid60;
if(!valid428){
const _errs1781 = errors;
if(!(Array.isArray(data595))){
const err1252 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1252];
}
else {
vErrors.push(err1252);
}
errors++;
}
var _valid60 = _errs1781 === errors;
valid428 = valid428 || _valid60;
}
}
}
if(!valid428){
const err1253 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1253];
}
else {
vErrors.push(err1253);
}
errors++;
}
else {
errors = _errs1774;
if(vErrors !== null){
if(_errs1774){
vErrors.length = _errs1774;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1254 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1254];
}
else {
vErrors.push(err1254);
}
errors++;
}
}
}
else {
const err1255 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i48,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1255];
}
else {
vErrors.push(err1255);
}
errors++;
}
}
}
else {
const err1256 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1256];
}
else {
vErrors.push(err1256);
}
errors++;
}
}
}
else {
const err1257 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1257];
}
else {
vErrors.push(err1257);
}
errors++;
}
var _valid59 = _errs1750 === errors;
valid421 = valid421 || _valid59;
}
if(!valid421){
const err1258 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1258];
}
else {
vErrors.push(err1258);
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
var _valid58 = _errs1746 === errors;
valid420 = valid420 || _valid58;
if(!valid420){
const _errs1783 = errors;
if(data585 !== null){
const err1259 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1259];
}
else {
vErrors.push(err1259);
}
errors++;
}
var _valid58 = _errs1783 === errors;
valid420 = valid420 || _valid58;
}
if(!valid420){
const err1260 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1260];
}
else {
vErrors.push(err1260);
}
errors++;
}
else {
errors = _errs1745;
if(vErrors !== null){
if(_errs1745){
vErrors.length = _errs1745;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data597 = data107.introductionPanel;
if(data597 && typeof data597 == "object" && !Array.isArray(data597)){
if(data597.title === undefined){
const err1261 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1261];
}
else {
vErrors.push(err1261);
}
errors++;
}
if(data597.text === undefined){
const err1262 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1262];
}
else {
vErrors.push(err1262);
}
errors++;
}
for(const key134 in data597){
if(!((key134 === "title") || (key134 === "text"))){
const err1263 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key134},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1263];
}
else {
vErrors.push(err1263);
}
errors++;
}
}
if(data597.title !== undefined){
if(typeof data597.title !== "string"){
const err1264 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1264];
}
else {
vErrors.push(err1264);
}
errors++;
}
}
if(data597.text !== undefined){
if(typeof data597.text !== "string"){
const err1265 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1265];
}
else {
vErrors.push(err1265);
}
errors++;
}
}
}
else {
const err1266 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1266];
}
else {
vErrors.push(err1266);
}
errors++;
}
}
if(data107.type !== undefined){
let data600 = data107.type;
if(typeof data600 !== "string"){
const err1267 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/14/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1267];
}
else {
vErrors.push(err1267);
}
errors++;
}
if("OneToManyDyadCensus" !== data600){
const err1268 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/14/properties/type/const",keyword:"const",params:{allowedValue: "OneToManyDyadCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1268];
}
else {
vErrors.push(err1268);
}
errors++;
}
}
if(data107.subject !== undefined){
let data601 = data107.subject;
if(data601 && typeof data601 == "object" && !Array.isArray(data601)){
if(data601.entity === undefined){
const err1269 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err1269];
}
else {
vErrors.push(err1269);
}
errors++;
}
if(data601.type === undefined){
const err1270 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1270];
}
else {
vErrors.push(err1270);
}
errors++;
}
for(const key135 in data601){
if(!((key135 === "entity") || (key135 === "type"))){
const err1271 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key135},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1271];
}
else {
vErrors.push(err1271);
}
errors++;
}
}
if(data601.entity !== undefined){
let data602 = data601.entity;
if(typeof data602 !== "string"){
const err1272 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1272];
}
else {
vErrors.push(err1272);
}
errors++;
}
if(!(((data602 === "edge") || (data602 === "node")) || (data602 === "ego"))){
const err1273 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1273];
}
else {
vErrors.push(err1273);
}
errors++;
}
}
if(data601.type !== undefined){
if(typeof data601.type !== "string"){
const err1274 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1274];
}
else {
vErrors.push(err1274);
}
errors++;
}
}
}
else {
const err1275 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1275];
}
else {
vErrors.push(err1275);
}
errors++;
}
}
if(data107.behaviours !== undefined){
let data604 = data107.behaviours;
if(data604 && typeof data604 == "object" && !Array.isArray(data604)){
if(data604.removeAfterConsideration === undefined){
const err1276 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/14/properties/behaviours/required",keyword:"required",params:{missingProperty: "removeAfterConsideration"},message:"must have required property '"+"removeAfterConsideration"+"'"};
if(vErrors === null){
vErrors = [err1276];
}
else {
vErrors.push(err1276);
}
errors++;
}
for(const key136 in data604){
if(!(key136 === "removeAfterConsideration")){
const err1277 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/14/properties/behaviours/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key136},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1277];
}
else {
vErrors.push(err1277);
}
errors++;
}
}
if(data604.removeAfterConsideration !== undefined){
if(typeof data604.removeAfterConsideration !== "boolean"){
const err1278 = {instancePath:instancePath+"/stages/" + i3+"/behaviours/removeAfterConsideration",schemaPath:"#/properties/stages/items/anyOf/14/properties/behaviours/properties/removeAfterConsideration/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
const err1279 = {instancePath:instancePath+"/stages/" + i3+"/behaviours",schemaPath:"#/properties/stages/items/anyOf/14/properties/behaviours/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1279];
}
else {
vErrors.push(err1279);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data606 = data107.prompts;
if(Array.isArray(data606)){
if(data606.length < 1){
const err1280 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1280];
}
else {
vErrors.push(err1280);
}
errors++;
}
const len49 = data606.length;
for(let i49=0; i49<len49; i49++){
let data607 = data606[i49];
if(data607 && typeof data607 == "object" && !Array.isArray(data607)){
if(data607.id === undefined){
const err1281 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1281];
}
else {
vErrors.push(err1281);
}
errors++;
}
if(data607.text === undefined){
const err1282 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1282];
}
else {
vErrors.push(err1282);
}
errors++;
}
if(data607.createEdge === undefined){
const err1283 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/required",keyword:"required",params:{missingProperty: "createEdge"},message:"must have required property '"+"createEdge"+"'"};
if(vErrors === null){
vErrors = [err1283];
}
else {
vErrors.push(err1283);
}
errors++;
}
for(const key137 in data607){
if(!(((((key137 === "id") || (key137 === "text")) || (key137 === "createEdge")) || (key137 === "bucketSortOrder")) || (key137 === "binSortOrder"))){
const err1284 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key137},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1284];
}
else {
vErrors.push(err1284);
}
errors++;
}
}
if(data607.id !== undefined){
if(typeof data607.id !== "string"){
const err1285 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1285];
}
else {
vErrors.push(err1285);
}
errors++;
}
}
if(data607.text !== undefined){
if(typeof data607.text !== "string"){
const err1286 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1286];
}
else {
vErrors.push(err1286);
}
errors++;
}
}
if(data607.createEdge !== undefined){
if(typeof data607.createEdge !== "string"){
const err1287 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/createEdge",schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/properties/createEdge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1287];
}
else {
vErrors.push(err1287);
}
errors++;
}
}
if(data607.bucketSortOrder !== undefined){
let data611 = data607.bucketSortOrder;
if(Array.isArray(data611)){
const len50 = data611.length;
for(let i50=0; i50<len50; i50++){
let data612 = data611[i50];
if(data612 && typeof data612 == "object" && !Array.isArray(data612)){
if(data612.property === undefined){
const err1288 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err1288];
}
else {
vErrors.push(err1288);
}
errors++;
}
for(const key138 in data612){
if(!((((key138 === "property") || (key138 === "direction")) || (key138 === "type")) || (key138 === "hierarchy"))){
const err1289 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key138},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1289];
}
else {
vErrors.push(err1289);
}
errors++;
}
}
if(data612.property !== undefined){
if(typeof data612.property !== "string"){
const err1290 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1290];
}
else {
vErrors.push(err1290);
}
errors++;
}
}
if(data612.direction !== undefined){
let data614 = data612.direction;
if(typeof data614 !== "string"){
const err1291 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1291];
}
else {
vErrors.push(err1291);
}
errors++;
}
if(!((data614 === "desc") || (data614 === "asc"))){
const err1292 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1292];
}
else {
vErrors.push(err1292);
}
errors++;
}
}
if(data612.type !== undefined){
let data615 = data612.type;
if(typeof data615 !== "string"){
const err1293 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1293];
}
else {
vErrors.push(err1293);
}
errors++;
}
if(!(((((data615 === "string") || (data615 === "number")) || (data615 === "boolean")) || (data615 === "date")) || (data615 === "hierarchy"))){
const err1294 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1294];
}
else {
vErrors.push(err1294);
}
errors++;
}
}
if(data612.hierarchy !== undefined){
let data616 = data612.hierarchy;
if(Array.isArray(data616)){
const len51 = data616.length;
for(let i51=0; i51<len51; i51++){
let data617 = data616[i51];
if(((typeof data617 !== "string") && (!((typeof data617 == "number") && (isFinite(data617))))) && (typeof data617 !== "boolean")){
const err1295 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/hierarchy/" + i51,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err1295];
}
else {
vErrors.push(err1295);
}
errors++;
}
}
}
else {
const err1296 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1296];
}
else {
vErrors.push(err1296);
}
errors++;
}
}
}
else {
const err1297 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder/" + i50,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1297];
}
else {
vErrors.push(err1297);
}
errors++;
}
}
}
else {
const err1298 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/bucketSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1298];
}
else {
vErrors.push(err1298);
}
errors++;
}
}
if(data607.binSortOrder !== undefined){
let data618 = data607.binSortOrder;
if(Array.isArray(data618)){
const len52 = data618.length;
for(let i52=0; i52<len52; i52++){
let data619 = data618[i52];
if(data619 && typeof data619 == "object" && !Array.isArray(data619)){
if(data619.property === undefined){
const err1299 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/required",keyword:"required",params:{missingProperty: "property"},message:"must have required property '"+"property"+"'"};
if(vErrors === null){
vErrors = [err1299];
}
else {
vErrors.push(err1299);
}
errors++;
}
for(const key139 in data619){
if(!((((key139 === "property") || (key139 === "direction")) || (key139 === "type")) || (key139 === "hierarchy"))){
const err1300 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key139},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1300];
}
else {
vErrors.push(err1300);
}
errors++;
}
}
if(data619.property !== undefined){
if(typeof data619.property !== "string"){
const err1301 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/property",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/property/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1301];
}
else {
vErrors.push(err1301);
}
errors++;
}
}
if(data619.direction !== undefined){
let data621 = data619.direction;
if(typeof data621 !== "string"){
const err1302 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1302];
}
else {
vErrors.push(err1302);
}
errors++;
}
if(!((data621 === "desc") || (data621 === "asc"))){
const err1303 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/direction",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1303];
}
else {
vErrors.push(err1303);
}
errors++;
}
}
if(data619.type !== undefined){
let data622 = data619.type;
if(typeof data622 !== "string"){
const err1304 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1304];
}
else {
vErrors.push(err1304);
}
errors++;
}
if(!(((((data622 === "string") || (data622 === "number")) || (data622 === "boolean")) || (data622 === "date")) || (data622 === "hierarchy"))){
const err1305 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema405.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1305];
}
else {
vErrors.push(err1305);
}
errors++;
}
}
if(data619.hierarchy !== undefined){
let data623 = data619.hierarchy;
if(Array.isArray(data623)){
const len53 = data623.length;
for(let i53=0; i53<len53; i53++){
let data624 = data623[i53];
if(((typeof data624 !== "string") && (!((typeof data624 == "number") && (isFinite(data624))))) && (typeof data624 !== "boolean")){
const err1306 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/hierarchy/" + i53,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/items/type",keyword:"type",params:{type: schema405.items.properties.hierarchy.items.type},message:"must be string,number,boolean"};
if(vErrors === null){
vErrors = [err1306];
}
else {
vErrors.push(err1306);
}
errors++;
}
}
}
else {
const err1307 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52+"/hierarchy",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/properties/hierarchy/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1307];
}
else {
vErrors.push(err1307);
}
errors++;
}
}
}
else {
const err1308 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder/" + i52,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1308];
}
else {
vErrors.push(err1308);
}
errors++;
}
}
}
else {
const err1309 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49+"/binSortOrder",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/9/properties/prompts/items/properties/bucketSortOrder/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1309];
}
else {
vErrors.push(err1309);
}
errors++;
}
}
}
else {
const err1310 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i49,schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1310];
}
else {
vErrors.push(err1310);
}
errors++;
}
}
}
else {
const err1311 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/14/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1311];
}
else {
vErrors.push(err1311);
}
errors++;
}
}
}
else {
const err1312 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1312];
}
else {
vErrors.push(err1312);
}
errors++;
}
var _valid9 = _errs1731 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1854 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err1313 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1313];
}
else {
vErrors.push(err1313);
}
errors++;
}
if(data107.label === undefined){
const err1314 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1314];
}
else {
vErrors.push(err1314);
}
errors++;
}
if(data107.type === undefined){
const err1315 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1315];
}
else {
vErrors.push(err1315);
}
errors++;
}
for(const key140 in data107){
if(!(((((((key140 === "id") || (key140 === "interviewScript")) || (key140 === "label")) || (key140 === "filter")) || (key140 === "skipLogic")) || (key140 === "introductionPanel")) || (key140 === "type"))){
const err1316 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key140},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1316];
}
else {
vErrors.push(err1316);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err1317 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1317];
}
else {
vErrors.push(err1317);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err1318 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1318];
}
else {
vErrors.push(err1318);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err1319 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1319];
}
else {
vErrors.push(err1319);
}
errors++;
}
}
if(data107.filter !== undefined){
let data628 = data107.filter;
const _errs1868 = errors;
let valid456 = false;
const _errs1869 = errors;
const _errs1870 = errors;
let valid457 = false;
const _errs1871 = errors;
const err1320 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1320];
}
else {
vErrors.push(err1320);
}
errors++;
var _valid62 = _errs1871 === errors;
valid457 = valid457 || _valid62;
if(!valid457){
const _errs1873 = errors;
if(data628 && typeof data628 == "object" && !Array.isArray(data628)){
for(const key141 in data628){
if(!((key141 === "join") || (key141 === "rules"))){
const err1321 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key141},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1321];
}
else {
vErrors.push(err1321);
}
errors++;
}
}
if(data628.join !== undefined){
let data629 = data628.join;
if(typeof data629 !== "string"){
const err1322 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1322];
}
else {
vErrors.push(err1322);
}
errors++;
}
if(!((data629 === "OR") || (data629 === "AND"))){
const err1323 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1323];
}
else {
vErrors.push(err1323);
}
errors++;
}
}
if(data628.rules !== undefined){
let data630 = data628.rules;
if(Array.isArray(data630)){
const len54 = data630.length;
for(let i54=0; i54<len54; i54++){
let data631 = data630[i54];
if(data631 && typeof data631 == "object" && !Array.isArray(data631)){
if(data631.type === undefined){
const err1324 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1324];
}
else {
vErrors.push(err1324);
}
errors++;
}
if(data631.id === undefined){
const err1325 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1325];
}
else {
vErrors.push(err1325);
}
errors++;
}
if(data631.options === undefined){
const err1326 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1326];
}
else {
vErrors.push(err1326);
}
errors++;
}
for(const key142 in data631){
if(!(((key142 === "type") || (key142 === "id")) || (key142 === "options"))){
const err1327 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key142},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1327];
}
else {
vErrors.push(err1327);
}
errors++;
}
}
if(data631.type !== undefined){
let data632 = data631.type;
if(typeof data632 !== "string"){
const err1328 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1328];
}
else {
vErrors.push(err1328);
}
errors++;
}
if(!(((data632 === "alter") || (data632 === "ego")) || (data632 === "edge"))){
const err1329 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1329];
}
else {
vErrors.push(err1329);
}
errors++;
}
}
if(data631.id !== undefined){
if(typeof data631.id !== "string"){
const err1330 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1330];
}
else {
vErrors.push(err1330);
}
errors++;
}
}
if(data631.options !== undefined){
let data634 = data631.options;
if(data634 && typeof data634 == "object" && !Array.isArray(data634)){
if(data634.operator === undefined){
const err1331 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1331];
}
else {
vErrors.push(err1331);
}
errors++;
}
if(data634.type !== undefined){
if(typeof data634.type !== "string"){
const err1332 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1332];
}
else {
vErrors.push(err1332);
}
errors++;
}
}
if(data634.attribute !== undefined){
if(typeof data634.attribute !== "string"){
const err1333 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1333];
}
else {
vErrors.push(err1333);
}
errors++;
}
}
if(data634.operator !== undefined){
let data637 = data634.operator;
if(typeof data637 !== "string"){
const err1334 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1334];
}
else {
vErrors.push(err1334);
}
errors++;
}
if(!((((((((((((((((data637 === "EXISTS") || (data637 === "NOT_EXISTS")) || (data637 === "EXACTLY")) || (data637 === "NOT")) || (data637 === "GREATER_THAN")) || (data637 === "GREATER_THAN_OR_EQUAL")) || (data637 === "LESS_THAN")) || (data637 === "LESS_THAN_OR_EQUAL")) || (data637 === "INCLUDES")) || (data637 === "EXCLUDES")) || (data637 === "OPTIONS_GREATER_THAN")) || (data637 === "OPTIONS_LESS_THAN")) || (data637 === "OPTIONS_EQUALS")) || (data637 === "OPTIONS_NOT_EQUALS")) || (data637 === "CONTAINS")) || (data637 === "DOES NOT CONTAIN"))){
const err1335 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1335];
}
else {
vErrors.push(err1335);
}
errors++;
}
}
if(data634.value !== undefined){
let data638 = data634.value;
const _errs1897 = errors;
let valid464 = false;
const _errs1898 = errors;
if(!(((typeof data638 == "number") && (!(data638 % 1) && !isNaN(data638))) && (isFinite(data638)))){
const err1336 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1336];
}
else {
vErrors.push(err1336);
}
errors++;
}
var _valid63 = _errs1898 === errors;
valid464 = valid464 || _valid63;
if(!valid464){
const _errs1900 = errors;
if(typeof data638 !== "string"){
const err1337 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1337];
}
else {
vErrors.push(err1337);
}
errors++;
}
var _valid63 = _errs1900 === errors;
valid464 = valid464 || _valid63;
if(!valid464){
const _errs1902 = errors;
if(typeof data638 !== "boolean"){
const err1338 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1338];
}
else {
vErrors.push(err1338);
}
errors++;
}
var _valid63 = _errs1902 === errors;
valid464 = valid464 || _valid63;
if(!valid464){
const _errs1904 = errors;
if(!(Array.isArray(data638))){
const err1339 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1339];
}
else {
vErrors.push(err1339);
}
errors++;
}
var _valid63 = _errs1904 === errors;
valid464 = valid464 || _valid63;
}
}
}
if(!valid464){
const err1340 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1340];
}
else {
vErrors.push(err1340);
}
errors++;
}
else {
errors = _errs1897;
if(vErrors !== null){
if(_errs1897){
vErrors.length = _errs1897;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1341 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1341];
}
else {
vErrors.push(err1341);
}
errors++;
}
}
}
else {
const err1342 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i54,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1342];
}
else {
vErrors.push(err1342);
}
errors++;
}
}
}
else {
const err1343 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1343];
}
else {
vErrors.push(err1343);
}
errors++;
}
}
}
else {
const err1344 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1344];
}
else {
vErrors.push(err1344);
}
errors++;
}
var _valid62 = _errs1873 === errors;
valid457 = valid457 || _valid62;
}
if(!valid457){
const err1345 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1345];
}
else {
vErrors.push(err1345);
}
errors++;
}
else {
errors = _errs1870;
if(vErrors !== null){
if(_errs1870){
vErrors.length = _errs1870;
}
else {
vErrors = null;
}
}
}
var _valid61 = _errs1869 === errors;
valid456 = valid456 || _valid61;
if(!valid456){
const _errs1906 = errors;
if(data628 !== null){
const err1346 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1346];
}
else {
vErrors.push(err1346);
}
errors++;
}
var _valid61 = _errs1906 === errors;
valid456 = valid456 || _valid61;
}
if(!valid456){
const err1347 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1347];
}
else {
vErrors.push(err1347);
}
errors++;
}
else {
errors = _errs1868;
if(vErrors !== null){
if(_errs1868){
vErrors.length = _errs1868;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data640 = data107.introductionPanel;
if(data640 && typeof data640 == "object" && !Array.isArray(data640)){
if(data640.title === undefined){
const err1348 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1348];
}
else {
vErrors.push(err1348);
}
errors++;
}
if(data640.text === undefined){
const err1349 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1349];
}
else {
vErrors.push(err1349);
}
errors++;
}
for(const key143 in data640){
if(!((key143 === "title") || (key143 === "text"))){
const err1350 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key143},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1350];
}
else {
vErrors.push(err1350);
}
errors++;
}
}
if(data640.title !== undefined){
if(typeof data640.title !== "string"){
const err1351 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1351];
}
else {
vErrors.push(err1351);
}
errors++;
}
}
if(data640.text !== undefined){
if(typeof data640.text !== "string"){
const err1352 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1352];
}
else {
vErrors.push(err1352);
}
errors++;
}
}
}
else {
const err1353 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1353];
}
else {
vErrors.push(err1353);
}
errors++;
}
}
if(data107.type !== undefined){
let data643 = data107.type;
if(typeof data643 !== "string"){
const err1354 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/15/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1354];
}
else {
vErrors.push(err1354);
}
errors++;
}
if("FamilyTreeCensus" !== data643){
const err1355 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/15/properties/type/const",keyword:"const",params:{allowedValue: "FamilyTreeCensus"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1355];
}
else {
vErrors.push(err1355);
}
errors++;
}
}
}
else {
const err1356 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1356];
}
else {
vErrors.push(err1356);
}
errors++;
}
var _valid9 = _errs1854 === errors;
valid47 = valid47 || _valid9;
if(!valid47){
const _errs1919 = errors;
if(data107 && typeof data107 == "object" && !Array.isArray(data107)){
if(data107.id === undefined){
const err1357 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1357];
}
else {
vErrors.push(err1357);
}
errors++;
}
if(data107.label === undefined){
const err1358 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1358];
}
else {
vErrors.push(err1358);
}
errors++;
}
if(data107.type === undefined){
const err1359 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1359];
}
else {
vErrors.push(err1359);
}
errors++;
}
if(data107.mapOptions === undefined){
const err1360 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "mapOptions"},message:"must have required property '"+"mapOptions"+"'"};
if(vErrors === null){
vErrors = [err1360];
}
else {
vErrors.push(err1360);
}
errors++;
}
if(data107.prompts === undefined){
const err1361 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/required",keyword:"required",params:{missingProperty: "prompts"},message:"must have required property '"+"prompts"+"'"};
if(vErrors === null){
vErrors = [err1361];
}
else {
vErrors.push(err1361);
}
errors++;
}
for(const key144 in data107){
if(!(func2.call(schema329.properties.stages.items.anyOf[16].properties, key144))){
const err1362 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key144},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1362];
}
else {
vErrors.push(err1362);
}
errors++;
}
}
if(data107.id !== undefined){
if(typeof data107.id !== "string"){
const err1363 = {instancePath:instancePath+"/stages/" + i3+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1363];
}
else {
vErrors.push(err1363);
}
errors++;
}
}
if(data107.interviewScript !== undefined){
if(typeof data107.interviewScript !== "string"){
const err1364 = {instancePath:instancePath+"/stages/" + i3+"/interviewScript",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/interviewScript/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1364];
}
else {
vErrors.push(err1364);
}
errors++;
}
}
if(data107.label !== undefined){
if(typeof data107.label !== "string"){
const err1365 = {instancePath:instancePath+"/stages/" + i3+"/label",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1365];
}
else {
vErrors.push(err1365);
}
errors++;
}
}
if(data107.filter !== undefined){
let data647 = data107.filter;
const _errs1933 = errors;
let valid472 = false;
const _errs1934 = errors;
const _errs1935 = errors;
let valid473 = false;
const _errs1936 = errors;
const err1366 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/0/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err1366];
}
else {
vErrors.push(err1366);
}
errors++;
var _valid65 = _errs1936 === errors;
valid473 = valid473 || _valid65;
if(!valid473){
const _errs1938 = errors;
if(data647 && typeof data647 == "object" && !Array.isArray(data647)){
for(const key145 in data647){
if(!((key145 === "join") || (key145 === "rules"))){
const err1367 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key145},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1367];
}
else {
vErrors.push(err1367);
}
errors++;
}
}
if(data647.join !== undefined){
let data648 = data647.join;
if(typeof data648 !== "string"){
const err1368 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1368];
}
else {
vErrors.push(err1368);
}
errors++;
}
if(!((data648 === "OR") || (data648 === "AND"))){
const err1369 = {instancePath:instancePath+"/stages/" + i3+"/filter/join",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/join/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.join.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1369];
}
else {
vErrors.push(err1369);
}
errors++;
}
}
if(data647.rules !== undefined){
let data649 = data647.rules;
if(Array.isArray(data649)){
const len55 = data649.length;
for(let i55=0; i55<len55; i55++){
let data650 = data649[i55];
if(data650 && typeof data650 == "object" && !Array.isArray(data650)){
if(data650.type === undefined){
const err1370 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1370];
}
else {
vErrors.push(err1370);
}
errors++;
}
if(data650.id === undefined){
const err1371 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1371];
}
else {
vErrors.push(err1371);
}
errors++;
}
if(data650.options === undefined){
const err1372 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/required",keyword:"required",params:{missingProperty: "options"},message:"must have required property '"+"options"+"'"};
if(vErrors === null){
vErrors = [err1372];
}
else {
vErrors.push(err1372);
}
errors++;
}
for(const key146 in data650){
if(!(((key146 === "type") || (key146 === "id")) || (key146 === "options"))){
const err1373 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key146},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1373];
}
else {
vErrors.push(err1373);
}
errors++;
}
}
if(data650.type !== undefined){
let data651 = data650.type;
if(typeof data651 !== "string"){
const err1374 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1374];
}
else {
vErrors.push(err1374);
}
errors++;
}
if(!(((data651 === "alter") || (data651 === "ego")) || (data651 === "edge"))){
const err1375 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1375];
}
else {
vErrors.push(err1375);
}
errors++;
}
}
if(data650.id !== undefined){
if(typeof data650.id !== "string"){
const err1376 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1376];
}
else {
vErrors.push(err1376);
}
errors++;
}
}
if(data650.options !== undefined){
let data653 = data650.options;
if(data653 && typeof data653 == "object" && !Array.isArray(data653)){
if(data653.operator === undefined){
const err1377 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/required",keyword:"required",params:{missingProperty: "operator"},message:"must have required property '"+"operator"+"'"};
if(vErrors === null){
vErrors = [err1377];
}
else {
vErrors.push(err1377);
}
errors++;
}
if(data653.type !== undefined){
if(typeof data653.type !== "string"){
const err1378 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1378];
}
else {
vErrors.push(err1378);
}
errors++;
}
}
if(data653.attribute !== undefined){
if(typeof data653.attribute !== "string"){
const err1379 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/attribute",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/attribute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1379];
}
else {
vErrors.push(err1379);
}
errors++;
}
}
if(data653.operator !== undefined){
let data656 = data653.operator;
if(typeof data656 !== "string"){
const err1380 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1380];
}
else {
vErrors.push(err1380);
}
errors++;
}
if(!((((((((((((((((data656 === "EXISTS") || (data656 === "NOT_EXISTS")) || (data656 === "EXACTLY")) || (data656 === "NOT")) || (data656 === "GREATER_THAN")) || (data656 === "GREATER_THAN_OR_EQUAL")) || (data656 === "LESS_THAN")) || (data656 === "LESS_THAN_OR_EQUAL")) || (data656 === "INCLUDES")) || (data656 === "EXCLUDES")) || (data656 === "OPTIONS_GREATER_THAN")) || (data656 === "OPTIONS_LESS_THAN")) || (data656 === "OPTIONS_EQUALS")) || (data656 === "OPTIONS_NOT_EQUALS")) || (data656 === "CONTAINS")) || (data656 === "DOES NOT CONTAIN"))){
const err1381 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/operator",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/operator/enum",keyword:"enum",params:{allowedValues: schema338.anyOf[0].anyOf[1].properties.rules.items.properties.options.allOf[0].properties.operator.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1381];
}
else {
vErrors.push(err1381);
}
errors++;
}
}
if(data653.value !== undefined){
let data657 = data653.value;
const _errs1962 = errors;
let valid480 = false;
const _errs1963 = errors;
if(!(((typeof data657 == "number") && (!(data657 % 1) && !isNaN(data657))) && (isFinite(data657)))){
const err1382 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err1382];
}
else {
vErrors.push(err1382);
}
errors++;
}
var _valid66 = _errs1963 === errors;
valid480 = valid480 || _valid66;
if(!valid480){
const _errs1965 = errors;
if(typeof data657 !== "string"){
const err1383 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1383];
}
else {
vErrors.push(err1383);
}
errors++;
}
var _valid66 = _errs1965 === errors;
valid480 = valid480 || _valid66;
if(!valid480){
const _errs1967 = errors;
if(typeof data657 !== "boolean"){
const err1384 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1384];
}
else {
vErrors.push(err1384);
}
errors++;
}
var _valid66 = _errs1967 === errors;
valid480 = valid480 || _valid66;
if(!valid480){
const _errs1969 = errors;
if(!(Array.isArray(data657))){
const err1385 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1385];
}
else {
vErrors.push(err1385);
}
errors++;
}
var _valid66 = _errs1969 === errors;
valid480 = valid480 || _valid66;
}
}
}
if(!valid480){
const err1386 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options/value",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/properties/value/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1386];
}
else {
vErrors.push(err1386);
}
errors++;
}
else {
errors = _errs1962;
if(vErrors !== null){
if(_errs1962){
vErrors.length = _errs1962;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1387 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55+"/options",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/properties/options/allOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1387];
}
else {
vErrors.push(err1387);
}
errors++;
}
}
}
else {
const err1388 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules/" + i55,schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1388];
}
else {
vErrors.push(err1388);
}
errors++;
}
}
}
else {
const err1389 = {instancePath:instancePath+"/stages/" + i3+"/filter/rules",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/properties/rules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1389];
}
else {
vErrors.push(err1389);
}
errors++;
}
}
}
else {
const err1390 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1390];
}
else {
vErrors.push(err1390);
}
errors++;
}
var _valid65 = _errs1938 === errors;
valid473 = valid473 || _valid65;
}
if(!valid473){
const err1391 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/0/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1391];
}
else {
vErrors.push(err1391);
}
errors++;
}
else {
errors = _errs1935;
if(vErrors !== null){
if(_errs1935){
vErrors.length = _errs1935;
}
else {
vErrors = null;
}
}
}
var _valid64 = _errs1934 === errors;
valid472 = valid472 || _valid64;
if(!valid472){
const _errs1971 = errors;
if(data647 !== null){
const err1392 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err1392];
}
else {
vErrors.push(err1392);
}
errors++;
}
var _valid64 = _errs1971 === errors;
valid472 = valid472 || _valid64;
}
if(!valid472){
const err1393 = {instancePath:instancePath+"/stages/" + i3+"/filter",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/filter/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1393];
}
else {
vErrors.push(err1393);
}
errors++;
}
else {
errors = _errs1933;
if(vErrors !== null){
if(_errs1933){
vErrors.length = _errs1933;
}
else {
vErrors = null;
}
}
}
}
if(data107.skipLogic !== undefined){
if(!(validate407(data107.skipLogic, {instancePath:instancePath+"/stages/" + i3+"/skipLogic",parentData:data107,parentDataProperty:"skipLogic",rootData}))){
vErrors = vErrors === null ? validate407.errors : vErrors.concat(validate407.errors);
errors = vErrors.length;
}
}
if(data107.introductionPanel !== undefined){
let data659 = data107.introductionPanel;
if(data659 && typeof data659 == "object" && !Array.isArray(data659)){
if(data659.title === undefined){
const err1394 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1394];
}
else {
vErrors.push(err1394);
}
errors++;
}
if(data659.text === undefined){
const err1395 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1395];
}
else {
vErrors.push(err1395);
}
errors++;
}
for(const key147 in data659){
if(!((key147 === "title") || (key147 === "text"))){
const err1396 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key147},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1396];
}
else {
vErrors.push(err1396);
}
errors++;
}
}
if(data659.title !== undefined){
if(typeof data659.title !== "string"){
const err1397 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/title",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1397];
}
else {
vErrors.push(err1397);
}
errors++;
}
}
if(data659.text !== undefined){
if(typeof data659.text !== "string"){
const err1398 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1398];
}
else {
vErrors.push(err1398);
}
errors++;
}
}
}
else {
const err1399 = {instancePath:instancePath+"/stages/" + i3+"/introductionPanel",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/0/properties/introductionPanel/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1399];
}
else {
vErrors.push(err1399);
}
errors++;
}
}
if(data107.type !== undefined){
let data662 = data107.type;
if(typeof data662 !== "string"){
const err1400 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/16/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1400];
}
else {
vErrors.push(err1400);
}
errors++;
}
if("Geospatial" !== data662){
const err1401 = {instancePath:instancePath+"/stages/" + i3+"/type",schemaPath:"#/properties/stages/items/anyOf/16/properties/type/const",keyword:"const",params:{allowedValue: "Geospatial"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1401];
}
else {
vErrors.push(err1401);
}
errors++;
}
}
if(data107.subject !== undefined){
let data663 = data107.subject;
if(data663 && typeof data663 == "object" && !Array.isArray(data663)){
if(data663.entity === undefined){
const err1402 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "entity"},message:"must have required property '"+"entity"+"'"};
if(vErrors === null){
vErrors = [err1402];
}
else {
vErrors.push(err1402);
}
errors++;
}
if(data663.type === undefined){
const err1403 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1403];
}
else {
vErrors.push(err1403);
}
errors++;
}
for(const key148 in data663){
if(!((key148 === "entity") || (key148 === "type"))){
const err1404 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key148},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1404];
}
else {
vErrors.push(err1404);
}
errors++;
}
}
if(data663.entity !== undefined){
let data664 = data663.entity;
if(typeof data664 !== "string"){
const err1405 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1405];
}
else {
vErrors.push(err1405);
}
errors++;
}
if(!(((data664 === "edge") || (data664 === "node")) || (data664 === "ego"))){
const err1406 = {instancePath:instancePath+"/stages/" + i3+"/subject/entity",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/entity/enum",keyword:"enum",params:{allowedValues: schema348.properties.entity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1406];
}
else {
vErrors.push(err1406);
}
errors++;
}
}
if(data663.type !== undefined){
if(typeof data663.type !== "string"){
const err1407 = {instancePath:instancePath+"/stages/" + i3+"/subject/type",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1407];
}
else {
vErrors.push(err1407);
}
errors++;
}
}
}
else {
const err1408 = {instancePath:instancePath+"/stages/" + i3+"/subject",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/1/properties/subject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1408];
}
else {
vErrors.push(err1408);
}
errors++;
}
}
if(data107.mapOptions !== undefined){
let data666 = data107.mapOptions;
if(data666 && typeof data666 == "object" && !Array.isArray(data666)){
if(data666.tokenAssetId === undefined){
const err1409 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "tokenAssetId"},message:"must have required property '"+"tokenAssetId"+"'"};
if(vErrors === null){
vErrors = [err1409];
}
else {
vErrors.push(err1409);
}
errors++;
}
if(data666.style === undefined){
const err1410 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "style"},message:"must have required property '"+"style"+"'"};
if(vErrors === null){
vErrors = [err1410];
}
else {
vErrors.push(err1410);
}
errors++;
}
if(data666.center === undefined){
const err1411 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "center"},message:"must have required property '"+"center"+"'"};
if(vErrors === null){
vErrors = [err1411];
}
else {
vErrors.push(err1411);
}
errors++;
}
if(data666.initialZoom === undefined){
const err1412 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "initialZoom"},message:"must have required property '"+"initialZoom"+"'"};
if(vErrors === null){
vErrors = [err1412];
}
else {
vErrors.push(err1412);
}
errors++;
}
if(data666.dataSourceAssetId === undefined){
const err1413 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "dataSourceAssetId"},message:"must have required property '"+"dataSourceAssetId"+"'"};
if(vErrors === null){
vErrors = [err1413];
}
else {
vErrors.push(err1413);
}
errors++;
}
if(data666.color === undefined){
const err1414 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "color"},message:"must have required property '"+"color"+"'"};
if(vErrors === null){
vErrors = [err1414];
}
else {
vErrors.push(err1414);
}
errors++;
}
if(data666.targetFeatureProperty === undefined){
const err1415 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/required",keyword:"required",params:{missingProperty: "targetFeatureProperty"},message:"must have required property '"+"targetFeatureProperty"+"'"};
if(vErrors === null){
vErrors = [err1415];
}
else {
vErrors.push(err1415);
}
errors++;
}
for(const key149 in data666){
if(!(((((((key149 === "tokenAssetId") || (key149 === "style")) || (key149 === "center")) || (key149 === "initialZoom")) || (key149 === "dataSourceAssetId")) || (key149 === "color")) || (key149 === "targetFeatureProperty"))){
const err1416 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key149},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1416];
}
else {
vErrors.push(err1416);
}
errors++;
}
}
if(data666.tokenAssetId !== undefined){
if(typeof data666.tokenAssetId !== "string"){
const err1417 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/tokenAssetId",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/tokenAssetId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1417];
}
else {
vErrors.push(err1417);
}
errors++;
}
}
if(data666.style !== undefined){
let data668 = data666.style;
if(typeof data668 !== "string"){
const err1418 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/style",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/style/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1418];
}
else {
vErrors.push(err1418);
}
errors++;
}
if(!((((((((((data668 === "mapbox://styles/mapbox/standard") || (data668 === "mapbox://styles/mapbox/standard-satellite")) || (data668 === "mapbox://styles/mapbox/streets-v12")) || (data668 === "mapbox://styles/mapbox/outdoors-v12")) || (data668 === "mapbox://styles/mapbox/light-v11")) || (data668 === "mapbox://styles/mapbox/dark-v11")) || (data668 === "mapbox://styles/mapbox/satellite-v9")) || (data668 === "mapbox://styles/mapbox/satellite-streets-v12")) || (data668 === "mapbox://styles/mapbox/navigation-day-v1")) || (data668 === "mapbox://styles/mapbox/navigation-night-v1"))){
const err1419 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/style",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/style/enum",keyword:"enum",params:{allowedValues: schema329.properties.stages.items.anyOf[16].properties.mapOptions.properties.style.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1419];
}
else {
vErrors.push(err1419);
}
errors++;
}
}
if(data666.center !== undefined){
let data669 = data666.center;
if(Array.isArray(data669)){
if(data669.length > 2){
const err1420 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err1420];
}
else {
vErrors.push(err1420);
}
errors++;
}
if(data669.length < 2){
const err1421 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err1421];
}
else {
vErrors.push(err1421);
}
errors++;
}
const len56 = data669.length;
if(len56 > 0){
let data670 = data669[0];
if(!((typeof data670 == "number") && (isFinite(data670)))){
const err1422 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center/0",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/items/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1422];
}
else {
vErrors.push(err1422);
}
errors++;
}
}
if(len56 > 1){
let data671 = data669[1];
if(!((typeof data671 == "number") && (isFinite(data671)))){
const err1423 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center/1",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/items/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1423];
}
else {
vErrors.push(err1423);
}
errors++;
}
}
}
else {
const err1424 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/center",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/center/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1424];
}
else {
vErrors.push(err1424);
}
errors++;
}
}
if(data666.initialZoom !== undefined){
let data672 = data666.initialZoom;
if((typeof data672 == "number") && (isFinite(data672))){
if(data672 > 22 || isNaN(data672)){
const err1425 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/initialZoom",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/initialZoom/maximum",keyword:"maximum",params:{comparison: "<=", limit: 22},message:"must be <= 22"};
if(vErrors === null){
vErrors = [err1425];
}
else {
vErrors.push(err1425);
}
errors++;
}
if(data672 < 0 || isNaN(data672)){
const err1426 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/initialZoom",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/initialZoom/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err1426];
}
else {
vErrors.push(err1426);
}
errors++;
}
}
else {
const err1427 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/initialZoom",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/initialZoom/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1427];
}
else {
vErrors.push(err1427);
}
errors++;
}
}
if(data666.dataSourceAssetId !== undefined){
if(typeof data666.dataSourceAssetId !== "string"){
const err1428 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/dataSourceAssetId",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/dataSourceAssetId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1428];
}
else {
vErrors.push(err1428);
}
errors++;
}
}
if(data666.color !== undefined){
if(typeof data666.color !== "string"){
const err1429 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/color",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/color/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1429];
}
else {
vErrors.push(err1429);
}
errors++;
}
}
if(data666.targetFeatureProperty !== undefined){
if(typeof data666.targetFeatureProperty !== "string"){
const err1430 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions/targetFeatureProperty",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/properties/targetFeatureProperty/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1430];
}
else {
vErrors.push(err1430);
}
errors++;
}
}
}
else {
const err1431 = {instancePath:instancePath+"/stages/" + i3+"/mapOptions",schemaPath:"#/properties/stages/items/anyOf/16/properties/mapOptions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1431];
}
else {
vErrors.push(err1431);
}
errors++;
}
}
if(data107.prompts !== undefined){
let data676 = data107.prompts;
if(Array.isArray(data676)){
if(data676.length < 1){
const err1432 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err1432];
}
else {
vErrors.push(err1432);
}
errors++;
}
const len57 = data676.length;
for(let i56=0; i56<len57; i56++){
let data677 = data676[i56];
if(data677 && typeof data677 == "object" && !Array.isArray(data677)){
if(data677.id === undefined){
const err1433 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1433];
}
else {
vErrors.push(err1433);
}
errors++;
}
if(data677.text === undefined){
const err1434 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err1434];
}
else {
vErrors.push(err1434);
}
errors++;
}
if(data677.variable === undefined){
const err1435 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/required",keyword:"required",params:{missingProperty: "variable"},message:"must have required property '"+"variable"+"'"};
if(vErrors === null){
vErrors = [err1435];
}
else {
vErrors.push(err1435);
}
errors++;
}
for(const key150 in data677){
if(!(((key150 === "id") || (key150 === "text")) || (key150 === "variable"))){
const err1436 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key150},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1436];
}
else {
vErrors.push(err1436);
}
errors++;
}
}
if(data677.id !== undefined){
if(typeof data677.id !== "string"){
const err1437 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56+"/id",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1437];
}
else {
vErrors.push(err1437);
}
errors++;
}
}
if(data677.text !== undefined){
if(typeof data677.text !== "string"){
const err1438 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56+"/text",schemaPath:"#/definitions/Protocol/properties/stages/items/anyOf/3/properties/prompts/items/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1438];
}
else {
vErrors.push(err1438);
}
errors++;
}
}
if(data677.variable !== undefined){
if(typeof data677.variable !== "string"){
const err1439 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56+"/variable",schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/properties/variable/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1439];
}
else {
vErrors.push(err1439);
}
errors++;
}
}
}
else {
const err1440 = {instancePath:instancePath+"/stages/" + i3+"/prompts/" + i56,schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1440];
}
else {
vErrors.push(err1440);
}
errors++;
}
}
}
else {
const err1441 = {instancePath:instancePath+"/stages/" + i3+"/prompts",schemaPath:"#/properties/stages/items/anyOf/16/properties/prompts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1441];
}
else {
vErrors.push(err1441);
}
errors++;
}
}
}
else {
const err1442 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1442];
}
else {
vErrors.push(err1442);
}
errors++;
}
var _valid9 = _errs1919 === errors;
valid47 = valid47 || _valid9;
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
if(!valid47){
const err1443 = {instancePath:instancePath+"/stages/" + i3,schemaPath:"#/properties/stages/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1443];
}
else {
vErrors.push(err1443);
}
errors++;
}
else {
errors = _errs297;
if(vErrors !== null){
if(_errs297){
vErrors.length = _errs297;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err1444 = {instancePath:instancePath+"/stages",schemaPath:"#/properties/stages/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1444];
}
else {
vErrors.push(err1444);
}
errors++;
}
}
}
else {
const err1445 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err1445];
}
else {
vErrors.push(err1445);
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
