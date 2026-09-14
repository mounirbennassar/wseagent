# Hala · هلا

A mobile-first Wall Street English Saudi Arabia course-advisor demo: Next.js 16 + React 19 + TypeScript frontend, Python/FastAPI backend, and OpenAI Realtime speech-to-speech over WebRTC.

## Run locally

Requires Node.js 20.9+ and Python 3.12+.

```sh
npm run setup
cp .env.example .env  # Only if .env does not already exist
# Put your OpenAI API key in .env
npm run dev
```

Open http://127.0.0.1:3000. The Python backend runs on 127.0.0.1:8010. Ports 8000 and 8001 were already occupied on the development machine, so this project uses 8010. All files and dependencies live inside `agentlive`.

The supplied key is already configured in the local `.env`, restricted to owner access and ignored by source control. Replace it after the demo because it was shared in a conversation. Never put a permanent key in a `NEXT_PUBLIC_*` variable or commit it.

## Features

- Saudi Arabic by default, English UI and replies on request. RTL/LTR layouts. The opening identifies Hala and Wall Street English, asks how she can help, then waits.
- Live voice using `gpt-realtime-2.1`, with the `marin` voice, patient semantic turn detection (`eagerness: low`) and interruption support.
- Real microphone control, mute, end/cancel, connection timeout, audio playback recovery and live transcripts. A session closes after ten minutes; this is a client-side demo limit, not a billing enforcement mechanism.
- Independent text conversation using the Responses API (`gpt-4.1-mini`).
- An adaptive advisor playbook covers intent discovery, direct questions, relevant course recommendations, objections and a respectful close. No lessons, quizzes or mock interviews. Learning goals inform both voice and text guidance. Changing the language ends the current voice call; changing goals is disabled during calls.
- Full Access and online learning options, personalized-price explanations and links to official information.
- Searchable sample of eight verified Saudi center entries, with working telephone links and the full official directory.
- Mobile bottom navigation, desktop sidebar, keyboard-accessible dialogs, reduced-motion support and an app manifest.

## Architecture

Browser microphone → OpenAI WebRTC media connection.
Browser SDP → Next.js `/api/session` rewrite → Python → OpenAI `/v1/realtime/calls` → SDP answer.
Browser chat → Next.js `/api/chat` rewrite → Python → OpenAI `/v1/responses`.

The Python server owns the permanent API key, initial persona and knowledge. No permanent key is returned to the browser. The unified WebRTC interface follows [the official Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime), with the [Realtime guide](https://developers.openai.com/api/docs/guides/realtime) as the entry point.

`backend/persona.py` contains the Saudi language and consultative course-advisor instructions. `backend/data/knowledge.json` is a curated factual snapshot, not a live scraper or vector database. Update and review it as offerings change. Voice accent and factual adherence are model behaviors, not guarantees; a Saudi speaker should review the demo before public launch.

## Sources

Information and the supplied site's logo were reviewed on 14 September 2026:

- [Wall Street English Saudi Arabia](https://wallstreetenglish.edu.sa/)
- [Official center directory](https://wallstreetenglish.edu.sa/institutes/)
- [Full Access learning and pricing approach](https://wallstreetenglish.edu.sa/full-access-english-schools/)

Only a sample of the center directory is included. No unverified fixed prices, package tiers, opening hours, promotions or outcome guarantees are supplied. Hala listens, answers program questions and recommends learning options; the demo does not book appointments, collect leads, send messages, accept payments or assess an official CEFR level.

## Docker deployment

A Docker Compose stack with automatic HTTPS is included. See [OVH deployment](deploy/README.md) for configuration, updates, verification and rollback.

## Privacy and deployment boundary

Audio and chat are sent to OpenAI to generate responses. This application does not persist transcripts or recordings. Chat requests use `store: false`; provider retention policies still apply. The browser only saves language and goal preferences locally. Voice transcripts stay in memory until a new call or page reload; chat stays until page reload.

This is a local demonstration, bound to localhost. Origin checks, bounded request schemas, sanitized provider errors and an in-process request limit are included. Origin checks are not authentication. Before exposing publicly, add authentication/access control, trusted proxy configuration, shared rate limits and server-enforced usage budgets. Realtime data channels are client-controlled; add a server sideband connection if business policies must be enforced against a modified client. Add a reviewed privacy notice and a supported deployment process.

A physical phone requires an HTTPS origin for microphone access (plain LAN HTTP is insufficient). Set `ALLOWED_ORIGINS` to the actual HTTPS frontend origin and `BACKEND_URL` to the private backend service URL. Keep the backend and permanent key private. The manifest supports an app-like home screen launch; offline voice is not supported.

## Validation

Run the app first, then:

```sh
npm run build
npm test
```

`npm test` runs backend tests and Playwright browser flows. If Chromium is missing: `cd frontend && npx playwright install chromium`.

Optional live integration check (incurs OpenAI API usage):

```sh
node scripts/voice-smoke.cjs
```

This uses a synthetic microphone, checks a real greeting transcript and incoming audio bytes, then verifies mute and cleanup. It does not validate subjective Saudi accent quality or a physical phone's microphone/audio behavior.

For optional live advisor behavior checks (billable API calls), run `.venv/bin/python scripts/advisor-smoke.py` and `HALA_ADVISOR_EVAL=1 node scripts/voice-smoke.cjs`. Set `HALA_BASE_URL` to test the deployed site. These check greeting, waiting, concise discovery, recommendation, pricing, no-teaching and declining; they do not guarantee every model response or real-microphone turn timing.
