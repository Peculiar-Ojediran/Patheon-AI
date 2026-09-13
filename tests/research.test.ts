import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenAIRequest,
  createResearchHandler,
  createResearchLimiter,
  DEFAULT_OPENAI_MODEL,
  extractOpenAIOutput,
  getResearchConfiguration,
  MAX_REQUEST_BYTES,
  parseResearchOutput,
  parseResearchRequest,
  ResearchError,
} from "../src/lib/research-server";
import { EXAMPLE_HYPOTHESES } from "../src/lib/research";
import { OPENAI_MODEL_IDS } from "../src/lib/models";

const validInput = {
  mode: "hypothesis",
  prompt: "Explore a test for orbital mixing",
  orbital: "2p",
};
const env = { OPENAI_API_KEY: "sk-test-private-key-not-a-real-key" };
const makeRequest = (
  body: unknown = validInput,
  headers: Record<string, string> = {},
) =>
  new Request("http://localhost/api/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
const exampleOutput = {
  hypotheses: EXAMPLE_HYPOTHESES.map(
    ({ title, summary, domain, rationale, methodology, limitations }) => ({
      title,
      summary,
      domain,
      rationale,
      methodology,
      limitations,
    }),
  ),
};
const providerResponse = (text: string, status = "completed") =>
  Response.json({
    status,
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text }],
      },
    ],
  });
const handler = (fetcher: typeof fetch, extra = {}) =>
  createResearchHandler({
    env,
    fetcher,
    limiter: createResearchLimiter(),
    ...extra,
  });

test("rejects unsupported modes, orbitals, excess history, and blank prompts", () => {
  for (const body of [
    { ...validInput, mode: "execute" },
    { ...validInput, orbital: "4f" },
    { ...validInput, prompt: "   " },
    { ...validInput, prompt: "a".repeat(9) },
    { ...validInput, prompt: "a".repeat(4001) },
    {
      ...validInput,
      history: Array.from({ length: 11 }, () => ({
        role: "user",
        content: "hello",
      })),
    },
    {
      ...validInput,
      history: Array.from({ length: 5 }, () => ({
        role: "user",
        content: "x".repeat(4000),
      })),
    },
    { ...validInput, apiKey: "client-cannot-override" },
  ])
    assert.throws(() => parseResearchRequest(body), ResearchError);
  assert.equal(
    parseResearchRequest({ ...validInput, prompt: "  Test nodal planes  " })
      .prompt,
    "Test nodal planes",
  );
  assert.equal(
    parseResearchRequest({ ...validInput, prompt: "a".repeat(10) }).prompt
      .length,
    10,
  );
  assert.equal(
    parseResearchRequest({ ...validInput, prompt: "a".repeat(4000) }).prompt
      .length,
    4000,
  );
  assert.doesNotThrow(() =>
    parseResearchRequest({
      ...validInput,
      prompt: "a".repeat(4000),
      history: Array.from({ length: 4 }, () => ({
        role: "user",
        content: "x".repeat(3000),
      })),
    }),
  );
});

test("a missing request key returns 401 without using server credentials or invoking a provider", async () => {
  let called = false;
  const response = await createResearchHandler({
    env,
    fetcher: async () => {
      called = true;
      throw new Error("must not run");
    },
  })(makeRequest(validInput, { Authorization: "" }));
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.code, "api_key_required");
  assert.match(result.error, /OpenAI API key/);
  assert.equal(result.hypotheses, undefined);
  assert.equal(called, false);
});

test("invalid JSON and non-JSON requests fail before provider work", async () => {
  const run = createResearchHandler({ env: {} });
  const malformed = new Request("http://localhost/api/research", {
    method: "POST",
    body: "{bad",
    headers: { "Content-Type": "application/json" },
  });
  assert.equal((await run(malformed)).status, 400);
  assert.equal(
    (await run(makeRequest(validInput, { "Content-Type": "text/plain" })))
      .status,
    415,
  );
});

test("enforces byte limits even without Content-Length", async () => {
  const response = await createResearchHandler({ env: {} })(
    makeRequest({ ...validInput, prompt: "x".repeat(MAX_REQUEST_BYTES) }),
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "request_too_large");
});

test("cross-origin requests are rejected", async () => {
  const response = await createResearchHandler({ env: {} })(
    makeRequest(validInput, { origin: "https://unrelated.example" }),
  );
  assert.equal(response.status, 403);
});

test("accepts browser-facing Host aliases without trusting forwarded-host", async () => {
  const run = createResearchHandler({ env: {} });
  const request = (origin: string, extra: Record<string, string> = {}) =>
    new Request("http://127.0.0.1:3000/api/research", {
      method: "POST",
      body: JSON.stringify(validInput),
      headers: {
        "Content-Type": "application/json",
        host: "localhost:3000",
        origin,
        ...extra,
      },
    });
  assert.equal((await run(request("http://localhost:3000"))).status, 401);
  assert.equal(
    (
      await run(
        request("https://unrelated.example", {
          "x-forwarded-host": "unrelated.example",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await run(
        request("http://localhost:3000", { "sec-fetch-site": "cross-site" }),
      )
    ).status,
    403,
  );
});

test("builds model conversation roles and structured output without secrets", () => {
  const input = parseResearchRequest({
    ...validInput,
    history: [
      { role: "user", content: "What is a node?" },
      { role: "assistant", content: "A zero of the wavefunction." },
    ],
  });
  const request = buildOpenAIRequest(input);
  assert.deepEqual(
    request.input.map((item) => item.role),
    ["user", "assistant", "user"],
  );
  assert.match(request.instructions, /unvalidated/);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.equal(request.text.format.schema.properties.hypotheses.minItems, 3);
  assert.equal(request.text.format.schema.properties.hypotheses.maxItems, 3);
  assert.equal(
    request.text.format.schema.properties.hypotheses.items.additionalProperties,
    false,
  );
  assert.equal(
    JSON.stringify(request.text.format.schema).includes("minLength"),
    false,
  );
  assert.equal(request.model, DEFAULT_OPENAI_MODEL);
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 8192);
  assert.match(
    request.input.at(-1)!.content,
    /Selected field-free hydrogen orbital: 2p/,
  );
  assert.equal(JSON.stringify(request).includes(env.OPENAI_API_KEY), false);
});

test("live hypotheses get server IDs, timestamps, and genuine provider provenance", async () => {
  let seenUrl = "";
  let seenKey = "";
  let seenBody: Record<string, unknown> = {};
  const response = await handler(async (url, init) => {
    seenUrl = String(url);
    seenKey = new Headers(init?.headers).get("Authorization") ?? "";
    seenBody = JSON.parse(String(init?.body));
    return providerResponse(JSON.stringify(exampleOutput));
  })(makeRequest());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.source, "openai");
  assert.equal(data.hypotheses.length, 3);
  assert.equal(
    new Set(data.hypotheses.map((item: { id: string }) => item.id)).size,
    3,
  );
  for (const item of data.hypotheses) {
    assert.equal(item.source, "openai");
    assert.equal(Number.isNaN(Date.parse(item.createdAt)), false);
  }
  assert.equal(seenKey, `Bearer ${env.OPENAI_API_KEY}`);
  assert.equal(seenUrl, "https://api.openai.com/v1/responses");
  assert.equal(seenBody.model, DEFAULT_OPENAI_MODEL);
  assert.equal(seenBody.store, false);
  assert.equal(seenUrl.includes(env.OPENAI_API_KEY), false);
});

test("assistant mode reads output messages after reasoning without exposing reasoning", async () => {
  const response = await handler(async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "reasoning",
          summary: [
            { type: "summary_text", text: "internal thought must not appear" },
          ],
        },
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: '{"message":"The density is proportional to ',
            },
            {
              type: "output_text",
              text: 'the squared wavefunction magnitude."}',
            },
          ],
        },
      ],
    }),
  )(makeRequest({ mode: "assistant", prompt: "What is orbital density?" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    source: "openai",
    message:
      "The density is proportional to the squared wavefunction magnitude.",
  });
});

test("rejects malformed generated structures instead of substituting examples", () => {
  for (const data of [
    "not json",
    JSON.stringify({ hypotheses: [] }),
    JSON.stringify({ hypotheses: [exampleOutput.hypotheses[0]] }),
    JSON.stringify({
      hypotheses: [
        ...exampleOutput.hypotheses.slice(0, 2),
        { title: "Missing fields" },
      ],
    }),
  ])
    assert.throws(() => parseResearchOutput(data, "hypothesis"), ResearchError);
});

test("handles incomplete, failed, empty, and malformed provider envelopes", async () => {
  for (const getResponse of [
    () => providerResponse(JSON.stringify(exampleOutput), "incomplete"),
    () => providerResponse(JSON.stringify(exampleOutput), "failed"),
    () => Response.json({ status: "completed", output: [] }),
    () =>
      Response.json({
        status: "completed",
        output: [{ type: "reasoning", summary: [] }],
      }),
    () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "incomplete",
            content: [
              { type: "output_text", text: JSON.stringify(exampleOutput) },
            ],
          },
        ],
      }),
    () => Response.json({ output_text: JSON.stringify(exampleOutput) }),
    () => new Response("not-json"),
    () => providerResponse("{}"),
  ]) {
    const response = await handler(async () => getResponse())(makeRequest());
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, "invalid_response");
    assert.equal(body.hypotheses, undefined);
  }
});

test("handles provider refusals without accepting partial text or invented hypotheses", async () => {
  const response = await handler(async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: JSON.stringify(exampleOutput) },
            {
              type: "refusal",
              refusal: `Refusal diagnostics ${env.OPENAI_API_KEY}`,
            },
          ],
        },
      ],
    }),
  )(makeRequest());
  assert.equal(response.status, 422);
  const data = await response.json();
  assert.equal(data.code, "provider_refused");
  assert.equal(data.hypotheses, undefined);
  assert.equal(JSON.stringify(data).includes(env.OPENAI_API_KEY), false);
});

test("rejects malformed messages even when the response claims completion", () => {
  for (const message of [
    {
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "output_text", text: "{}" }],
    },
    {
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: 42 }],
    },
    {
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "image", text: "{}" }],
    },
  ])
    assert.throws(
      () => extractOpenAIOutput({ status: "completed", output: [message] }),
      ResearchError,
    );
});

test("sends a configured model in the JSON body to the fixed OpenAI endpoint", async () => {
  let model = "";
  const response = await handler(
    async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      model = JSON.parse(String(init?.body)).model;
      return providerResponse(JSON.stringify(exampleOutput));
    },
    { env: { ...env, OPENAI_MODEL: "gpt-5.6-terra" } },
  )(makeRequest());
  assert.equal(response.status, 200);
  assert.equal(model, "gpt-5.6-terra");
});

test("provider errors are useful and never echo provider secrets", async () => {
  for (const [upstreamStatus, expected] of [
    [401, 401],
    [403, 422],
    [404, 422],
    [429, 429],
    [500, 502],
  ]) {
    const response = await handler(
      async () =>
        new Response(`Provider diagnostic with ${env.OPENAI_API_KEY}`, {
          status: upstreamStatus,
        }),
    )(makeRequest());
    assert.equal(response.status, expected);
    assert.equal((await response.text()).includes(env.OPENAI_API_KEY), false);
  }
  const network = await handler(async () => {
    throw new Error(`network error ${env.OPENAI_API_KEY}`);
  })(makeRequest());
  assert.equal(network.status, 503);
  assert.equal((await network.text()).includes(env.OPENAI_API_KEY), false);
});

test("timeouts abort the provider and free the concurrency slot", async () => {
  const limiter = createResearchLimiter(12, 1);
  const run = handler(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    { timeoutMs: 10, limiter },
  );
  const response = await run(makeRequest());
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "provider_timeout");
  const release = limiter.acquire();
  release();
});

test("oversized provider output is bounded and rejected", async () => {
  const response = await handler(async () => new Response("x".repeat(131_073)))(
    makeRequest(),
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "invalid_response");
});

test("limiter enforces concurrency and rolling window, with idempotent release", () => {
  const limiter = createResearchLimiter(2, 1);
  const releaseFirst = limiter.acquire(1000);
  assert.throws(
    () => limiter.acquire(1001),
    (error: unknown) => error instanceof ResearchError && error.code === "busy",
  );
  releaseFirst();
  releaseFirst();
  const releaseSecond = limiter.acquire(1002);
  releaseSecond();
  assert.throws(
    () => limiter.acquire(1003),
    (error: unknown) =>
      error instanceof ResearchError && error.code === "rate_limited",
  );
  assert.doesNotThrow(() => limiter.acquire(61_003)());
});

test("untrusted forwarded IPs cannot bypass the process quota", async () => {
  const run = handler(
    async () => providerResponse(JSON.stringify(exampleOutput)),
    { limiter: createResearchLimiter(1, 1) },
  );
  assert.equal(
    (await run(makeRequest(validInput, { "x-forwarded-for": "1.2.3.4" })))
      .status,
    200,
  );
  const limited = await run(
    makeRequest(validInput, { "x-forwarded-for": "5.6.7.8" }),
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
});

test("model config ignores credentials and uses only supported model IDs", () => {
  assert.equal(getResearchConfiguration({}).configured, false);
  assert.equal(
    getResearchConfiguration({ OPENAI_API_KEY: "  " }).configured,
    false,
  );
  assert.equal(
    getResearchConfiguration({ ...env, OPENAI_MODEL: "gpt-5.6-terra" }).model,
    "gpt-5.6-terra",
  );
  assert.equal(
    getResearchConfiguration({ ...env, OPENAI_MODEL: "../secret?key=leak" })
      .model,
    DEFAULT_OPENAI_MODEL,
  );
  assert.equal(
    getResearchConfiguration({ ...env, OPENAI_MODEL: "chat-latest" }).model,
    "chat-latest",
  );
  assert.equal(
    getResearchConfiguration({
      GEMINI_API_KEY: "old-key",
      GEMINI_MODEL: "gemini-3.8-flash",
    }).configured,
    false,
  );
  assert.equal(
    getResearchConfiguration({ ...env, OPENAI_MODEL: "gemini-3.8-flash" })
      .model,
    DEFAULT_OPENAI_MODEL,
  );
  for (const model of ["gpt-image-2", "gpt-unknown", "https://example.com", env.OPENAI_API_KEY]) {
    assert.equal(getResearchConfiguration({ OPENAI_MODEL: model }).model, DEFAULT_OPENAI_MODEL);
  }
});

test("each supported user model overrides the server default for hypotheses and chat", async () => {
  for (const mode of ["hypothesis", "assistant"] as const) {
    for (const model of OPENAI_MODEL_IDS) {
      let calls = 0;
      const run = handler(async (url, init) => {
        calls++;
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, model);
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        assert.equal(String(init?.body).includes(env.OPENAI_API_KEY), false);
        return providerResponse(JSON.stringify(mode === "hypothesis" ? exampleOutput : { message: "A node is a zero of the wavefunction." }));
      }, { env: { OPENAI_MODEL: "gpt-5.6-terra" } });
      const response = await run(makeRequest({ ...validInput, mode, model }));
      assert.equal(response.status, 200);
      assert.equal(calls, 1);
    }
  }
});

test("unsupported client models fail before provider work without echoing their value", async () => {
  let calls = 0;
  const run = handler(async () => {
    calls++;
    throw new Error("must not run");
  });
  for (const model of ["gpt-image-2", "gpt-unknown", "https://example.com", env.OPENAI_API_KEY, "", null, 42, { id: "chat-latest" }]) {
    const response = await run(makeRequest({ ...validInput, model }));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "unsupported_model");
    assert.equal(JSON.stringify(body).includes(env.OPENAI_API_KEY), false);
  }
  assert.equal(calls, 0);
});

test("concurrent users keep their model choices isolated", async () => {
  const seen: string[] = [];
  const run = handler(async (_url, init) => {
    seen.push(JSON.parse(String(init?.body)).model);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return providerResponse(JSON.stringify(exampleOutput));
  });
  const models = ["gpt-5.6-luna", "gpt-6-astra"];
  const responses = await Promise.all(models.map((model) => run(makeRequest({ ...validInput, model }))));
  assert.ok(responses.every((response) => response.status === 200));
  assert.deepEqual(seen.sort(), models.sort());
});

test("unavailable models report a recoverable access error with no fallback request", async () => {
  for (const status of [403, 404]) {
    let calls = 0;
    const run = handler(async () => {
      calls++;
      return new Response(`Private provider diagnostic ${env.OPENAI_API_KEY}`, { status });
    });
    const response = await run(makeRequest({ ...validInput, model: "gpt-6-astra" }));
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.code, "model_access_denied");
    assert.match(body.error, /Choose another AI model/);
    assert.equal(JSON.stringify(body).includes(env.OPENAI_API_KEY), false);
    assert.equal(calls, 1);
  }
});

test("request keys are isolated across concurrent callers and never reused", async () => {
  const keys = [
    "sk-request-one-unique-credential",
    "sk-request-two-unique-credential",
  ];
  const observed: string[] = [];
  const run = handler(async (_url, init) => {
    observed.push(new Headers(init?.headers).get("Authorization")!);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    for (const key of keys)
      assert.equal(String(init?.body).includes(key), false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return providerResponse(JSON.stringify(exampleOutput));
  });
  const responses = await Promise.all(
    keys.map((key) =>
      run(makeRequest(validInput, { Authorization: `Bearer ${key}` })),
    ),
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Set-Cookie"), null);
    const body = await response.text();
    for (const key of keys) assert.equal(body.includes(key), false);
  }
  assert.deepEqual(observed.sort(), keys.map((key) => `Bearer ${key}`).sort());
  const missing = await run(makeRequest(validInput, { Authorization: "" }));
  assert.equal(missing.status, 401);
  assert.equal(observed.length, 2);
  const configuration = getResearchConfiguration(env);
  assert.equal(configuration.configured, false);
  assert.equal(configuration.requiresUserKey, true);
  assert.equal(
    JSON.stringify(configuration).includes(env.OPENAI_API_KEY),
    false,
  );
});

test("invalid credentials and insecure transport fail before calling OpenAI", async () => {
  let called = false;
  const run = handler(async () => {
    called = true;
    throw new Error("must not run");
  });
  for (const authorization of [
    "Basic abc",
    "Bearer sk-short",
    "Bearer sk-" + "x".repeat(510),
    "Bearer sk-not valid whitespace",
  ]) {
    const result = await run(
      makeRequest(validInput, { Authorization: authorization }),
    );
    assert.equal(result.status, 400);
    assert.equal((await result.json()).code, "invalid_api_key");
  }
  for (const [url, headers] of [
    ["http://research.example/api/research", {}],
    [
      "http://127.0.0.1:3000/api/research",
      { host: "research.example", origin: "http://research.example" },
    ],
  ] as const) {
    const result = await run(
      new Request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          ...headers,
        },
        body: JSON.stringify(validInput),
      }),
    );
    assert.equal(result.status, 400);
    assert.equal((await result.json()).code, "secure_connection_required");
  }
  assert.equal(called, false);
});

test("HTTPS browser origins work behind a same-host TLS proxy", async () => {
  const run = handler(async () =>
    providerResponse(JSON.stringify(exampleOutput)),
  );
  const response = await run(
    new Request("http://127.0.0.1:3000/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host: "research.example",
        origin: "https://research.example",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(validInput),
    }),
  );
  assert.equal(response.status, 200);
});

test("pasted keys are removed from prompts/history and reflected credentials never reach the response", async () => {
  const key = env.OPENAI_API_KEY;
  const run = handler(async (_url, init) => {
    assert.equal(String(init?.body).includes(key), false);
    assert.match(String(init?.body), /API key removed/);
    return providerResponse(
      JSON.stringify({ message: `Here is a credential: ${key}` }),
    );
  });
  const response = await run(
    makeRequest({
      mode: "assistant",
      prompt: `Explain wavefunctions. ${key}`,
      history: [{ role: "user", content: `Accidental key ${key}` }],
    }),
  );
  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.code, "invalid_response");
  assert.equal(JSON.stringify(data).includes(key), false);
});

test("client cancellation stops the provider and releases the request slot", async () => {
  const client = new AbortController();
  const limiter = createResearchLimiter(12, 1);
  let aborted = false;
  const run = handler(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, {once: true});
    client.abort();
  }), {limiter});
  await run(new Request("http://localhost/api/research", {
    method: "POST", signal: client.signal,
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}`},
    body: JSON.stringify(validInput),
  }));
  assert.equal(aborted, true);
  assert.doesNotThrow(() => limiter.acquire()());
});
