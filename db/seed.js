const { sql } = require("@vercel/postgres");
const { faker } = require("@faker-js/faker");

async function seedEvents() {
  const eventTypes = ["AppSetup", "ProtocolInstalled"];

  try {
    await sql`
    CREATE TABLE IF NOT EXISTS Events (
      event varchar,
      installationId varchar
    );
  `;
    for (let i = 0; i < 100; i++) {
      const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const installationId = faker.string.uuid();

      await sql`
          INSERT INTO Events (event, installationId)
          VALUES (${event}, ${installationId});
        `;
    }
  } catch (error) {
    console.error("Error seeding data:", error);
  }
}

async function seedErrors() {
  const errorCodes = [400, 401, 403, 404, 500];

  try {
    await sql`
    CREATE TABLE IF NOT EXISTS Errors (
      code integer,
      message varchar,
      details varchar,
      stackTrace varchar,
      installationId varchar,
      path varchar
    );
  `;
    for (let i = 0; i < 100; i++) {
      const code = errorCodes[Math.floor(Math.random() * errorCodes.length)];
      const message = faker.lorem.sentence();
      const details = faker.lorem.paragraph();
      const stackTrace = faker.lorem.paragraph();
      const installationId = faker.string.uuid();
      const path = faker.internet.url();

      await sql`
            INSERT INTO Errors (code, message, details, stackTrace, installationId, path)
            VALUES (${code}, ${message}, ${details}, ${stackTrace}, ${installationId}, ${path});
            `;
    }
  } catch (error) {
    console.error("Error seeding data:", error);
  }
}

(async () => {
  await seedEvents();
  await seedErrors();
})();
