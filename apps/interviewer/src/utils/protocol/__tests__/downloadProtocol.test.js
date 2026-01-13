/* eslint-disable @codaco/spellcheck/spell-checker */

import electron from "electron";
import path from "path";
import { vi } from "vitest";
import { getEnvironment } from "../../Environment";
import environments from "../../environments";
import downloadProtocol from "../downloadProtocol";

vi.mock("electron");
vi.mock("request-promise-native");
vi.mock("../../filesystem");

it.todo("downloadProtocol");
