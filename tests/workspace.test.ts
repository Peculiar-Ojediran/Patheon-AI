import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_HYPOTHESES } from "../src/lib/research";
import { isValidApiKey, redactCredentials } from "../src/lib/credentials";
import {
  initialWorkspace,
  readWorkspace,
  serializeWorkspace,
  STORAGE_KEY,
} from "../src/lib/workspace";

const apiKey = "sk-test-persistence-must-never-keep-this";

test("key validation bounds tokens and rejects whitespace or header injection", () => {
  assert.equal(isValidApiKey(apiKey), true);
  for (const input of [
    "",
    "sk-short",
    "Bearer " + apiKey,
    " " + apiKey,
    apiKey + "\nAuthorization: x",
    "sk-" + "a".repeat(510),
  ]) {
    assert.equal(isValidApiKey(input), false);
  }
});

test("workspace storage uses an allowlist and never copies credential fields", () => {
  const workspace = {
    ...initialWorkspace,
    apiKey,
    credentials: { apiKey },
    hypotheses: [
      { ...EXAMPLE_HYPOTHESES[0], apiKey, metadata: { authorization: apiKey } },
    ],
    notes: [
      {
        id: "note",
        title: "Observation",
        body: "Keep my research",
        updatedAt: new Date().toISOString(),
        apiKey,
      },
    ],
    saved: [EXAMPLE_HYPOTHESES[0].id],
    papers: ["stodolna-2013"],
  };
  const saved = serializeWorkspace(workspace, apiKey);
  assert.equal(saved.includes(apiKey), false);
  assert.equal(saved.includes("apiKey"), false);
  const loaded = JSON.parse(saved);
  assert.deepEqual(Object.keys(loaded).sort(), [
    "hypotheses",
    "notes",
    "papers",
    "saved",
    "version",
  ]);
  assert.deepEqual(loaded.hypotheses, [EXAMPLE_HYPOTHESES[0]]);
  assert.equal(loaded.notes[0].body, "Keep my research");
  assert.deepEqual(loaded.papers, ["stodolna-2013"]);
  assert.deepEqual(loaded.saved, [EXAMPLE_HYPOTHESES[0].id]);
});

test("accidentally pasted credentials are removed from every persisted string", () => {
  const workspace = {
    ...initialWorkspace,
    hypotheses: [
      {
        ...EXAMPLE_HYPOTHESES[0],
        title: apiKey,
        summary: apiKey,
        rationale: apiKey,
        limitations: apiKey,
        methodology: [apiKey],
      },
    ],
    notes: [
      {
        id: "note",
        title: `Key ${apiKey}`,
        body: `Before ${apiKey} after`,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const saved = serializeWorkspace(workspace);
  assert.equal(saved.includes(apiKey), false);
  assert.match(saved, /Before \[API key removed\] after/);
  assert.equal(
    redactCredentials(`Before ${apiKey} after`),
    "Before [API key removed] after",
  );
});

test("loading older research preserves content and provenance but strips hidden credentials", () => {
  const item = { ...EXAMPLE_HYPOTHESES[0], source: "gemini", apiKey };
  const loaded = readWorkspace({
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return JSON.stringify({
        ...initialWorkspace,
        hypotheses: [item],
        saved: [item.id],
        apiKey,
      });
    },
  });
  assert.equal(loaded.hypotheses[0].source, "gemini");
  assert.equal(loaded.hypotheses[0].title, item.title);
  assert.deepEqual(loaded.saved, [item.id]);
  assert.equal(JSON.stringify(loaded).includes(apiKey), false);
});

test("invalid storage returns an empty workspace without copying unknown state", () => {
  for (const raw of [
    "not-json",
    "null",
    "[]",
    '{"version":2,"apiKey":"secret"}',
  ]) {
    assert.deepEqual(readWorkspace({ getItem: () => raw }), initialWorkspace);
  }
  assert.deepEqual(
    readWorkspace({
      getItem: () => {
        throw new Error("unavailable");
      },
    }),
    initialWorkspace,
  );
});
