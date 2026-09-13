import { expect, test, type Page } from "@playwright/test";

const API_KEY = "sk-syntheticModelSelectionKey123456789";
const STORAGE_KEY = "patheon-workspace-v1";
const GENERATED_TITLE = "Model-selected radial convergence proposal";

async function openSettings(page: Page) {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
}

async function closeDialog(page: Page) {
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

async function mockStatus(page: Page, model: string) {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: { configured: false, model, requiresUserKey: true },
    }),
  );
}

test("selected models reach hypotheses and chat while only research persists", async ({
  page,
}) => {
  await mockStatus(page, "gpt-5.6-luna");
  const requests: {
    headers: Record<string, string>;
    body: Record<string, unknown>;
    url: string;
  }[] = [];
  await page.route("**/api/research", async (route) => {
    const body = route.request().postDataJSON();
    requests.push({
      headers: await route.request().allHeaders(),
      body,
      url: route.request().url(),
    });
    await route.fulfill({
      json:
        body.mode === "hypothesis"
          ? {
              source: "openai",
              hypotheses: [
                {
                  id: "model-selected-proposal",
                  title: GENERATED_TITLE,
                  summary:
                    "Compare radial sampling with the analytical density.",
                  domain: "Quantum mechanics",
                  rationale:
                    "An analytical density provides a convergence reference.",
                  methodology: [
                    "Sample the hydrogen density.",
                    "Compare radial histograms across sample counts.",
                  ],
                  limitations:
                    "The model describes an idealized single electron.",
                  source: "openai",
                  createdAt: "2026-09-13T12:00:00.000Z",
                },
              ],
            }
          : {
              source: "openai",
              message: "Angular nodes follow the orbital quantum numbers.",
            },
    });
  });

  await page.goto("/");
  await openSettings(page);
  const model = page.getByRole("combobox", { name: "AI model", exact: true });
  await expect(model).toHaveValue("gpt-5.6-luna");
  await page.getByLabel("OpenAI API key", { exact: true }).fill(API_KEY);
  await page
    .getByRole("button", { name: "Use for this visit", exact: true })
    .click();
  await expect(page.getByLabel("OpenAI API key", { exact: true })).toHaveValue(
    "",
  );
  await model.selectOption("gpt-5.6-terra");
  await closeDialog(page);

  await page
    .getByRole("button", { name: "Generate hypothesis", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What are you curious about?" })
    .fill(
      "How can we measure radial sampling convergence for a hydrogen orbital?",
    );
  await page
    .getByRole("button", { name: "Generate hypotheses", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: GENERATED_TITLE, exact: true }),
  ).toBeVisible();

  await openSettings(page);
  await expect(model).toHaveValue("gpt-5.6-terra");
  await model.selectOption("gpt-5.6-sol");
  await closeDialog(page);
  await navigate(page, "Overview");
  await page
    .getByRole("button", { name: "Why do orbitals have different shapes?" })
    .click();
  await page
    .getByRole("textbox", { name: "Message the research assistant" })
    .fill("Explain how angular nodes determine the orbital shape.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant p")).toHaveText(
    "Angular nodes follow the orbital quantum numbers.",
  );
  await closeDialog(page);

  expect(requests).toHaveLength(2);
  expect(requests[0].body).toMatchObject({
    mode: "hypothesis",
    model: "gpt-5.6-terra",
  });
  expect(requests[1].body).toMatchObject({
    mode: "assistant",
    model: "gpt-5.6-sol",
  });
  for (const request of requests) {
    expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(JSON.stringify(request.body)).not.toContain(API_KEY);
    expect(request.url).not.toContain(API_KEY);
    expect(new URL(request.url).search).toBe("");
  }

  await navigate(page, "Hypotheses");
  await page
    .locator(".hypothesis-card")
    .filter({ hasText: GENERATED_TITLE })
    .getByRole("button", { name: /^Explore hypothesis:/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save hypothesis", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to notebook" })
    .click();
  await closeDialog(page);
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const workspace = JSON.parse(localStorage.getItem(key) || "{}");
        return {
          saved: workspace.saved,
          notes: workspace.notes?.map((note: { title: string }) => note.title),
        };
      }, STORAGE_KEY),
    )
    .toEqual({ saved: ["model-selected-proposal"], notes: [GENERATED_TITLE] });

  const persisted = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(persisted)).not.toContain(API_KEY);
  expect(JSON.stringify(persisted)).not.toContain("gpt-5.6-terra");
  expect(JSON.stringify(persisted)).not.toContain("gpt-5.6-sol");
  expect(JSON.stringify(await page.context().cookies())).not.toContain(API_KEY);

  await page.reload();
  await openSettings(page);
  await expect(model).toHaveValue("gpt-5.6-luna");
  await expect(page.getByLabel("OpenAI API key", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: "Clear key", exact: true }),
  ).toHaveCount(0);
  await closeDialog(page);
  await page.getByRole("button", { name: /^Saved hypotheses/ }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(1);
  await expect(
    page.locator(".hypothesis-card").getByRole("heading"),
  ).toHaveText(GENERATED_TITLE);
  await navigate(page, "Notebook");
  await page
    .locator(".note-list-item")
    .filter({ hasText: GENERATED_TITLE })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Note content" }),
  ).toContainText(/## Rationale/);
});

test("a late server default does not replace an explicit model choice", async ({
  page,
}) => {
  let releaseStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  await page.route("**/api/status", async (route) => {
    await statusGate;
    await route.fulfill({
      json: { configured: false, model: "gpt-5.6-luna", requiresUserKey: true },
    });
  });
  try {
    await page.goto("/");
    await openSettings(page);
    const model = page.getByRole("combobox", { name: "AI model", exact: true });
    await expect(model).toHaveValue("chat-latest");
    await model.selectOption("gpt-6-astra");
    const statusResponse = page.waitForResponse("**/api/status");
    releaseStatus();
    await (await statusResponse).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(model).toHaveValue("gpt-6-astra");
    await closeDialog(page);
    await openSettings(page);
    await expect(model).toHaveValue("gpt-6-astra");
  } finally {
    releaseStatus();
  }
});

test("an unsupported server model falls back to the supported default", async ({
  page,
}) => {
  await mockStatus(page, "unsupported-model-name");
  const statusResponse = page.waitForResponse("**/api/status");
  await page.goto("/");
  await (await statusResponse).finished();
  await openSettings(page);
  const model = page.getByRole("combobox", { name: "AI model", exact: true });
  await expect(model).toHaveValue("chat-latest");
  await expect(model.getByRole("option")).toHaveCount(5);
  await model.selectOption("gpt-5.6-terra");
  await expect(model).toHaveValue("gpt-5.6-terra");
});

test("model access errors preserve the key so another model can be selected and retried", async ({
  page,
}) => {
  await mockStatus(page, "gpt-5.6-luna");
  const models: string[] = [];
  await page.route("**/api/research", async (route) => {
    const body = route.request().postDataJSON();
    models.push(body.model);
    expect((await route.request().allHeaders()).authorization).toBe(
      `Bearer ${API_KEY}`,
    );
    await route.fulfill(
      models.length === 1
        ? {
            status: 422,
            json: {
              code: "model_access_denied",
              error:
                "OpenAI denied access to this model. Select another model and try again.",
            },
          }
        : {
            json: {
              source: "openai",
              message: "The selected model is available for this request.",
            },
          },
    );
  });
  await page.goto("/");
  await openSettings(page);
  await expect(
    page.getByRole("combobox", { name: "AI model", exact: true }),
  ).toHaveValue("gpt-5.6-luna");
  await page.getByLabel("OpenAI API key", { exact: true }).fill(API_KEY);
  await page
    .getByRole("button", { name: "Use for this visit", exact: true })
    .click();
  await closeDialog(page);
  await page
    .getByRole("button", { name: "Why do orbitals have different shapes?" })
    .click();
  await page
    .getByRole("textbox", { name: "Message the research assistant" })
    .fill("Explain the relationship between angular nodes and orbital shape.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Select another model",
  );
  await closeDialog(page);
  await openSettings(page);
  await expect(
    page.getByRole("button", { name: "Clear key", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "AI model", exact: true })
    .selectOption("gpt-5.6-sol");
  await closeDialog(page);
  await page
    .getByRole("button", { name: "Why do orbitals have different shapes?" })
    .click();
  await page
    .getByRole("textbox", { name: "Message the research assistant" })
    .fill("Explain the relationship between angular nodes and orbital shape.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant p")).toHaveText(
    "The selected model is available for this request.",
  );
  expect(models).toEqual(["gpt-5.6-luna", "gpt-5.6-sol"]);
});

test("an in-flight request keeps its model when the server default arrives late", async ({
  page,
}) => {
  let releaseStatus!: () => void;
  let releaseResearch!: () => void;
  const statusGate = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  const researchGate = new Promise<void>((resolve) => {
    releaseResearch = resolve;
  });
  await page.route("**/api/status", async (route) => {
    await statusGate;
    await route.fulfill({
      json: { configured: false, model: "gpt-5.6-luna", requiresUserKey: true },
    });
  });
  await page.route("**/api/research", async (route) => {
    await researchGate;
    await route.fulfill({
      json: {
        source: "openai",
        message: "The request completed with its original model.",
      },
    });
  });
  try {
    await page.goto("/");
    await openSettings(page);
    await expect(
      page.getByRole("combobox", { name: "AI model", exact: true }),
    ).toHaveValue("chat-latest");
    await page.getByLabel("OpenAI API key", { exact: true }).fill(API_KEY);
    await page
      .getByRole("button", { name: "Use for this visit", exact: true })
      .click();
    await closeDialog(page);
    await page
      .getByRole("button", { name: "Why do orbitals have different shapes?" })
      .click();
    await page
      .getByRole("textbox", { name: "Message the research assistant" })
      .fill("Explain how angular nodes arise in the hydrogen wavefunction.");
    const researchRequest = page.waitForRequest("**/api/research");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    expect((await researchRequest).postDataJSON()).toMatchObject({
      mode: "assistant",
      model: "chat-latest",
    });
    const context = page.getByRole("dialog").locator(".research-model-context");
    await expect(context).toContainText("Chat Latest");
    await expect(
      context.getByRole("button", { name: "Change model", exact: true }),
    ).toBeDisabled();
    const statusResponse = page.waitForResponse("**/api/status");
    releaseStatus();
    await (await statusResponse).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(context).toContainText("Chat Latest");
    await expect(context).not.toContainText("Luna");
    releaseResearch();
    await expect(page.locator(".chat-message.assistant p")).toHaveText(
      "The request completed with its original model.",
    );
    await expect(
      context.getByRole("button", { name: "Change model", exact: true }),
    ).toBeEnabled();
    await context
      .getByRole("button", { name: "Change model", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "AI model", exact: true }),
    ).toHaveValue("chat-latest");
  } finally {
    releaseStatus();
    releaseResearch();
  }
});
