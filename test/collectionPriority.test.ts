import { assert } from "chai";
import {
  buildPriorityTemplate,
  getPriorityBoost,
  getResultTypeBoost,
  parsePriorityConfig,
  resolvePriorityEntries,
  serializePriorityConfig,
  type PriorityConfig,
} from "../src/modules/spotlight/collectionPriority";

const EMPTY_CONFIG = { order: [], unlisted: "low", resultTypes: {} };

describe("collection priority config", function () {
  describe("parsePriorityConfig", function () {
    it("returns an empty config for null/undefined/empty input", function () {
      assert.deepEqual(parsePriorityConfig(null), EMPTY_CONFIG);
      assert.deepEqual(parsePriorityConfig(undefined), EMPTY_CONFIG);
      assert.deepEqual(parsePriorityConfig(""), EMPTY_CONFIG);
    });

    it("returns an empty config for invalid JSON", function () {
      assert.deepEqual(parsePriorityConfig("{not json"), EMPTY_CONFIG);
    });

    it("returns an empty config when order is missing", function () {
      assert.deepEqual(
        parsePriorityConfig('{"unlisted": "low"}'),
        EMPTY_CONFIG,
      );
    });

    it("parses valid library and collection entries", function () {
      const config = parsePriorityConfig(
        JSON.stringify({
          order: [
            { type: "library", libraryID: 1 },
            { type: "collection", libraryID: 1, key: "ABCD1234" },
          ],
          unlisted: "low",
        }),
      );
      assert.deepEqual(config.order, [
        { type: "library", libraryID: 1 },
        { type: "collection", libraryID: 1, key: "ABCD1234" },
      ]);
    });

    it("drops malformed entries and deduplicates", function () {
      const config = parsePriorityConfig(
        JSON.stringify({
          order: [
            { type: "library", libraryID: "one" },
            { type: "collection", libraryID: 1 },
            { type: "library", libraryID: 2 },
            { type: "library", libraryID: 2 },
            { type: "collection", libraryID: 1, key: "KEY1" },
            { type: "collection", libraryID: 1, key: "KEY1" },
            null,
          ],
        }),
      );
      assert.deepEqual(config.order, [
        { type: "library", libraryID: 2 },
        { type: "collection", libraryID: 1, key: "KEY1" },
      ]);
    });

    it("ignores unknown fields such as display names", function () {
      const config = parsePriorityConfig(
        JSON.stringify({
          order: [
            { type: "library", libraryID: 7, name: "My Library" },
            {
              type: "collection",
              libraryID: 7,
              key: "KEY2",
              name: "Lab › Papers",
            },
          ],
        }),
      );
      assert.deepEqual(config.order, [
        { type: "library", libraryID: 7 },
        { type: "collection", libraryID: 7, key: "KEY2" },
      ]);
    });
  });

  describe("serializePriorityConfig", function () {
    it("round-trips through parse", function () {
      const original = {
        order: [
          { type: "library", libraryID: 3 },
          { type: "collection", libraryID: 3, key: "K9" },
        ],
        unlisted: "low",
        resultTypes: { item: 8, pdf: 5 },
      } as PriorityConfig;
      const roundTripped = parsePriorityConfig(
        serializePriorityConfig(original),
      );
      assert.deepEqual(roundTripped, original);
    });
  });

  describe("resultTypes boosts", function () {
    const configJSON =
      '{"order":[],"resultTypes":{"item":8,"pdf":5,"bogus":99,"note":"high"}}';

    it("keeps valid types and drops unknown keys and non-numeric values", function () {
      const config = parsePriorityConfig(configJSON);
      assert.deepEqual(config.resultTypes, { item: 8, pdf: 5 });
    });

    it("boosts matching result types", function () {
      const config = parsePriorityConfig(configJSON);
      assert.equal(getResultTypeBoost("item", config), 8);
      assert.equal(getResultTypeBoost("pdf", config), 5);
    });

    it("returns zero for missing or unknown types", function () {
      const config = parsePriorityConfig(configJSON);
      assert.equal(getResultTypeBoost("note", config), 0);
      assert.equal(getResultTypeBoost("bogus", config), 0);
      assert.equal(getResultTypeBoost("item", EMPTY_CONFIG), 0);
    });

    it("includes an empty resultTypes block in the template", function () {
      const template = buildPriorityTemplate(
        [{ libraryID: 1, name: "My Library" }],
        [],
      );
      assert.deepEqual(JSON.parse(template).resultTypes, {});
    });
  });

  describe("resolvePriorityEntries", function () {
    it("resolves keys to collection IDs and drops stale entries", function () {
      const config = parsePriorityConfig(
        JSON.stringify({
          order: [
            { type: "library", libraryID: 10 },
            { type: "collection", libraryID: 10, key: "AAA" },
            { type: "collection", libraryID: 99, key: "GONE" },
          ],
        }),
      );
      const resolved = resolvePriorityEntries(config, (libraryID, key) =>
        libraryID === 10 && key === "AAA" ? 555 : null,
      );
      assert.deepEqual(resolved, [
        { type: "library", libraryID: 10 },
        { type: "collection", libraryID: 10, collectionID: 555 },
      ]);
    });
  });

  describe("getPriorityBoost", function () {
    // Library 10 > its collection AAA; library 20 > BBB > CCC.
    const entries = [
      { type: "library", libraryID: 10 },
      { type: "collection", libraryID: 10, collectionID: 111 },
      { type: "library", libraryID: 20 },
      { type: "collection", libraryID: 20, collectionID: 222 },
      { type: "collection", libraryID: 20, collectionID: 333 },
    ] as const;

    it("ranks listed libraries ahead of unlisted ones, in order", function () {
      const firstLibrary = getPriorityBoost(10, [], entries);
      const secondLibrary = getPriorityBoost(20, [], entries);
      const unlisted = getPriorityBoost(30, [], entries);
      assert.isAbove(firstLibrary, secondLibrary);
      assert.isAbove(secondLibrary, unlisted);
      assert.equal(unlisted, 0);
    });

    it("gives the first-listed library exactly one step over the second", function () {
      assert.equal(
        getPriorityBoost(10, [], entries) - getPriorityBoost(20, [], entries),
        8,
      );
    });

    it("adds collection boosts on top of the library boost", function () {
      const inCollection = getPriorityBoost(10, [111], entries);
      const bareInLibrary = getPriorityBoost(10, [999], entries);
      assert.isAbove(inCollection, bareInLibrary);
      // Only one collection listed for library 10 → step is 4.
      assert.equal(inCollection - bareInLibrary, 4);
    });

    it("ranks collections within a library by their position", function () {
      const firstCollection = getPriorityBoost(20, [222], entries); // BBB
      const secondCollection = getPriorityBoost(20, [333], entries); // CCC
      const noCollection = getPriorityBoost(20, [444], entries);
      assert.isAbove(firstCollection, secondCollection);
      assert.isAbove(secondCollection, noCollection);
      assert.equal(firstCollection - secondCollection, 4);
    });

    it("takes the best rank for items in multiple prioritized collections", function () {
      const bestOnly = getPriorityBoost(20, [222], entries);
      const both = getPriorityBoost(20, [222, 333], entries);
      assert.equal(bestOnly, both);
    });

    it("returns zero for empty resolved entries", function () {
      assert.equal(getPriorityBoost(10, [111], []), 0);
    });
  });

  describe("buildPriorityTemplate", function () {
    it("produces parseable JSON with libraries and nested collections", function () {
      const template = buildPriorityTemplate(
        [
          { libraryID: 1, name: "My Library" },
          { libraryID: 281631, name: "Manuscript Lab" },
        ],
        [
          {
            libraryID: 281631,
            key: "ABCD1234",
            name: "R01 drafts",
            path: ["Grant"],
          },
        ],
      );
      const config = parsePriorityConfig(template);
      assert.deepEqual(config.order, [
        { type: "library", libraryID: 1 },
        { type: "library", libraryID: 281631 },
        { type: "collection", libraryID: 281631, key: "ABCD1234" },
      ]);
      // Names survive serialization as display hints only.
      const raw = JSON.parse(template);
      assert.equal(raw.order[0].name, "My Library");
      assert.equal(raw.order[2].name, "Grant › R01 drafts");
    });
  });
});
