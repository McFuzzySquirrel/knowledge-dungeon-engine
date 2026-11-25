# Visual Record — Side-Scroller Host

Running, append-only visual history for [the implementation plan](README.md). The gate
evidence records *what passed*; this file records *what the host looked like* when it
passed.

## Rules

- **Append-only.** Never replace a gate's images. If a frame is wrong, capture a new dated
  frame and leave the old one in place with a note.
- **One folder per phase:** `visuals/p0/`, `visuals/p1/`, and so on.
- **File names:** `YYYY-MM-DD-gN-NN-slug.png`, where `NN` is the capture order. The
  capture script's `--prefix` produces exactly this pattern.
- **Content:** the full app window (canvas plus DOM HUD), tutorial fixture or synthetic
  data only. Never capture learner notes, topics, or subject names.
- **Every frame is dated and gated.** Record the commit (or `uncommitted`), the viewport,
  and the conditions that matter (low FPS, reduced motion, reload).
- **Keep the manifest.** Each gate gets a `<prefix>-manifest.json` beside its images,
  produced by the capture script and annotated with the gate facts.
- **Keep the repository light.** P1 frames were reduced to 256-colour PNGs (~30 KiB each).

## Index

P5 was captured on 2026-11-24 (`visuals/p5/`, two runs: normal and reduced motion).
P6 was captured on 2026-11-24 (`visuals/p6/`, three runs: normal, reduced motion, and a
keyboard-only segment). P7 was captured on 2026-11-24 (`visuals/p7/`, two runs: normal and
reduced motion) and shows every village service plus the Library-to-review handoff.
P8 was captured on 2026-11-24 (`visuals/p8/`, two runs: normal and reduced motion) and shows
the journal, assistance, settings, large text, entry from the journal, and a fresh-save
zero state. A same-day follow-up (`g8b`) moved the key map behind a **Controls (?)** popup.
P9 was captured on 2026-11-24 (`visuals/p9/`, two runs: normal and reduced motion) over the
real app with WebDriver BiDi viewport emulation: a 1280×800 desktop title and a 390×844
DPR-2 phone viewport for the title, archetype, rejected import, touch street/dungeon/pond,
responsive sheet, and an export → clear → import round trip. P10 was captured on
2026-11-25 (`visuals/p10/`) across the first-ten-minutes path, performance traces at six
surfaces, every prior capture mode, a reduced-motion journal run, and a production-build
boot check; each run has a manifest with its conditions and any console result.

The P7 run uses the tutorial fixture and the three synthetic demo subjects. The Workshop
gear shown is from the engine's own room-clear loot; no learner subject or note appears in
the record.

The P6 demo subject names — Rivers & Bridges, Sky & Weather, Kitchen Chemistry — are
synthetic authored content. No learner subject or note appears in the P6 record.

| Date | Gate | Commit | Frame | File | What it shows |
|---|---|---|---|---|---|
| 2026-11-23 | G1 | uncommitted (base `989acf1`) | Root room | [`01-root-room.png`](visuals/p1/2026-11-23-g1-01-root-room.png) | Start; spawn in `tut-note`; XP 0; 0/3 cleared; visits 1 |
| 2026-11-23 | G1 | uncommitted | Lower room | [`02-tools-room-low-fps.png`](visuals/p1/2026-11-23-g1-02-tools-room-low-fps.png) | Ladder descent under a 55 ms/80 ms main-thread hog; visits 2; frames avg 37 ms, max 67 ms |
| 2026-11-23 | G1 | uncommitted | Upper room | [`03-map-room.png`](visuals/p1/2026-11-23-g1-03-map-room.png) | Climb ≈3.8 s; visits 3; label clear of the ladder |
| 2026-11-23 | G1 | uncommitted | Return to root | [`04-return-to-root.png`](visuals/p1/2026-11-23-g1-04-return-to-root.png) | Descend ≈1.1 s and step off; visits stays 3 (engine keeps a set) |
| 2026-11-23 | G1 | uncommitted | Reload | [`05-reload.png`](visuals/p1/2026-11-23-g1-05-reload.png) | Three rooms restored from IndexedDB; sessions 1 → 2; fresh session visits 1 |
| 2026-11-23 | G1 | uncommitted | Reduced motion | [`06-reduced-motion.png`](visuals/p1/2026-11-23-g1-06-reduced-motion.png) | `ui.prefersReducedMotion=1`; `matchMedia` true; camera snaps |
| 2026-11-23 | G2 | uncommitted (base `f0eda0e`) | Reduced motion | [`06-reduced-motion.png`](visuals/p2/2026-11-23-g2-06-reduced-motion.png) | P2 build; `matchMedia` true; no panel transitions; focus on the Progress heading |
| 2026-11-23 | G2 | uncommitted | Dungeon re-run: root | [`01-root-room.png`](visuals/p2/2026-11-23-g2-01-root-room.png) | P2 build; visits 1; P1 traversal unchanged |
| 2026-11-23 | G2 | uncommitted | Dungeon re-run: lower room | [`02-tools-room-low-fps.png`](visuals/p2/2026-11-23-g2-02-tools-room-low-fps.png) | Deliberate 55 ms/80 ms hog; visits 2; frames avg 41 ms, max 67 ms |
| 2026-11-23 | G2 | uncommitted | Dungeon re-run: upper room | [`03-map-room.png`](visuals/p2/2026-11-23-g2-03-map-room.png) | Climb ≈3.6 s; visits 3 |
| 2026-11-23 | G2 | uncommitted | Dungeon re-run: return | [`04-return-to-root.png`](visuals/p2/2026-11-23-g2-04-return-to-root.png) | Descend ≈1.1 s; visits stays 3 |
| 2026-11-23 | G2 | uncommitted | Dungeon re-run: reload | [`05-reload.png`](visuals/p2/2026-11-23-g2-05-reload.png) | Three rooms restored; fresh session visits 1 |
| 2026-11-23 | G2 | uncommitted | Composer | [`07-composer.png`](visuals/p2/2026-11-23-g2-07-composer.png) | `E` opens; template prefilled; focus in `#note-text`; prompt hidden while open |
| 2026-11-23 | G2 | uncommitted | Draft | [`08-draft.png`](visuals/p2/2026-11-23-g2-08-draft.png) | Missing sections named (`Key Points, Recall Question`); XP 0; cleared 0 |
| 2026-11-23 | G2 | uncommitted | Cleared | [`09-cleared.png`](visuals/p2/2026-11-23-g2-09-cleared.png) | 28 XP; room `Cleared`; artifact plain text in `<pre>`; focus on Take artifact |
| 2026-11-23 | G2 | uncommitted | Composer closed | [`10-closed.png`](visuals/p2/2026-11-23-g2-10-closed.png) | `Escape` closes; focus returns to `#game`; artifact count 1 |
| 2026-11-23 | G2 | uncommitted | Reload after clear | [`11-reload.png`](visuals/p2/2026-11-23-g2-11-reload.png) | XP 28, cleared 1, artifact 1 survive IndexedDB |
| 2026-11-23 | G2 | uncommitted | Save failure | [`12-not-saved.png`](visuals/p2/2026-11-23-g2-12-not-saved.png) | Simulated quota failure; "Not saved" in panel and HUD; XP 28→28, cleared 1→1 |
| 2026-11-23 | G3 | uncommitted (base `fd8c171`) | Village street | [`01-street.png`](visuals/p3/2026-11-23-g3-01-street.png) | Fresh save; 0 subject portals; nearby Training Grounds; prompt visible; canvas focus outline |
| 2026-11-23 | G3 | uncommitted | Portal entry | [`02-dungeon-entry.png`](visuals/p3/2026-11-23-g3-02-dungeon-entry.png) | Training gate enters in 16 ms; world dungeon; 3 rooms; active session |
| 2026-11-23 | G3 | uncommitted | Room cleared | [`03-cleared.png`](visuals/p3/2026-11-23-g3-03-cleared.png) | 28 XP; room `Cleared`; artifact outcome; active session |
| 2026-11-23 | G3 | uncommitted | Returned through the shaft | [`04-returned.png`](visuals/p3/2026-11-23-g3-04-returned.png) | Climb ≈4.0 s; world village; active subject null; session closed; subject portal row shows 1/3 |
| 2026-11-23 | G3 | uncommitted | Reload on the street | [`05-reload-surface.png`](visuals/p3/2026-11-23-g3-05-reload-surface.png) | World village; one subject portal; cleared count survives |
| 2026-11-23 | G3 | uncommitted | Reload in the dungeon | [`06-reload-dungeon.png`](visuals/p3/2026-11-23-g3-06-reload-dungeon.png) | P0-T5 recovery; world dungeon; 3 rooms; active session |
| 2026-11-24 | G3 re-run | uncommitted (base `b44f24a`) | Village street (fixed layout) | [`01-street.png`](visuals/p3/2026-11-24-g3-01-street.png) | Facades are background-only; 3-tile building gap; spawn centred on the Training Grounds door; player can walk both ways |
| 2026-11-24 | G3 re-run | uncommitted | Portal entry | [`02-dungeon-entry.png`](visuals/p3/2026-11-24-g3-02-dungeon-entry.png) | Training gate enters in 21 ms; world dungeon; 3 rooms; active session |
| 2026-11-24 | G3 re-run | uncommitted | Room cleared | [`03-cleared.png`](visuals/p3/2026-11-24-g3-03-cleared.png) | 28 XP; room `Cleared`; active session |
| 2026-11-24 | G3 re-run | uncommitted | Returned through the shaft | [`04-returned.png`](visuals/p3/2026-11-24-g3-04-returned.png) | Climb ≈4.0 s; world village; session closed; portal row shows 1/3 |
| 2026-11-24 | G3 re-run | uncommitted | Reload on the street | [`05-reload-surface.png`](visuals/p3/2026-11-24-g3-05-reload-surface.png) | World village; one subject portal; cleared count survives |
| 2026-11-24 | G3 re-run | uncommitted | Reload in the dungeon | [`06-reload-dungeon.png`](visuals/p3/2026-11-24-g3-06-reload-dungeon.png) | P0-T5 recovery; world dungeon; 3 rooms; active session |
| 2026-11-24 | G3 polish | uncommitted (base `1ef03cf`) | Village street (polished) | [`01-street.png`](visuals/p3/2026-11-24-g3p-01-street.png) | Skyline, moon, lit windows, contact shadows, paving; HUD deduped with pond locations |
| 2026-11-24 | G3 polish | uncommitted | Portal entry | [`02-dungeon-entry.png`](visuals/p3/2026-11-24-g3p-02-dungeon-entry.png) | Training gate enters in 72 ms; world dungeon; 3 rooms |
| 2026-11-24 | G3 polish | uncommitted | Room cleared | [`03-cleared.png`](visuals/p3/2026-11-24-g3p-03-cleared.png) | 28 XP; room `Cleared`; active session |
| 2026-11-24 | G3 polish | uncommitted | Returned through the shaft | [`04-returned.png`](visuals/p3/2026-11-24-g3p-04-returned.png) | Climb ≈4.2 s; full portal sign; world village; session closed |
| 2026-11-24 | G3 polish | uncommitted | Reload on the street | [`05-reload-surface.png`](visuals/p3/2026-11-24-g3p-05-reload-surface.png) | World village; one subject portal; cleared count survives |
| 2026-11-24 | G3 polish | uncommitted | Reload in the dungeon | [`06-reload-dungeon.png`](visuals/p3/2026-11-24-g3p-06-reload-dungeon.png) | P0-T5 recovery; world dungeon; 3 rooms; active session |
| 2026-11-24 | G4 | uncommitted (base `203011d`) | Dungeon entry | [`01-dungeon-entry.png`](visuals/p4/2026-11-24-g4-01-dungeon-entry.png) | P4 build; Training Grounds entry; 3 rooms; active session |
| 2026-11-24 | G4 | uncommitted | Pond on the street | [`02-pond-on-street.png`](visuals/p4/2026-11-24-g4-02-pond-on-street.png) | After one clear; `Nearby Fishing Pond (north-west)`; `E` prompt |
| 2026-11-24 | G4 | uncommitted | Pond entry | [`03-pond-idle.png`](visuals/p4/2026-11-24-g4-03-pond-idle.png) | World fishing; host-resolved Tutorial subject; 0 fish; reduced motion; avg 16.79 ms, p95 17.16 ms, max 33.74 ms |
| 2026-11-24 | G4 | uncommitted | Charging the cast | [`03b-powering.png`](visuals/p4/2026-11-24-g4-03b-powering.png) | Space held; power meter; phase `powering` |
| 2026-11-24 | G4 | uncommitted | Cast waiting | [`04-waiting.png`](visuals/p4/2026-11-24-g4-04-waiting.png) | Bobber on the water; live-region "Waiting for a bite." |
| 2026-11-24 | G4 | uncommitted | Bite | [`05-bite.png`](visuals/p4/2026-11-24-g4-05-bite.png) | Bite in ≈5.4 s; "Bite! Press Space to reel in." |
| 2026-11-24 | G4 | uncommitted | Recall dialog | [`06-recall.png`](visuals/p4/2026-11-24-g4-06-recall.png) | Focus on the first action; engine recall question; 0 fish |
| 2026-11-24 | G4 | uncommitted | Catch save failure | [`07-not-saved.png`](visuals/p4/2026-11-24-g4-07-not-saved.png) | Simulated quota failure; "Not saved" in dialog and HUD; fish 0→0 |
| 2026-11-24 | G4 | uncommitted | Kept with recall | [`08-kept.png`](visuals/p4/2026-11-24-g4-08-kept.png) | Enter on the focused button; fish 1; XP 28→33; focus back on `#game` |
| 2026-11-24 | G4 | uncommitted | Released | [`09-released.png`](visuals/p4/2026-11-24-g4-09-released.png) | Second cast released; fish stays 1; "Released. Nothing was added…" |
| 2026-11-24 | G4 | uncommitted | Left the pond | [`10-street.png`](visuals/p4/2026-11-24-g4-10-street.png) | Escape returns to the street beside the pond; fish 1 |
| 2026-11-24 | G4 | uncommitted | Reload after a catch | [`11-reload.png`](visuals/p4/2026-11-24-g4-11-reload.png) | Fish 1 and XP 33 survive IndexedDB |
| 2026-11-24 | G4 | uncommitted | Mid-cast reload recovery | [`12-mid-cast-reload.png`](visuals/p4/2026-11-24-g4-12-mid-cast-reload.png) | Persistent banner: "Session could not be resumed…"; world village |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Review locked | [`01-locked.png`](visuals/p5/2026-11-24-g5-01-locked.png) | shownIn=44ms; cleared=1/3; toast says locked=true; panel stayed closed=true; prompt offers R=true |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Cleared room prompt | [`02-due-prompt.png`](visuals/p5/2026-11-24-g5-02-due-prompt.png) | cleared=3/3; climb=3784ms; prompt shows E and R=true; HUD reviews due="3 rooms" |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Review panel | [`03-review-panel.png`](visuals/p5/2026-11-24-g5-03-review-panel.png) | shownIn=24ms; focus=review-rating-0; rating buttons=6; prompt shown=true; previous row="Previous rating None chosen yet"; frame avg=17.93ms p95=33.24ms max=50.56ms over16.7=305/558 |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Rating selected | [`04-selected.png`](visuals/p5/2026-11-24-g5-04-selected.png) | pressed=review-rating-5; submit enabled=true |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Rated pass | [`05-rated.png`](visuals/p5/2026-11-24-g5-05-rated.png) | shownIn=8ms; XP copy=true; pass progress=true; next review copy=true; passCount tut-map=1; reviewPasses=1; focus=review-close |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Saved for later | [`06-saved.png`](visuals/p5/2026-11-24-g5-06-saved.png) | shownIn=8ms; marker=tut-map; no XP promise=true; passCount unchanged=1; focus=review-rating-4 |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Resumed after reload | [`07-resumed.png`](visuals/p5/2026-11-24-g5-07-resumed.png) | marker after reload=tut-map; previous rating restored=true; focus=review-rating-4 |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Saved review discarded | [`08-discarded.png`](visuals/p5/2026-11-24-g5-08-discarded.png) | armed copy=true; shownIn=20ms; marker=null; result="Saved review discarded. Nothing was scheduled." |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Resumed completion is not paid twice | [`09-duplicate.png`](visuals/p5/2026-11-24-g5-09-duplicate.png) | shownIn=24ms; marker left in place disclosed=true; duplicate copy=true; xp 92→92; reviewPasses 1→1 |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Review save failure | [`10-not-saved.png`](visuals/p5/2026-11-24-g5-10-not-saved.png) | descend=2665ms; shownIn=10ms; error says not saved=true; panel open=true; submit enabled after failure=true; xp 92→92; passCount tut-tools 0→0 |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Reload after review work | [`11-reload.png`](visuals/p5/2026-11-24-g5-11-reload.png) | world=dungeon; cleared=3/3; reviewPasses=1; passCounts={"tut-note":0,"tut-tools":0,"tut-map":1}; nextReview set=true; marker=null; focus=panel-title |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Street review shortcut | [`12-street-shortcut.png`](visuals/p5/2026-11-24-g5-12-street-shortcut.png) | street=3784ms; panel=33ms; focus=review-rating-0; previous="Previous rating None chosen yet"; subject activated for the command=true |
| 2026-11-24 | G5 | uncommitted (base `6525c22`) | Street review closed | [`13-street-closed.png`](visuals/p5/2026-11-24-g5-13-street-closed.png) | world=village; activeSubject=null; study session open=false; focus=game; reviews due still listed=true |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Review locked | [`01-locked.png`](visuals/p5/2026-11-24-g5rm-01-locked.png) | Reduced-motion re-run; shownIn=15ms; cleared=1/3; toast says locked=true; panel stayed closed=true; prompt offers R=true |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Cleared room prompt | [`02-due-prompt.png`](visuals/p5/2026-11-24-g5rm-02-due-prompt.png) | Reduced-motion re-run; cleared=3/3; climb=3718ms; prompt shows E and R=true; HUD reviews due="3 rooms" |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Review panel | [`03-review-panel.png`](visuals/p5/2026-11-24-g5rm-03-review-panel.png) | Reduced-motion re-run; shownIn=7ms; focus=review-rating-0; rating buttons=6; prompt shown=true; previous row="Previous rating None chosen yet"; frame avg=16.64ms p95=17.18ms max=33.38ms over16.7=314/601 |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Rating selected | [`04-selected.png`](visuals/p5/2026-11-24-g5rm-04-selected.png) | Reduced-motion re-run; pressed=review-rating-5; submit enabled=true |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Rated pass | [`05-rated.png`](visuals/p5/2026-11-24-g5rm-05-rated.png) | Reduced-motion re-run; shownIn=6ms; XP copy=true; pass progress=true; next review copy=true; passCount tut-map=1; reviewPasses=1; focus=review-close |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Saved for later | [`06-saved.png`](visuals/p5/2026-11-24-g5rm-06-saved.png) | Reduced-motion re-run; shownIn=19ms; marker=tut-map; no XP promise=true; passCount unchanged=1; focus=review-rating-4 |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Resumed after reload | [`07-resumed.png`](visuals/p5/2026-11-24-g5rm-07-resumed.png) | Reduced-motion re-run; marker after reload=tut-map; previous rating restored=true; focus=review-rating-4 |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Saved review discarded | [`08-discarded.png`](visuals/p5/2026-11-24-g5rm-08-discarded.png) | Reduced-motion re-run; armed copy=true; shownIn=17ms; marker=null; result="Saved review discarded. Nothing was scheduled." |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Resumed completion is not paid twice | [`09-duplicate.png`](visuals/p5/2026-11-24-g5rm-09-duplicate.png) | Reduced-motion re-run; shownIn=30ms; marker left in place disclosed=true; duplicate copy=true; xp 92→92; reviewPasses 1→1 |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Review save failure | [`10-not-saved.png`](visuals/p5/2026-11-24-g5rm-10-not-saved.png) | Reduced-motion re-run; descend=2944ms; shownIn=17ms; error says not saved=true; panel open=true; submit enabled after failure=true; xp 92→92; passCount tut-tools 0→0 |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Reload after review work | [`11-reload.png`](visuals/p5/2026-11-24-g5rm-11-reload.png) | Reduced-motion re-run; world=dungeon; cleared=3/3; reviewPasses=1; passCounts={"tut-note":0,"tut-tools":0,"tut-map":1}; nextReview set=true; marker=null; focus=panel-title |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Street review shortcut | [`12-street-shortcut.png`](visuals/p5/2026-11-24-g5rm-12-street-shortcut.png) | Reduced-motion re-run; street=3790ms; panel=18ms; focus=review-rating-0; previous="Previous rating None chosen yet"; subject activated for the command=true |
| 2026-11-24 | G5 (reduced motion) | uncommitted (base `6525c22`) | Street review closed | [`13-street-closed.png`](visuals/p5/2026-11-24-g5rm-13-street-closed.png) | Reduced-motion re-run; world=village; activeSubject=null; study session open=false; focus=game; reviews due still listed=true |
| 2026-11-24 | G5 follow-up | uncommitted (base `9c9ef3d`) | Dungeon figure | [`g5player-01-dungeon-entry.png`](visuals/p5/2026-11-24-g5player-01-dungeon-entry.png) | Shared capsule body, shade outline, feet bar, contact shadow, and facing eye |
| 2026-11-24 | G5 follow-up | uncommitted (base `9c9ef3d`) | Pond figure | [`g5player-03-pond-idle.png`](visuals/p5/2026-11-24-g5player-03-pond-idle.png) | Same figure at the pond; replaces the P4 rectangular torso plus circular head |
| 2026-11-24 | P4 follow-up | uncommitted (base `066844b`) | Pond before a clear | [`01a-pond-refusal.png`](visuals/p4/2026-11-24-g4b-01a-pond-refusal.png) | Canvas toast: "No dungeon subject is in focus…"; prompt still offers `E` |
| 2026-11-24 | P4 follow-up | uncommitted | Non-portal building | [`11a-library.png`](visuals/p4/2026-11-24-g4b-11a-library.png) | Canvas toast: "Library is a facade…; only subject portals and the Training Grounds open a dungeon" |
| 2026-11-24 | G6 | uncommitted (base `46e28b3`) | Creator subject list | [`01-subject-list.png`](visuals/p6/2026-11-24-g6-01-subject-list.png) | Fresh save; 3 demo subjects seeded; 3 portals; list shows room/cleared counts |
| 2026-11-24 | G6 | uncommitted | Create form | [`02-create-form.png`](visuals/p6/2026-11-24-g6-02-create-form.png) | Name and root topic filled; host mints ids |
| 2026-11-24 | G6 | uncommitted | Created subject | [`03-created.png`](visuals/p6/2026-11-24-g6-03-created.png) | Subjects 3→4; active study session; root room only |
| 2026-11-24 | G6 | uncommitted | Room tree | [`04-tree.png`](visuals/p6/2026-11-24-g6-04-tree.png) | Root plus three depth-1 children in graph order |
| 2026-11-24 | G6 | uncommitted | Cascade confirmation | [`05-cascade-confirm.png`](visuals/p6/2026-11-24-g6-05-cascade-confirm.png) | Two nested rooms under the selected room; "Confirm remove: 3 rooms"; nothing written |
| 2026-11-24 | G6 | uncommitted | Cascade removed | [`06-cascade-removed.png`](visuals/p6/2026-11-24-g6-06-cascade-removed.png) | Subtree removed; rooms 6→3; outcome names three rooms |
| 2026-11-24 | G6 | uncommitted | Tree with tags | [`07-tree-tags.png`](visuals/p6/2026-11-24-g6-07-tree-tags.png) | Selected room carries stored `water, observation`; depth and parent shown |
| 2026-11-24 | G6 | uncommitted | Cross-link edge | [`08-cross-link.png`](visuals/p6/2026-11-24-g6-08-cross-link.png) | Non-tree edge rendered below the tree |
| 2026-11-24 | G6 | uncommitted | New portal on the street | [`09-street-portal.png`](visuals/p6/2026-11-24-g6-09-street-portal.png) | 4 portals from engine data; new portal drawn and reachable; session closed |
| 2026-11-24 | G6 | uncommitted | Duplicate-name refusal | [`10-refusal.png`](visuals/p6/2026-11-24-g6-10-refusal.png) | Visible refusal; subject count unchanged |
| 2026-11-24 | G6 | uncommitted | Rejected graph write | [`11-not-saved.png`](visuals/p6/2026-11-24-g6-11-not-saved.png) | Simulated quota failure; "Not saved"; tree and tags unchanged |
| 2026-11-24 | G6 | uncommitted | Keyboard-only Creator | [`12-keyboard-create.png`](visuals/p6/2026-11-24-g6-12-keyboard-create.png) | C, Tab, typing, Enter: subject 4→5 and 3 rooms; no pointer events |
| 2026-11-24 | G6 | uncommitted | Keyboard-only portal entry | [`13-keyboard-enter.png`](visuals/p6/2026-11-24-g6-13-keyboard-enter.png) | Escape returns focus to `#game`; D/E enters the new subject's dungeon |
| 2026-11-24 | G6 reduced motion | uncommitted | Subject list | [`01-subject-list.png`](visuals/p6/2026-11-24-g6rm-01-subject-list.png) | `prefers-reduced-motion=1`; Creator open; same engine data |
| 2026-11-24 | G6 reduced motion | uncommitted | Creator panel | [`02-reduced-motion.png`](visuals/p6/2026-11-24-g6rm-02-reduced-motion.png) | No panel animation; reduced-motion flag recorded |
| 2026-11-24 | G7 | uncommitted | Villager dialogue | [`01-villager.png`](visuals/p7/2026-11-24-g7-01-villager.png) | Wandering Scholar; `E talk` prompt; line as a text node; only "speaks" announced |
| 2026-11-24 | G7 | uncommitted | Villager cursor advanced | [`02-villager-second-line.png`](visuals/p7/2026-11-24-g7-02-villager-second-line.png) | Second `E` returns a different deterministic line; Escape closes |
| 2026-11-24 | G7 | uncommitted | Library | [`03-library.png`](visuals/p7/2026-11-24-g7-03-library.png) | Three review candidates; one collected artifact; two uncollected; note topics/dates |
| 2026-11-24 | G7 | uncommitted | Review opened from the Library | [`04-library-review.png`](visuals/p7/2026-11-24-g7-04-library-review.png) | Keyboard Tab from Close to the first Review button, Enter; service dropped; P5 panel focused |
| 2026-11-24 | G7 | uncommitted | Review rated from the Library | [`05-library-review-rated.png`](visuals/p7/2026-11-24-g7-05-library-review-rated.png) | Rating 5 via keys; XP and next-review copy; pass recorded |
| 2026-11-24 | G7 | uncommitted | Library review closed | [`06-library-review-closed.png`](visuals/p7/2026-11-24-g7-06-library-review-closed.png) | World village; active subject null; study session closed; one review pass total |
| 2026-11-24 | G7 | uncommitted | Fish Stand (display only) | [`07-fish-stand.png`](visuals/p7/2026-11-24-g7-07-fish-stand.png) | Visible "Selling and trading are not part of this build"; empty collection; only Close is a button |
| 2026-11-24 | G7 | uncommitted | Workshop inventory | [`08-workshop.png`](visuals/p7/2026-11-24-g7-08-workshop.png) | Per-subject inventory from engine loot; equip controls; subject named |
| 2026-11-24 | G7 | uncommitted | Workshop save failure | [`09-workshop-not-saved.png`](visuals/p7/2026-11-24-g7-09-workshop-not-saved.png) | Simulated quota failure; "Not saved"; equipped 0→0; inventory 3→3 |
| 2026-11-24 | G7 | uncommitted | Workshop equipped | [`10-workshop-equipped.png`](visuals/p7/2026-11-24-g7-10-workshop-equipped.png) | Enter on the focused Equip button; result copy; equipped=1 |
| 2026-11-24 | G7 | uncommitted | Trophy Hall | [`11-trophy-hall.png`](visuals/p7/2026-11-24-g7-11-trophy-hall.png) | Labelled badges; fish empty state; records from `statistics` with real zeroes |
| 2026-11-24 | G7 | uncommitted | Guild Hall | [`12-guild-hall.png`](visuals/p7/2026-11-24-g7-12-guild-hall.png) | Quest step advanced by the door; next step; archetype; roster; Creator entry |
| 2026-11-24 | G7 | uncommitted | Equipment after reload | [`13-workshop-reload.png`](visuals/p7/2026-11-24-g7-13-workshop-reload.png) | Equipped=1 after reload; Workshop shows Unequip for the same item |
| 2026-11-24 | G7 reduced motion | uncommitted | Villager dialogue | [`01-villager.png`](visuals/p7/2026-11-24-g7rm-01-villager.png) | `prefers-reduced-motion=1`; same NPC and service path |
| 2026-11-24 | G7 reduced motion | uncommitted | Villager cursor advanced | [`02-villager-second-line.png`](visuals/p7/2026-11-24-g7rm-02-villager-second-line.png) | Second line differs; Escape closes |
| 2026-11-24 | G7 reduced motion | uncommitted | Library | [`03-library.png`](visuals/p7/2026-11-24-g7rm-03-library.png) | Three candidates; same engine data with motion disabled |
| 2026-11-24 | G7 reduced motion | uncommitted | Library review | [`04-library-review.png`](visuals/p7/2026-11-24-g7rm-04-library-review.png) | Keyboard-open review from the desk; focus lands on rating 0 |
| 2026-11-24 | G7 reduced motion | uncommitted | Review rated | [`05-library-review-rated.png`](visuals/p7/2026-11-24-g7rm-05-library-review-rated.png) | Rating 5 via keys; reward and next-review copy |
| 2026-11-24 | G7 reduced motion | uncommitted | Library review closed | [`06-library-review-closed.png`](visuals/p7/2026-11-24-g7rm-06-library-review-closed.png) | World village; session closed; one pass total |
| 2026-11-24 | G7 reduced motion | uncommitted | Fish Stand | [`07-fish-stand.png`](visuals/p7/2026-11-24-g7rm-07-fish-stand.png) | Read-only notice; no transaction |
| 2026-11-24 | G7 reduced motion | uncommitted | Workshop inventory | [`08-workshop.png`](visuals/p7/2026-11-24-g7rm-08-workshop.png) | Per-subject inventory; equip controls |
| 2026-11-24 | G7 reduced motion | uncommitted | Workshop save failure | [`09-workshop-not-saved.png`](visuals/p7/2026-11-24-g7rm-09-workshop-not-saved.png) | Same rejected-write path with reduced motion |
| 2026-11-24 | G7 reduced motion | uncommitted | Workshop equipped | [`10-workshop-equipped.png`](visuals/p7/2026-11-24-g7rm-10-workshop-equipped.png) | Keyboard equip succeeds; equipped=1 |
| 2026-11-24 | G7 reduced motion | uncommitted | Trophy Hall | [`11-trophy-hall.png`](visuals/p7/2026-11-24-g7rm-11-trophy-hall.png) | Records and empty fish state |
| 2026-11-24 | G7 reduced motion | uncommitted | Guild Hall | [`12-guild-hall.png`](visuals/p7/2026-11-24-g7rm-12-guild-hall.png) | Quest board, roster, and Creator entry with motion disabled |
| 2026-11-24 | G8 | uncommitted | Journal overview | [`2026-11-24-g8-01-journal-overview.png`](visuals/p8/2026-11-24-g8-01-journal-overview.png) | openIn=13ms; focus=journal-panel-title; subjects=active subject row; sections=journal-overview,journal-subjects,journal-progress,journal-badges,journal-records,journal-inventory,journal-fish,journal-due,journal-assistance,journal-settings; records=true; due=true; assistance=true; settings=true |
| 2026-11-24 | G8 | uncommitted | Journal subjects | [`2026-11-24-g8-02-journal-subjects.png`](visuals/p8/2026-11-24-g8-02-journal-subjects.png) | section=journal-panel-title; room counts=true; enter buttons=4 |
| 2026-11-24 | G8 | uncommitted | Journal records | [`2026-11-24-g8-03-journal-records.png`](visuals/p8/2026-11-24-g8-03-journal-records.png) | notes=true; active days=true; engine copy=true |
| 2026-11-24 | G8 | uncommitted | Journal assistance | [`2026-11-24-g8-04-journal-assistance.png`](visuals/p8/2026-11-24-g8-04-journal-assistance.png) | suggestions=6; engine reason labels=true; mode copy=true |
| 2026-11-24 | G8 | uncommitted | Journal settings | [`2026-11-24-g8-05-journal-settings.png`](visuals/p8/2026-11-24-g8-05-journal-settings.png) | focus=journal-panel-title; values={"reducedMotion":"system","assistance":"gentle","textScale":"normal","touch":"auto"}; local-only copy=true |
| 2026-11-24 | G8 | uncommitted | Large text applied | [`2026-11-24-g8-06-journal-large-text.png`](visuals/p8/2026-11-24-g8-06-journal-large-text.png) | dataset=large; value=large; same panel open=true |
| 2026-11-24 | G8 | uncommitted | Assistance mode off | [`2026-11-24-g8-07-journal-assistance-off.png`](visuals/p8/2026-11-24-g8-07-journal-assistance-off.png) | mode=off; off copy=true; suggestions=0 |
| 2026-11-24 | G8 | uncommitted | Settings after reload | [`2026-11-24-g8-08-journal-settings-persisted.png`](visuals/p8/2026-11-24-g8-08-journal-settings-persisted.png) | dataset text=large; select text=large; assistance=off; reduced motion=system; touch=auto |
| 2026-11-24 | G8 | uncommitted | Entered from the journal | [`2026-11-24-g8-09-journal-entry.png`](visuals/p8/2026-11-24-g8-09-journal-entry.png) | subject=demo-kitchen; enteredIn=108ms; world=dungeon; study session open=true; focus=game |
| 2026-11-24 | G8 | uncommitted | Journal on a fresh save | [`2026-11-24-g8-10-journal-empty.png`](visuals/p8/2026-11-24-g8-10-journal-empty.png) | subjects visible=true; active subject=true; due=true; focus=journal-panel-title |
| 2026-11-24 | G8 | uncommitted | Fresh-save records | [`2026-11-24-g8-11-journal-empty-records.png`](visuals/p8/2026-11-24-g8-11-journal-empty-records.png) | zero notes=true; zero fish=true; badges empty=true; fish empty=true |
| 2026-11-24 | G8 reduced motion | uncommitted | Journal overview | [`2026-11-24-g8rm-01-journal-overview.png`](visuals/p8/2026-11-24-g8rm-01-journal-overview.png) | openIn=55ms; focus=journal-panel-title; subjects=active subject row; sections=journal-overview,journal-subjects,journal-progress,journal-badges,journal-records,journal-inventory,journal-fish,journal-due,journal-assistance,journal-settings; records=true; due=true; assistance=true; settings=true |
| 2026-11-24 | G8 reduced motion | uncommitted | Journal subjects | [`2026-11-24-g8rm-02-journal-subjects.png`](visuals/p8/2026-11-24-g8rm-02-journal-subjects.png) | section=journal-panel-title; room counts=true; enter buttons=4 |
| 2026-11-24 | G8 reduced motion | uncommitted | Journal records | [`2026-11-24-g8rm-03-journal-records.png`](visuals/p8/2026-11-24-g8rm-03-journal-records.png) | notes=true; active days=true; engine copy=true |
| 2026-11-24 | G8 reduced motion | uncommitted | Journal assistance | [`2026-11-24-g8rm-04-journal-assistance.png`](visuals/p8/2026-11-24-g8rm-04-journal-assistance.png) | suggestions=6; engine reason labels=true; mode copy=true |
| 2026-11-24 | G8 reduced motion | uncommitted | Journal settings | [`2026-11-24-g8rm-05-journal-settings.png`](visuals/p8/2026-11-24-g8rm-05-journal-settings.png) | focus=journal-panel-title; values={"reducedMotion":"system","assistance":"gentle","textScale":"normal","touch":"auto"}; local-only copy=true |
| 2026-11-24 | G8 reduced motion | uncommitted | Large text applied | [`2026-11-24-g8rm-06-journal-large-text.png`](visuals/p8/2026-11-24-g8rm-06-journal-large-text.png) | dataset=large; value=large; same panel open=true |
| 2026-11-24 | G8 reduced motion | uncommitted | Assistance mode off | [`2026-11-24-g8rm-07-journal-assistance-off.png`](visuals/p8/2026-11-24-g8rm-07-journal-assistance-off.png) | mode=off; off copy=true; suggestions=0 |
| 2026-11-24 | G8 reduced motion | uncommitted | Settings after reload | [`2026-11-24-g8rm-08-journal-settings-persisted.png`](visuals/p8/2026-11-24-g8rm-08-journal-settings-persisted.png) | dataset text=large; select text=large; assistance=off; reduced motion=system; touch=auto |
| 2026-11-24 | G8 reduced motion | uncommitted | Entered from the journal | [`2026-11-24-g8rm-09-journal-entry.png`](visuals/p8/2026-11-24-g8rm-09-journal-entry.png) | subject=demo-kitchen; enteredIn=114ms; world=dungeon; study session open=true; focus=game |
| 2026-11-24 | G8 reduced motion | uncommitted | Journal on a fresh save | [`2026-11-24-g8rm-10-journal-empty.png`](visuals/p8/2026-11-24-g8rm-10-journal-empty.png) | subjects visible=true; active subject=true; due=true; focus=journal-panel-title |
| 2026-11-24 | G8 reduced motion | uncommitted | Fresh-save records | [`2026-11-24-g8rm-11-journal-empty-records.png`](visuals/p8/2026-11-24-g8rm-11-journal-empty-records.png) | zero notes=true; zero fish=true; badges empty=true; fish empty=true |
| 2026-11-24 | G8 follow-up | uncommitted | Controls help | [`2026-11-24-g8b-01-controls-help.png`](visuals/p8/2026-11-24-g8b-01-controls-help.png) | openIn=39ms; focus=help-panel-title; groups=Move,Interact,Review,Pond,World; close buttons=1 |
| 2026-11-24 | G8 follow-up | uncommitted | Controls closed | [`2026-11-24-g8b-02-controls-closed.png`](visuals/p8/2026-11-24-g8b-02-controls-closed.png) | closedIn=24ms; focus returned to open-help; help hidden=true |
| 2026-11-24 | G8 follow-up | uncommitted | Controls opened with ? | [`2026-11-24-g8b-03-controls-question.png`](visuals/p8/2026-11-24-g8b-03-controls-question.png) | openIn=49ms; focus=help-panel-title; shortcut works without the mouse |
| 2026-11-24 | G8 follow-up | uncommitted | Root room opening | [`2026-11-24-g8c-01-root-opening.png`](visuals/p8/2026-11-24-g8c-01-root-opening.png) | The chamber outline is cut at the ladder doorway; the room reads as connected to the shaft |
| 2026-11-24 | G8 follow-up | uncommitted | Lower room opening | [`2026-11-24-g8c-02-lower-opening.png`](visuals/p8/2026-11-24-g8c-02-lower-opening.png) | The lower chamber shows the same doorway gap at the ladder |

Manifests: [`2026-11-23-g1-manifest.json`](visuals/p1/2026-11-23-g1-manifest.json),
[`2026-11-23-g2-manifest.json`](visuals/p2/2026-11-23-g2-manifest.json),
[`2026-11-23-g3-manifest.json`](visuals/p3/2026-11-23-g3-manifest.json),
[`2026-11-24-g3-manifest.json`](visuals/p3/2026-11-24-g3-manifest.json),
[`2026-11-24-g3p-manifest.json`](visuals/p3/2026-11-24-g3p-manifest.json),
[`2026-11-24-g4-manifest.json`](visuals/p4/2026-11-24-g4-manifest.json),
[`2026-11-24-g4b-manifest.json`](visuals/p4/2026-11-24-g4b-manifest.json),
[`2026-11-24-g6-manifest.json`](visuals/p6/2026-11-24-g6-manifest.json),
[`2026-11-24-g6rm-manifest.json`](visuals/p6/2026-11-24-g6rm-manifest.json),
[`2026-11-24-g7-manifest.json`](visuals/p7/2026-11-24-g7-manifest.json),
[`2026-11-24-g7rm-manifest.json`](visuals/p7/2026-11-24-g7rm-manifest.json),
[`2026-11-24-g8-manifest.json`](visuals/p8/2026-11-24-g8-manifest.json),
[`2026-11-24-g8rm-manifest.json`](visuals/p8/2026-11-24-g8rm-manifest.json),
[`2026-11-24-g8b-manifest.json`](visuals/p8/2026-11-24-g8b-manifest.json),
[`2026-11-24-g8c-manifest.json`](visuals/p8/2026-11-24-g8c-manifest.json).

P0 predates this record: it proved boot and storage with a debug panel and captured no
frames. The record starts at P1.

## P1 — Dungeon level and movement

The tutorial generates as a vertical stack: `tut-note` at the root, `tut-tools` below,
`tut-map` above, joined by one ladder shaft at the room centre.

The teal outline on the Progress heading is the keyboard focus target after Start; the
start button is hidden once the dungeon opens.

### Start in the root room

![Root room](visuals/p1/2026-11-23-g1-01-root-room.png)

### Lower room under low FPS

![Lower room under low FPS](visuals/p1/2026-11-23-g1-02-tools-room-low-fps.png)

### Upper room after the climb

![Upper room](visuals/p1/2026-11-23-g1-03-map-room.png)

### Back in the root room

![Return to root](visuals/p1/2026-11-23-g1-04-return-to-root.png)

### After reload

![Reload](visuals/p1/2026-11-23-g1-05-reload.png)

### Reduced motion

![Reduced motion](visuals/p1/2026-11-23-g1-06-reduced-motion.png)

## P2 — Note loop

P2 re-ran the P1 dungeon path on the current build (frames `01`–`06`) and then drove the
note loop in a fresh save (frames `07`–`12`). The composer is a real DOM dialog over the
canvas; the artifact is plain text in a `<pre>`; no frame contains learner content.

### Composer opens from E

![Composer](visuals/p2/2026-11-23-g2-07-composer.png)

### Draft: the exact missing sections

![Draft](visuals/p2/2026-11-23-g2-08-draft.png)

### Cleared: XP and the plain-text artifact

![Cleared](visuals/p2/2026-11-23-g2-09-cleared.png)

### Closed: focus back on the canvas

![Composer closed](visuals/p2/2026-11-23-g2-10-closed.png)

### Reload: cleared room, XP, and artifact survive

![Reload after clear](visuals/p2/2026-11-23-g2-11-reload.png)

### Save failure: "Not saved", prior state intact

![Save failure](visuals/p2/2026-11-23-g2-12-not-saved.png)

Manifest: [`2026-11-23-g2-manifest.json`](visuals/p2/2026-11-23-g2-manifest.json).

## P3 — Surface village

P3 adds the side-view street above the dungeon. Frame `01` is a fresh save with no
subject portals yet; `04` is the same street after the tutorial clear, with the engine's
subject portal row and the Training Grounds facade. These are the first P3 frames; the
[2026-11-24 follow-up](#follow-up-spacing-and-movement-fix-2026-11-24) fixes the facade
spacing and removes the portal/gate overlap.

### Village street (fresh save)

![Village street](visuals/p3/2026-11-23-g3-01-street.png)

### Portal entry

![Portal entry](visuals/p3/2026-11-23-g3-02-dungeon-entry.png)

### Room cleared

![Room cleared](visuals/p3/2026-11-23-g3-03-cleared.png)

### Returned through the entrance shaft

![Returned through the shaft](visuals/p3/2026-11-23-g3-04-returned.png)

### Reload on the street

![Reload on the street](visuals/p3/2026-11-23-g3-05-reload-surface.png)

### Reload in the dungeon

![Reload in the dungeon](visuals/p3/2026-11-23-g3-06-reload-dungeon.png)

Manifest: [`2026-11-23-g3-manifest.json`](visuals/p3/2026-11-23-g3-manifest.json).

### Follow-up: spacing and movement fix (2026-11-24)

Playtest feedback found two problems in the first P3 pass: the raw top-down `gridX`
values clumped facades together, and solid building bodies plus a door gap trapped the
player inside the Training Grounds footprint. The follow-up makes facades background
presentation, keeps only the street ground and invisible world edges as collision,
spaces buildings by 1.6× with a 3-tile minimum gap, and centres the spawn/entrance on
the Training Grounds door. The 2026-11-23 frames are retained as the earlier record.

#### Fixed street: buildings separated, player free to walk

![Fixed village street](visuals/p3/2026-11-24-g3-01-street.png)

#### Portal entry on the fixed street

![Portal entry](visuals/p3/2026-11-24-g3-02-dungeon-entry.png)

#### Room cleared

![Room cleared](visuals/p3/2026-11-24-g3-03-cleared.png)

#### Returned through the shaft

![Returned through the shaft](visuals/p3/2026-11-24-g3-04-returned.png)

#### Reload on the street

![Reload on the street](visuals/p3/2026-11-24-g3-05-reload-surface.png)

#### Reload in the dungeon

![Reload in the dungeon](visuals/p3/2026-11-24-g3-06-reload-dungeon.png)

Manifest: [`2026-11-24-g3-manifest.json`](visuals/p3/2026-11-24-g3-manifest.json).

### Polish pass (2026-11-24)

The polish pass adds a deterministic skyline and moon, warm window lights, contact
shadows, door frames and steps, paving seams, a street gradient, and a small chevron at
the entrance shaft. Portal signs may extend into the 3-tile building gap so the subject
name stays readable, and the surface HUD drops redundant type repeats and labels the
three ponds by direction.

#### Polished street

![Polished village street](visuals/p3/2026-11-24-g3p-01-street.png)

#### Portal entry

![Portal entry](visuals/p3/2026-11-24-g3p-02-dungeon-entry.png)

#### Room cleared

![Room cleared](visuals/p3/2026-11-24-g3p-03-cleared.png)

#### Returned through the shaft

![Returned through the shaft](visuals/p3/2026-11-24-g3p-04-returned.png)

#### Reload on the street

![Reload on the street](visuals/p3/2026-11-24-g3p-05-reload-surface.png)

#### Reload in the dungeon

![Reload in the dungeon](visuals/p3/2026-11-24-g3p-06-reload-dungeon.png)

Manifest: [`2026-11-24-g3p-manifest.json`](visuals/p3/2026-11-24-g3p-manifest.json).

## P4 — Fishing

P4 adds the Fisher's Rest loop at the north-west surface pond. The capture clears one
tutorial room, walks to the pond, holds Space to cast, presses Space at the bite, keeps
with a correct recall (activated with Enter on the focused dialog button), releases a
second fish, reloads, and finally reloads mid-cast to prove the recovery notice.

This run enabled the OS reduced-motion preference (`ui.prefersReducedMotion=1`;
`matchMedia` true) and took a 10-second frame measurement at the pond: 596 frames,
average 16.79 ms, p95 17.16 ms, max 33.74 ms (one dropped frame), 319 frames just over 16.7 ms. That is the
headless software-compositing floor recorded as P2-O1, not a fishing-specific cost.
Tab order inside the recall dialog is `answered-incorrect → release → later →
answered-correct` (wrapping inside the modal).

### Pond on the street

![Pond on the street](visuals/p4/2026-11-24-g4-02-pond-on-street.png)

### Pond entry

![Pond entry](visuals/p4/2026-11-24-g4-03-pond-idle.png)

### Charging the cast

![Charging the cast](visuals/p4/2026-11-24-g4-03b-powering.png)

### Waiting for a bite

![Waiting for a bite](visuals/p4/2026-11-24-g4-04-waiting.png)

### Bite

![Bite](visuals/p4/2026-11-24-g4-05-bite.png)

### Recall dialog

![Recall dialog](visuals/p4/2026-11-24-g4-06-recall.png)

### Catch save failure

![Catch save failure](visuals/p4/2026-11-24-g4-07-not-saved.png)

### Kept with recall

![Kept with recall](visuals/p4/2026-11-24-g4-08-kept.png)

### Released

![Released](visuals/p4/2026-11-24-g4-09-released.png)

### Left the pond

![Left the pond](visuals/p4/2026-11-24-g4-10-street.png)

### Reload after a catch

![Reload after a catch](visuals/p4/2026-11-24-g4-11-reload.png)

### Mid-cast reload recovery

![Mid-cast reload recovery](visuals/p4/2026-11-24-g4-12-mid-cast-reload.png)

Manifest: [`2026-11-24-g4-manifest.json`](visuals/p4/2026-11-24-g4-manifest.json).

### Follow-up: on-canvas interaction feedback (2026-11-24)

Playtest feedback: on a fresh save, pressing `E` at a pond appeared to do nothing,
and non-portal buildings also appeared inert. Both outcomes were only written to the
side panel, which sits below the canvas on narrow windows. The follow-up adds a canvas
toast for refusals and facade interactions. The full pond path was re-captured with the
same conditions under `g4b`; the two frames below show the changed feedback.

#### Pond before a clear: the refusal is on the canvas

![Pond before a clear](visuals/p4/2026-11-24-g4b-01a-pond-refusal.png)

#### Non-portal building: says it has no interior

![Non-portal building](visuals/p4/2026-11-24-g4b-11a-library.png)

Manifest for the full follow-up run:
[`2026-11-24-g4b-manifest.json`](visuals/p4/2026-11-24-g4b-manifest.json).

## P5 — Archaeologist review

P5 adds the 0–5 recall review. The capture clears the three tutorial rooms, presses R before the unlock to show the engine refusal, rates a pass, saves a marker for later, reloads and resumes it, discards it, re-saves and completes the same pass to show the duplicate ledger, then breaks the IndexedDB write on a never-reviewed room. It finishes by climbing to the street and opening the queue with R, which activates the subject and must close it again. The keyboard path uses the real keys `0`–`5`, `Enter`, `S`, `D`, and `Escape`; `R` opens the panel from a room and from the street.

The first run is the normal visual; the second repeats the whole path with `ui.prefersReducedMotion=1`. The 10-second frame measurement with the panel open was 558 frames, average 17.93 ms, p95 33.24 ms, max 50.56 ms in the normal run, and 601 frames, average 16.64 ms, p95 17.18 ms, max 33.38 ms in the reduced-motion run. Both sit on the headless software-compositing floor recorded as P2-O1; the panel itself adds no per-frame work.

Manifests: [`2026-11-24-g5-manifest.json`](visuals/p5/2026-11-24-g5-manifest.json) and [`2026-11-24-g5rm-manifest.json`](visuals/p5/2026-11-24-g5rm-manifest.json).

### Review locked

Boot the tutorial, clear only the root room, and press R: the engine gate refuses because 1 of 3 encounters is cleared. The toast and the error region both say so and no panel opens.

![Review locked](visuals/p5/2026-11-24-g5-01-locked.png)

### Cleared room prompt

All three rooms cleared; the room prompt now carries both `E write a note` and `R review`, and the HUD reports 3 rooms due and review mode unlocked.

![Cleared room prompt](visuals/p5/2026-11-24-g5-02-due-prompt.png)

### Review panel

The panel shows the room, pass, "Previous rating: None chosen yet", the engine self-check prompt (a text node), and six engine-labelled ratings. Focus starts on the first rating; Submit is disabled until a rating is chosen.

![Review panel](visuals/p5/2026-11-24-g5-03-review-panel.png)

### Rating selected

Pressing 5 marks the rating button pressed with a non-colour cue (`aria-pressed`) and enables Submit.

![Rating selected](visuals/p5/2026-11-24-g5-04-selected.png)

### Rated pass

Enter records the pass: XP, pass progress, and the next due date are visible without a reload. The HUD moves to 2 rooms due and keeps review mode unlocked.

![Rated pass](visuals/p5/2026-11-24-g5-05-rated.png)

### Saved for later

S saves the marker with rating 4 preselected; the copy names the saved timestamp, promises no XP, and the pass count does not move.

![Saved for later](visuals/p5/2026-11-24-g5-06-saved.png)

### Resumed after reload

After a reload, walking back and pressing R restores "Previous rating: 4 · Good" and preselects it; the live region says the saved review resumed.

![Resumed after reload](visuals/p5/2026-11-24-g5-07-resumed.png)

### Saved review discarded

D arms a confirmation, the second D discards, and the copy says nothing was scheduled; the durable marker is gone.

![Saved review discarded](visuals/p5/2026-11-24-g5-08-discarded.png)

### Resumed completion is not paid twice

Resuming the re-saved marker and completing it hits the same (room, pass): XP and review passes stay at 92 and 1, and the copy discloses that the duplicate path left the marker in place.

![Resumed completion is not paid twice](visuals/p5/2026-11-24-g5-09-duplicate.png)

### Review save failure

A simulated quota failure on the lower room shows "Not saved … the review is still open" in the panel and the HUD; XP stays 92 and the lower room pass count stays 0.

![Review save failure](visuals/p5/2026-11-24-g5-10-not-saved.png)

### Reload after review work

The final reload keeps 3/3 cleared, one review pass on the upper room, a next review date, and no marker.

![Reload after review work](visuals/p5/2026-11-24-g5-11-reload.png)

### Street review shortcut

Climbing back to the street and pressing R opens the queue for the last-studied subject: the host activates the subject for the command, the panel opens on the most urgent room, and the surface HUD stays visible.

![Street review shortcut](visuals/p5/2026-11-24-g5-12-street-shortcut.png)

### Street review closed

Escape closes the street review, returns focus to the canvas, and the host calls `returnToVillage()`: active subject null and no study session left open (K-15).

![Street review closed](visuals/p5/2026-11-24-g5-13-street-closed.png)

### Reduced-motion re-run (2026-11-24)

The whole path repeated with `matchMedia('(prefers-reduced-motion: reduce)')` true. Same frame names under the `g5rm` prefix; the panel itself has no transitions, and camera motion snaps.

![Review locked — reduced motion](visuals/p5/2026-11-24-g5rm-01-locked.png)

![Cleared room prompt — reduced motion](visuals/p5/2026-11-24-g5rm-02-due-prompt.png)

![Review panel — reduced motion](visuals/p5/2026-11-24-g5rm-03-review-panel.png)

![Rating selected — reduced motion](visuals/p5/2026-11-24-g5rm-04-selected.png)

![Rated pass — reduced motion](visuals/p5/2026-11-24-g5rm-05-rated.png)

![Saved for later — reduced motion](visuals/p5/2026-11-24-g5rm-06-saved.png)

![Resumed after reload — reduced motion](visuals/p5/2026-11-24-g5rm-07-resumed.png)

![Saved review discarded — reduced motion](visuals/p5/2026-11-24-g5rm-08-discarded.png)

![Resumed completion is not paid twice — reduced motion](visuals/p5/2026-11-24-g5rm-09-duplicate.png)

![Review save failure — reduced motion](visuals/p5/2026-11-24-g5rm-10-not-saved.png)

![Reload after review work — reduced motion](visuals/p5/2026-11-24-g5rm-11-reload.png)

![Street review shortcut — reduced motion](visuals/p5/2026-11-24-g5rm-12-street-shortcut.png)

![Street review closed — reduced motion](visuals/p5/2026-11-24-g5rm-13-street-closed.png)

### Follow-up: one player figure (2026-11-24)

The P4 pond drew its own avatar — a rectangular torso with a separate circular
head and no eye — while the dungeon and the street drew the capsule figure. The
pond now calls the same `drawPlayerFigure` (`src/render/playerFigure.ts`) at the
world body size, so the character does not change when the learner walks from the
shore into a dungeon. The full `--fishing` run is kept under the `g5player`
prefix; the two frames below show the comparison.

#### Dungeon figure

![Dungeon figure](visuals/p5/2026-11-24-g5player-01-dungeon-entry.png)

#### Pond figure

![Pond figure](visuals/p5/2026-11-24-g5player-03-pond-idle.png)

Manifest: [`2026-11-24-g5player-manifest.json`](visuals/p5/2026-11-24-g5player-manifest.json).

## P6 — Creator and demo campaign

A fresh profile seeds three synthetic subjects on the first boot. The run then uses `C`
(the host's street shortcut; the Guild Hall door opens the same overlay) to create a
fourth subject, build a nested tree, tag and cross-link rooms, and remove the subtree
through the two-step cascade confirmation. The demo subject names are authored content,
not learner data. Frames were reduced to 256-colour PNGs with the snippet at the end of
this file.

### Subject list on a seeded save

![Creator subject list](visuals/p6/2026-11-24-g6-01-subject-list.png)

### Create a subject

![Creator create form](visuals/p6/2026-11-24-g6-02-create-form.png)

### The new subject's empty tree

![Created subject](visuals/p6/2026-11-24-g6-03-created.png)

### Tree after adding root children

![Room tree](visuals/p6/2026-11-24-g6-04-tree.png)

### Cascade confirmation names all three rooms

![Cascade confirmation](visuals/p6/2026-11-24-g6-05-cascade-confirm.png)

![Cascade removed](visuals/p6/2026-11-24-g6-06-cascade-removed.png)

### Tags and a cross-link

![Tree with tags](visuals/p6/2026-11-24-g6-07-tree-tags.png)

![Cross-link edge](visuals/p6/2026-11-24-g6-08-cross-link.png)

### The new portal on the street

![New portal on the street](visuals/p6/2026-11-24-g6-09-street-portal.png)

### Refusals are visible and non-destructive

![Duplicate-name refusal](visuals/p6/2026-11-24-g6-10-refusal.png)

![Rejected graph write](visuals/p6/2026-11-24-g6-11-not-saved.png)

### Keyboard-only create, add rooms, and entry

![Keyboard-only Creator](visuals/p6/2026-11-24-g6-12-keyboard-create.png)

![Keyboard-only portal entry](visuals/p6/2026-11-24-g6-13-keyboard-enter.png)

The keyboard segment used real WebDriver key events only: `C` opened the panel, Tab
reached the create form (9 tabs), typing filled name and root topic, Enter created,
Tab reached the topics textarea, Enter added two rooms, Escape closed and returned
focus to `#game`, then `D` walked to the new portal and `E` entered its dungeon.

### Reduced-motion run (2026-11-24)

`matchMedia('(prefers-reduced-motion: reduce)')` true, same seed. The Creator panel has
no animation; the underlying street camera snaps instead of easing.

![Creator subject list — reduced motion](visuals/p6/2026-11-24-g6rm-01-subject-list.png)

![Creator panel — reduced motion](visuals/p6/2026-11-24-g6rm-02-reduced-motion.png)

Manifests: [`2026-11-24-g6-manifest.json`](visuals/p6/2026-11-24-g6-manifest.json),
[`2026-11-24-g6rm-manifest.json`](visuals/p6/2026-11-24-g6rm-manifest.json).

## P7 — Village services and interiors

Captured 2026-11-24 from the real app over WebDriver. The run clears all three tutorial
rooms, collects the root artifact, returns to the street, and opens every service. The
Library desk hands a due room to the P5 panel with the keyboard; the Workshop write is
rejected once and then retried with Enter, and the equipped item survives a reload. The
reduced-motion run repeats the path with `ui.prefersReducedMotion=1`.

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p7 \
  --prefix 2026-11-24-g7 --services
```

### A villager speaks, and a second press advances the engine cursor

![Villager dialogue](visuals/p7/2026-11-24-g7-01-villager.png)

![Villager second line](visuals/p7/2026-11-24-g7-02-villager-second-line.png)

### The Library: review desk, archive, and collected notes

![Library](visuals/p7/2026-11-24-g7-03-library.png)

### The Library hands a due room to the P5 review, keyboard-only

![Review from the Library](visuals/p7/2026-11-24-g7-04-library-review.png)

![Rated from the Library](visuals/p7/2026-11-24-g7-05-library-review-rated.png)

![Library review closed](visuals/p7/2026-11-24-g7-06-library-review-closed.png)

### The Fish Stand is visibly display-only

![Fish Stand](visuals/p7/2026-11-24-g7-07-fish-stand.png)

### Workshop: a rejected write, then a keyboard equip

![Workshop inventory](visuals/p7/2026-11-24-g7-08-workshop.png)

![Workshop not saved](visuals/p7/2026-11-24-g7-09-workshop-not-saved.png)

![Workshop equipped](visuals/p7/2026-11-24-g7-10-workshop-equipped.png)

### Trophy Hall and Guild Hall

![Trophy Hall](visuals/p7/2026-11-24-g7-11-trophy-hall.png)

![Guild Hall](visuals/p7/2026-11-24-g7-12-guild-hall.png)

### Equipment survives a reload

![Workshop after reload](visuals/p7/2026-11-24-g7-13-workshop-reload.png)

### Reduced motion

![Villager dialogue — reduced motion](visuals/p7/2026-11-24-g7rm-01-villager.png)

![Library — reduced motion](visuals/p7/2026-11-24-g7rm-03-library.png)

![Review from the Library — reduced motion](visuals/p7/2026-11-24-g7rm-04-library-review.png)

![Workshop — reduced motion](visuals/p7/2026-11-24-g7rm-09-workshop-not-saved.png)

![Guild Hall — reduced motion](visuals/p7/2026-11-24-g7rm-12-guild-hall.png)

Manifests: [`2026-11-24-g7-manifest.json`](visuals/p7/2026-11-24-g7-manifest.json),
[`2026-11-24-g7rm-manifest.json`](visuals/p7/2026-11-24-g7rm-manifest.json).

## P8 — Journal, assistance, and settings

Captured 2026-11-24 from the real app over WebDriver. The run clears all three tutorial
rooms, keeps the three demo subjects, seeds one gear item, reloads, and opens the journal
with `J`. It captures the overview, subjects, records, assistance, and settings, switches
to large text and assistance off, reloads to prove both persisted, enters a subject from
the journal's own Enter button, then clears the save for the fresh-save zero state. The
reduced-motion run repeats the path with `ui.prefersReducedMotion=1`.

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p8 \
  --prefix 2026-11-24-g8 --journal
```

### Overview, subjects, and records

![Journal overview](visuals/p8/2026-11-24-g8-01-journal-overview.png)

![Journal subjects](visuals/p8/2026-11-24-g8-02-journal-subjects.png)

![Journal records](visuals/p8/2026-11-24-g8-03-journal-records.png)

### Engine-ranked assistance and the settings section

![Journal assistance](visuals/p8/2026-11-24-g8-04-journal-assistance.png)

![Journal settings](visuals/p8/2026-11-24-g8-05-journal-settings.png)

### Large text and assistance off apply immediately

![Large text applied](visuals/p8/2026-11-24-g8-06-journal-large-text.png)

![Assistance mode off](visuals/p8/2026-11-24-g8-07-journal-assistance-off.png)

### Settings survive a reload, and Enter opens a subject

![Settings after reload](visuals/p8/2026-11-24-g8-08-journal-settings-persisted.png)

![Entered from the journal](visuals/p8/2026-11-24-g8-09-journal-entry.png)

### Fresh save: three demo subjects, zero records

![Journal on a fresh save](visuals/p8/2026-11-24-g8-10-journal-empty.png)

![Fresh-save records](visuals/p8/2026-11-24-g8-11-journal-empty-records.png)

### Reduced motion

![Journal overview — reduced motion](visuals/p8/2026-11-24-g8rm-01-journal-overview.png)

![Journal assistance — reduced motion](visuals/p8/2026-11-24-g8rm-04-journal-assistance.png)

![Journal settings — reduced motion](visuals/p8/2026-11-24-g8rm-05-journal-settings.png)

![Large text — reduced motion](visuals/p8/2026-11-24-g8rm-06-journal-large-text.png)

Manifests: [`2026-11-24-g8-manifest.json`](visuals/p8/2026-11-24-g8-manifest.json),
[`2026-11-24-g8rm-manifest.json`](visuals/p8/2026-11-24-g8rm-manifest.json),
[`2026-11-24-g8b-manifest.json`](visuals/p8/2026-11-24-g8b-manifest.json).

### Controls live behind a help button and the `?` key

![Controls help](visuals/p8/2026-11-24-g8b-01-controls-help.png)

![Controls closed](visuals/p8/2026-11-24-g8b-02-controls-closed.png)

![Controls opened with ?](visuals/p8/2026-11-24-g8b-03-controls-question.png)

Manifest: [`2026-11-24-g8b-manifest.json`](visuals/p8/2026-11-24-g8b-manifest.json).

### Room outlines break where a corridor enters

![Root room opening](visuals/p8/2026-11-24-g8c-01-root-opening.png)

![Lower room opening](visuals/p8/2026-11-24-g8c-02-lower-opening.png)

Manifest: [`2026-11-24-g8c-manifest.json`](visuals/p8/2026-11-24-g8c-manifest.json).

## P9 — Onboarding, save portability, and touch

Captured 2026-11-24 from the real app over WebDriver. The same run first proves the
keyboard path (focus starts on Continue, Tab/Shift+Tab stay inside the title, Enter starts
the game, `d` walks, `j`/Escape open and close the journal), then switches to a 390×844
DPR-2 phone viewport. It clears the save, offers the three archetypes, refuses a hostile
bundle, enables the touch layout, walks and enters the tutorial with pointer events,
clears a room through the note form a tap opens, injects one 53-byte attachment, exports,
clears the save, imports the captured bundle, and confirms cleared rooms, XP, and the
attachment survive. It clears the other two tutorial rooms with the touch pad and action button, opens the
journal and the review through the progress sheet, then walks touch-only to the pond,
charges a cast, hooks a bite, answers the recall, and keeps the fish. The reduced-motion run repeats the path with
`ui.prefersReducedMotion=1`.

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p9 \
  --prefix 2026-11-24-g9 --mobile
```

The `--mobile` mode is an alias for `--shell`. It uses WebDriver BiDi
`browsingContext.setViewport` because headless Firefox clamps its window to 500 CSS px
wide; the app itself gets no test hook.

### Title and onboarding

![Title — desktop](visuals/p9/2026-11-24-g9-01-title-desktop.png)

![Title — phone viewport](visuals/p9/2026-11-24-g9-02-title-mobile.png)

![Archetype chosen](visuals/p9/2026-11-24-g9-03-archetype.png)

### A save file is untrusted input

![Import refused](visuals/p9/2026-11-24-g9-04-import-error.png)

The version-2 bundle is refused with the exact reason; the stored save is unchanged and
the title is still usable.

### Touch controls over a full-viewport world

![Touch controls on the street](visuals/p9/2026-11-24-g9-05-touch-street.png)

![Touch controls in the dungeon](visuals/p9/2026-11-24-g9-07-touch-dungeon.png)

![Touch controls at the pond](visuals/p9/2026-11-24-g9-09-touch-pond.png)

![Touch cast charged](visuals/p9/2026-11-24-g9-10-touch-cast.png)

![Touch-only catch kept](visuals/p9/2026-11-24-g9-10b-touch-kept.png)

Every button is at least 44 px and feeds the same `IntentState` as the keyboard. The
action label follows the context: Enter, Note, Cast, Release, Reel, Keep.

### Responsive progress sheet

![Responsive progress sheet](visuals/p9/2026-11-24-g9-06-responsive-hud.png)

### Touch-only journal and review

![Touch-only journal](visuals/p9/2026-11-24-g9-07b-touch-journal.png)

![Touch-only review](visuals/p9/2026-11-24-g9-07c-touch-review.png)

The progress sheet carries Journal, Review, and Creator buttons, so the touch-only path
does not depend on the `J`/`R`/`C` keys. The review opens after all three rooms are
cleared with the same touch pad and action button.

### Export → clear → import

![Imported save restored](visuals/p9/2026-11-24-g9-08-import-roundtrip.png)

The captured bundle carries a 53-byte attachment as base64. After clearing the save
(0 cleared rooms, 0 XP), importing restores 3 cleared rooms, 86 XP, and the same bytes.

### Reduced motion

![Title — reduced motion](visuals/p9/2026-11-24-g9rm-01-title-desktop.png)

![Touch street — reduced motion](visuals/p9/2026-11-24-g9rm-05-touch-street.png)

![Touch dungeon — reduced motion](visuals/p9/2026-11-24-g9rm-07-touch-dungeon.png)

Manifests: [`2026-11-24-g9-manifest.json`](visuals/p9/2026-11-24-g9-manifest.json),
[`2026-11-24-g9rm-manifest.json`](visuals/p9/2026-11-24-g9rm-manifest.json).

The manifests record the keyboard focus result, the 390×844 → 844×390 → 390×844
orientation check, and the export/import counts. Frames were reduced to 256-colour PNGs;
the full 26-frame set (13 per run) stays in `visuals/p9/`.

## P10 — Local polish, performance, and the final record

Captured 2026-11-25 from the real app over WebDriver. The run is split by mode so each
condition has its own manifest: the first-ten-minutes path (`--p10`), performance traces
(`--perf`), the previous phase modes, a reduced-motion journal run, and a production-build
boot (`--smoke`). The `--p10` manifest also records the BiDi console subscription, layout
overlaps, minimum target sizes, focus, large text, the phone sheet, and the durable-state
size.

### First-ten-minutes path

![Title](visuals/p10/2026-11-25-g10play-01-title.png)

![Village street](visuals/p10/2026-11-25-g10play-02-street.png)

![Progress panel](visuals/p10/2026-11-25-g10play-03-progress-panel.png)

![Three rooms cleared](visuals/p10/2026-11-25-g10play-04-cleared.png)

![Review passed](visuals/p10/2026-11-25-g10play-05-review.png)

![Catch kept](visuals/p10/2026-11-25-g10play-07-fishing.png)

![Journal](visuals/p10/2026-11-25-g10play-08-journal.png)

![Export, clear, import](visuals/p10/2026-11-25-g10play-09-import-roundtrip.png)

The path finished with 0 console errors or warnings. The export bundle carried a 54-byte
attachment; after clear and import, XP 97 and the one fish were unchanged. The state JSON
was 26,021 bytes before and after.

### Layout, large text, and the phone sheet

![Large text](visuals/p10/2026-11-25-g10play-10-large-text.png)

![Phone progress sheet](visuals/p10/2026-11-25-g10play-11-phone-sheet.png)

At 20 px text and 390×844, the page has no horizontal overflow, no dialog clips, zero
visible targets under 44 px, and no HUD overlap. The sheet hides the touch pad rather than
leaving live buttons under it.

### Creator and the new subject

![Creator subject](visuals/p10/2026-11-25-g10play-12-creator.png)

![New subject room](visuals/p10/2026-11-25-g10play-13-new-subject.png)

### Performance traces

The traces are 10-second `requestAnimationFrame` windows at 1280×800 in headless Firefox
with software compositing. The `about:blank` baseline is recorded in the manifest; the
Pond, Library, and Journal match it after the P10 repaint pause, while the canvas-heavy
Street and dungeon rooms carry the accepted P2-O1 exception.

![Dungeon room trace](visuals/p10/2026-11-25-g10perf-01-dungeon-room.png)

![Pond trace](visuals/p10/2026-11-25-g10perf-04-pond.png)

![Library trace](visuals/p10/2026-11-25-g10perf-05-library.png)

![Journal trace](visuals/p10/2026-11-25-g10perf-06-journal.png)

### Every mode

The previous mode captures were re-run on the final tree: default dungeon + note loop,
surface, fishing, review, Creator, services, journal, title/mobile shell, and the
reduced-motion journal. Representative frames and all mode-specific facts are in the rows
below and in each manifest.

| Date | Gate | Commit | Frame | File | What it shows |
|---|---|---|---|---|---|
| 2026-11-25 | G10 playtest | uncommitted | Title | [`2026-11-25-g10play-01-title.png`](visuals/p10/2026-11-25-g10play-01-title.png) | focus=title-continue (true); title=true; targets under 44px=0; consoles subscribed=true; status="3 subjects saved · quest: intro · archetype: not chosen" |
| 2026-11-25 | G10 playtest | uncommitted | Village street | [`2026-11-25-g10play-02-street.png`](visuals/p10/2026-11-25-g10play-02-street.png) | archetype scholar=true; focus=game; overlaps=none; targets under 44px=0; page scroll=false |
| 2026-11-25 | G10 playtest | uncommitted | Progress panel | [`2026-11-25-g10play-03-progress-panel.png`](visuals/p10/2026-11-25-g10play-03-progress-panel.png) | open=true; overlaps=none; touch hidden=true; targets under 44px=0 |
| 2026-11-25 | G10 playtest | uncommitted | Three rooms cleared | [`2026-11-25-g10play-04-cleared.png`](visuals/p10/2026-11-25-g10play-04-cleared.png) | cleared=3/3; lower=304ms; climb=3569ms; xp=86; prompt="E write a note — The Map & Beyond<br>R review — The Map & Beyond" |
| 2026-11-25 | G10 playtest | uncommitted | Review passed | [`2026-11-25-g10play-05-review.png`](visuals/p10/2026-11-25-g10play-05-review.png) | openedIn=11ms; passes=1; XP=92; next review set=true |
| 2026-11-25 | G10 playtest | uncommitted | Catch kept | [`2026-11-25-g10play-07-fishing.png`](visuals/p10/2026-11-25-g10play-07-fishing.png) | bite=7902ms; fish 0→1; xp=97; world=fishing |
| 2026-11-25 | G10 playtest | uncommitted | Journal | [`2026-11-25-g10play-08-journal.png`](visuals/p10/2026-11-25-g10play-08-journal.png) | openedIn=10ms; focus=journal-panel-title; subjects in journal=4; overlaps=none; horizontal clip=false |
| 2026-11-25 | G10 playtest | uncommitted | Export → clear → import | [`2026-11-25-g10play-09-import-roundtrip.png`](visuals/p10/2026-11-25-g10play-09-import-roundtrip.png) | bundle v1; attachment base64=true; cleared 0→0; XP 97→97; fish 1→1; emptied save cleared=0; state JSON 26015→26015 bytes |
| 2026-11-25 | G10 playtest | uncommitted | Large text | [`2026-11-25-g10play-10-large-text.png`](visuals/p10/2026-11-25-g10play-10-large-text.png) | text scale=large; page overflowX=false; clipped dialogs=none; targets under 44px=0 |
| 2026-11-25 | G10 playtest | uncommitted | Phone progress sheet | [`2026-11-25-g10play-11-phone-sheet.png`](visuals/p10/2026-11-25-g10play-11-phone-sheet.png) | viewport=390×844; sheet open=true; touch hidden=true; overlaps=none; page overflowX=false; targets under 44px=0 |
| 2026-11-25 | G10 playtest | uncommitted | Creator subject | [`2026-11-25-g10play-12-creator.png`](visuals/p10/2026-11-25-g10play-12-creator.png) | subjects=5; rooms=4; overlaps=none; targets under 44px=0 |
| 2026-11-25 | G10 playtest | uncommitted | New subject room | [`2026-11-25-g10play-13-new-subject.png`](visuals/p10/2026-11-25-g10play-13-new-subject.png) | cleared=1; rooms=4; world=dungeon; created subject active=true |
| 2026-11-25 | G10 performance | uncommitted | Dungeon room | [`2026-11-25-g10perf-01-dungeon-room.png`](visuals/p10/2026-11-25-g10perf-01-dungeon-room.png) | avg=23.93ms p95=33.48ms max=34.24ms over16.7=305/419 |
| 2026-11-25 | G10 performance | uncommitted | Lower dungeon room | [`2026-11-25-g10perf-02-lower-room.png`](visuals/p10/2026-11-25-g10perf-02-lower-room.png) | avg=25.02ms p95=33.78ms max=49.98ms over16.7=298/400 |
| 2026-11-25 | G10 performance | uncommitted | Street | [`2026-11-25-g10perf-03-street.png`](visuals/p10/2026-11-25-g10perf-03-street.png) | avg=30.12ms p95=33.84ms max=50.4ms over16.7=303/333 |
| 2026-11-25 | G10 performance | uncommitted | Pond | [`2026-11-25-g10perf-04-pond.png`](visuals/p10/2026-11-25-g10perf-04-pond.png) | avg=16.62ms p95=17.12ms max=17.54ms over16.7=330/602 |
| 2026-11-25 | G10 performance | uncommitted | Library service | [`2026-11-25-g10perf-05-library.png`](visuals/p10/2026-11-25-g10perf-05-library.png) | avg=16.64ms p95=17.1ms max=17.14ms over16.7=343/601 |
| 2026-11-25 | G10 performance | uncommitted | Journal | [`2026-11-25-g10perf-06-journal.png`](visuals/p10/2026-11-25-g10perf-06-journal.png) | avg=16.64ms p95=17.12ms max=17.42ms over16.7=339/601 |
| 2026-11-25 | G10 shell | uncommitted | Title — desktop | [`2026-11-25-g10shell-01-title-desktop.png`](visuals/p10/2026-11-25-g10shell-01-title-desktop.png) | title=true; viewport=1280×800; focus=title-continue; touch=off; no page scroll=true; status="3 subjects saved · quest: intro · archetype: not chosen" |
| 2026-11-25 | G10 shell | uncommitted | Title — phone viewport | [`2026-11-25-g10shell-02-title-mobile.png`](visuals/p10/2026-11-25-g10shell-02-title-mobile.png) | title=true; viewport=390×844; no horizontal overflow=true; archetype buttons=3; status="3 subjects saved · quest: intro · archetype: not chosen" |
| 2026-11-25 | G10 shell | uncommitted | Archetype chosen | [`2026-11-25-g10shell-03-archetype.png`](visuals/p10/2026-11-25-g10shell-03-archetype.png) | offered=scholar,cartographer,archivist; chosen=scholar; engine status="3 subjects saved · quest: intro · archetype: scholar"; archetype panel hidden=true |
| 2026-11-25 | G10 shell | uncommitted | Import refused | [`2026-11-25-g10shell-04-import-error.png`](visuals/p10/2026-11-25-g10shell-04-import-error.png) | panel=true; error="Unsupported bundle version 2; expected 1."; save unchanged=true; title still usable=true |
| 2026-11-25 | G10 shell | uncommitted | Touch controls on the street | [`2026-11-25-g10shell-05-touch-street.png`](visuals/p10/2026-11-25-g10shell-05-touch-street.png) | touch=true; layout=on (on); action="Enter"; viewport=390×844; no page scroll=true |
| 2026-11-25 | G10 shell | uncommitted | Responsive progress sheet | [`2026-11-25-g10shell-06-responsive-hud.png`](visuals/p10/2026-11-25-g10shell-06-responsive-hud.png) | open=true; sheet radius=12px; summary="Location<br>Village street<br>Phase<br>creator<br>Subject portals<br>3 portals<br>Rooms cleared (all portals)<br>0 / 13<br>XP (all subjects)<br>0<br>Nearby<br>Training Grounds<br>Journal<br>J — subjects, records, assistance, settings"; touch still visible=false |
| 2026-11-25 | G10 shell | uncommitted | Touch controls in the dungeon | [`2026-11-25-g10shell-07-touch-dungeon.png`](visuals/p10/2026-11-25-g10shell-07-touch-dungeon.png) | touch=true; action="Note"; current room="The Note"; buttons=6; min target=44px |
| 2026-11-25 | G10 shell | uncommitted | Touch-only journal entry | [`2026-11-25-g10shell-07b-touch-journal.png`](visuals/p10/2026-11-25-g10shell-07b-touch-journal.png) | opened=5ms via Progress → Journal; focus=journal-panel-title; title hidden=true |
| 2026-11-25 | G10 shell | uncommitted | Touch-only review entry | [`2026-11-25-g10shell-07c-touch-review.png`](visuals/p10/2026-11-25-g10shell-07c-touch-review.png) | opened=8ms via Progress → Review after three touch clears; cleared=3; room="Review “The Map & Beyond”" |
| 2026-11-25 | G10 shell | uncommitted | Export → clear → import | [`2026-11-25-g10shell-08-import-roundtrip.png`](visuals/p10/2026-11-25-g10shell-08-import-roundtrip.png) | bundle v1/knowledge-dungeon-side-scroller; attachment base64=true; cleared 3→3; XP 86→86; attachment bytes=53; emptied save had cleared=0, XP=0 |
| 2026-11-25 | G10 shell | uncommitted | Touch controls at the pond | [`2026-11-25-g10shell-09-touch-pond.png`](visuals/p10/2026-11-25-g10shell-09-touch-pond.png) | touch=true; action="Cast"; cleared rooms=3; world=fishing; phase hint="Fishing at Fishing Pond in First Dungeon (Tutorial). Hold Space to charge the cast." |
| 2026-11-25 | G10 shell | uncommitted | Touch cast charged and released | [`2026-11-25-g10shell-10-touch-cast.png`](visuals/p10/2026-11-25-g10shell-10-touch-cast.png) | charging label="Release"; after release="Wait"; status="Waiting for a bite." |
| 2026-11-25 | G10 shell | uncommitted | Touch-only catch kept | [`2026-11-25-g10shell-10b-touch-kept.png`](visuals/p10/2026-11-25-g10shell-10b-touch-kept.png) | bite=1952ms; recall=665ms; kept=true; fish 0→1; xp=91; action label now="Cast" |
| 2026-11-25 | G10 surface | uncommitted | Village street | [`2026-11-25-g10surface-01-street.png`](visuals/p10/2026-11-25-g10surface-01-street.png) | world=village; subjects=3; nearby=Training Grounds |
| 2026-11-25 | G10 surface | uncommitted | Portal entry | [`2026-11-25-g10surface-02-dungeon-entry.png`](visuals/p10/2026-11-25-g10surface-02-dungeon-entry.png) | shownIn=34ms; world=dungeon; active=true; subjects=4; rooms=3 |
| 2026-11-25 | G10 surface | uncommitted | Room cleared | [`2026-11-25-g10surface-03-cleared.png`](visuals/p10/2026-11-25-g10surface-03-cleared.png) | world=dungeon; xp=28; cleared=1; active session=true |
| 2026-11-25 | G10 surface | uncommitted | Returned through the shaft | [`2026-11-25-g10surface-04-returned.png`](visuals/p10/2026-11-25-g10surface-04-returned.png) | climb=4167ms; world=village; activeSubject=null; active session=false; sessions=4; portals label=true |
| 2026-11-25 | G10 surface | uncommitted | Reload on the street | [`2026-11-25-g10surface-05-reload-surface.png`](visuals/p10/2026-11-25-g10surface-05-reload-surface.png) | world=village; subjects=4; activeSubject=null; portal row=true |
| 2026-11-25 | G10 surface | uncommitted | Reload in the dungeon | [`2026-11-25-g10surface-06-reload-dungeon.png`](visuals/p10/2026-11-25-g10surface-06-reload-dungeon.png) | world=dungeon; active=true; rooms=3; sessions=6; summary has world=true |
| 2026-11-25 | G10 fishing | uncommitted | Pond before a clear | [`2026-11-25-g10fish-01a-pond-refusal.png`](visuals/p10/2026-11-25-g10fish-01a-pond-refusal.png) | nearby=Fishing Pond (north-west); shownIn=43ms; canvas message="Clear a room before fishing. Kitchen Chemistry has no cleared rooms yet." |
| 2026-11-25 | G10 fishing | uncommitted | Dungeon entry | [`2026-11-25-g10fish-01-dungeon-entry.png`](visuals/p10/2026-11-25-g10fish-01-dungeon-entry.png) | world=dungeon; active session=true; rooms=3 |
| 2026-11-25 | G10 fishing | uncommitted | Pond on the street | [`2026-11-25-g10fish-02-pond-on-street.png`](visuals/p10/2026-11-25-g10fish-02-pond-on-street.png) | cleared=1; nearby=Fishing Pond (north-west); prompt=Near Fishing Pond. Press E to fish. |
| 2026-11-25 | G10 fishing | uncommitted | Pond entry | [`2026-11-25-g10fish-03-pond-idle.png`](visuals/p10/2026-11-25-g10fish-03-pond-idle.png) | shownIn=13ms; world=fishing; subject=host-resolved; xp=28; fish=0; reduced-motion=false; frame avg=16.72ms p95=17.16ms max=50.3ms over16.7=316/599 |
| 2026-11-25 | G10 fishing | uncommitted | Charging the cast | [`2026-11-25-g10fish-03b-powering.png`](visuals/p10/2026-11-25-g10fish-03b-powering.png) | phase=powering; prompt=Fishing at Fishing Pond in First Dungeon (Tutorial). Hold Space to charge the cast. |
| 2026-11-25 | G10 fishing | uncommitted | Cast waiting | [`2026-11-25-g10fish-04-waiting.png`](visuals/p10/2026-11-25-g10fish-04-waiting.png) | phase=waiting; prompt=Waiting for a bite. |
| 2026-11-25 | G10 fishing | uncommitted | Bite | [`2026-11-25-g10fish-05-bite.png`](visuals/p10/2026-11-25-g10fish-05-bite.png) | shownIn=8372ms; screen-reader message present=true |
| 2026-11-25 | G10 fishing | uncommitted | Recall dialog | [`2026-11-25-g10fish-06-recall.png`](visuals/p10/2026-11-25-g10fish-06-recall.png) | shownIn=671ms; focus=fishing-answered-correct; question shown=true; collection row=0 fish |
| 2026-11-25 | G10 fishing | uncommitted | Catch save failure | [`2026-11-25-g10fish-07-not-saved.png`](visuals/p10/2026-11-25-g10fish-07-not-saved.png) | shownIn=12ms; error=true; dialog still open=true; fish 0→0 |
| 2026-11-25 | G10 fishing | uncommitted | Kept with recall | [`2026-11-25-g10fish-08-kept.png`](visuals/p10/2026-11-25-g10fish-08-kept.png) | shownIn=14ms; fish=1; xp=33; focus=game; message="Kept. 5 XP gained. Collection: 1." |
| 2026-11-25 | G10 fishing | uncommitted | Released | [`2026-11-25-g10fish-09-released.png`](visuals/p10/2026-11-25-g10fish-09-released.png) | fish=1 (unchanged from 1); focus=game; message="Released. Nothing was added to the collection." |
| 2026-11-25 | G10 fishing | uncommitted | Left the pond | [`2026-11-25-g10fish-10-street.png`](visuals/p10/2026-11-25-g10fish-10-street.png) | shownIn=36ms; world=village; fish=1 |
| 2026-11-25 | G10 fishing | uncommitted | Reload after a catch | [`2026-11-25-g10fish-11-reload.png`](visuals/p10/2026-11-25-g10fish-11-reload.png) | fish=1; xp=33; world=village |
| 2026-11-25 | G10 fishing | uncommitted | Non-portal building | [`2026-11-25-g10fish-11a-library.png`](visuals/p10/2026-11-25-g10fish-11a-library.png) | nearby=; canvas message="" |
| 2026-11-25 | G10 fishing | uncommitted | Mid-cast reload recovery | [`2026-11-25-g10fish-12-mid-cast-reload.png`](visuals/p10/2026-11-25-g10fish-12-mid-cast-reload.png) | world=village; notice=false; fish=1 |
| 2026-11-25 | G10 review | uncommitted | Review locked | [`2026-11-25-g10review-01-locked.png`](visuals/p10/2026-11-25-g10review-01-locked.png) | shownIn=33ms; cleared=1/3; toast says locked=true; panel stayed closed=true; prompt offers R=true |
| 2026-11-25 | G10 review | uncommitted | Cleared room prompt | [`2026-11-25-g10review-02-due-prompt.png`](visuals/p10/2026-11-25-g10review-02-due-prompt.png) | cleared=3/3; climb=3619ms; prompt shows E and R=true; HUD reviews due="3 rooms" |
| 2026-11-25 | G10 review | uncommitted | Review panel | [`2026-11-25-g10review-03-review-panel.png`](visuals/p10/2026-11-25-g10review-03-review-panel.png) | shownIn=10ms; focus=review-rating-0; rating buttons=6; prompt shown=true; previous row="Previous rating None chosen yet"; frame avg=16.65ms p95=17.12ms max=17.26ms over16.7=341/601 |
| 2026-11-25 | G10 review | uncommitted | Rating selected | [`2026-11-25-g10review-04-selected.png`](visuals/p10/2026-11-25-g10review-04-selected.png) | pressed=review-rating-5; submit enabled=true |
| 2026-11-25 | G10 review | uncommitted | Rated pass | [`2026-11-25-g10review-05-rated.png`](visuals/p10/2026-11-25-g10review-05-rated.png) | shownIn=5ms; XP copy=true; pass progress=true; next review copy=true; passCount tut-map=1; reviewPasses=1; focus=review-close |
| 2026-11-25 | G10 review | uncommitted | Saved for later | [`2026-11-25-g10review-06-saved.png`](visuals/p10/2026-11-25-g10review-06-saved.png) | shownIn=4ms; marker=tut-map; no XP promise=true; passCount unchanged=1; focus=review-rating-4 |
| 2026-11-25 | G10 review | uncommitted | Resumed after reload | [`2026-11-25-g10review-07-resumed.png`](visuals/p10/2026-11-25-g10review-07-resumed.png) | marker after reload=tut-map; previous rating restored=true; focus=review-rating-4 |
| 2026-11-25 | G10 review | uncommitted | Saved review discarded | [`2026-11-25-g10review-08-discarded.png`](visuals/p10/2026-11-25-g10review-08-discarded.png) | armed copy=true; shownIn=6ms; marker=null; result="Saved review discarded. Nothing was scheduled." |
| 2026-11-25 | G10 review | uncommitted | Resumed completion is not paid twice | [`2026-11-25-g10review-09-duplicate.png`](visuals/p10/2026-11-25-g10review-09-duplicate.png) | shownIn=15ms; marker left in place disclosed=true; duplicate copy=true; xp 92→92; reviewPasses 1→1 |
| 2026-11-25 | G10 review | uncommitted | Review save failure | [`2026-11-25-g10review-11-not-saved.png`](visuals/p10/2026-11-25-g10review-11-not-saved.png) | descend=2848ms; shownIn=5ms; error says not saved=true; panel open=true; submit enabled after failure=true; xp 92→92; passCount tut-tools 0→0 |
| 2026-11-25 | G10 review | uncommitted | Reload after review work | [`2026-11-25-g10review-11-reload.png`](visuals/p10/2026-11-25-g10review-11-reload.png) | world=dungeon; cleared=3/3; reviewPasses=1; passCounts={"tut-note":0,"tut-tools":0,"tut-map":1}; nextReview set=true; marker=null; focus=game |
| 2026-11-25 | G10 review | uncommitted | Street review shortcut | [`2026-11-25-g10review-12-street-shortcut.png`](visuals/p10/2026-11-25-g10review-12-street-shortcut.png) | street=3814ms; panel=12ms; focus=review-rating-0; previous="Previous rating None chosen yet"; subject activated for the command=true |
| 2026-11-25 | G10 review | uncommitted | Street review closed | [`2026-11-25-g10review-13-street-closed.png`](visuals/p10/2026-11-25-g10review-13-street-closed.png) | world=village; activeSubject=null; study session open=false; focus=game; reviews due still listed=true |
| 2026-11-25 | G10 Creator | uncommitted | Creator subject list | [`2026-11-25-g10creator-01-subject-list.png`](visuals/p10/2026-11-25-g10creator-01-subject-list.png) | seededIn=61ms; openIn=133ms; subjects=3; portals row="3 portals"; listed=3; focus=H2 |
| 2026-11-25 | G10 Creator | uncommitted | Creator create form | [`2026-11-25-g10creator-02-create-form.png`](visuals/p10/2026-11-25-g10creator-02-create-form.png) | name="Tide Pools"; root="Rock Pool Ecology"; subjects before create=3 |
| 2026-11-25 | G10 Creator | uncommitted | Created subject | [`2026-11-25-g10creator-03-created.png`](visuals/p10/2026-11-25-g10creator-03-created.png) | shownIn=50ms; subjects 3→4; rooms=1; active study=true; result=true |
| 2026-11-25 | G10 Creator | uncommitted | Room tree | [`2026-11-25-g10creator-04-tree.png`](visuals/p10/2026-11-25-g10creator-04-tree.png) | addedIn=40ms; rooms=4; order=◆ root Rock Pool Ecology > ↳ Tide Zones > ↳ Pool Life > ↳ Salinity |
| 2026-11-25 | G10 Creator | uncommitted | Cascade confirmation | [`2026-11-25-g10creator-05-cascade-confirm.png`](visuals/p10/2026-11-25-g10creator-05-cascade-confirm.png) | rooms=6; confirm="Confirm remove: 3 rooms"; names cascade=true; no write yet=true |
| 2026-11-25 | G10 Creator | uncommitted | Cascade removed | [`2026-11-25-g10creator-06-cascade-removed.png`](visuals/p10/2026-11-25-g10creator-06-cascade-removed.png) | removedIn=23ms; rooms=3; result=true |
| 2026-11-25 | G10 Creator | uncommitted | Tree with tags | [`2026-11-25-g10creator-07-tree-tags.png`](visuals/p10/2026-11-25-g10creator-07-tree-tags.png) | tagsIn=33ms; tags="water, observation"; rooms=3 |
| 2026-11-25 | G10 Creator | uncommitted | Cross-link edge | [`2026-11-25-g10creator-08-cross-link.png`](visuals/p10/2026-11-25-g10creator-08-cross-link.png) | linkIn=39ms; edges=["Pool Life → Salinity (related)"] |
| 2026-11-25 | G10 Creator | uncommitted | New portal on the street | [`2026-11-25-g10creator-09-street-portal.png`](visuals/p10/2026-11-25-g10creator-09-street-portal.png) | closedIn=50ms; focus returned to #game=true; tab reached=subject-edit-demo-rivers; subjects=4; portals row="4 portals"; walk found Tide Pools=true; nearby="Tide Pools"; activeStudy=false |
| 2026-11-25 | G10 Creator | uncommitted | Duplicate-name refusal | [`2026-11-25-g10creator-10-refusal.png`](visuals/p10/2026-11-25-g10creator-10-refusal.png) | shownIn=22ms; refusal=true; subjects still=4; error="Refused: a subject named “Tide Pools” already exists." |
| 2026-11-25 | G10 Creator | uncommitted | Rejected graph write | [`2026-11-25-g10creator-11-not-saved.png`](visuals/p10/2026-11-25-g10creator-11-not-saved.png) | shownIn=8ms; not saved=true; tree intact=true; tags still "quota-test"; subjects 4→4 |
| 2026-11-25 | G10 Creator | uncommitted | Keyboard-only Creator | [`2026-11-25-g10creator-12-keyboard-create.png`](visuals/p10/2026-11-25-g10creator-12-keyboard-create.png) | openIn=5ms; tabs to name=9; create focus=create-submit; createdIn=5ms; subjects 4→5; tabs to topics=3, to add=1; treeIn=4ms; rooms=3 |
| 2026-11-25 | G10 Creator | uncommitted | Keyboard-only portal entry | [`2026-11-25-g10creator-13-keyboard-enter.png`](visuals/p10/2026-11-25-g10creator-13-keyboard-enter.png) | escape focus returned=true; walk found=true; enteredIn=19ms; summary subject row=true; world=dungeon · scribe |
| 2026-11-25 | G10 services | uncommitted | Villager dialogue | [`2026-11-25-g10services-01-villager.png`](visuals/p10/2026-11-25-g10services-01-villager.png) | openedIn=28ms; nearby="Wandering Scholar"; focus=game; text as node=true |
| 2026-11-25 | G10 services | uncommitted | Villager cursor advanced | [`2026-11-25-g10services-02-villager-second-line.png`](visuals/p10/2026-11-25-g10services-02-villager-second-line.png) | second line differs=true; closedIn=29ms |
| 2026-11-25 | G10 services | uncommitted | Library | [`2026-11-25-g10services-03-library.png`](visuals/p10/2026-11-25-g10services-03-library.png) | walk found=true; openIn=42ms; role=dialog modal=true; review desk=true; artifact=true; notes=true; focus=service-panel-title |
| 2026-11-25 | G10 services | uncommitted | Review opened from the Library | [`2026-11-25-g10services-04-library-review.png`](visuals/p10/2026-11-25-g10services-04-library-review.png) | openIn=14ms; keyboard focus on "Review"; focus=review-rating-0; prompt shown=true; service closed=true; rating controls=6 |
| 2026-11-25 | G10 services | uncommitted | Review rated from the Library | [`2026-11-25-g10services-05-library-review-rated.png`](visuals/p10/2026-11-25-g10services-05-library-review-rated.png) | shownIn=5ms; reward copy=true; next review copy=true |
| 2026-11-25 | G10 services | uncommitted | Library review closed | [`2026-11-25-g10services-06-library-review-closed.png`](visuals/p10/2026-11-25-g10services-06-library-review-closed.png) | closedIn=32ms; world=village; activeSubject=null; study session open=false; reviewPasses total=1 |
| 2026-11-25 | G10 services | uncommitted | Fish Stand (display only) | [`2026-11-25-g10services-07-fish-stand.png`](visuals/p10/2026-11-25-g10services-07-fish-stand.png) | walk found=true; openIn=19ms; selling notice=true; buttons=1; focus=service-panel-title |
| 2026-11-25 | G10 services | uncommitted | Workshop inventory | [`2026-11-25-g10services-08-workshop.png`](visuals/p10/2026-11-25-g10services-08-workshop.png) | walk found=true; openIn=27ms; subject=true; equip button=workshop-equip-gear-mwvacoa5-6epa; inventory=3; focus=service-panel-title |
| 2026-11-25 | G10 services | uncommitted | Workshop save failure | [`2026-11-25-g10services-09-workshop-not-saved.png`](visuals/p10/2026-11-25-g10services-09-workshop-not-saved.png) | shownIn=5ms; not saved=true; panel open=true; equipped 0→0; inventory 3→3 |
| 2026-11-25 | G10 services | uncommitted | Workshop equipped | [`2026-11-25-g10services-10-workshop-equipped.png`](visuals/p10/2026-11-25-g10services-10-workshop-equipped.png) | shownIn=5ms; equipped=1; result="Equipped. The change survives a reload." |
| 2026-11-25 | G10 services | uncommitted | Trophy Hall | [`2026-11-25-g10services-11-trophy-hall.png`](visuals/p10/2026-11-25-g10services-11-trophy-hall.png) | walk found=true; openIn=18ms; badges section=true; records=true; zeroes shown=true; focus=service-panel-title |
| 2026-11-25 | G10 services | uncommitted | Guild Hall | [`2026-11-25-g10services-12-guild-hall.png`](visuals/p10/2026-11-25-g10services-12-guild-hall.png) | walk found=true; openIn=17ms; quest board=true; roster=true; creator entry=true; focus=service-panel-title |
| 2026-11-25 | G10 services | uncommitted | Equipment after reload | [`2026-11-25-g10services-13-workshop-reload.png`](visuals/p10/2026-11-25-g10services-13-workshop-reload.png) | equipped=1; walk found=false; subject=false; unequip shown=false; focus=title-continue |
| 2026-11-25 | G10 journal | uncommitted | Journal overview | [`2026-11-25-g10journal-01-journal-overview.png`](visuals/p10/2026-11-25-g10journal-01-journal-overview.png) | openIn=11ms; focus=journal-panel-title; subjects=active subject row; sections=journal-overview,journal-subjects,journal-progress,journal-badges,journal-records,journal-inventory,journal-fish,journal-due,journal-assistance,journal-settings; records=true; due=true; assistance=true; settings=true |
| 2026-11-25 | G10 journal | uncommitted | Journal subjects | [`2026-11-25-g10journal-02-journal-subjects.png`](visuals/p10/2026-11-25-g10journal-02-journal-subjects.png) | section=journal-panel-title; room counts=true; enter buttons=4 |
| 2026-11-25 | G10 journal | uncommitted | Journal records | [`2026-11-25-g10journal-03-journal-records.png`](visuals/p10/2026-11-25-g10journal-03-journal-records.png) | notes=true; active days=true; engine copy=true |
| 2026-11-25 | G10 journal | uncommitted | Journal assistance | [`2026-11-25-g10journal-04-journal-assistance.png`](visuals/p10/2026-11-25-g10journal-04-journal-assistance.png) | suggestions=6; engine reason labels=true; mode copy=true |
| 2026-11-25 | G10 journal | uncommitted | Journal settings | [`2026-11-25-g10journal-05-journal-settings.png`](visuals/p10/2026-11-25-g10journal-05-journal-settings.png) | focus=journal-panel-title; values={"reducedMotion":"system","assistance":"gentle","textScale":"normal","touch":"auto"}; local-only copy=true |
| 2026-11-25 | G10 journal | uncommitted | Large text applied | [`2026-11-25-g10journal-06-journal-large-text.png`](visuals/p10/2026-11-25-g10journal-06-journal-large-text.png) | dataset=large; value=large; same panel open=true |
| 2026-11-25 | G10 journal | uncommitted | Assistance mode off | [`2026-11-25-g10journal-07-journal-assistance-off.png`](visuals/p10/2026-11-25-g10journal-07-journal-assistance-off.png) | mode=off; off copy=true; suggestions=0 |
| 2026-11-25 | G10 journal | uncommitted | Settings after reload | [`2026-11-25-g10journal-08-journal-settings-persisted.png`](visuals/p10/2026-11-25-g10journal-08-journal-settings-persisted.png) | dataset text=large; select text=large; assistance=off; reduced motion=system; touch=auto |
| 2026-11-25 | G10 journal | uncommitted | Entered from the journal | [`2026-11-25-g10journal-09-journal-entry.png`](visuals/p10/2026-11-25-g10journal-09-journal-entry.png) | subject=demo-kitchen; enteredIn=111ms; world=dungeon; study session open=true; focus=game |
| 2026-11-25 | G10 journal | uncommitted | Journal on a fresh save | [`2026-11-25-g10journal-10-journal-empty.png`](visuals/p10/2026-11-25-g10journal-10-journal-empty.png) | subjects visible=true; active subject=true; due=true; focus=journal-panel-title |
| 2026-11-25 | G10 journal | uncommitted | Fresh-save records | [`2026-11-25-g10journal-11-journal-empty-records.png`](visuals/p10/2026-11-25-g10journal-11-journal-empty-records.png) | zero notes=true; zero fish=true; badges empty=true; fish empty=true |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Root room | [`2026-11-25-g10dungeon-01-root-room.png`](visuals/p10/2026-11-25-g10dungeon-01-root-room.png) | visits=1 |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Lower room | [`2026-11-25-g10dungeon-02-tools-room.png`](visuals/p10/2026-11-25-g10dungeon-02-tools-room.png) | visits=2 |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Upper room | [`2026-11-25-g10dungeon-03-map-room.png`](visuals/p10/2026-11-25-g10dungeon-03-map-room.png) | climb=3620ms; visits=3 |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Return to root | [`2026-11-25-g10dungeon-04-return-to-root.png`](visuals/p10/2026-11-25-g10dungeon-04-return-to-root.png) | descend=1151ms; visits=3 |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Reload | [`2026-11-25-g10dungeon-05-reload.png`](visuals/p10/2026-11-25-g10dungeon-05-reload.png) | rooms=3; sessions=5; visits=1; focus=game |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Composer | [`2026-11-25-g10dungeon-07-composer.png`](visuals/p10/2026-11-25-g10dungeon-07-composer.png) | focus=note-text; prefilled=true; prompt hidden while open=true |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Draft | [`2026-11-25-g10dungeon-08-draft.png`](visuals/p10/2026-11-25-g10dungeon-08-draft.png) | missing named=true; xp=0; cleared=0 |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Cleared | [`2026-11-25-g10dungeon-09-cleared.png`](visuals/p10/2026-11-25-g10dungeon-09-cleared.png) | xp=28; cleared=1; artifact pre starts "# Scribe Artifa"; focus=note-collect |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Composer closed | [`2026-11-25-g10dungeon-10-closed.png`](visuals/p10/2026-11-25-g10dungeon-10-closed.png) | artifacts=1; focus=game; panel hidden=true |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Reload after clear | [`2026-11-25-g10dungeon-11-reload.png`](visuals/p10/2026-11-25-g10dungeon-11-reload.png) | xp=28; cleared=1; artifacts=1; visits=1; cleared label=true |
| 2026-11-25 | G10 dungeon + note loop | uncommitted | Save failure | [`2026-11-25-g10dungeon-12-not-saved.png`](visuals/p10/2026-11-25-g10dungeon-12-not-saved.png) | shownIn=14ms; error=true; submit re-enabled=true; xp 28→28; cleared 1→1 |
| 2026-11-25 | G10 reduced motion | uncommitted | Journal overview | [`2026-11-25-g10rm-01-journal-overview.png`](visuals/p10/2026-11-25-g10rm-01-journal-overview.png) | openIn=11ms; focus=journal-panel-title; subjects=active subject row; sections=journal-overview,journal-subjects,journal-progress,journal-badges,journal-records,journal-inventory,journal-fish,journal-due,journal-assistance,journal-settings; records=true; due=true; assistance=true; settings=true |
| 2026-11-25 | G10 reduced motion | uncommitted | Journal subjects | [`2026-11-25-g10rm-02-journal-subjects.png`](visuals/p10/2026-11-25-g10rm-02-journal-subjects.png) | section=journal-panel-title; room counts=true; enter buttons=4 |
| 2026-11-25 | G10 reduced motion | uncommitted | Journal records | [`2026-11-25-g10rm-03-journal-records.png`](visuals/p10/2026-11-25-g10rm-03-journal-records.png) | notes=true; active days=true; engine copy=true |
| 2026-11-25 | G10 reduced motion | uncommitted | Journal assistance | [`2026-11-25-g10rm-04-journal-assistance.png`](visuals/p10/2026-11-25-g10rm-04-journal-assistance.png) | suggestions=6; engine reason labels=true; mode copy=true |
| 2026-11-25 | G10 reduced motion | uncommitted | Journal settings | [`2026-11-25-g10rm-05-journal-settings.png`](visuals/p10/2026-11-25-g10rm-05-journal-settings.png) | focus=journal-panel-title; values={"reducedMotion":"system","assistance":"gentle","textScale":"normal","touch":"auto"}; local-only copy=true |
| 2026-11-25 | G10 reduced motion | uncommitted | Large text applied | [`2026-11-25-g10rm-06-journal-large-text.png`](visuals/p10/2026-11-25-g10rm-06-journal-large-text.png) | dataset=large; value=large; same panel open=true |
| 2026-11-25 | G10 reduced motion | uncommitted | Assistance mode off | [`2026-11-25-g10rm-07-journal-assistance-off.png`](visuals/p10/2026-11-25-g10rm-07-journal-assistance-off.png) | mode=off; off copy=true; suggestions=0 |
| 2026-11-25 | G10 reduced motion | uncommitted | Settings after reload | [`2026-11-25-g10rm-08-journal-settings-persisted.png`](visuals/p10/2026-11-25-g10rm-08-journal-settings-persisted.png) | dataset text=large; select text=large; assistance=off; reduced motion=system; touch=auto |
| 2026-11-25 | G10 reduced motion | uncommitted | Entered from the journal | [`2026-11-25-g10rm-09-journal-entry.png`](visuals/p10/2026-11-25-g10rm-09-journal-entry.png) | subject=demo-kitchen; enteredIn=73ms; world=dungeon; study session open=true; focus=game |
| 2026-11-25 | G10 reduced motion | uncommitted | Journal on a fresh save | [`2026-11-25-g10rm-10-journal-empty.png`](visuals/p10/2026-11-25-g10rm-10-journal-empty.png) | subjects visible=true; active subject=true; due=true; focus=journal-panel-title |
| 2026-11-25 | G10 reduced motion | uncommitted | Fresh-save records | [`2026-11-25-g10rm-11-journal-empty-records.png`](visuals/p10/2026-11-25-g10rm-11-journal-empty-records.png) | zero notes=true; zero fish=true; badges empty=true; fish empty=true |
| 2026-11-25 | G10 production boot | uncommitted | Production boot | [`2026-11-25-g10prod-01-boot.png`](visuals/p10/2026-11-25-g10prod-01-boot.png) | title in 343ms; title visible=true; canvas=1280×800; failed resources=0; panel error="" |

Manifests:
[`2026-11-25-g10play-manifest.json`](visuals/p10/2026-11-25-g10play-manifest.json),
[`2026-11-25-g10perf-manifest.json`](visuals/p10/2026-11-25-g10perf-manifest.json),
[`2026-11-25-g10shell-manifest.json`](visuals/p10/2026-11-25-g10shell-manifest.json),
[`2026-11-25-g10surface-manifest.json`](visuals/p10/2026-11-25-g10surface-manifest.json),
[`2026-11-25-g10fish-manifest.json`](visuals/p10/2026-11-25-g10fish-manifest.json),
[`2026-11-25-g10review-manifest.json`](visuals/p10/2026-11-25-g10review-manifest.json),
[`2026-11-25-g10creator-manifest.json`](visuals/p10/2026-11-25-g10creator-manifest.json),
[`2026-11-25-g10services-manifest.json`](visuals/p10/2026-11-25-g10services-manifest.json),
[`2026-11-25-g10journal-manifest.json`](visuals/p10/2026-11-25-g10journal-manifest.json),
[`2026-11-25-g10dungeon-manifest.json`](visuals/p10/2026-11-25-g10dungeon-manifest.json),
[`2026-11-25-g10rm-manifest.json`](visuals/p10/2026-11-25-g10rm-manifest.json),
[`2026-11-25-g10prod-manifest.json`](visuals/p10/2026-11-25-g10prod-manifest.json).

## Capturing the next phase

Prerequisites: example dependencies installed, Firefox on `PATH`, and `geckodriver`
available. The app must be reachable at the script's `--base` (default
`http://localhost:5174/`); if Vite reports another port because 5174 is busy, pass it
explicitly.

```sh
# terminal 1 — the app
npm --prefix examples/side-scroller run dev

# terminal 2 — WebDriver
geckodriver --port 4444

# terminal 3 — capture from the repository root
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p2 \
  --prefix 2026-11-23-g2 \
  --low-fps --reduced-motion --note-loop
```

The script drives the real app over WebDriver:

1. reduced-motion session (when `--reduced-motion`);
2. start tutorial and the root frame;
3. optional main-thread hog and frame-interval measurement (`--low-fps`);
4. step off, ladder down, lower frame;
5. climb until the room actually changes, upper frame;
6. descend, step off, root frame;
7. reload and final frame;
8. writes `<prefix>-manifest.json` and prints Markdown rows for the index.

With `--note-loop`, a second session resets the save through the app's own control and
then captures: composer open, draft, clear, close/focus return, reload, and a simulated
storage failure (the next IndexedDB `put` throws). The script injects that failure through
`IDBObjectStore.prototype.put` in the page; the app has no test hooks and its normal
"not saved" path runs.

With `--surface`, a separate mode captures the P3 street and the portal/return loop:
street, Training Grounds entry, cleared room, shaft return, reload on the street, and
reload in the dungeon. It uses the same real app and key events; no test hooks are added.

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p3 \
  --prefix 2026-11-23-g3 \
  --surface
```

With `--mobile` (or `--shell`), P9 captures the desktop title, a 390×844 phone viewport,
the archetype choice, a rejected import, touch controls on the street, in a dungeon room,
at the pond, touch-only journal/review entry, the responsive progress sheet, and an
export → clear → import round trip.
Add `--reduced-motion` to repeat it with the OS preference set.

With `--fishing`, a separate mode captures the pond loop: dungeon entry, a cleared room,
the walk to a pond, powering, waiting, the bite, the recall dialog, a simulated
IndexedDB failure on keep, the retry with Enter, a release, leaving the pond, reload, and
a mid-cast reload recovery. Add `--reduced-motion` to run it with the OS preference set.

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p4 \
  --prefix 2026-11-24-g4 \
  --fishing --reduced-motion
```

It does not add test hooks to the page or change engine state beyond normal commands.
Use a new `--prefix` for every gate so the record stays append-only.

After capturing, reduce the PNGs if the sizes are large. P1 used Pillow's 256-colour
FASTOCTREE, which preserves the player and status colours:

```sh
python3 - <<'PY'
from PIL import Image
import glob, os
for path in glob.glob('docs/plans/side-scroller-host/visuals/p2/*.png'):
    image = Image.open(path).convert('RGB').quantize(colors=256, method=Image.FASTOCTREE)
    image.save(path, optimize=True)
PY
```

Then append the printed rows to the index, add the images to the gallery, and reference
the visual record from that phase's execution evidence.
