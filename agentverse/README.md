# SiteScope on Agentverse

This directory wraps the existing site-scope Next.js property analyst as a
Fetch.ai [`uagents`](https://uagents.fetch.ai) Chat Protocol agent so it can be
registered on [Agentverse](https://agentverse.ai/) and chatted with from
[ASI:One](https://asi1.ai/).

## Architecture

```
ASI:One user
    │  (Chat Protocol)
    ▼
Agentverse Mailbox
    │
    ▼
agent.py  ──HTTP──►  Next.js /api/agent  ──tools──►  ArcGIS, LADBS, LAHD,
(this repo)          (apps/web)                       MyLA311, Census, HUD,
                                                      LAPD, Google geocoding
```

The Python agent is a **thin proxy**. All real work — the Gemini-driven
ToolLoop, the 9 LA data tools, the analysis logic — lives in the existing
TypeScript codebase and is unchanged. We add ONE new endpoint
(`apps/web/app/api/agent/route.ts`) that returns plain markdown instead of
the spec-block UI format used by the web frontend.

## Setup (5 minutes)

### 1. Start the Next.js backend

From the repo root:

```bash
pnpm install
pnpm --filter web dev
```

This serves the new agent endpoint at `http://localhost:3000/api/agent`.
Make sure `apps/web/.env` has `GOOGLE_GENERATIVE_AI_API_KEY` set (or pass
your own via `GEMINI_API_KEY` in this directory's `.env`).

Quick smoke test:

```bash
curl -X POST http://localhost:3000/api/agent \
  -H 'Content-Type: application/json' \
  -d '{"message": "Analyze 350 S Grand Ave, Los Angeles"}'
```

You should get back JSON with a `response` field containing markdown.

### 2. Set up the Python agent

```bash
cd agentverse
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — at minimum, set AGENT_SEED to a unique long string
```

### 3. Run it

```bash
python agent.py
```

You'll see something like:

```
======================================================================
  SiteScope Agent
  Name:     sitescope
  Address:  agent1qf...long-hex-address...
  Port:     8001
  Backend:  http://localhost:3000/api/agent
  Mailbox:  enabled  →  https://agentverse.ai/
======================================================================
```

Copy the `Address:` value — you'll need it for Agentverse.

### 4. Register on Agentverse

1. Go to <https://agentverse.ai/> and sign in (use promo code `LAHACKSAV` if asked)
2. **My Agents** → **+ New Agent** → **Mailbox Agent**
3. Paste the agent address from step 3
4. Add a profile:
    - **Name:** SiteScope
    - **Description:** *Los Angeles real estate due-diligence agent. Send any LA street address and get back a pro-grade development briefing — zoning, FAR, TOC tier, fire & fault hazards, permits, violations, market rent, crime, demographics. Built for acquisitions associates and developers.*
    - **Tags:** `real-estate`, `los-angeles`, `due-diligence`, `zoning`, `property-analysis`
5. Save — the manifest is auto-published the first time `agent.py` connects.

### 5. Chat from ASI:One

1. Go to <https://asi1.ai/> (use promo code `LAHACKS` if asked)
2. Search for "SiteScope" or paste your agent address
3. Try queries like:
    - `Analyze 350 S Grand Ave, Los Angeles`
    - `What's the development potential of 200 N Spring St?`
    - `Tell me about fire hazard risk near 15000 Sunset Blvd`

Capture the **shared chat URL** from ASI:One — Fetch wants this in your
Devpost submission.

## Deliverables for Devpost

Per Raj's announcement (4/24, 9:17 PM), include in your Devpost or GitHub
README:

- [ ] **Agent profile URL:** `https://agentverse.ai/agents/details/<address>`
- [ ] **ASI:One shared chat URL:** captured from a real conversation showing
      the agent answering an LA property question end-to-end
- [ ] **Repo link:** this repo, with `agentverse/agent.py` highlighted
- [ ] **Hackpack box checked** on Devpost submission

## Troubleshooting

**`Could not reach SiteScope backend`**
The Next.js dev server isn't running, or `SITE_SCOPE_URL` is wrong.
Run `pnpm --filter web dev` from repo root and confirm the curl smoke test works.

**Agent address keeps changing**
You're not setting `AGENT_SEED`, or you're regenerating it. Set a stable
random string once, save it, never change it.

**Agent responds but takes 60+ seconds**
Normal. Each query runs up to 20 tool calls (geocode → parcel → 7 data
sources). The Next.js endpoint has `maxDuration = 120` for this reason.

**Agent works locally but ASI:One can't reach it**
Mailbox solves this — the Mailbox queues messages on Agentverse and
delivers them to your local agent over a WebSocket. You do NOT need
ngrok for the **agent itself**. You DO need a public URL for the
**Next.js backend** if you want to demo from a different machine
than the one running it. For demo day, run both on your laptop and
present from the same laptop — simplest path.

**Want to expose the Next.js backend publicly anyway?**
```bash
# Option 1: ngrok
ngrok http 3000
# then set SITE_SCOPE_URL=https://<random>.ngrok-free.app in agentverse/.env

# Option 2: cloudflared
cloudflared tunnel --url http://localhost:3000
```

## What's intentionally out of scope

- **No tool porting.** All 9 data tools stay in TypeScript. The Python agent
  is a proxy, not a reimplementation. This is the correct hackathon move.
- **No streaming.** ASI:One Chat Protocol delivers one `ChatMessage` per
  response. The Vercel AI SDK streaming output is not exposed here.
- **No Payment Protocol.** Optional per the brief — skip for v1, add if
  you have time.
