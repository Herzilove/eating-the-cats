# Eating the Cats — hackathon submission

**Live demo:** https://eating-the-cats.vercel.app/

**Source:** https://github.com/Herzilove/eating-the-cats

## Solution

Eating the Cats is a research agent powered by NVIDIA Nemotron on Nebius Token Factory and Tavily. Nemotron extracts factual claims, chooses searches and assesses the retrieved evidence, producing explanations with source links. Live conversation is the input experience: users can keep speaking while research runs independently, or enter text directly. ElevenLabs provides supporting speech-to-text input with automatic language detection; English and German are intended use cases.

The goal is to make verification inspectable: show the statement, the search activity, the evidence and the uncertainty. The app does not infer a person's honesty. Speaker attribution is manually selected. The support percentage is Supported / (Supported + Contradicted), with unresolved statements and processing coverage displayed separately.

## Key features

- Live partial and committed transcripts, microphone selection, volume meter and automatic gain controls.
- Context-aware claim extraction, section queue, bounded automatic retries and manual recovery.
- Nemotron-directed Tavily searches, streamed research activity and independently arriving claim assessments.
- Four verdicts: Supported, Contradicted, Needs Context and Unverified, with citations and excerpts.
- Live, Results and Speakers views, filters, presentation mode and coverage ledger.
- Session recording/request allowances, optional local saving, restore and JSON export.

## Core research technology

- NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) runs through Nebius Token Factory for claim extraction, tool calling and evidence assessment.
- Tavily provides basic web search with source excerpts and URLs. Search allocation is bounded per research group.

## Supporting speech and hosting services

- ElevenLabs Scribe v2 Realtime provides streaming speech-to-text input. It does not perform claim research or evidence assessment. Vercel issues short-lived single-use tokens so the permanent key never enters browser code.
- Vercel hosts the browser application and server-side API routes. Text input can demonstrate the research agent independently of speech transcription.

## Verification and limitations

A deployed text check produced a cited assessment; the realtime token and WebSocket connection were verified. These checks do not constitute a speech-accuracy benchmark or comprehensive fact-checking evaluation. Search snippets can be incomplete, model extraction can miss claims, and citations do not guarantee correctness. The cache and request throttling are per server instance, not distributed enforcement. Provider credits and network availability affect operation.

## Submission checklist

- [ ] Confirm repository is publicly accessible without signing in.
- [ ] Record the two-minute walkthrough in DEMO-SCRIPT.md.
- [ ] Paste the actual shared video URL into the event submission form.
- [ ] Test video and app links in a signed-out browser.
- [ ] Select the appropriate event track and submit before the organizer deadline.

No video link is fabricated here: recording and upload must actually be completed.
