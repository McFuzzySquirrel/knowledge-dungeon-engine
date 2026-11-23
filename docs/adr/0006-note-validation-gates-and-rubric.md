---
id: ADR-0006
applies_to:
  - "src/core/validation/notes/**/*.ts"
  - "src/learningPorts.ts"
status: Accepted
---

# ADR-0006: Separate Blocking Note Requirements From Bonus Rubric Scoring

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Ported note-validation rules from Knowledge Dungeon; the 120-word target was previously confused with a pass condition.

## Agent Rules

- **MUST:** Treat a note as passing only when all three required sections (`Summary`, `Key Points`, `Recall Question`) are detected and `manualConfirmed` is true.
- **MUST:** Treat the 120-word target as a bonus badge target, not a blocking requirement.
- **MUST:** Score the five rubric criteria on a 0–2 integer scale and expose the resulting `qualityBonus` from 0 to 10.
- **MUST:** Generate the Scribe artifact only for a passing note.
- **MUST NOT:** Let word count or any rubric criterion alone decide `finalPass`.
- **MUST NOT:** Rewrite or trim the learner's note text when generating an artifact; only normalize line endings and trailing whitespace.

## Verify

- **Check:** `npm test -- tests/unit/noteValidation.test.ts tests/unit/encounterCommands.test.ts`
- **Expected:** A complete, manually confirmed short note passes; a missing section or missing confirmation fails; a note below 120 words is not failed for word count.

## Context and Problem Statement

A learner can write a short but complete note. Should the engine refuse it because it is under 120 words, and how should the artifact's quality score relate to passing the encounter?

## Decision Drivers

- The required structure is the pedagogical minimum.
- The learner's explicit confirmation is part of the contract.
- The rubric is useful feedback and a bonus, not a gate that silently blocks progress.
- Artifacts should preserve the learner's own text.

## Considered Options

- Make word count, sections, confirmation, and rubric all blocking.
- Require sections and confirmation, and score the rest as a bonus.
- Accept any note and score it.

## Decision Outcome

Chosen option: "Require sections and confirmation, and score the rest as a bonus", because it keeps the pass condition clear and achievable while still rewarding a fuller note. The 120-word target remains a badge threshold, and the five rubric criteria produce a 0–10 quality bonus that feeds progression without deciding pass/fail.

### Positive Consequences

- A concise, well-structured note clears its room.
- Rubric feedback can be shown without implying the note failed.
- Artifact generation has one condition: `finalPass`.

### Negative Consequences

- A passing note may score zero on several rubric criteria.
- The section detector is lexical and can be fooled by headings in code blocks or prose.
- Word count is token-based and language-sensitive.

## Pros and Cons of the Options

### All criteria blocking

- Good, because it demands a high-quality note.
- Bad, because a correct short note is refused and the learner cannot tell which gate is pedagogical.

### Sections and confirmation blocking, rubric as bonus

- Good, because the gate is explicit and the score is feedback.
- Bad, because a low-quality note can still clear.

### Accept any note

- Good, because it never blocks.
- Bad, because the required structure loses meaning.

## Links

- Implemented by `src/core/validation/notes/` and `src/learningPorts.ts`.
- Related: [ADR-0005](0005-award-once-reward-ledgers.md).
- See "Write and validate a note" in the [user guide](../user-guide.md#write-and-validate-a-note).
