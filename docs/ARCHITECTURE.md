# Eating the Cats — technical overview

Eating the Cats turns live speech or typed text into source-linked assessments of factual claims. It is an AI-assisted evidence tool, not an assessment of a person's honesty.

| Component | Model / technology | Role |
|---|---|---|
| Live transcription | ElevenLabs Scribe v2 Realtime (`scribe_v2_realtime`) | Streams microphone audio to text, with partial and committed transcripts and automatic language detection. English and German are intended use cases; accuracy depends on audio and language. |
| Claim extraction and reasoning | NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) through Nebius Token Factory | Extracts factual claims, plans searches through tool calling, compares retrieved evidence and generates structured assessments. Uses a pretrained hosted model; no custom model training. |
| Evidence retrieval | Tavily Search API | Returns source URLs, titles and excerpts. The app currently uses basic search, not full-page crawling. Tavily is a search service, not the verdict model. |
| Browser app | HTML, CSS, JavaScript, Web Audio, AudioWorklet, WebSocket | Captures PCM audio, displays live text, queues research, and renders claim cards and session statistics. |
| Backend and hosting | Vercel serverless functions and static hosting | Stores provider credentials as server-side environment variables and runs research and temporary-token routes. |
| Source and deployment | GitHub: Herzilove/eating-the-cats | Version control; pushes to main trigger Vercel deployments. |
| Session storage | Optional browser localStorage and JSON export | Session history can stay on the device. Supabase is not connected in this implementation. Provider processing and retention still apply. |

## Request flow

1. Browser requests a short-lived, single-use ElevenLabs token from `/api/scribe-token`; the permanent API key stays on the server.
2. Microphone audio streams directly to ElevenLabs over WebSocket. Partial text appears while speaking; committed text enters the research queue. Typed text bypasses transcription.
3. `/api/check` calls Nemotron to extract complete factual claims with recent context. Larger sets are split into research groups of up to three claims.
4. Nemotron requests `search_web` tool calls. The server calls Tavily, then returns numbered evidence excerpts and URLs to the model. A group has a total budget of three searches; up to two claim assessments run concurrently.
5. The backend validates structured assessments and citation IDs. Verdicts without citations become Unverified. Results stream to the browser as newline-delimited JSON, including activity and completed claim results.
6. The UI shows Supported, Contradicted, Needs Context or Unverified, explanations and source links. The current support percentage is Supported / (Supported + Contradicted); unresolved claims and coverage are displayed separately. Speaker labels are entered by the user, not automatically identified.

## Reliability and boundaries

Research continues independently of live transcription. The queue retains pending sections and supports retries. A short-lived in-memory cache can avoid repeated identical checks on the same warm server instance; it is not a shared durable cache. Microphone permissions, network quality, provider credits, model output and source quality affect results. A cited assessment is not a guarantee of truth or complete research. Configured credentials do not alone prove live API access.

Graphic created with the built-in ImageGen tool. Exact prompt: `technical-overview-prompt.txt`. The illustration's phrase "any language" is shorthand for automatic detection of supported languages, not a guarantee that every language is supported.
