import { expect, test, type Download, type Page } from "@playwright/test";

const API_KEY = "sk-testEphemeralResearchKey1234567890";
const PASTED_KEY = "sk-testAccidentallyPastedKey9876543210";
const STORAGE_KEY = "patheon-workspace-v1";
const GENERATED_TITLE = "Ephemeral credential radial convergence";

async function mockStatus(page: Page) {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: { configured: false, model: "test-model", requiresUserKey: true },
    }),
  );
}

async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

async function openSettings(page: Page) {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
}

async function closeDialog(page: Page) {
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

async function useKey(page: Page) {
  await openSettings(page);
  const input = page.getByLabel("OpenAI API key", { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  await input.fill(API_KEY);
  await page
    .getByRole("button", { name: "Use for this visit", exact: true })
    .click();
  await expect(input).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Clear key", exact: true }),
  ).toBeVisible();
  await closeDialog(page);
  await expect(
    page.getByRole("button", { name: "Key ready for this visit", exact: true }),
  ).toBeVisible();
}

async function openGeneration(page: Page) {
  await page
    .getByRole("button", { name: "Generate hypothesis", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What are you curious about?" })
    .fill(
      "How can we test numerical convergence of the hydrogen radial density?",
    );
}

async function expectKeyRequired(
  page: Page,
  mode: "hypothesis" | "assistant" = "hypothesis",
) {
  const submit = page.getByRole("button", {
    name: mode === "hypothesis" ? "Generate hypotheses" : "Send message",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Add your OpenAI API key in Connection settings to use ChatGPT for this visit.",
  );
}

async function expectNoStoredKeys(page: Page) {
  const persisted = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    cookies: document.cookie,
  }));
  const cookies = await page.context().cookies();
  for (const key of [API_KEY, PASTED_KEY]) {
    expect(JSON.stringify(persisted)).not.toContain(key);
    expect(JSON.stringify(cookies)).not.toContain(key);
  }
}

async function expectNoKeyInDom(page: Page) {
  const rendered = await page.evaluate(() => ({
    markup: document.documentElement.outerHTML,
    values: Array.from(document.querySelectorAll("input, textarea")).map(
      (input) => (input as HTMLInputElement | HTMLTextAreaElement).value,
    ),
  }));
  for (const key of [API_KEY, PASTED_KEY]) {
    expect(JSON.stringify(rendered)).not.toContain(key);
  }
}

async function readDownload(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

test.beforeEach(async ({ page }) => {
  await mockStatus(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Explore the unseen.",
  );
});

test("research requires an explicitly supplied key before any request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/research", (route) => {
    calls++;
    return route.fulfill({
      status: 401,
      json: { error: "A key is required." },
    });
  });
  await openGeneration(page);
  await expectKeyRequired(page);
  await closeDialog(page);
  await page
    .getByRole("button", { name: "Why do orbitals have different shapes?" })
    .click();
  await page
    .getByRole("textbox", { name: "Message the research assistant" })
    .fill("Explain how angular nodes determine the orbital shape.");
  await expectKeyRequired(page, "assistant");
  expect(calls).toBe(0);
  await expectNoStoredKeys(page);
});

test("password input clears and only the request authorization header carries the key", async ({
  page,
}) => {
  const requests: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  await page.route("**/api/research", async (route) => {
    requests.push({
      url: route.request().url(),
      headers: await route.request().allHeaders(),
      body: route.request().postData() || "",
    });
    await route.fulfill({
      json: {
        source: "openai",
        hypotheses: [
          {
            id: "ephemeral-credential-test",
            title: GENERATED_TITLE,
            summary: `Compare radial histograms. Unexpected provider echo: ${API_KEY}`,
            domain: "Quantum mechanics",
            rationale: "A known density provides a convergence reference.",
            methodology: [
              "Sample the 1s density.",
              "Compare several sample counts.",
            ],
            limitations: "The model has only one electron.",
            source: "openai",
            createdAt: "2026-09-12T12:00:00.000Z",
            apiKey: API_KEY,
            unexpectedProviderMetadata: { apiKey: API_KEY },
          },
        ],
      },
    });
  });
  await useKey(page);
  await expectNoStoredKeys(page);
  await expectNoKeyInDom(page);
  await openGeneration(page);
  await page
    .getByRole("button", { name: "Generate hypotheses", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: GENERATED_TITLE, exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].headers.authorization).toBe(`Bearer ${API_KEY}`);
  expect(requests[0].url).not.toContain(API_KEY);
  expect(new URL(requests[0].url).search).toBe("");
  expect(requests[0].body).not.toContain(API_KEY);
  await expectNoStoredKeys(page);
  await expectNoKeyInDom(page);
  const stored = await page.evaluate(
    (storageKey) => JSON.parse(localStorage.getItem(storageKey)!),
    STORAGE_KEY,
  );
  expect(stored.hypotheses[0]).not.toHaveProperty("apiKey");
  expect(stored.hypotheses[0]).not.toHaveProperty("unexpectedProviderMetadata");
  expect(stored.hypotheses[0].summary).not.toContain(API_KEY);

  await page.reload();
  await navigate(page, "Hypotheses");
  await expect(
    page.getByRole("heading", { name: GENERATED_TITLE, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Key ready for this visit", exact: true }),
  ).toHaveCount(0);
  await openGeneration(page);
  await expectKeyRequired(page);
  expect(requests).toHaveLength(1);
  await closeDialog(page);
  await openSettings(page);
  await expect(page.getByLabel("OpenAI API key", { exact: true })).toHaveValue(
    "",
  );
  await expectNoStoredKeys(page);
});

test("clearing the key blocks research and another browser context never inherits it", async ({
  page,
  browser,
  baseURL,
}) => {
  let firstContextCalls = 0;
  await page.route("**/api/research", (route) => {
    firstContextCalls++;
    return route.fulfill({
      json: { source: "openai", message: "A synthetic response." },
    });
  });
  await useKey(page);
  const otherContext = await browser.newContext({
    baseURL,
    reducedMotion: "reduce",
  });
  try {
    const otherPage = await otherContext.newPage();
    await mockStatus(otherPage);
    let otherContextCalls = 0;
    await otherPage.route("**/api/research", (route) => {
      otherContextCalls++;
      return route.fulfill({
        status: 401,
        json: { error: "A key is required." },
      });
    });
    await otherPage.goto("/");
    await openGeneration(otherPage);
    await expectKeyRequired(otherPage);
    await expectNoStoredKeys(otherPage);
    expect(otherContextCalls).toBe(0);
    await expect(
      page.getByRole("button", {
        name: "Key ready for this visit",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await otherContext.close();
  }
  await openSettings(page);
  await page.getByRole("button", { name: "Clear key", exact: true }).click();
  await expect(page.getByLabel("OpenAI API key", { exact: true })).toHaveValue(
    "",
  );
  await closeDialog(page);
  await openGeneration(page);
  await expectKeyRequired(page);
  expect(firstContextCalls).toBe(0);
  await expectNoStoredKeys(page);
  await expectNoKeyInDom(page);
});

test("page departure and back-forward cache restoration discard the key", async ({
  page,
}) => {
  await useKey(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Key ready for this visit", exact: true }),
  ).toHaveCount(0);
  await openGeneration(page);
  await expectKeyRequired(page);
  await closeDialog(page);
  await useKey(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Key ready for this visit", exact: true }),
  ).toHaveCount(0);
  await openGeneration(page);
  await expectKeyRequired(page);
  await expectNoStoredKeys(page);
});

test("notes and workspace exports redact pasted credentials while notes and bookmarks persist", async ({
  page,
}) => {
  await useKey(page);
  const hypothesis = page.locator(".hypothesis-card").first();
  const hypothesisTitle = (
    await hypothesis.getByRole("heading").innerText()
  ).trim();
  await hypothesis
    .getByRole("button", { name: /^Explore hypothesis:/ })
    .click();
  await page
    .getByRole("button", { name: "Save hypothesis", exact: true })
    .click();
  await closeDialog(page);
  await navigate(page, "Research library");
  const paperTitle = (
    await page.locator(".paper-card").first().getByRole("heading").innerText()
  ).trim();
  await page
    .locator(".paper-card")
    .first()
    .getByRole("button", { name: /^Save paper:/ })
    .click();
  await navigate(page, "Notebook");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("Safe research observations");
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill(
      `Keep this observation. Accidentally pasted: ${PASTED_KEY}. Active credential: ${API_KEY}.`,
    );
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const noteDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export note as Markdown" }).click();
  const note = await readDownload(await noteDownload);
  expect(note).toContain("Keep this observation.");
  expect(note).not.toContain(API_KEY);
  expect(note).not.toContain(PASTED_KEY);
  await openSettings(page);
  const workspaceDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  const workspace = await readDownload(await workspaceDownload);
  expect(JSON.parse(workspace).notes).toHaveLength(1);
  expect(workspace).toContain("Keep this observation.");
  expect(workspace).not.toContain(API_KEY);
  expect(workspace).not.toContain(PASTED_KEY);
  await expectNoStoredKeys(page);
  await page.reload();
  await page.getByRole("button", { name: /^Saved hypotheses/ }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(1);
  await expect(
    page.locator(".hypothesis-card").getByRole("heading"),
  ).toHaveText(hypothesisTitle);
  await page.getByRole("button", { name: /^Saved papers/ }).click();
  await expect(page.locator(".paper-card")).toHaveCount(1);
  await expect(page.locator(".paper-card").getByRole("heading")).toHaveText(
    paperTitle,
  );
  await navigate(page, "Notebook");
  await page
    .locator(".note-list-item")
    .filter({ hasText: "Safe research observations" })
    .click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveValue(
    /Keep this observation\./,
  );
  await expectNoStoredKeys(page);
  await expectNoKeyInDom(page);
});

test("assistant prompts, provider echoes, and subsequent conversation history redact pasted keys", async ({
  page,
}) => {
  const requests: {
    body: Record<string, unknown>;
    authorization: string | undefined;
  }[] = [];
  await page.route("**/api/research", async (route) => {
    requests.push({
      body: route.request().postDataJSON(),
      authorization: (await route.request().allHeaders()).authorization,
    });
    await route.fulfill({
      json: {
        source: "openai",
        message: `Angular nodes follow quantum numbers. Provider echo: ${API_KEY} ${PASTED_KEY}`,
      },
    });
  });
  await useKey(page);
  await page
    .getByRole("button", { name: "Why do orbitals have different shapes?" })
    .click();
  const message = page.getByRole("textbox", {
    name: "Message the research assistant",
  });
  await message.fill(
    `Explain orbital angular nodes. Accidentally pasted ${PASTED_KEY} and ${API_KEY}`,
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant")).toHaveCount(1);
  await expect(message).toHaveValue("");
  await expectNoKeyInDom(page);
  await message.fill("How do those nodes change for the selected 3d orbital?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
  expect(requests).toHaveLength(2);
  expect(requests[0].body.mode).toBe("assistant");
  expect(requests[1].body.history).toEqual([
    expect.objectContaining({ role: "user" }),
    expect.objectContaining({ role: "assistant" }),
  ]);
  for (const request of requests) {
    expect(request.authorization).toBe(`Bearer ${API_KEY}`);
    expect(JSON.stringify(request.body)).not.toContain(API_KEY);
    expect(JSON.stringify(request.body)).not.toContain(PASTED_KEY);
  }
  await expectNoStoredKeys(page);
  await expectNoKeyInDom(page);
});
