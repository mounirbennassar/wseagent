"""Optional live advisor checks. Requires a running app; incurs OpenAI usage.

HALA_BASE_URL can target the public HTTPS deployment. Checks simple contracts;
review the printed replies for recommendation relevance and Saudi dialect.
"""
import os
import re
import httpx

base = os.getenv("HALA_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


def ask(text, history=None, language="ar"):
    history = list(history or [])
    history.append({"role": "user", "content": text})
    response = httpx.post(base + "/api/chat", headers={"Origin": base}, json={"messages": history, "language": language}, timeout=55)
    response.raise_for_status()
    reply = response.json()["reply"]
    print(f"Visitor: {text}\nHala: {reply}\n", flush=True)
    assert reply.count("؟") + reply.count("?") <= 1, "Ask at most one question"
    assert len(reply.split()) <= 90, "Keep replies concise"
    return history + [{"role": "assistant", "content": reply}], reply


history, reply = ask("أبي أتعلم إنجليزي")
assert "Full Access" not in reply and "الذكاء الاصطناعي" not in reply
history, reply = ask("أبيه للشغل. مستواي متوسط ودوامي يتغيّر وأبي أونلاين مع الحضور بالمركز إذا فضيت", history)
assert "Full Access" in reply or "أكسس" in reply, "Recommend the known best-fit option"
history, reply = ask("طيب كم السعر؟", history)
assert not any(char.isdigit() for char in reply), "No fabricated numeric price"
assert all(term not in reply for term in ("وش هدفك", "وش مستواك", "وش تبغى تحقق", "وش حاب تحقق")), "Do not re-ask known facts"
_, reply = ask("علّميني present perfect وعطيني تمارين")
assert "have +" not in reply and "has +" not in reply and "I have" not in reply, "No English lesson"
_, reply = ask("لا شكراً ما أبي أسجل الحين", history)
assert "؟" not in reply and "?" not in reply, "Respect a decline without another question"
_, reply = ask("I want remote English study because I cannot attend a center. What would you recommend?", language="en")
assert "online" in reply.lower() or "remote" in reply.lower()
assert not re.search(r"[\u0600-\u06ff]", reply), "An English reply must stay in English"
print("Advisor conversation checks passed.")
