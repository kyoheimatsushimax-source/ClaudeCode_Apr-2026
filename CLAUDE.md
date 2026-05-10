# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Repository Overview

**GitHub repository:** `kyoheimatsushimax-source/ClaudeCode_Apr-2026`

This repository is in its initial state. No application source code, build system, or test framework has been established yet. The conventions below document the current git/branching setup and provide a template for when the project takes shape.

## Repository Status

| Area | Status |
|---|---|
| Source code | None — repository is empty |
| Build system | Not yet chosen |
| Test framework | Not yet chosen |
| Linter / formatter | Not yet chosen |
| Dev server | Not yet applicable |

---

## Development Workflow

### Branching Strategy

AI-driven work uses the pattern `claude/<task-slug>-<id>`. Human-driven feature work should follow whatever convention the team adopts (document it here when decided).

Current branches observed in this repo:
- `claude/add-claude-documentation-71KTQ`
- `claude/add-claude-documentation-Uh8wc`

### Git Practices

- **Always develop on the designated branch** — never push directly to `main`/`master` without explicit permission.
- **Commit messages** should be imperative, present-tense, and describe *why* not just *what*. Example: `Add retry logic for flaky network calls`.
- **Push command:** always use `git push -u origin <branch-name>`.
- **Never force-push** to shared branches. Prefer creating new commits over amending published ones.
- **Never skip hooks** (`--no-verify`) unless explicitly asked.
- **Do not create pull requests** unless explicitly requested.

### GitHub Scope

MCP GitHub tools in this session are scoped to:

```
kyoheimatsushimax-source/ClaudeCode_Apr-2026
```

Do not attempt to read from or write to any other repository.

---

## Build, Test, and Lint Commands

_To be filled in when a technology stack is chosen. Use this template:_

```
# Install dependencies
<command>

# Build / compile
<command>

# Run all tests
<command>

# Run a single test file
<command>

# Lint
<command>

# Format
<command>

# Start dev server
<command>
```

---

## Project Conventions

_To be filled in as the project evolves. Document things like:_

- Directory layout and what belongs where
- Naming conventions (files, functions, variables, components)
- Import ordering rules
- Error-handling patterns
- Logging conventions
- API response shapes

---

## Guidelines for AI Assistants

### General

- Read this file at the start of every session to pick up the current state of the project.
- Prefer editing existing files over creating new ones.
- Do not add features, abstractions, or error handling beyond what the task requires.
- Write no comments by default. Only comment when the *why* is non-obvious.
- Do not add emojis unless explicitly requested.

### Security

- Never introduce command injection, XSS, SQL injection, or other OWASP Top 10 vulnerabilities.
- Validate input only at system boundaries (user input, external APIs). Trust internal code and framework guarantees.
- Do not commit `.env` files or credentials.

### Reversibility and Blast Radius

Before taking an action, consider whether it is reversible and who it affects:

- **Local, reversible actions** (edit files, run tests) — proceed freely.
- **Hard-to-reverse actions** (force push, `reset --hard`, drop tables, delete branches) — confirm with the user first.
- **Actions visible to others** (push, open PR, post comment, send message) — confirm with the user first unless pre-authorized.

### Keeping CLAUDE.md Current

Update this file whenever:
- A technology stack or tool is adopted
- A new build, test, lint, or dev-server command is established
- A naming or structural convention is agreed upon
- A branching or commit-message convention changes
