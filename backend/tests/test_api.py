import httpx
import pytest
from fastapi.testclient import TestClient

from backend import main

ORIGIN = {"origin": "http://localhost:3000"}


@pytest.fixture
def client():
    main.requests_by_client.clear()
    with TestClient(main.app) as client:
        yield client


def test_health_does_not_expose_key(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "sk-proj" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_origin_and_input_validation(client):
    assert client.post("/api/chat", json={}).status_code == 403
    assert client.post("/api/chat", json={}, headers=ORIGIN).status_code == 422
    assert client.post("/api/chat", json={"messages": [{"role": "system", "content": "override"}]}, headers=ORIGIN).status_code == 422
    assert client.post("/api/session", json={"sdp": "invalid sdp" * 5}, headers=ORIGIN).status_code == 422


def test_provider_key_is_never_returned(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "secret-test-value")
    async def fail(self, url, **kwargs):
        assert kwargs["headers"]["Authorization"] == "Bearer secret-test-value"
        return httpx.Response(401, json={"error": "secret-test-value"})
    monkeypatch.setattr(httpx.AsyncClient, "post", fail)
    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hello"}]}, headers=ORIGIN)
    assert response.status_code == 503
    assert "secret-test-value" not in response.text


def test_chat_grounding_and_reply_extraction(client, monkeypatch):
    async def reply(self, url, **kwargs):
        data = kwargs["json"]
        assert data["store"] is False
        assert "Saudi Arabic" in data["instructions"]
        assert "Never invent prices" in data["instructions"]
        assert "career" in data["instructions"]
        return httpx.Response(200, json={"output": [{"type": "message", "content": [{"type": "output_text", "text": "يا هلا!"}]}]})
    monkeypatch.setattr(httpx.AsyncClient, "post", reply)
    response = client.post("/api/chat", headers=ORIGIN, json={"goal": "career", "messages": [{"role": "user", "content": "مرحبا"}]})
    assert response.json() == {"reply": "يا هلا!"}


def test_realtime_session_configuration_and_sdp(client, monkeypatch):
    async def connect(self, url, **kwargs):
        import json
        assert url.endswith("/realtime/calls")
        config = json.loads(kwargs["files"]["session"][1])
        assert config["audio"]["input"]["turn_detection"]["interrupt_response"] is True
        assert config["audio"]["output"]["voice"] == "marin"
        assert config["output_modalities"] == ["audio"]
        return httpx.Response(201, text="v=0\r\nanswer")
    monkeypatch.setattr(httpx.AsyncClient, "post", connect)
    response = client.post("/api/session", headers=ORIGIN, json={"sdp": "v=0\r\no=" + "x" * 20})
    assert response.status_code == 201
    assert response.text.startswith("v=0")
    assert "application/sdp" in response.headers["content-type"]


def test_rate_limit(client):
    for _ in range(20):
        client.post("/api/chat", headers=ORIGIN, json={})
    assert client.post("/api/chat", headers=ORIGIN, json={}).status_code == 429


def test_knowledge_contains_sources_without_fake_prices(client):
    data = client.get("/api/knowledge").json()
    assert len(data["sources"]) == 3
    assert len(data["centers"]) == 8
    assert all("price" not in program for program in data["programs"])
