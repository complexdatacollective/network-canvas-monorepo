const { sql } = require("@vercel/postgres");
const { faker } = require("@faker-js/faker");

let installationIds = [];
for (let i = 0; i < 20; i++) {
  installationIds.push(faker.string.uuid());
}

async function seedEvents() {
  const eventTypes = [
    "AppSetup",
    "ProtocolInstalled",
    "InterviewStarted",
    "InterviewCompleted",
    "InterviewCompleted",
  ];

  try {
    await sql`
    CREATE TABLE IF NOT EXISTS Events (
      event varchar,
      timestamp timestamp,
      installationId varchar
    );
  `;
    for (let i = 0; i < 100; i++) {
      const event = faker.helpers.arrayElement(eventTypes);
      const installationId = faker.helpers.arrayElement(installationIds);
      const timestamp = faker.date.recent();

      await sql`
          INSERT INTO Events (event, timestamp, installationId)
          VALUES (${event}, ${timestamp}, ${installationId});
        `;
    }
  } catch (error) {
    console.error("Error seeding data:", error);
  }
}

async function seedErrors() {
  const messages = [
    "Database connection error",
    "Database query error: Invalid syntax",
    "Database query error: Invalid column name",
    "Page not found",
    "Internal server error",
    "Authentication Failure",
    "File Upload Error: Invalid file type",
  ];
  try {
    await sql`
    CREATE TABLE IF NOT EXISTS Errors (
      code integer,
      message varchar,
      details varchar,
      stackTrace varchar,
      timestamp timestamp,
      installationId varchar,
      path varchar
    );
  `;
    for (let i = 0; i < 100; i++) {
      const code = faker.internet.httpStatusCode();
      const message = faker.helpers.arrayElement(messages);
      const details = faker.lorem.paragraph();
      const stackTrace = faker.lorem.lines();
      const installationId = faker.helpers.arrayElement(installationIds);
      const path = faker.system.directoryPath();
      const timestamp = faker.date.recent();

      await sql`
            INSERT INTO Errors (code, message, details, stackTrace, timestamp, installationId, path)
            VALUES (${code}, ${message}, ${details}, ${stackTrace}, ${timestamp}, ${installationId}, ${path});
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
