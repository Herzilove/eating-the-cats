# Eating the Cats — hackathon submission

**Live demo:** https://eating-the-cats.vercel.app/

**Source:** https://github.com/Herzilove/eating-the-cats

## Solution

Eating the Cats is a live evidence companion for conversations. It transcribes speech, extracts factual claims, researches them through an agentic search loop, and presents assessments with linked evidence. Users can keep speaking while research runs independently. English and German are intended use cases, with automatic transcription language detection.

The goal is to make verification inspectable: show the statement, the search activity, the evidence and the uncertainty. The app does not infer a person's honesty. Speaker attribution is manually selected. The support percentage is Supported / (Supported + Contradicted), with unresolved statements and processing coverage displayed separately.

## Key features

- Live partial and committed transcripts, microphone selection, volume meter and automatic gain controls.
- Context-aware claim extraction, section queue, bounded automatic retries and manual recovery.
- Nemotron-directed Tavily searches, streamed research activity and independently arriving claim assessments.
- Four verdicts: Supported, Contradicted, Needs Context and Unverified, with citations and excerpts.
- Live, Results and Speakers views, filters, presentation mode and coverage ledger.
- Session recording/request allowances, optional local saving, restore and JSON export.

## Partner technology

- NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) runs through Nebius Token Factory for claim extraction, tool calling and evidence assessment.
- Tavily provides basic web search with source excerpts and URLs. Search allocation is bounded per research group.
- ElevenLabs Scribe v2 Realtime provides streaming speech recognition. Vercel issues short-lived single-use tokens so the permanent key never enters browser code.

## Verification and limitations

A deployed text check produced a cited assessment; the realtime token and WebSocket connection were verified. These checks do not constitute a speech-accuracy benchmark or comprehensive fact-checking evaluation. Search snippets can be incomplete, model extraction can miss claims, and citations do not guarantee correctness. The cache and request throttling are per server instance, not distributed enforcement. Provider credits and network availability affect operation.

## Submission checklist

- [ ] Confirm repository is publicly accessible without signing in.
- [ ] Record the two-minute walkthrough in DEMO-SCRIPT.md.
- [ ] Paste the actual shared video URL into the event submission form.
- [ ] Test video and app links in a signed-out browser.
- [ ] Select the appropriate event track and submit before the organizer deadline.

No video link is fabricated here: recording and upload must actually be completed.
