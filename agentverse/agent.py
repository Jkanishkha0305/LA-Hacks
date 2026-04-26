"""SiteScope — LA real estate due-diligence agent for ASI:One / Agentverse.

Wraps the existing SiteScope Next.js property analyst as a Fetch.ai uagents Chat
Protocol agent. Receives ChatMessage from ASI:One, forwards to the local
Next.js /api/agent endpoint, returns the response.

Run:
    pip install -r requirements.txt
    cp .env.example .env  # fill in AGENT_SEED + (optionally) GEMINI_API_KEY
    python agent.py
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

# Python 3.14 compat — uagents 0.22.8 internally calls asyncio.get_event_loop()
# which no longer auto-creates a loop in 3.14. Set one before importing/using Agent.
# Safe in all Python versions: if a loop already exists, this just replaces the unused
# default with our own. The agent will adopt this loop in Agent.__init__.
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

AGENT_NAME = os.environ.get("AGENT_NAME", "sitescope")
AGENT_SEED = os.environ.get("AGENT_SEED")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "8001"))
SITE_SCOPE_URL = os.environ.get("SITE_SCOPE_URL", "http://localhost:3000").rstrip("/")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "120"))

if not AGENT_SEED:
    raise SystemExit(
        "AGENT_SEED is required. Set a long random string in .env so your "
        "agent address is stable across restarts. Example: "
        "AGENT_SEED='sitescope-la-hacks-2026-secret-please-change-me'"
    )

agent = Agent(
    name=AGENT_NAME,
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
)

chat_proto = Protocol(spec=chat_protocol_spec)


# Helper function to create text chat messages (matches canonical Fetch.ai pattern)
def create_text_chat(text: str) -> ChatMessage:
    """Create a ChatMessage with TextContent."""
    return ChatMessage(content=[TextContent(text=text, type="text")])


def _extract_text(msg: ChatMessage) -> str:
    parts: list[str] = []
    for chunk in msg.content:
        if isinstance(chunk, TextContent):
            parts.append(chunk.text)
    return " ".join(p for p in parts if p).strip()


async def _ask_site_scope(question: str) -> str:
    """POST the user question to the local Next.js /api/agent endpoint."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if GEMINI_API_KEY:
        headers["x-gemini-api-key"] = GEMINI_API_KEY

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        try:
            r = await client.post(
                f"{SITE_SCOPE_URL}/api/agent",
                json={"message": question},
                headers=headers,
            )
        except httpx.RequestError as e:
            return (
                f"⚠️  Could not reach SiteScope backend at {SITE_SCOPE_URL}.\n\n"
                f"Make sure `pnpm dev` is running in `apps/web` and SITE_SCOPE_URL "
                f"in `.env` is correct.\n\nError: {e}"
            )

    if r.status_code != 200:
        return f"⚠️  SiteScope backend returned {r.status_code}: {r.text[:500]}"

    try:
        data = r.json()
    except Exception:
        return f"⚠️  Backend returned non-JSON response: {r.text[:500]}"

    return data.get("response") or data.get("error") or "(empty response)"


@agent.on_event("startup")
async def startup(ctx: Context) -> None:
    """Initialize agent on startup."""
    ctx.logger.info("🏙️  Starting SiteScope — LA real estate due-diligence agent...")
    ctx.logger.info(f"📍 Agent address: {agent.address}")
    ctx.logger.info(f"🔗 Backend:       {SITE_SCOPE_URL}/api/agent")
    ctx.logger.info("✅ Mailbox enabled — register at https://agentverse.ai/")


@chat_proto.on_message(ChatMessage)
async def handle_chat_message(ctx: Context, sender: str, msg: ChatMessage) -> None:
    """Handle incoming chat messages from ASI:One."""
    try:
        # Extract text from message content
        question = _extract_text(msg)
        if not question:
            ctx.logger.warning("No text content in message")
            return

        ctx.logger.info(f"📨 Message from {sender[:20]}...: {question[:80]!r}")

        # Acknowledge receipt so the sender stops retrying.
        await ctx.send(
            sender,
            ChatAcknowledgement(
                timestamp=datetime.now(timezone.utc),
                acknowledged_msg_id=msg.msg_id,
            ),
        )

        # Forward to the SiteScope Next.js backend (does the real ToolLoop work).
        ctx.logger.info("🤔 Calling SiteScope backend...")
        reply_text = await _ask_site_scope(question)
        ctx.logger.info(f"✅ Backend response: {reply_text[:80]!r}")

        # Send response back to user (helper auto-fills timestamp + msg_id).
        await ctx.send(sender, create_text_chat(reply_text))
        ctx.logger.info(f"💬 Response sent to {sender[:20]}...")

    except Exception as e:
        ctx.logger.error(f"❌ Error processing message: {e}")
        await ctx.send(
            sender,
            create_text_chat(
                "Sorry, I hit an error processing your message. "
                "Make sure the SiteScope Next.js backend is running, "
                "then try again."
            ),
        )


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    """Handle message acknowledgements."""
    ctx.logger.debug(f"✓ Message {msg.acknowledged_msg_id} acknowledged by {sender[:20]}...")


# Publishing the manifest makes this agent discoverable on Agentverse / ASI:One.
agent.include(chat_proto, publish_manifest=True)


if __name__ == "__main__":
    print("=" * 70)
    print("  SiteScope Agent")
    print(f"  Name:     {AGENT_NAME}")
    print(f"  Address:  {agent.address}")
    print(f"  Port:     {AGENT_PORT}")
    print(f"  Backend:  {SITE_SCOPE_URL}/api/agent")
    print("  Mailbox:  enabled  →  https://agentverse.ai/")
    print("=" * 70)
    print("Next steps:")
    print("  1. Open https://agentverse.ai/ → My Agents → register this agent address")
    print("  2. Add a profile + README so ASI:One can discover it")
    print("  3. Open https://asi1.ai/ and chat with your agent")
    print("=" * 70)
    agent.run()
