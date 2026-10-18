# Eating the Cats

Berlin hackathon prototype: speech or text → Nemotron on Nebius Token Factory → model-directed Tavily searches → cited claim assessments. ElevenLabs Scribe replaces Deepgram.

The session evidence score is supported statements divided by all assessed statements, not a person's credibility score. No speaker identity recognition. Results are AI assessments, not established facts. The first microphone version transcribes 10-second clips and pauses between clips during research: it is not continuous realtime transcription.

## Configure

Copy `.env.example` to `.env.local` and fill in keys privately. Set `NEBIUS_MODEL` to an available NVIDIA Nemotron model with tool calling. Do not commit keys. Configure ElevenLabs key with Speech to Text access. Confirm provider credits before live tests.

Node 22+: `node --env-file-if-exists=.env.local server.mjs` opens http://127.0.0.1:3000.

## Publish

Create a GitHub repository under the intended account, add it as origin and push reviewed files. In Vercel import that repository, use framework Other, output directory public, and no build command. Add the five environment variables from `.env.example` to Production and Preview as needed, then deploy. Direct CLI deployment is also possible. `vercel.json` configures the functions.

Verify the production URL in an unsigned browser: text check with source links, German microphone recording, missing-key errors, and mobile layout. Configuration indicators only report key presence; they do not prove API access. No live provider validation or deployment has been completed yet.

## Before unrestricted public sharing

Set provider spending limits and add a durable rate limit / bot protection to the paid endpoints. This prototype has input caps and a three-search budget per assessment, but no durable cross-instance rate limiter. Anyone reaching the endpoints can consume account credits. Obtain consent from recorded speakers. Audio is sent to ElevenLabs, transcripts to Nebius, search queries to Tavily. This app has no persistent storage, but provider retention policies still apply. App host may retain operational logs.
