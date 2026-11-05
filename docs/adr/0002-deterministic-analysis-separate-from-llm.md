# ADR 0002: Deterministic analysis is separate from LLM intelligence

- Status: Accepted
- Date: 2026-11-05

## Context

VIFE's value depends on users trusting what it says about their code. LLMs
can produce fluent but false claims, such as describing a feature (say, JWT auth)
that a project doesn't actually implement. For students learning from their own
projects, a confident wrong explanation is worse than none.

## Decision

Split the backend into two layers with a one-way boundary:

1. **`app/analysis/`: deterministic.** File scanning, classification, manifest
   parsing, rule-based framework detection and Tree-sitter relationships. It must
   never import from `app/intelligence/` or call an LLM. The same input always
   produces the same report. Every finding carries evidence: an id, file path,
   line range and the detector that produced it.
2. **`app/intelligence/`: LLM-backed.** It receives only the analysis report and
   *redacted* source snippets, never the raw upload. Every claim it returns must
   cite evidence ids and be labelled `verified`, `inferred` or `unknown`.
   Citations are validated in code against the report. Uncited claims, or claims
   that cite unknown ids, are rejected or downgraded.

Secrets are detected and redacted before any content reaches the intelligence layer.

## Consequences

- The analysis layer can be tested exhaustively without network access or an LLM
  provider. Intelligence tests use a fake client.
- Every claim shown to a user traces back to a concrete file and line range.
- The LLM can't "see" anything the analysis didn't find, which limits its insight
  to what detectors cover. We accept this trade-off and grow coverage by adding
  detectors.
- The boundary should be enforced mechanically (for example, a test that fails if
  `app/analysis` imports `app.intelligence`) once both packages exist.
