import dotenv from "dotenv";
dotenv.config();

import { execSync } from "node:child_process";

// Always run prisma generate
execSync("prisma generate", { stdio: "inherit" });
