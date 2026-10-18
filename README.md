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
```

Use the exact model ID available in your Token Factory account. The model must support function/tool calling. The ElevenLabs key needs Speech to Text access. Never put provider keys into browser JavaScript or commit `.env.local`.

Run `node --env-file-if-exists=.env.local server.mjs`, then open http://127.0.0.1:3018. Restart the server after changing environment values. No access code is required; anyone with the URL can use the app.

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
- Queued text is held in tab memory by default. Opt-in device saving retains a single discussion in localStorage, including transcript, results, pending work and elapsed time; it does not store audio or access codes. Restore leaves research paused. Delete removes the device copy. JSON export downloads the current discussion. There is no account-based cloud archive. The transcript preview shows the latest text; expand it to read the full conversation. Research sections are split without dropping remaining text.
- Each server instance allows up to 20 paid-route requests per minute per socket address. On proxies, multiple visitors may share a bucket. This is a demo safeguard, not a distributed quota or a spending cap. Set provider budgets before sharing publicly; a wider launch needs shared rate limiting and individual authentication.
- The app is publicly accessible without a demo code. Same-origin validation and per-instance rate limits remain enabled; they are not authentication or a spending cap.
- Search excerpts are not full-page verification. The app cannot establish that a source is correct merely because its URL was retrieved. Review linked evidence and uncertainty.
- Configuration indicators only show whether variables exist. They do not establish valid credentials, credits or provider availability.

## Tests

Run `node --test`. Tests cover audio conversion, secret-safe errors, transcript queue retention and splitting, deduplication, citation validation, access controls, rate limits, cancellation signals, streaming tool execution, and caching. Provider responses in tests are isolated fixtures; they are never served as successful live results. Live microphone and provider checks must be performed separately with valid credentials.

## Vercel

Import the repository as an Other-framework project. Serve `public` as configured by `vercel.json`; there is no build command. Add the variables above in the project's environment settings, then deploy. Use HTTPS for microphone access. The research handler needs the configured 60-second execution allowance; confirm it is available on your deployment. Check public access and input validation, then run a live claim and microphone test within your provider budget. GitHub pushes trigger deployments only after you connect the repository to Vercel; local edits alone do not publish anything.

## Discussion controls

Live, Evidence and Panel views share a persistent recording control. Pause and wait for the final transcript before changing the manual speaker label. Speaker A/B buttons and custom labels associate future text with that label; this is not automatic diarization. The same statement by different speakers is retained separately. Panel counts are evidence categories, never an honesty rating.

A configurable 20/50/100 research-request allowance pauses automatic research when reached, including failed attempts. It is a tab-level convenience, not a dollar budget or security boundary. Server rate limits and provider budgets still apply. No paid provider retries occur automatically.

## Parallel research

Streaming checks research up to two extracted claims concurrently and emit each validated assessment immediately. Searches requested together within a claim's tool round also run concurrently. The batch still has at most three Tavily searches: three for one claim, two plus one for two claims, or one each for three claims. This bounds search cost but leaves less room for follow-up evidence when a batch has several claims; insufficient evidence must remain Unverified or Needs Context. Model-call counts may increase for multi-claim batches.

Each claim has its own evidence IDs, remapped when assembling the final batch response. Successful partial results are shown and cached for five minutes even if another claim fails. Failed batches stay queued for explicit retry; completed claims can reuse that cache. The 52-second overall deadline and cancellation signal cover all workers. This reduces waiting between independent work; it does not guarantee provider latency or a fixed speedup.

## Long conversations and coverage

Input is split into sections of at most 1,200 characters, preferring sentence or word boundaries. Each section remains in the coverage ledger, including repeated sections linked to the original. The last 600 characters of preceding context help extraction resolve references; context is not new material to check.

Extraction requests all claims. If more than three are detected, the API returns the complete `deferred` list and the client queues groups of up to three, each with the original section as context. Each group retains the three-search cap; therefore a long section can cost more than three searches overall. Request allowances still pause the queue without deleting pending groups. Truncated or invalid extraction, including more than 30 claims in one section, fails visibly rather than returning a truncated list. JSON clients must also process the `deferred` field.

Coverage distinguishes waiting, researching, partial results, assessed, no checkable claim detected, grouped work, duplicates, cancellation and failure. Assessed means the detected claims were processed, not that the extraction was exhaustive or that the claims are true. The ledger is included in device saving and exports. No model-based extraction can guarantee every implied or ambiguous claim is detected.

The transcript shows a short tail preview with an expandable full transcript. Result cards are expandable, with the initial result open and later cards compact; no automatic scrolling is introduced.

## Focused interface

The German Live view shows one published assessment, current detection, a three-line transcript preview and section progress. Detailed research is collapsed. The Results view shows the complete published feed with verdict filters; Speaker view keeps comparisons separate. Incoming cards are buffered behind a new-results button so reading is not interrupted. They are still included immediately in session history, counts, saving and export. Reset is in session settings. Provider-originated diagnostic messages may retain their original language.
