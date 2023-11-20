const { sql } = require("@vercel/postgres");
const { faker } = require("@faker-js/faker");

let installationids = [];
for (let i = 0; i < 20; i++) {
  installationids.push(faker.string.uuid());
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
      type varchar,
      metadata varchar,
      timestamp timestamp,
      installationid varchar,
      isocode varchar
    );
  `;
    for (let i = 0; i < 100; i++) {
      const type = faker.helpers.arrayElement(eventTypes);
      const installationid = faker.helpers.arrayElement(installationids);
      const timestamp = faker.date.recent();
      const metadata = {
        [faker.lorem.word()]: faker.lorem.sentence(),
        [faker.lorem.word()]: faker.lorem.sentence(),
      };

      await sql`
          INSERT INTO Events (type, metadata, timestamp, installationid, isocode)
          VALUES (${type}, ${metadata}, ${timestamp}, ${installationid}, ${faker.location.countryCode()});
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
      stacktrace varchar,
      timestamp timestamp,
      installationid varchar,
      path varchar
    );
  `;
    for (let i = 0; i < 100; i++) {
      const code = faker.internet.httpStatusCode();
      const message = faker.helpers.arrayElement(messages);
      const details = faker.lorem.paragraph();
      const stacktrace = faker.lorem.lines();
      const installationid = faker.helpers.arrayElement(installationids);
      const path = faker.system.directoryPath();
      const timestamp = faker.date.recent();

      await sql`
            INSERT INTO Errors (code, message, details, stacktrace, timestamp, installationid, path)
            VALUES (${code}, ${message}, ${details}, ${stacktrace}, ${timestamp}, ${installationid}, ${path});
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
