"""Pulse as a Fetch.ai uAgent: a mailbox agent on Agentverse that speaks the chat protocol to ASI:One.

Run on its own (Railway service `agent-fetchai`): `uv run python -m app.fetchai.agent`.
"""

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

from app.core.config import settings

from .bridge import GREETING, ask_pulse, extract_text, log

NAME = "Pulse Health Agent"
PORT = 8001
README = Path(__file__).with_name("README.md")

chat_proto = Protocol(spec=chat_protocol_spec)


def _text_message(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(UTC), msg_id=uuid4(), content=[TextContent(type="text", text=text)]
    )


@chat_proto.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(UTC), acknowledged_msg_id=msg.msg_id))
    text = extract_text(msg.content)
    if not text:
        if any(isinstance(c, StartSessionContent) for c in msg.content):
            await ctx.send(sender, _text_message(GREETING))
        return
    reply = await ask_pulse(sender, text, str(msg.msg_id))
    await ctx.send(sender, _text_message(reply))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    log.info("fetchai.ack from=%s msg=%s", sender, msg.acknowledged_msg_id)


def build_agent(seed: str | None = None) -> Agent:
    agent = Agent(
        name=NAME,
        seed=seed or settings().agent_seed,
        port=PORT,
        mailbox=True,
        publish_agent_details=True,
        description="Personal health agent: wearable vitals, digital twin, approval-gated calendar actions.",
        readme_path=str(README),
    )
    agent.include(chat_proto, publish_manifest=True)
    return agent


if __name__ == "__main__":
    if not settings().agent_seed:
        raise SystemExit("AGENT_SEED is not set. Use a stable value so the agent address never changes.")
    build_agent().run()
