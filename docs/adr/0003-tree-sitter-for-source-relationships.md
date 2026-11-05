# ADR 0003: Tree-sitter for source relationships

- Status: Accepted (approved by the project owner for increment 5)
- Date: 2026-11-05

## Context

To show a student where concepts live in their code, we need imports, HTTP routes and data
models with exact line ranges. Uploaded code is untrusted, so we can't run it, install its
dependencies or use the project's own toolchain (no `tsc`, no Babel config, no bundler). Regex
over source text breaks on multi-line calls, comments and strings.

## Decision

Use **Tree-sitter** through its official Python bindings: `tree-sitter`,
`tree-sitter-javascript` and `tree-sitter-typescript` (TS and TSX grammars). These are
prebuilt wheels with no network access or compilation at runtime.

`app/analysis/relationships.py` walks the syntax tree to extract:
- imports (`import`, `export … from`, `require()`, dynamic `import()`), resolving relative
  specifiers to project files
- Express routes, only when the receiver was created by `express()` / `express.Router()` /
  `Router()` in the same file (precision over recall, so `axios.get('/api/x')` is not a route)
- Mongoose models (`mongoose.model('Name', schema)`), with schema fields and `ref` targets

Framework findings are upgraded from `declared` to `used` when source imports a rule's package.

## Consequences

- Deterministic, error-tolerant parsing. Files with syntax errors are still analysed and listed
  in `files_with_syntax_errors`.
- Cross-file data flow isn't tracked. A router exported from one file and mounted in another
  shows up as a `USE` mount plus that file's routes; joining full paths is future work.
- Supporting another language means adding its grammar wheel (a new dependency → new approval).
