# Patheon AI

A personal physics research platform built with Next.js, TypeScript, Tailwind CSS, Framer Motion, Three.js, and ChatGPT through the OpenAI API.

Explore hydrogen orbitals in an interactive 3D workspace, develop research hypotheses, collect original papers, and keep a research notebook.

## Run locally

Requires Node.js 20.9 or later and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The 3D explorer, curated papers, example hypotheses, bookmarks, and notebook work without an API key. AI generation and conversations require an OpenAI API key; missing credentials are reported explicitly and never replaced with simulated AI output.

## Connect ChatGPT

Create a key in [OpenAI Platform](https://platform.openai.com/api-keys). In the app, open **Workspace settings**, enter it in the masked **OpenAI API key** field, and choose **Use for this visit**. No server restart is needed.

Choose **AI model** in the same settings to select Chat Latest, GPT-5.6 Luna, GPT-5.6 Terra, GPT-5.6 Sol, or GPT-6 Astra. The selection applies to both hypothesis generation and the research assistant for this visit. Reloading restores the server's default model and clears the key. Your key's project must have access to the chosen model; access errors let you choose another model without re-entering the key. The app does not automatically switch models or retry billable requests.

The key remains only in the current page's memory. The password field clears after submission. Each research request sends it to this app's server in the `Authorization` header; the server uses it for that one OpenAI request and does not retain it. **Clear key**, reloading, or leaving the page removes it from the app. Every browser tab and every user supplies their own key.

The app never writes user-entered keys to localStorage, sessionStorage, cookies, files, databases, logs, notes, hypotheses, or exports. Persistent research uses an explicit field allowlist, and accidentally pasted OpenAI key strings are removed from saved/exported content and model prompts. Browser extensions, password managers, OS memory, and third-party infrastructure are outside the app's control.

`.env.local` is optional and is used only to configure the initial model:

```dotenv
OPENAI_MODEL=chat-latest
```

Restart the app only after changing `OPENAI_MODEL`. The default model, [`chat-latest`](https://developers.openai.com/api/docs/models/chat-latest), is the latest Instant model used in ChatGPT. Set the server default to any model ID from `src/lib/models.ts`; unsupported configuration values fall back to `chat-latest`. All picker options support the Responses API and structured output, as verified in the [OpenAI model documentation](https://developers.openai.com/api/docs/models). `OPENAI_API_KEY` in server environment variables or an old `.env.local` is ignored; requests always need the user's current key. Remove any previously entered credential from your own environment file if you no longer want it stored there. OpenAI API requests are billed separately from ChatGPT subscriptions, and pricing varies by model.

“Key ready for this visit” means a key was supplied, not that OpenAI verified it. Actual provider access and quota are checked when you send a request. Automated tests use synthetic credentials and mocked provider responses; live calls require your own key.

## What you can do

- **Quantum playground:** inspect 1s, 2p_z, and 3d_z² probability clouds; switch states, rotate, zoom, pause, reset the camera, adjust point count, expand the scene, and save observations.
- **Hypotheses:** inspect rationale, proposed methods, and limitations; bookmark examples or generate three proposals from a custom question using ChatGPT.
- **Research copilot:** discuss physics with a ChatGPT assistant that receives the selected orbital and bounded recent conversation context.
- **Research library:** search and filter four curated publications, open the original sources, and bookmark papers.
- **Notebook:** create, edit, save, and export notes as Markdown; convert an orbital observation or hypothesis into a research note.
- **Workspace search:** press Ctrl/Cmd + K to find hypotheses, papers, and notes.
- **Portable data:** export the saved workspace as JSON from workspace settings. This version does not provide JSON import.

All notes, bookmarks, and generated hypotheses are stored in browser `localStorage`. Chat stays in memory during the session. There is no account system, database synchronization, or collaboration service. Use Save note before closing the page; switching to another note also saves the current draft. Export saved work before clearing browser data or switching devices.

Previously saved Gemini hypotheses remain available and are labeled “Gemini generated (legacy)” in the workspace and newly exported research plans. The AI generated filter includes both old Gemini proposals and new ChatGPT proposals. Existing notes retain their original content and source labels.

## Physics model

The explorer uses normalized analytic wavefunctions for an isolated, nonrelativistic hydrogen atom with a fixed nucleus and no external field. Points are deterministic samples of the position probability density |ψ|², with the spherical volume factor included. Sampling uses the exact separable radial gamma distribution and angular rejection sampling for the three supported states.

- Colors show positive and negative wavefunction sign, not positive and negative charge.
- Cloud rotation changes the view; it does not represent an electron trajectory or time evolution.
- The 3d_z² state has two axial lobes and an equatorial ring, rather than the four lobes of other d states.
- Distances use Bohr radii. Each orbital is framed independently, so apparent sizes across presets are not directly comparable.
- A finite display radius omits less than 0.0003% of probability for each supported state.
- Example and AI-generated hypotheses are unvalidated proposals. The viewer does not solve the proposed Stark-effect, imaging, or Rydberg experiments.

Model reference: [OpenStax, The Hydrogen Atom](https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom). Publication references are linked directly in the library.

## Validate

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests verify the physics model, provider handling, model selection and validation, request-specific credential isolation, redaction, storage allowlists, errors, rate limits, and timeouts. Browser tests verify model selection for both research modes, key clearing, page departure, reloads, separate contexts, request headers, research persistence, and credential-free exports using synthetic keys.

## Production build

```powershell
npm run build
npm start
```

Use a Node.js host for the API routes; a static-only host cannot run the OpenAI backend. The included start command binds to loopback for local use. On a private hosted deployment, use `npx next start --hostname 0.0.0.0` with the host's access controls and server-side environment variables.

Deployed access must use HTTPS; plaintext HTTP credential requests are allowed only on localhost. The upstream OpenAI URL is fixed, redirects are refused, and request/response caching is disabled. Keep `Authorization` headers and research request bodies out of reverse-proxy, hosting, analytics, and monitoring logs/traces. Disable automatic form/session recording around credential fields. This is necessary to preserve the app's no-key-persistence policy across your deployment.

The in-process API guard permits two concurrent requests and 12 starts per minute across the instance. It retains only counts/timestamps, never keys or key hashes. This personal workbench does not include user accounts or distributed quotas; add access controls and shared limits for a public deployment.

## Project layout

```text
src/app/                     Next.js layout, page, stylesheet, and API routes
src/components/              Workspace interface, dialogs, Three.js scene
src/lib/physics.ts           Analytic hydrogen model and sampling
src/lib/research.ts          Curated publications and labeled examples
src/lib/research-server.ts   Validated OpenAI requests and provider handling
src/lib/models.ts            Shared supported-model catalog and default
src/lib/types.ts             Shared contracts
tests/                       Physics, backend, and browser tests
```

API implementation references: [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Next.js App Router](https://nextjs.org/docs/app).
