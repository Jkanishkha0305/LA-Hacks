"""One-shot Agentverse registration for the SiteScope agent.

Reads credentials from agentverse/.env and registers the agent via the
Agentverse Launch flow. Run once from the agentverse/ directory:

    source .venv/bin/activate
    python register.py

After it succeeds, your agent shows up under My Agents on agentverse.ai
and is searchable from ASI:One.

Required env vars (set in .env):
    AGENT_SEED_PHRASE  — same value as AGENT_SEED, mirrored for Agentverse
    AGENTVERSE_KEY     — Agentverse API key with Mailbox Read+Write
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from uagents_core.utils.registration import (
    RegistrationRequestCredentials,
    register_chat_agent,
)

load_dotenv()

AGENT_SEED_PHRASE = os.environ.get("AGENT_SEED_PHRASE") or os.environ.get("AGENT_SEED")
AGENTVERSE_KEY = os.environ.get("AGENTVERSE_KEY")

if not AGENT_SEED_PHRASE:
    sys.exit(
        "❌ AGENT_SEED_PHRASE (or AGENT_SEED) not set in .env.\n"
        "   This must be the EXACT same value the running agent uses, "
        "or the address won't match what you just registered on Agentverse."
    )

if not AGENTVERSE_KEY:
    sys.exit(
        "❌ AGENTVERSE_KEY not set in .env.\n"
        "   1. Open https://agentverse.ai/profile/api-keys\n"
        "   2. Create a new key with Mailbox: Read + Write\n"
        "   3. Paste it as AGENTVERSE_KEY=... in agentverse/.env (NEVER in chat)\n"
        "   4. Re-run this script"
    )

print("🚀 Registering SiteScope on Agentverse...")
print(f"   Seed phrase: {AGENT_SEED_PHRASE[:12]}... (length {len(AGENT_SEED_PHRASE)})")
print(f"   API key:     {AGENTVERSE_KEY[:12]}... (length {len(AGENTVERSE_KEY)})")
print()

try:
    register_chat_agent(
        "SiteScope",
        "https://agentverse.ai/v1/submit",
        active=True,
        credentials=RegistrationRequestCredentials(
            agentverse_api_key=AGENTVERSE_KEY,
            agent_seed_phrase=AGENT_SEED_PHRASE,
        ),
    )
except Exception as e:
    sys.exit(f"❌ Registration failed: {e}")

print("✅ Registration complete!")
print("   - Open https://agentverse.ai/agents → look for SiteScope under My Agents")
print("   - Then go to https://asi1.ai and chat with it.")
