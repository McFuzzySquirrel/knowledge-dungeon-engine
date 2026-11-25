# First Ten Minutes — Manual Playtest

A repeatable playtest for the [side-scroller example](../../../examples/side-scroller/README.md)
and the P10 ship pass. It uses the tutorial fixture and the three synthetic demo subjects;
never record learner note text, topics, or subject names in the result.

## Setup

Hosted copy:
[`mcfuzzysquirrel.github.io/knowledge-dungeon-engine/examples/side-scroller/`](https://mcfuzzysquirrel.github.io/knowledge-dungeon-engine/examples/side-scroller/).
It runs the same build; saves stay in that browser.

For local development:

```sh
npm --prefix examples/side-scroller install
npm --prefix examples/side-scroller run dev
```

Open the printed URL, clear site data for that origin, and reload. Keep the browser
console open. On a phone-sized run, use a current mobile browser or a 390×844 DPR-2
viewport with touch emulation.

## Path

| # | Step | Expected |
|---|---|---|
| 1 | Load with no save | Title card: Continue disabled, New game primary, three archetypes, status says no save |
| 2 | New game → choose Scholar → Continue | Three demo portals on the street, quest step visible, canvas focused |
| 3 | Walk into the Training Grounds and press `E` | Tutorial dungeon, study session active, 3 rooms, XP 0 |
| 4 | In each of the three rooms, write and submit a complete note | One visit per entry, only the first clear awards XP/artifact, prompt offers `R review` |
| 5 | Press `R` in a cleared room, rate 5, submit | Review pass recorded, next review date set, no second reward for the same pass |
| 6 | Return up the shaft to the street | Study session closed, cleared count survives, focus returns to `#game` |
| 7 | Walk to a pond and press `E` | Pond opens for the last-studied subject; cast, wait for the bite, reel, answer the recall prompt, keep |
| 8 | Press `J` | Journal opens with subjects, records, inventory, fish, due rooms, assistance, and settings; no note text is shown or announced |
| 9 | In settings, set large text and reduced motion | Text grows in DOM and canvas labels; camera snaps; no panel animation |
| 10 | Press `C`, create a subject with a root and three rooms | Subject count rises, new portal appears, Creator tree shows four rooms |
| 11 | Enter the new subject (street portal or journal Enter) and clear its root | New dungeon, one clear, room list matches |
| 12 | Open every service: Library, Guild Hall, Trophy Hall, Workshop, Fish Stand, and a villager | Each opens a real overlay; read-only surfaces say so; Workshop equips/unequips; Escape returns focus |
| 13 | Review a due room from the progress panel and from the street `R` shortcut | Same review panel; closing the street path returns to the village with no session left open |
| 14 | Export the save | `.json` download; settings are not in the bundle |
| 15 | Clear saved state, reload, import the bundle | Rooms, XP, fish, review schedule, and an attachment survive; a malformed import leaves the old save intact |
| 16 | Reload mid-dungeon and mid-cast | The engine recovers the study session; a mid-cast pond reload shows the recovery banner and returns to a safe screen |
| 17 | Repeat the critical path with the mouse unplugged | Title, movement, note, review, Creator, services, journal, fishing, import, and close all work; focus is always visible |
| 18 | Repeat on a 390×844 touch viewport | Touch pad, Jump, and one contextual action; progress sheet hides the pad; no overlap, no page scroll, 44 px targets |

## Environment variants

- **Reduced motion:** set the OS preference or the journal setting; confirm camera and
  transitions stop and nothing animates.
- **Large text:** set the journal text scale to `large`; confirm HUD, dialogs, and canvas
  labels do not clip and no horizontal page scroll appears.
- **Low frame rate:** throttle the main thread (for example a 55 ms/80 ms hog) and repeat
  a ladder descent; the physics substeps must not tunnel.
- **Phone orientation:** rotate 390×844 → 844×390 and back; the canvas resizes and the
  world/state survive.

## Dated capture

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p10 \
  --prefix 2026-11-25-g10play --p10
```

`--p10` drives title → archetype → street → three rooms → review → fishing → journal →
export/clear/import → Creator → new subject, and records layout overlaps, minimum target
sizes, focus, large text, the phone sheet, durable-state size, and browser console
errors/warnings. The automated run enters the new subject last, through the journal, and
ends in that dungeon; that avoids guessing a newly generated room graph. A human
playtester walks out through the entrance shaft before fishing and the journal, or uses
the same journal entry with a known subject.

`--perf` records a 10-second frame trace at the dungeon, a lower room, the street, the
pond, the Library, and the journal, plus an `about:blank` baseline and the IndexedDB
footprint.

## Gate

```sh
node examples/side-scroller/scripts/gate.mjs
```

Record the date, commit, browser, viewport, console result, and any accepted exception in
[EVIDENCE.md](EVIDENCE.md). Add new frames to [VISUALS.md](VISUALS.md); never replace an
older gate's images.
