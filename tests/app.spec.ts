import { expect, test, type Page } from "@playwright/test";

async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

async function provideVisitKey(page: Page) {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page
    .getByLabel("OpenAI API key", { exact: true })
    .fill("sk-synthetic-existing-app-test-key");
  await page
    .getByRole("button", { name: "Use for this visit", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { configured: false, model: "test-model" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Explore the unseen.",
  );
});

test("hypothesis details, bookmarks, and research plans persist across reload", async ({
  page,
}) => {
  const card = page.locator(".hypothesis-card").first();
  const title = (await card.getByRole("heading").innerText()).trim();
  await card.getByRole("button", { name: /^Explore hypothesis:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "The reasoning" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "A way to test it" }),
  ).toBeVisible();
  await expect(dialog.getByText("Starter example · unvalidated")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Save hypothesis", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Saved hypothesis", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Add to notebook" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Saved hypotheses/ }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(1);
  await expect(
    page.locator(".hypothesis-card").getByRole("heading"),
  ).toHaveText(title);
  await navigate(page, "Notebook");
  await page.locator(".note-list-item").filter({ hasText: title }).click();
  await expect(
    page.getByRole("textbox", { name: "Note content" }),
  ).toContainText(/## Rationale/);
  await expect(
    page.getByRole("textbox", { name: "Note content" }),
  ).toContainText(/## Limitations/);
});

test("notebook creates, saves, edits, switches, exports, and deletes notes", async ({
  page,
}) => {
  await navigate(page, "Notebook");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("Sampling observations");
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("Repeat the hydrogen sampling experiment.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.locator(".note-toolbar")).toContainText(
    "Saved in this browser",
  );
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("Repeat with 24,000 samples and compare the radial histogram.");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("Follow-up experiment");
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("Check convergence before interpreting the cloud.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page
    .locator(".note-list-item")
    .filter({ hasText: "Sampling observations" })
    .click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveValue(
    "Repeat with 24,000 samples and compare the radial histogram.",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export note as Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Sampling-observations.md");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(
    "# Sampling observations\n\nRepeat with 24,000 samples and compare the radial histogram.",
  );
  await page.reload();
  await navigate(page, "Notebook");
  await expect(page.locator(".note-list-item")).toHaveCount(2);
  await page
    .locator(".note-list-item")
    .filter({ hasText: "Follow-up experiment" })
    .click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveValue(
    "Check convergence before interpreting the cloud.",
  );
  await page.getByRole("button", { name: "Delete current note" }).click();
  await expect(page.locator(".note-list-item")).toHaveCount(1);
});

test("library field and text filters combine, saved papers persist, and empty search recovers", async ({
  page,
}) => {
  await navigate(page, "Research library");
  const first = page.locator(".paper-card").first();
  const title = (await first.getByRole("heading").innerText()).trim();
  const domain = (await first.locator(".domain-tag").innerText()).trim();
  await first.getByRole("button", { name: /^Save paper:/ }).click();
  await page
    .getByRole("combobox", { name: "Filter paper field" })
    .selectOption({ label: domain });
  await page.getByRole("textbox", { name: "Search papers" }).fill(title);
  await expect(page.locator(".paper-card")).toHaveCount(1);
  await expect(page.locator(".paper-card").getByRole("link")).toHaveAttribute(
    "target",
    "_blank",
  );
  await page
    .getByRole("textbox", { name: "Search papers" })
    .fill("no-matching-paper-72819");
  await expect(
    page.getByRole("heading", { name: "No papers in this view." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all papers" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search papers" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Filter paper field" }),
  ).toHaveValue("All fields");
  await page.reload();
  await page.getByRole("button", { name: /^Saved papers/ }).click();
  await expect(page.locator(".paper-card")).toHaveCount(1);
  await expect(page.locator(".paper-card").getByRole("heading")).toHaveText(
    title,
  );
  await page
    .locator(".paper-card")
    .getByRole("button", { name: /^Unsave paper:/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "No papers in this view." }),
  ).toBeVisible();
});

test("global keyboard search opens hypotheses, papers, and saved notes", async ({
  page,
}) => {
  const title = (
    await page
      .locator(".hypothesis-card")
      .first()
      .getByRole("heading")
      .innerText()
  ).trim();
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search workspace" }).fill(title);
  await page.locator(".search-results").getByRole("button").click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await navigate(page, "Research library");
  const paperTitle = (
    await page.locator(".paper-card").first().getByRole("heading").innerText()
  ).trim();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search workspace" })
    .fill(paperTitle);
  await page.locator(".search-results").getByRole("button").click();
  await expect(
    page.getByRole("textbox", { name: "Search papers" }),
  ).toHaveValue(paperTitle);
  await expect(page.locator(".paper-card")).toHaveCount(1);
  await navigate(page, "Notebook");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("Quantum test journal");
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("An observation for workspace search.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await navigate(page, "Overview");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search workspace" })
    .fill("Quantum test journal");
  await page.locator(".search-results").getByRole("button").click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Quantum test journal",
  );
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveValue(
    "An observation for workspace search.",
  );
});

test("missing-key research errors are shown without adding pretend results", async ({
  page,
}) => {
  const initialCount = await page.locator(".hypothesis-card").count();
  await page
    .getByRole("button", { name: "Generate hypothesis", exact: true })
    .click();
  await expect(
    page.getByText("Connect ChatGPT to generate new ideas", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate hypotheses", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "What are you curious about?" })
    .fill("How can orbital radial density be measured computationally?");
  await page
    .getByRole("button", { name: "Generate hypotheses", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Add your OpenAI API key in Connection settings",
  );
  await expect(
    page.getByRole("button", { name: "Generate hypotheses", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Explore examples" }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(initialCount);
});

test("mocked ChatGPT hypotheses persist and assistant requests carry conversation context", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { configured: true, model: "test-model" } }),
  );
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/research", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      json:
        body.mode === "hypothesis"
          ? {
              source: "openai",
              hypotheses: [
                {
                  id: "generated-test-hypothesis",
                  title: "Test radial sampling convergence",
                  summary:
                    "Compare sample counts against the analytical hydrogen radial density.",
                  domain: "Quantum mechanics",
                  rationale:
                    "Convergence can be checked against a known distribution.",
                  methodology: [
                    "Sample the 1s density.",
                    "Compare radial histograms at multiple counts.",
                  ],
                  limitations:
                    "An idealized single-electron model does not capture interacting electrons.",
                  source: "openai",
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : {
              source: "openai",
              message: `Response ${requests.filter((r) => r.mode === "assistant").length}: angular nodes follow the orbital quantum numbers.`,
            },
    });
  });
  await page.reload();
  await provideVisitKey(page);
  await expect(
    page.getByRole("button", { name: "Key ready for this visit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate hypothesis", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What are you curious about?" })
    .fill("How can we test radial sampling convergence for hydrogen?");
  await page
    .getByRole("button", { name: "Generate hypotheses", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Test radial sampling convergence",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "AI generated", exact: true }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(1);
  await expect(page.locator(".hypothesis-card")).toContainText(
    "ChatGPT generated",
  );
  expect(requests[0]).toMatchObject({
    mode: "hypothesis",
    orbital: "3d",
    prompt: "How can we test radial sampling convergence for hydrogen?",
  });
  await page.reload();
  await navigate(page, "Hypotheses");
  await page.getByRole("button", { name: "AI generated", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Test radial sampling convergence",
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, "Overview");
  await provideVisitKey(page);
  await page
    .getByRole("button", { name: "Why do orbitals have different shapes?" })
    .click();
  const message = page.getByRole("textbox", {
    name: "Message the research assistant",
  });
  await message.fill("Why does a 2p orbital contain an angular node?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant")).toHaveText(
    /Response 1: angular nodes/,
  );
  await expect(message).toHaveValue("");
  await message.fill("How would that change for the selected 3d orbital?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
  expect(requests[2]).toMatchObject({
    mode: "assistant",
    orbital: "3d",
    history: [
      {
        role: "user",
        content: "Why does a 2p orbital contain an angular node?",
      },
      {
        role: "assistant",
        content:
          "Response 1: angular nodes follow the orbital quantum numbers.",
      },
    ],
  });
});

test("legacy Gemini hypotheses survive reload and both AI sources keep their provenance in exported notes", async ({
  page,
}) => {
  const proposals = [
    {
      id: "legacy-gemini-hypothesis",
      title: "Legacy orbital sampling proposal",
      source: "gemini",
      label: "Gemini generated (legacy)",
    },
    {
      id: "openai-hypothesis",
      title: "New orbital sampling proposal",
      source: "openai",
      label: "ChatGPT generated",
    },
  ];
  await page.evaluate((proposals) => {
    localStorage.setItem(
      "patheon-workspace-v1",
      JSON.stringify({
        version: 1,
        hypotheses: proposals.map(({ id, title, source }) => ({
          id,
          title,
          source,
          summary: "Compare orbital samples against the analytical density.",
          domain: "Quantum mechanics",
          rationale: "A known density provides a reference for convergence.",
          methodology: ["Sample the orbital.", "Compare the radial histogram."],
          limitations: "This proposal uses an idealized one-electron model.",
          createdAt: "2026-09-01T12:00:00.000Z",
        })),
        saved: ["legacy-gemini-hypothesis"],
        papers: [],
        notes: [],
      }),
    );
  }, proposals);
  await page.reload();
  await navigate(page, "Hypotheses");
  await page.getByRole("button", { name: "AI generated", exact: true }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(2);

  for (const proposal of proposals) {
    const card = page
      .locator(".hypothesis-card")
      .filter({ hasText: proposal.title });
    await expect(card).toContainText(proposal.label);
    await card.getByRole("button", { name: /^Explore hypothesis:/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".example-tag")).toHaveText(
      `${proposal.label} · unvalidated`,
    );
    await dialog.getByRole("button", { name: "Add to notebook" }).click();
    await page.keyboard.press("Escape");
  }

  await page.reload();
  await page.getByRole("button", { name: /^Saved hypotheses/ }).click();
  await expect(page.locator(".hypothesis-card")).toHaveCount(1);
  await expect(page.locator(".hypothesis-card")).toContainText(
    "Gemini generated (legacy)",
  );
  await navigate(page, "Notebook");
  for (const proposal of proposals) {
    await page
      .locator(".note-list-item")
      .filter({ hasText: proposal.title })
      .click();
    const provenance = `Source: ${proposal.label}; unvalidated research proposal.`;
    await expect(
      page.getByRole("textbox", { name: "Note content" }),
    ).toHaveValue(
      new RegExp(provenance.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export note as Markdown" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toContain(provenance);
  }
  const savedProposals = await page.evaluate(
    () => JSON.parse(localStorage.getItem("patheon-workspace-v1")!).hypotheses,
  );
  expect(savedProposals).toEqual(
    expect.arrayContaining(
      proposals.map(({ id, source }) =>
        expect.objectContaining({ id, source }),
      ),
    ),
  );
});

test.describe("mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("navigation and each main view fit a 390px phone", async ({ page }) => {
    async function expectNoOverflow() {
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
    }
    await expectNoOverflow();
    for (const [name, heading] of [
      ["Hypotheses", "Ideas with potential."],
      ["Research library", "Build on brilliant minds."],
      ["Notebook", "Leave a trail of thought."],
      ["Overview", "Explore the unseen."],
    ]) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Close navigation", exact: true }),
      ).toBeVisible();
      await navigate(page, name);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(
        page.getByRole("button", { name: "Close navigation", exact: true }),
      ).not.toBeVisible();
      await expectNoOverflow();
    }
    await page
      .getByRole("button", { name: "Generate hypothesis", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoOverflow();
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Close dialog" }).click();
  });
});

test("3D orbital presets, camera controls, detail settings, and observation capture work", async ({
  page,
}) => {
  const scene = page.getByTestId("quantum-scene");
  await expect(scene).toHaveAttribute("data-scene-status", "ready");
  for (const [preset, principal] of [
    ["1s Spherical", "1"],
    ["2p Dumbbell", "2"],
    ["3d Axial + ring", "3"],
  ]) {
    const control = page.getByRole("button", { name: preset, exact: true });
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".scene-coordinates b").first()).toHaveText(
      principal,
    );
    await expect(scene.locator("canvas")).toHaveAttribute(
      "aria-label",
      new RegExp(preset.slice(0, 2)),
    );
    await expect(scene).toHaveAttribute("data-scene-status", "ready");
  }
  const stillFrame = await scene.locator("canvas").screenshot();
  await page
    .getByRole("button", { name: "Play rotation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause rotation", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await scene.locator("canvas").screenshot()).equals(stillFrame),
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Pause rotation", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page
    .getByRole("button", { name: "Visualization settings", exact: true })
    .click();
  await page.getByRole("slider", { name: "Point cloud detail" }).fill("24000");
  await expect(page.locator(".scene-controls label")).toContainText("24,000");
  await page
    .getByRole("button", { name: "Visualization settings", exact: true })
    .click();
  await scene.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  await page.keyboard.press("Home");
  await page
    .getByRole("button", { name: "Expand visualization", exact: true })
    .click();
  await expect(page.locator(".visualizer-expanded")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".visualizer-expanded")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save orbital observation", exact: true })
    .click();
  await navigate(page, "Notebook");
  await page.locator(".note-list-item").first().click();
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveValue(
    /Particles displayed: 24,000/,
  );
  await expect(page.getByRole("textbox", { name: "Note content" })).toHaveValue(
    /n = 3, l = 2, m = 0/,
  );
});

test("WebGL fallback keeps research accessible and corrupted browser data is handled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("patheon-workspace-v1", "{broken-json");
    const original = HTMLCanvasElement.prototype.getContext;
    // Simulate a browser without a usable WebGL implementation.
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (
        kind === "webgl" ||
        kind === "webgl2" ||
        kind === "experimental-webgl"
      )
        return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.reload();
  await expect(page.getByTestId("quantum-scene")).toHaveAttribute(
    "data-scene-status",
    "unavailable",
  );
  await expect(
    page.getByText("3D rendering isn’t available in this browser."),
  ).toBeVisible();
  await navigate(page, "Hypotheses");
  await expect(page.locator(".hypothesis-card")).toHaveCount(3);
});
