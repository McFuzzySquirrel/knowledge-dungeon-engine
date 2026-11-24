import type { LibraryArtifactEntry, LibraryView } from '../village/projection';

/**
 * Library interior (P7).
 *
 * Three read-mostly surfaces over engine data:
 *
 * - the review desk, which hands a room id back to the host so the P5 panel can
 *   run the actual review command;
 * - the artifact archive, which renders an artifact as a text node and only
 *   when the progression already holds the collected note;
 * - the collected-notes list, which shows topics and dates but never reprints
 *   the learner's note text.
 *
 * The panel never imports the engine and never writes anything.
 */

export interface LibraryPanelCallbacks {
  onReview(roomId: string): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; id?: string } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  return node;
}

function button(text: string, id: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', { text, id });
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** An ISO timestamp as a stable date; no locale drift in a projection panel. */
function dateLabel(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'unknown date';
  return new Date(parsed).toISOString().slice(0, 10);
}

function reviewSection(view: LibraryView, callbacks: LibraryPanelCallbacks): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Review desk' }));

  if (!view.review) {
    section.append(
      element('p', {
        className: 'note-hint',
        text: view.emptyMessage,
      }),
    );
    return section;
  }

  section.append(
    element('p', {
      className: 'note-hint',
      text: `${view.review.subjectName} — ${view.review.candidates.length} reviewable ${
        view.review.candidates.length === 1 ? 'room' : 'rooms'
      }, ${view.review.dueCount} due now.`,
    }),
  );

  if (view.review.candidates.length === 0) {
    section.append(
      element('p', {
        className: 'note-hint',
        text: 'No cleared rooms with notes yet. Clear a room in this subject and its review appears here.',
      }),
    );
    return section;
  }

  const list = element('ul', { className: 'service-list' });
  for (const candidate of view.review.candidates) {
    const item = element('li', { className: 'service-row' });
    item.append(
      element('span', { text: `${candidate.topic} — ${candidate.dueLabel}` }),
      button('Review', `library-review-${candidate.roomId}`, () => callbacks.onReview(candidate.roomId)),
    );
    list.append(item);
  }
  section.append(list);
  return section;
}

function artifactSection(view: LibraryView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Artifact archive' }));

  if (view.artifacts.length === 0) {
    section.append(
      element('p', {
        className: 'note-hint',
        text: view.emptyMessage,
      }),
    );
    return section;
  }

  const detail = element('pre', {
    id: 'library-artifact-text',
    className: 'service-artifact',
  });
  detail.hidden = true;

  const hint = element('p', {
    className: 'note-hint',
    text: 'Collected artifacts open here as plain text. An uncollected artifact stays hidden until you take it from the room.',
  });

  const list = element('ul', { className: 'service-list' });
  for (const artifact of view.artifacts) {
    const item = element('li', { className: 'service-row' });
    const text = `${artifact.topic} — ${
      artifact.collected
        ? `Collected ${artifact.collectedAt ? dateLabel(artifact.collectedAt) : ''}`.trim()
        : 'Not collected'
    }`;
    if (artifact.collected && artifact.artifactText) {
      const entry: LibraryArtifactEntry = artifact;
      item.append(
        element('span', { text }),
        button('Show artifact', `library-artifact-${artifact.roomId}`, () => {
          detail.textContent = entry.artifactText ?? '';
          detail.hidden = false;
        }),
      );
    } else {
      item.append(
        element('span', { text }),
        element('span', {
          className: 'note-hint',
          text: 'Take it from the room note panel first.',
        }),
      );
    }
    list.append(item);
  }

  section.append(list, hint, detail);
  return section;
}

function notesSection(view: LibraryView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Collected notes' }));

  if (view.notes.length === 0) {
    section.append(
      element('p', {
        className: 'note-hint',
        text: 'No collected notes yet. Take an artifact after a clear to add one.',
      }),
    );
    return section;
  }

  const list = element('ul', { className: 'service-list' });
  for (const note of view.notes) {
    list.append(
      element('li', {
        className: 'service-row',
        text: `${note.topic} — collected ${dateLabel(note.collectedAt)}`,
      }),
    );
  }
  section.append(
    list,
    element('p', {
      className: 'note-hint',
      text: 'Topics and dates only. Note text stays in the room where it was written.',
    }),
  );
  return section;
}

/** Render the Library content slot from a committed projection. */
export function renderLibrary(view: LibraryView, callbacks: LibraryPanelCallbacks): HTMLElement {
  const root = element('div', { className: 'service-body' });
  root.append(reviewSection(view, callbacks), artifactSection(view), notesSection(view));
  return root;
}
