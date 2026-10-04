import json

import httpx
import pytest
import respx
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
)

from app.core.config import settings
from app.fetchai import agent as fa
from app.fetchai import bridge

SENDER = "agent1qsenderaddress"
INBOUND = "http://localhost:8000/agent/inbound"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("PUBLIC_AGENT_URL", "http://localhost:8000")
    monkeypatch.setenv("INTERNAL_TOKEN", "tok")
    settings.cache_clear()
    yield
    settings.cache_clear()


def msg(*content):
    from datetime import UTC, datetime
    from uuid import uuid4

    return ChatMessage(timestamp=datetime.now(UTC), msg_id=uuid4(), content=list(content))


class Ctx:
    def __init__(self):
        self.sent = []

    async def send(self, to, message):
        self.sent.append((to, message))


def test_extract_text_joins_text_parts_and_ignores_the_rest():
    parts = [
        TextContent(type="text", text="how did I"),
        StartSessionContent(type="start-session"),
        TextContent(type="text", text="sleep?"),
        EndSessionContent(type="end-session"),
    ]
    assert bridge.extract_text(parts) == "how did I\nsleep?"
    assert bridge.extract_text([]) == ""


@respx.mock
async def test_ask_pulse_posts_as_asi_one_with_the_internal_token():
    route = respx.post(INBOUND).mock(
        return_value=httpx.Response(200, json={"reply": "You slept 6h 41m.", "actions": []})
    )
    assert await bridge.ask_pulse(SENDER, "how did I sleep?", "m-1") == "You slept 6h 41m."
    req = route.calls[0].request
    assert req.headers["x-internal-token"] == "tok"
    assert json.loads(req.read()) == {
        "channel": "asi_one",
        "external_id": SENDER,
        "text": "how did I sleep?",
        "message_id": "m-1",
    }


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(200, json={"nope": 1}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"reply": "   "}),
    ],
)
async def test_ask_pulse_falls_back_when_the_agent_fails_or_replies_oddly(response):
    respx.post(INBOUND).mock(return_value=response)
    assert await bridge.ask_pulse(SENDER, "hi", "m") == bridge.FALLBACK


@respx.mock
async def test_ask_pulse_falls_back_on_network_error_and_clips_long_replies():
    respx.post(INBOUND).mock(side_effect=httpx.ConnectError("down"))
    assert await bridge.ask_pulse(SENDER, "hi", "m") == bridge.FALLBACK
    respx.post(INBOUND).mock(return_value=httpx.Response(200, json={"reply": "x" * 9000}))
    assert len(await bridge.ask_pulse(SENDER, "hi", "m")) == bridge.MAX_REPLY


@respx.mock
async def test_handler_acknowledges_first_then_replies_to_the_sender():
    respx.post(INBOUND).mock(return_value=httpx.Response(200, json={"reply": "Resting HR is 60."}))
    ctx, incoming = Ctx(), msg(TextContent(type="text", text="status"))
    await fa.handle_chat(ctx, SENDER, incoming)
    (to1, ack), (to2, reply) = ctx.sent
    assert to1 == to2 == SENDER
    assert isinstance(ack, ChatAcknowledgement) and ack.acknowledged_msg_id == incoming.msg_id
    assert isinstance(reply, ChatMessage) and reply.content[0].text == "Resting HR is 60."


async def test_handler_greets_on_session_start_without_calling_the_agent():
    ctx = Ctx()
    await fa.handle_chat(ctx, SENDER, msg(StartSessionContent(type="start-session")))
    assert [type(m).__name__ for _, m in ctx.sent] == ["ChatAcknowledgement", "ChatMessage"]
    assert ctx.sent[1][1].content[0].text == bridge.GREETING


async def test_handler_only_acknowledges_a_message_with_no_text():
    ctx = Ctx()
    await fa.handle_chat(ctx, SENDER, msg(EndSessionContent(type="end-session")))
    assert [type(m).__name__ for _, m in ctx.sent] == ["ChatAcknowledgement"]


async def test_build_agent_has_a_stable_address_and_the_chat_protocol():
    a = fa.build_agent(seed="unit test seed")
    assert a.address.startswith("agent1q")
    assert a.address == fa.build_agent(seed="unit test seed").address
    assert a.address != fa.build_agent(seed="another seed").address
    assert fa.chat_proto.digest in a.protocols


async def test_the_agent_registers_an_agentverse_handle(monkeypatch):
    seen = {}
    real = fa.Agent

    def spy(**kwargs):
        seen.update(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(fa, "Agent", spy)
    fa.build_agent(seed="unit test seed")
    assert seen["handle"] == "pulse-health"

    monkeypatch.setenv("AGENT_HANDLE", "pulse-demo")
    settings.cache_clear()
    fa.build_agent(seed="unit test seed")
    assert seen["handle"] == "pulse-demo"
