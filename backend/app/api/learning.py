"""Learning endpoints: pathway, concept explanations, quiz/viva practice, progress, presentation.

All routes are scoped to the signed-in owner's project (``get_project_or_404``).
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analysis.concepts import Concept, derive_concepts
from app.analysis.report import collect_evidence
from app.api.projects import get_project_or_404, latest_successful_run, project_source_dir
from app.api.summaries import get_llm_client, provider_failed
from app.config import Settings, get_settings
from app.db import get_db
from app.intelligence.llm import LLMClient, LLMError
from app.learning.catalog import info
from app.learning.generation import (
    Question,
    explain_concept,
    generate_presentation,
    generate_questions,
    grade_answer,
)
from app.models import AnalysisRun, ConceptProgress, LearningOutput, PracticeAttempt, Project, User
from app.security.auth import get_current_user
from app.security.redaction import redact

router = APIRouter(prefix="/projects/{project_id}/learning", tags=["learning"])
MASTERED_AT = 75


class PracticeIn(BaseModel):
    mode: Literal["quiz", "viva"] = "quiz"
    concept_key: str | None = None
    count: int = Field(default=5, ge=1, le=10)


class AnswerIn(BaseModel):
    index: int = Field(ge=0)
    answer: str = Field(min_length=1, max_length=4000)


class PresentationIn(BaseModel):
    minutes: int = Field(default=10, ge=3, le=30)


def _context(project_id: uuid.UUID, user: User, db: Session) -> tuple[Project, AnalysisRun, dict[str, Any], list[Concept]]:
    project = get_project_or_404(db, project_id, user)
    run = latest_successful_run(project)
    assert run.report is not None
    return project, run, run.report, derive_concepts(run.report)


def _concept_or_404(concepts: list[Concept], key: str) -> Concept:
    concept = next((c for c in concepts if c.key == key), None)
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This project doesn't use that concept.")
    return concept


def _status(progress: ConceptProgress | None) -> str:
    if progress is None or progress.attempts == 0:
        return "not_started"
    return "mastered" if progress.score >= MASTERED_AT else "learning"


def _progress_map(db: Session, project_id: uuid.UUID) -> dict[str, ConceptProgress]:
    rows = db.scalars(select(ConceptProgress).where(ConceptProgress.project_id == project_id))
    return {p.concept_key: p for p in rows}


def _latest_output(db: Session, run: AnalysisRun, kind: str, key: str) -> LearningOutput | None:
    query = (
        select(LearningOutput)
        .where(LearningOutput.run_id == run.id, LearningOutput.kind == kind, LearningOutput.key == key)
        .order_by(LearningOutput.created_at.desc())
        .limit(1)
    )
    return db.scalar(query)


def _call(fn: Any, *args: Any) -> Any:
    try:
        return fn(*args)
    except LLMError as exc:
        raise provider_failed(exc) from exc


# --- pathway & explanations ----------------------------------------------------------------


@router.get("/pathway")
def pathway(project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Detected concepts in learning order (fundamentals first), each with progress and resources."""
    _, run, _, concepts = _context(project_id, user, db)
    progress = _progress_map(db, project_id)
    explained = set(db.scalars(select(LearningOutput.key).where(
        LearningOutput.run_id == run.id, LearningOutput.kind == "explanation")))
    ordered = sorted(concepts, key=lambda c: (info(c.key).level, c.name))
    items = []
    for c in ordered:
        p = progress.get(c.key)
        items.append({
            "key": c.key, "name": c.name, "level": info(c.key).level, "description": info(c.key).description,
            "evidence": [e.model_dump() for e in c.evidence],
            "resources": [r.model_dump() for r in info(c.key).resources],
            "status": _status(p), "score": round(p.score) if p else None, "attempts": p.attempts if p else 0,
            "has_explanation": c.key in explained,
        })
    next_up = next((i["key"] for i in items if i["status"] != "mastered"), None)
    return {"concepts": items, "next_concept": next_up,
            "mastered": sum(i["status"] == "mastered" for i in items), "total": len(items)}


@router.post("/concepts/{concept_key}/explanation")
def create_explanation(
    project_id: uuid.UUID,
    concept_key: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    project, run, report, concepts = _context(project_id, user, db)
    concept = _concept_or_404(concepts, concept_key)
    explanation = _call(explain_concept, report, project_source_dir(settings, project.id), concept, client)
    content = explanation.model_dump(mode="json")
    db.add(LearningOutput(project_id=project.id, run_id=run.id, kind="explanation", key=concept.key, content=content))
    db.commit()
    return content


@router.get("/concepts/{concept_key}/explanation")
def get_explanation(
    project_id: uuid.UUID, concept_key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    _, run, _, _ = _context(project_id, user, db)
    output = _latest_output(db, run, "explanation", concept_key)
    if output is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No explanation generated yet.")
    return output.content


# --- practice (quiz / viva) ----------------------------------------------------------------


def _public_question(index: int, q: Question, names: dict[str, str], report: dict[str, Any]) -> dict[str, Any]:
    evidence = collect_evidence(report)
    return {"index": index, "question": q.question, "concept_key": q.concept_key,
            "concept_name": names.get(q.concept_key, q.concept_key), "difficulty": q.difficulty,
            "evidence": [evidence[i].model_dump() for i in q.evidence_ids if i in evidence]}


@router.post("/practice")
def start_practice(
    project_id: uuid.UUID,
    body: PracticeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    project, run, report, concepts = _context(project_id, user, db)
    if not concepts:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No concepts were detected in this project to practise.")
    if body.concept_key:
        targets = [_concept_or_404(concepts, body.concept_key)]
    else:  # focus on gaps: weakest / unpractised concepts first
        progress = _progress_map(db, project_id)
        targets = sorted(concepts, key=lambda c: progress[c.key].score if c.key in progress else -1)[:6]
    questions = _call(generate_questions, report, project_source_dir(settings, project.id), targets, body.mode,
                      body.count, client)
    if not questions:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI didn't return any questions grounded in your code. Try again.")
    output = LearningOutput(project_id=project.id, run_id=run.id, kind="questions", key=body.mode,
                            content={"mode": body.mode, "questions": [q.model_dump() for q in questions]})
    db.add(output)
    db.commit()
    names = {c.key: c.name for c in concepts}
    return {"id": str(output.id), "mode": body.mode,
            "questions": [_public_question(i, q, names, report) for i, q in enumerate(questions)]}


@router.post("/practice/{set_id}/answer")
def answer_question(
    project_id: uuid.UUID,
    set_id: uuid.UUID,
    body: AnswerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    project, _, report, _ = _context(project_id, user, db)
    output = db.get(LearningOutput, set_id)
    if output is None or output.project_id != project.id or output.kind != "questions":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Practice session not found.")
    raw_questions = output.content["questions"]
    if body.index >= len(raw_questions):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    question = Question.model_validate(raw_questions[body.index])
    answer = redact(body.answer.strip()).text  # rule 6: a pasted key must not reach the LLM
    grade = _call(grade_answer, report, question, answer, client)

    now = datetime.now(UTC)
    progress = db.get(ConceptProgress, (project.id, question.concept_key))
    if progress is None:
        progress = ConceptProgress(project_id=project.id, concept_key=question.concept_key, score=grade.score,
                                   attempts=1, updated_at=now)
        db.add(progress)
    else:  # moving average: recent answers count most, one bad answer doesn't erase progress
        progress.score = round(0.5 * progress.score + 0.5 * grade.score, 1)
        progress.attempts += 1
        progress.updated_at = now
    db.add(PracticeAttempt(project_id=project.id, concept_key=question.concept_key, mode=output.content["mode"],
                           question=question.question, answer=answer, score=grade.score,
                           grade=grade.model_dump(), created_at=now))
    db.commit()
    return {**grade.model_dump(), "key_points": question.key_points,
            "concept": {"key": question.concept_key, "score": round(progress.score), "attempts": progress.attempts,
                        "status": _status(progress)}}


# --- progress ------------------------------------------------------------------------------


@router.get("/progress")
def progress(project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    _, _, _, concepts = _context(project_id, user, db)
    rows = _progress_map(db, project_id)
    attempts = list(db.scalars(select(PracticeAttempt).where(PracticeAttempt.project_id == project_id)
                               .order_by(PracticeAttempt.created_at.desc())))
    per_concept = [{"key": c.key, "name": c.name, "status": _status(rows.get(c.key)),
                    "score": round(rows[c.key].score) if c.key in rows else 0,
                    "attempts": rows[c.key].attempts if c.key in rows else 0} for c in concepts]
    by_day: dict[str, list[int]] = defaultdict(list)
    for a in attempts:
        by_day[a.created_at.date().isoformat()].append(a.score)
    return {
        "overall": round(sum(c["score"] for c in per_concept) / len(per_concept)) if per_concept else 0,
        "mastered": sum(c["status"] == "mastered" for c in per_concept),
        "learning": sum(c["status"] == "learning" for c in per_concept),
        "not_started": sum(c["status"] == "not_started" for c in per_concept),
        "total_attempts": len(attempts),
        "concepts": per_concept,
        "history": [{"date": d, "attempts": len(s), "average": round(sum(s) / len(s))} for d, s in sorted(by_day.items())],
        "recent": [{"concept_key": a.concept_key, "mode": a.mode, "question": a.question, "score": a.score,
                    "created_at": a.created_at.isoformat()} for a in attempts[:20]],
    }


# --- presentation --------------------------------------------------------------------------


@router.post("/presentation")
def create_presentation(
    project_id: uuid.UUID,
    body: PresentationIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    project, run, report, concepts = _context(project_id, user, db)
    deck = _call(generate_presentation, report, concepts, body.minutes, client)
    if not deck.slides:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI didn't return any slides grounded in your code. Try again.")
    content = deck.model_dump(mode="json")
    db.add(LearningOutput(project_id=project.id, run_id=run.id, kind="presentation", key="", content=content))
    db.commit()
    return content


@router.get("/presentation")
def get_presentation(project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    _, run, _, _ = _context(project_id, user, db)
    output = _latest_output(db, run, "presentation", "")
    if output is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No presentation generated yet.")
    return output.content
