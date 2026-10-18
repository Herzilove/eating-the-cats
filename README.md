# Eating the Cats

A mobile-friendly live fact-checking prototype using ElevenLabs Realtime Scribe, Nemotron through Nebius Token Factory, and Tavily search. The current app is plain browser JavaScript with Node serverless handlers; it has no build dependencies.

## Local setup

Requires Node.js 22 or later. Copy `.env.example` to `.env.local` if the latter does not exist. Put credentials only in `.env.local`:

```dotenv
NEBIUS_API_KEY=your_token_factory_key
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
NEBIUS_MODEL=your_available_tool_calling_model_id
TAVILY_API_KEY=your_tavily_key
ELEVENLABS_API_KEY=your_elevenlabs_key
DEMO_ACCESS_TOKEN=your_long_random_demo_access_code
```

Use the exact model ID available in your Token Factory account. The model must support function/tool calling. The ElevenLabs key needs Speech to Text access. Never use provider keys as the demo access code. Never put provider keys into browser JavaScript or commit `.env.local`.

Run `node --env-file-if-exists=.env.local server.mjs`, then open http://127.0.0.1:3018. Restart the server after changing environment values. Enter the demo access code in the page if configured; it is held only in the current page. A code is optional for the loopback-only local server and required on Vercel.

## How it works

1. Start listening to request a microphone with echo cancellation and noise suppression. A server route issues a single-use ElevenLabs token; the permanent key stays server-side.
2. Audio streams directly to ElevenLabs as PCM16. Interim speech appears in the transcript; committed speech enters a research queue while recording continues. Choose a 30, 60 or 90 minute recording allowance. Pause/resume preserves elapsed recording time; the selected allowance applies across resumes. Optional reconnection makes up to three attempts after unexpected socket closure and marks gaps. Browser backgrounding or provider limits may interrupt audio.
3. Streaming requests first extract complete claims and display them immediately. Each queued batch then goes to Nemotron. It can call Tavily search up to three times, inspect numbered excerpts, and return up to three assessed claims. Actual search queries stream into the research activity panel.
4. The server validates claim fields, verdicts and citation IDs. Unsupported citations reject the response; uncited claims become Unverified. Source links and expandable search excerpts appear in the evidence feed.

Manual input is separate from the live transcript. Failed and cancelled batches remain pending; use **Retry pending research** or copy the retained text. There is no automatic retry of failed paid calls. Cancel research does not stop the microphone; stop listening separately. Reset is available when recording and research are inactive. Display mode hides editing controls and enlarges evidence cards.

## Limits and privacy

- Provider requests have an 18-second timeout; research has a 52-second overall deadline. Cancellation aborts in-flight fetches, but a provider may still bill work already accepted.
- Exact repeated batches are deduplicated in the tab; completed claim cards are deduplicated by normalized claim text. This is not semantic deduplication.
- Successful results are cached in server memory for five minutes, up to 100 batches. The original assessment time remains visible. Cache contents include submitted text and research results and disappear on process restart; no database is used.
- Queued text is held in tab memory by default. Opt-in device saving retains a single discussion in localStorage, including transcript, results, pending work and elapsed time; it does not store audio or access codes. Restore leaves research paused. Delete removes the device copy. JSON export downloads the current discussion. There is no account-based cloud archive. The transcript display shows the latest 6,000 characters; research batches are split without dropping remaining text.
- Each server instance allows up to 20 paid-route requests per minute per socket address. On proxies, multiple visitors may share a bucket. This is a demo safeguard, not a distributed quota or a spending cap. Set provider budgets before sharing publicly; a wider launch needs shared rate limiting and individual authentication.
- Vercel fails closed if `DEMO_ACCESS_TOKEN` is missing. Same-origin validation is an additional browser safeguard, not authentication.
- Search excerpts are not full-page verification. The app cannot establish that a source is correct merely because its URL was retrieved. Review linked evidence and uncertainty.
- Configuration indicators only show whether variables exist. They do not establish valid credentials, credits or provider availability.

## Tests

Run `node --test`. Tests cover audio conversion, secret-safe errors, transcript queue retention and splitting, deduplication, citation validation, access controls, rate limits, cancellation signals, streaming tool execution, and caching. Provider responses in tests are isolated fixtures; they are never served as successful live results. Live microphone and provider checks must be performed separately with valid credentials.

## Vercel

Import the repository as an Other-framework project. Serve `public` as configured by `vercel.json`; there is no build command. Add the variables above in the project's environment settings, including `DEMO_ACCESS_TOKEN`, then deploy. Use HTTPS for microphone access. The research handler needs the configured 60-second execution allowance; confirm it is available on your deployment. Smoke-test access-code rejection first, then run a live claim and microphone test within your provider budget. GitHub pushes trigger deployments only after you connect the repository to Vercel; local edits alone do not publish anything.

## Discussion controls

Live, Evidence and Panel views share a persistent recording control. Pause and wait for the final transcript before changing the manual speaker label. Speaker A/B buttons and custom labels associate future text with that label; this is not automatic diarization. The same statement by different speakers is retained separately. Panel counts are evidence categories, never an honesty rating.

A configurable 20/50/100 research-request allowance pauses automatic research when reached, including failed attempts. It is a tab-level convenience, not a dollar budget or security boundary. Server rate limits and provider budgets still apply. No paid provider retries occur automatically.
