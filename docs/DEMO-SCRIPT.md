# Two-minute demo — screen recording and narration

## Fast recording setup

1. Open https://eating-the-cats.vercel.app/ in Chrome or Edge. Close tabs and notifications containing private information. Never show API dashboards, .env files or credentials.
2. In Loom choose Screen + microphone and the app tab or window. Camera is optional. Use headphones to avoid feedback.
3. Record a maximum of two minutes. Speak the script below in your own voice. If a provider is slow, keep the research activity visible; do not pretend a prepared result was generated live.
4. Stop the app microphone at the end, then stop Loom. Set video access so anyone with the link can view, without allowing editing. Copy the share link.
5. Open the share link signed out and verify playback and sound before submitting.

If Loom is not ready, use a screen recorder already available on your computer and upload the actual MP4 to a service offering a public viewing link. Do not spend hackathon time building a video editor.

## Timed walkthrough

### 0:00–0:15 — problem and product

Show the main page.

"In a live conversation, claims move faster than we can verify them. Eating the Cats listens, identifies factual statements and brings the evidence into the conversation."

### 0:15–0:40 — real speech input

Click Start listening and allow the microphone. Say clearly:

"Berlin is the capital of Germany. The capital of Australia is Sydney."

Pause briefly so speech can commit. Show partial text becoming final. Then pause listening to keep the demo focused.

"ElevenLabs transcribes speech live. Recording and research are independent, so the app can queue new statements while earlier ones are being checked."

### 0:40–1:15 — agentic research and evidence

Expand research activity and show searches and resulting claim cards.

"NVIDIA Nemotron on Nebius extracts claims and decides which searches to request. Tavily returns source excerpts and URLs. Nemotron assesses that evidence and returns a cited explanation."

Open one source link or expand its excerpt. Describe the actual verdict shown, not a promised result. The Sydney statement should normally be contradicted, but do not assert success if the app reports uncertainty or a failure.

### 1:15–1:40 — verdicts and controls

Show Results and the support summary, then briefly show section coverage or session settings.

"We distinguish supported, contradicted, context-dependent and unverified statements. The support percentage is not an honesty score. Coverage and pending checks remain visible. Users can limit research, retry failures and export their session."

### 1:40–2:00 — stack and closing

Show the architecture graphic or return to the app.

"The browser app runs on Vercel, with server-side API keys and a public GitHub repository. Our focus is traceable evidence, not an unexplained truth label. Open the sources and judge the assessment yourself."

## Backup if microphone access fails

Use Manual input with the same two claims and explicitly say that you are demonstrating text input. A previous result can be shown as a previous run, never presented as live. Keep screenshots available for an outage.
