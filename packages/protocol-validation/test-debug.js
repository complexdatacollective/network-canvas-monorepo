import { createBaseProtocol } from "./src/utils/test-utils.ts";
import ProtocolSchemaV8 from "./src/schemas/8/schema.ts";

const baseValidProtocol = createBaseProtocol();
const result = ProtocolSchemaV8.safeParse(baseValidProtocol);

console.log("Success:", result.success);
if (!result.success) {
	console.log("Errors:", JSON.stringify(result.error.issues, null, 2));
}
