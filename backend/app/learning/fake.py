"""Deterministic offline answers for the learning tasks (LLM_PROVIDER=fake, and tests).

Built only from the <context> JSON, so every citation is real. Grading uses key-point keyword
overlap: crude, but it behaves sensibly (a better answer scores higher) and is reproducible.
"""

import re
from typing import Any

_WORD = re.compile(r"[a-z0-9]{4,}")


def _where(ev: dict[str, Any]) -> str:
    return f"{ev['file']}:{ev['line_start']}" if ev["line_start"] > 0 else ev["file"]


def _explain(ctx: dict[str, Any]) -> dict[str, Any]:
    concept = ctx["concept"]
    claims = [
        {"text": f"{concept['name']} appears in {_where(ev)}" + (f" ({ev['detail']})." if ev["detail"] else "."),
         "label": "verified", "evidence_ids": [ev["id"]]}
        for ev in concept["evidence"][:5]
    ]
    return {"claims": claims, "key_terms": [{"term": concept["name"], "meaning": concept["description"] or concept["name"]}]}


def _questions(ctx: dict[str, Any]) -> dict[str, Any]:
    pool = [(c, ev) for c in ctx["concepts"] for ev in c["evidence"]]
    out = []
    for i in range(min(ctx["count"], len(pool))):
        concept, ev = pool[i % len(pool)]
        ask = "Why did you design" if ctx["mode"] == "viva" else "What does"
        tail = "this way, and what would break without it?" if ctx["mode"] == "viva" else "do in your project?"
        out.append({
            "question": f"{ask} the code at {_where(ev)} ({concept['name']}) {tail}",
            "concept_key": concept["key"],
            "difficulty": ("easy", "medium", "hard")[i % 3],
            "key_points": [concept["name"], *([ev["detail"]] if ev["detail"] else [])],
            "evidence_ids": [ev["id"]],
        })
    return {"questions": out}


def _grade(ctx: dict[str, Any]) -> dict[str, Any]:
    answer = ctx["answer"].lower()
    answer_words = set(_WORD.findall(answer))
    hit, missed = [], []
    for point in ctx["key_points"]:
        words = set(_WORD.findall(point.lower()))
        covered = len(words & answer_words) * 2 >= len(words) if words else point.lower().strip() in answer
        (hit if covered else missed).append(point)
    score = round(100 * len(hit) / len(ctx["key_points"])) if ctx["key_points"] else 0
    feedback = "Good answer: you covered the key points." if not missed else "Partly there. Mention the missing points below."
    return {"score": score, "feedback": feedback, "missing_points": missed,
            "evidence_ids": [e["id"] for e in ctx["evidence"]]}


def _presentation(ctx: dict[str, Any]) -> dict[str, Any]:
    project = ctx["project"]
    used = [f for f in project["frameworks"] if f["status"] == "used" and f["evidence_ids"]]
    slides = [
        {"title": "Tech stack", "notes": "Walk through the main technologies and why each was chosen.",
         "bullets": [{"text": f"Uses {f['name']} ({f['category']}).", "label": "verified",
                      "evidence_ids": f["evidence_ids"][:2]} for f in used[:6]]},
        {"title": "API", "notes": "Explain how requests reach the handlers.",
         "bullets": [{"text": f"{r['method']} {r['path'] or ''} in {r['file']}.", "label": "verified",
                      "evidence_ids": [r["evidence_id"]]} for r in project["routes"][:6]]},
        {"title": "Data model", "notes": "Describe each model and how they relate.",
         "bullets": [{"text": f"{m['name']}: {', '.join(m['fields']) or 'no detected fields'}.", "label": "verified",
                      "evidence_ids": [m["evidence_id"]]} for m in project["models"][:6]]},
        {"title": "Concepts I applied", "notes": "Connect each concept to where it lives in the code.",
         "bullets": [{"text": c["name"], "label": "verified", "evidence_ids": c["evidence_ids"][:2]}
                     for c in ctx["concepts"][:6] if c["evidence_ids"]]},
    ]
    return {"title": "Project presentation", "slides": [s for s in slides if s["bullets"]]}


_TASKS = {"explain": _explain, "questions": _questions, "grade": _grade, "presentation": _presentation}


def respond(ctx: dict[str, Any]) -> dict[str, Any]:
    handler = _TASKS.get(ctx.get("task", ""))
    return handler(ctx) if handler else {}
