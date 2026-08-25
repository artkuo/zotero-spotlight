import { assert } from "chai";
import {
  buildPriorityTemplate,
  getMatchOptions,
  getPriorityBoost,
  getResultTypeBoost,
  parsePriorityConfig,
  resolvePriorityEntries,
  serializePriorityConfig,
  type PriorityConfig,
} from "../src/modules/spotlight/collectionPriority";
import {
  DEFAULT_MATCH_OPTIONS,
  scoreQuery,
} from "../src/modules/spotlight/matching";

const EMPTY_CONFIG = {
  order: [],
  unlisted: "low",
  resultTypes: {},
  matching: { ...DEFAULT_MATCH_OPTIONS },
};

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
        matching: { mode: "loose", typoDistance: 1, minTokenLength: 4 },
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

  describe("matching options", function () {
    it("defaults to field mode when missing or invalid", function () {
      assert.equal(getMatchOptions(parsePriorityConfig(null)).mode, "field");
      assert.equal(
        getMatchOptions(parsePriorityConfig('{"order":[]}')).mode,
        "field",
      );
      assert.equal(
        getMatchOptions(
          parsePriorityConfig('{"order":[],"matching":{"mode":"bogus"}}'),
        ).mode,
        "field",
      );
    });

    it("parses explicit loose and field modes", function () {
      assert.equal(
        getMatchOptions(
          parsePriorityConfig('{"order":[],"matching":{"mode":"loose"}}'),
        ).mode,
        "loose",
      );
      assert.equal(
        getMatchOptions(
          parsePriorityConfig('{"order":[],"matching":{"mode":"field"}}'),
        ).mode,
        "field",
      );
    });

    it("clamps typoDistance and minTokenLength to valid ranges", function () {
      const options = getMatchOptions(
        parsePriorityConfig(
          '{"order":[],"matching":{"typoDistance":99,"minTokenLength":-5}}',
        ),
      );
      assert.equal(options.typoDistance, 3);
      assert.equal(options.minTokenLength, 1);
    });
  });

  describe("scoreQuery (token-based field mode)", function () {
    // Abstract-style text that contains the k…u…o subsequence of 'kuo'
    // scattered across words but no actual 'kuo' word.
    const fields = [
      "OpenPose realtime multi-person pose estimation",
      "Cao 2019",
      "ask you to cite",
    ];
    const looseText =
      "openpose realtime multi-person pose estimation cao 2019 ask you to cite";
    const defaults = { ...DEFAULT_MATCH_OPTIONS };

    it("matches exact words regardless of case", function () {
      assert.isAbove(scoreQuery("kuo", ["Kuo 2019"], "kuo 2019", defaults), 0);
    });

    it("does not match letters scattered across words", function () {
      assert.equal(scoreQuery("kuo", fields, looseText, defaults), -1);
    });

    it("allows minor typos for long-enough tokens", function () {
      assert.isAbove(
        scoreQuery(
          "machien",
          ["machine learning"],
          "machine learning",
          defaults,
        ),
        0,
      );
      assert.isAbove(
        scoreQuery(
          "lerning",
          ["machine learning"],
          "machine learning",
          defaults,
        ),
        0,
      );
    });

    it("requires exact short tokens when minTokenLength excludes them", function () {
      const strictShort = { ...defaults, minTokenLength: 99 };
      assert.equal(
        scoreQuery("kou", ["kuo 2019"], "kuo 2019", strictShort),
        -1,
      );
      assert.isAbove(
        scoreQuery("kuo", ["kuo 2019"], "kuo 2019", strictShort),
        0,
      );
    });

    it("disables typo tolerance with typoDistance 0", function () {
      const noTypo = { ...defaults, typoDistance: 0 };
      assert.equal(
        scoreQuery("machien", ["machine learning"], "machine learning", noTypo),
        -1,
      );
    });

    it("supports prefix matches", function () {
      assert.isAbove(
        scoreQuery("mach", ["machine learning"], "machine learning", defaults),
        0,
      );
    });

    it("requires all query tokens to match (AND semantics)", function () {
      assert.isAbove(
        scoreQuery(
          "gait prince",
          ["Gait Disorders", "Prince 1997"],
          "gait disorders prince 1997",
          defaults,
        ),
        0,
      );
      assert.equal(
        scoreQuery(
          "gait zzzzq",
          ["Gait Disorders", "Prince 1997"],
          "gait disorders prince 1997",
          defaults,
        ),
        -1,
      );
    });

    it("still matches loosely in loose mode", function () {
      // 'donelan' traces across this concatenation but matches no single word.
      const legacyFields = ["gait disorders", "prince plan", "1997"];
      const legacyText = "gait disorders prince plan 1997";
      assert.isAbove(
        scoreQuery("donelan", legacyFields, legacyText, {
          ...defaults,
          mode: "loose",
        }),
        0,
      );
      assert.equal(
        scoreQuery("donelan", legacyFields, legacyText, defaults),
        -1,
      );
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
