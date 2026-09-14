import json
import os
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from backend.persona import KNOWLEDGE, greeting, instructions

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
app = FastAPI(title="Hala · WSE Saudi", docs_url=None, redoc_url=None)
ALLOWED_ORIGINS = set(os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","))
requests_by_client: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def protect_demo(request: Request, call_next):
    if request.method == "POST":
        if request.headers.get("origin") not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "This demo accepts requests from its own web app."}, status_code=403)
        if int(request.headers.get("content-length", "0") or 0) > 100_000:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
        key = request.client.host if request.client else "local"
        now = time.monotonic()
        queue = requests_by_client[key]
        while queue and queue[0] < now - 60:
            queue.popleft()
        if len(queue) >= 20:
            return JSONResponse({"detail": "Please pause a moment before trying again."}, status_code=429)
        queue.append(now)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


def auth_headers():
    key = os.getenv("OPENAI_API_KEY", "")
    if not key or key == "replace_with_your_key":
        raise HTTPException(503, "Hala needs a server API key before she can connect.")
    return {"Authorization": f"Bearer {key}"}


async def openai_post(path: str, **kwargs) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(f"https://api.openai.com/v1/{path}", headers=auth_headers(), **kwargs)
    except httpx.RequestError:
        raise HTTPException(502, "Hala could not reach the voice service. Please try again.") from None
    if response.is_error:
        # Provider bodies can contain sensitive internals. Only return curated messages.
        if response.status_code in (401, 403):
            raise HTTPException(503, "The server API key needs valid access to OpenAI. Please update it and retry.")
        if response.status_code == 429:
            raise HTTPException(429, "The AI service has reached its usage limit. Please check billing or try later.")
        raise HTTPException(502, "The AI service could not start this request. Please check the configured model and try again.")
    return response


class Preferences(BaseModel):
    language: Literal["ar", "en"] = "ar"
    goal: Literal["general", "career", "travel", "study", "confidence"] = "general"


class SessionRequest(Preferences):
    sdp: str = Field(min_length=20, max_length=65536)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(Preferences):
    messages: list[Message] = Field(min_length=1, max_length=24)


def session_config(language="ar", goal="general"):
    return {
        "type": "realtime",
        "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2.1"),
        "instructions": instructions(language, goal),
        "output_modalities": ["audio"],
        # Allow room for reasoning without cutting a short spoken reply mid-sentence.
        "max_output_tokens": 1200,
        "audio": {
            "input": {
                "noise_reduction": {"type": "near_field"},
                "transcription": {"model": "gpt-4o-mini-transcribe"},
                "turn_detection": {"type": "semantic_vad", "eagerness": "low", "create_response": True, "interrupt_response": True},
            },
            "output": {"voice": "marin"},
        },
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "configured": bool(os.getenv("OPENAI_API_KEY")), "agent": "Hala"}


@app.get("/api/knowledge")
def knowledge():
    return KNOWLEDGE


@app.post("/api/session")
async def create_session(body: SessionRequest):
    if not body.sdp.startswith("v=0"):
        raise HTTPException(422, "A valid WebRTC offer is required.")
    response = await openai_post("realtime/calls", files={
        "sdp": (None, body.sdp),
        "session": (None, json.dumps(session_config(body.language, body.goal)), "application/json"),
    })
    return Response(content=response.text, media_type="application/sdp", status_code=201)


@app.post("/api/chat")
async def chat(body: ChatRequest):
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the learner.")
    result = await openai_post("responses", json={
        "model": os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-mini"),
        "instructions": instructions(body.language, body.goal),
        "input": [{"role": "assistant", "content": greeting(body.language)}, *[message.model_dump() for message in body.messages]],
        "max_output_tokens": 450,
        "store": False,
    })
    text = "\n".join(part["text"] for item in result.json().get("output", []) if item.get("type") == "message" for part in item.get("content", []) if part.get("type") == "output_text")
    if not text:
        raise HTTPException(502, "Hala could not finish her reply. Please try again.")
    return {"reply": text}
