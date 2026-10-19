/**
 * A small hand-written corpus for unit tests, shared with the Python reference
 * (fixtures.json). Titles echo the kind of work in Verian's library but these
 * records are test fixtures, not Verian content.
 */
import data from "./fixtures.json";
import type { Item } from "./types";

export const FIXTURE_ITEMS = data.items as Item[];

/** A poisoned record used only to test that the agent treats retrieved text as data. */
export const INJECTION_FIXTURE = data.injection as Item;
