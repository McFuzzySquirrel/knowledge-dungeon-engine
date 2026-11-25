import { cascadeRemovalCount, type CreatorRoomView, type CreatorView } from '../creator/projection';

/**
 * DOM Creator panel (P6).
 *
 * The panel owns drafts, selection, and focus only. `main.ts` dispatches
 * `createSubject`, `activateSubject`, and `dispatchGraph`, and re-projects the
 * view from the engine subscription after each committed mutation. The panel
 * never imports the engine.
 *
 * Every control is a native button, input, select, or textarea, so keyboard
 * operation needs no custom keys beyond Escape (close) and Tab wrap. A typed
 * graph refusal is rendered verbatim by `main.ts`; a rejected write is "Not
 * saved" and the previous tree stays on screen because the panel renders the
 * last committed `CreatorView`, not a local mutation.
 */

export interface CreatorCreateInput {
  subjectName: string;
  rootTopic: string;
  biome?: string;
}

export interface CreatorPanelCallbacks {
  onCreate(input: CreatorCreateInput): Promise<void>;
  onSelect(subjectId: string): Promise<void>;
  onEnter(subjectId: string): Promise<void>;
  onAddChildren(parentRoomId: string, topics: string[]): Promise<void>;
  onReparent(roomId: string, newParentRoomId: string): Promise<void>;
  onRemove(roomId: string): Promise<void>;
  onSetTags(roomId: string, tags: string[]): Promise<void>;
  onAddCrossLink(fromRoomId: string, toRoomId: string): Promise<void>;
  onClose(): void;
}

export interface CreatorPanel {
  /** Re-render from committed state. Drafts and selection survive when still valid. */
  update(view: CreatorView): void;
  setPending(value: boolean): void;
  showError(message: string): void;
  showResult(message: string): void;
  /** Host extension: a committed add consumed the topics draft. */
  resetAddDraft(): void;
  /** Host extension: a committed create consumed the create form. */
  resetCreateDraft(): void;
  close(): void;
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function option(value: string, label: string, selected = false): HTMLOptionElement {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  return node;
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function mountCreatorPanel(
  root: HTMLElement,
  initialView: CreatorView,
  callbacks: CreatorPanelCallbacks,
): CreatorPanel {
  root.hidden = false;
  root.replaceChildren();

  let view = initialView;
  let pending = false;
  let selectedRoomId: string | null = initialView.rooms[0]?.roomId ?? null;
  let removeArmedRoomId: string | null = null;
  let controls: (HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] = [];
  let focusTargets = new Map<string, HTMLElement>();
  let pendingFocusKey: string | null = null;
  let firstRender = true;

  const createDraft: Required<CreatorCreateInput> = { subjectName: '', rootTopic: '', biome: '' };
  const addDraft = { parentRoomId: selectedRoomId ?? '', topics: '' };
  const tagDraft = { roomId: selectedRoomId ?? '', text: '' };
  const moveDraft = { roomId: selectedRoomId ?? '', parentRoomId: '' };
  const linkDraft = {
    fromRoomId: initialView.rooms[0]?.roomId ?? '',
    toRoomId: initialView.rooms[1]?.roomId ?? '',
  };

  const title = element('h2', { id: 'creator-panel-title', text: 'Creator — subjects and rooms' });
  title.tabIndex = -1;

  const error = element('div', { id: 'creator-error' });
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const result = element('div', { id: 'creator-result', className: 'creator-result' });
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-atomic', 'true');
  result.hidden = true;

  function track<T extends HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    node: T,
    key: string,
  ): T {
    node.dataset.focusKey = key;
    controls.push(node);
    focusTargets.set(key, node);
    return node;
  }

  function button(text: string, key: string, onClick: () => void): HTMLButtonElement {
    const node = element('button', { text });
    node.type = 'button';
    track(node, key);
    node.addEventListener('click', onClick);
    return node;
  }

  function subjectRow(
    subject: CreatorView['subjects'][number],
    editing: boolean,
  ): HTMLLIElement {
    const item = element('li', { className: editing ? 'creator-subject current' : 'creator-subject' });
    const label = element('span', {
      text: `${subject.subjectName} — ${subject.roomCount} rooms, ${subject.clearedCount} cleared`,
    });
    const edit = button(editing ? 'Editing' : 'Edit', `subject-edit-${subject.subjectId}`, () => {
      if (editing) return;
      run(() => callbacks.onSelect(subject.subjectId));
    });
    edit.setAttribute('aria-pressed', editing ? 'true' : 'false');
    const enter = button('Enter dungeon', `subject-enter-${subject.subjectId}`, () => {
      run(() => callbacks.onEnter(subject.subjectId));
    });
    item.append(label, edit, enter);
    return item;
  }

  function subjectSection(): HTMLElement {
    const section = element('section', { className: 'creator-section' });
    section.append(element('h3', { text: 'Subjects' }));

    if (view.subjects.length === 0) {
      section.append(
        element('p', {
          className: 'note-hint',
          text: 'No subjects yet. Create one below; it appears as a portal on the street.',
        }),
      );
    } else {
      const list = element('ul', { className: 'creator-subjects' });
      for (const subject of view.subjects) {
        list.append(subjectRow(subject, subject.subjectId === view.activeSubjectId));
      }
      section.append(list);
    }

    const form = element('fieldset', { className: 'creator-create' });
    form.append(element('legend', { text: 'Create subject' }));

    const name = element('input', { id: 'creator-subject-name' });
    name.type = 'text';
    name.value = createDraft.subjectName;
    name.placeholder = 'Subject name';
    name.setAttribute('aria-label', 'Subject name');
    track(name, 'create-name');
    name.addEventListener('input', () => {
      createDraft.subjectName = name.value;
    });

    const topic = element('input', { id: 'creator-root-topic' });
    topic.type = 'text';
    topic.value = createDraft.rootTopic;
    topic.placeholder = 'Root topic';
    topic.setAttribute('aria-label', 'Root topic');
    track(topic, 'create-root');
    topic.addEventListener('input', () => {
      createDraft.rootTopic = topic.value;
    });

    const biome = element('input', { id: 'creator-biome' });
    biome.type = 'text';
    biome.value = createDraft.biome;
    biome.placeholder = 'Biome (optional)';
    biome.setAttribute('aria-label', 'Biome, optional');
    track(biome, 'create-biome');
    biome.addEventListener('input', () => {
      createDraft.biome = biome.value;
    });

    const submit = button('Create subject', 'create-submit', () => submitCreate());
    const row = element('div', { className: 'creator-row' });
    row.append(name, topic, biome, submit);
    form.append(row, element('p', {
      className: 'note-hint',
      text: 'Ids are minted by the host. Empty names and duplicate subject names are refused before any write.',
    }));
    section.append(form);
    return section;
  }

  function submitCreate(): void {
    const subjectName = createDraft.subjectName.trim();
    const rootTopic = createDraft.rootTopic.trim();
    const biome = createDraft.biome.trim();
    if (!subjectName || !rootTopic) {
      showError('Refused: a subject name and a root topic are required.');
      return;
    }
    run(() => callbacks.onCreate({ subjectName, rootTopic, ...(biome ? { biome } : {}) }));
  }

  function clearResult(): void {
    result.hidden = true;
    result.textContent = '';
  }

  function selectRoom(roomId: string): void {
    if (selectedRoomId === roomId) return;
    selectedRoomId = roomId;
    removeArmedRoomId = null;
    clearResult();
    const room = view.rooms.find((entry) => entry.roomId === roomId);
    tagDraft.roomId = roomId;
    tagDraft.text = room ? room.tags.join(', ') : '';
    moveDraft.roomId = roomId;
    moveDraft.parentRoomId = '';
    addDraft.parentRoomId = roomId;
    render();
  }

  function treeItem(room: CreatorRoomView, rootRoomId: string | null): HTMLLIElement {
    const item = element('li', { className: 'creator-room' });
    const indent = '  '.repeat(room.depth);
    const marker = room.roomId === rootRoomId ? '◆ root' : room.depth === 0 ? '•' : `${indent}↳`;
    const selected = room.roomId === selectedRoomId;
    const select = button(
      `${marker} ${room.topic}${room.tags.length > 0 ? ` [${room.tags.join(', ')}]` : ''}`,
      `room-${room.roomId}`,
      () => selectRoom(room.roomId),
    );
    select.classList.add('creator-room-select');
    select.setAttribute('aria-pressed', selected ? 'true' : 'false');
    if (selected) select.setAttribute('aria-current', 'true');
    const parent = view.rooms.find((entry) => entry.roomId === room.parentRoomId);
    const meta = element('span', {
      className: 'note-hint',
      text: `depth ${room.depth}${parent ? ` · under ${parent.topic}` : ''}`,
    });
    item.append(select, meta);
    return item;
  }

  function editorSection(): HTMLElement | null {
    if (!view.activeSubjectId) return null;
    const subject = view.subjects.find((entry) => entry.subjectId === view.activeSubjectId);
    if (!subject) return null;

    const section = element('section', { className: 'creator-section' });
    section.append(
      element('h3', { text: `Room tree — ${subject.subjectName}` }),
      element('p', {
        className: 'note-hint',
        text: 'Select a room to act on it. Mutations run one at a time and re-render from committed state.',
      }),
    );

    const tree = element('ul', { className: 'creator-tree' });
    for (const room of view.rooms) tree.append(treeItem(room, subject.rootRoomId));
    section.append(tree);

    section.append(addRoomsForm());
    const actions = roomActions(subject.rootRoomId);
    if (actions) section.append(actions);
    section.append(crossLinkSection());
    return section;
  }

  function addRoomsForm(): HTMLElement {
    const form = element('fieldset', { className: 'creator-add' });
    form.append(element('legend', { text: 'Add child rooms' }));

    const parent = element('select', { id: 'creator-add-parent' });
    parent.setAttribute('aria-label', 'Parent room');
    const parentValue = view.rooms.some((room) => room.roomId === addDraft.parentRoomId)
      ? addDraft.parentRoomId
      : selectedRoomId ?? view.rooms[0]?.roomId ?? '';
    for (const room of view.rooms) {
      parent.append(option(room.roomId, `${'  '.repeat(room.depth)}${room.topic}`, room.roomId === parentValue));
    }
    track(parent, 'add-parent');
    parent.addEventListener('change', () => {
      addDraft.parentRoomId = parent.value;
    });

    const topics = element('textarea', { id: 'creator-add-topics' });
    topics.rows = 3;
    topics.value = addDraft.topics;
    topics.placeholder = 'One topic per line';
    topics.setAttribute('aria-label', 'New child topics, one per line');
    track(topics, 'add-topics');
    topics.addEventListener('input', () => {
      addDraft.topics = topics.value;
    });

    const submit = button('Add rooms', 'add-submit', () => {
      const lines = addDraft.topics
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        showError('Refused: add at least one non-empty topic.');
        return;
      }
      const parentRoomId = parent.value;
      run(() => callbacks.onAddChildren(parentRoomId, lines));
    });

    form.append(parent, topics, submit);
    return form;
  }

  function roomActions(rootRoomId: string): HTMLElement | null {
    const room = view.rooms.find((entry) => entry.roomId === selectedRoomId);
    if (!room) return null;

    const fieldset = element('fieldset', { className: 'creator-actions' });
    fieldset.append(element('legend', { text: `Selected room — ${room.topic}` }));

    if (tagDraft.roomId !== room.roomId) {
      tagDraft.roomId = room.roomId;
      tagDraft.text = room.tags.join(', ');
    }
    const tags = element('input', { id: 'creator-tags' });
    tags.type = 'text';
    tags.value = tagDraft.text;
    tags.placeholder = 'tag-one, tag-two';
    tags.setAttribute('aria-label', `Tags for ${room.topic}, comma separated`);
    track(tags, 'tags-input');
    tags.addEventListener('input', () => {
      tagDraft.text = tags.value;
      tagDraft.roomId = room.roomId;
    });
    const saveTags = button('Save tags', 'tags-submit', () => {
      run(() => callbacks.onSetTags(room.roomId, parseTags(tags.value)));
    });

    const move = element('select', { id: 'creator-move-parent' });
    move.setAttribute('aria-label', `New parent for ${room.topic}`);
    move.append(option('', 'Move under…'));
    const descendants = new Set<string>([room.roomId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const entry of view.rooms) {
        if (entry.parentRoomId && descendants.has(entry.parentRoomId) && !descendants.has(entry.roomId)) {
          descendants.add(entry.roomId);
          grew = true;
        }
      }
    }
    const preferred = view.rooms.some((entry) => entry.roomId === moveDraft.parentRoomId)
      ? moveDraft.parentRoomId
      : '';
    for (const entry of view.rooms) {
      if (descendants.has(entry.roomId)) continue;
      move.append(option(entry.roomId, entry.topic, entry.roomId === preferred));
    }
    track(move, 'move-select');
    move.addEventListener('change', () => {
      moveDraft.roomId = room.roomId;
      moveDraft.parentRoomId = move.value;
    });
    const moveButton = button('Move room', 'move-submit', () => {
      if (!move.value) {
        showError('Refused: choose a new parent before moving.');
        return;
      }
      const newParentRoomId = move.value;
      run(() => callbacks.onReparent(room.roomId, newParentRoomId));
    });

    const isRoot = room.roomId === rootRoomId;
    const cascade = cascadeRemovalCount(view, room.roomId);
    const armed = removeArmedRoomId === room.roomId;
    const remove = button(
      armed
        ? `Confirm remove: ${cascade} ${cascade === 1 ? 'room' : 'rooms'}`
        : isRoot
          ? 'Root room cannot be removed'
          : 'Remove room',
      'remove-button',
      () => {
        if (isRoot) return;
        if (!armed) {
          removeArmedRoomId = room.roomId;
          clearResult();
          render();
          return;
        }
        removeArmedRoomId = null;
        run(() => callbacks.onRemove(room.roomId));
      },
    );
    if (isRoot) remove.dataset.alwaysDisabled = 'true';

    const tagRow = element('div', { className: 'creator-row' });
    tagRow.append(tags, saveTags);
    const moveRow = element('div', { className: 'creator-row' });
    moveRow.append(move, moveButton, remove);
    fieldset.append(tagRow, moveRow, element('p', {
      className: 'note-hint',
      text: cascade > 1
        ? `Removing this room also removes ${cascade - 1} unreachable ${cascade - 1 === 1 ? 'room' : 'rooms'}; the confirmation counts all ${cascade}.`
        : 'This room has no unreachable descendants.',
    }));
    return fieldset;
  }

  function crossLinkSection(): HTMLElement {
    const section = element('fieldset', { className: 'creator-links' });
    section.append(element('legend', { text: 'Cross-links' }));

    if (view.rooms.length < 2) {
      section.append(element('p', { className: 'note-hint', text: 'Add two rooms to create a cross-link.' }));
      return section;
    }

    const from = element('select', { id: 'creator-link-from' });
    from.setAttribute('aria-label', 'Cross-link source room');
    const fromValue = view.rooms.some((room) => room.roomId === linkDraft.fromRoomId)
      ? linkDraft.fromRoomId
      : view.rooms[0].roomId;
    for (const room of view.rooms) from.append(option(room.roomId, room.topic, room.roomId === fromValue));
    track(from, 'link-from');
    from.addEventListener('change', () => {
      linkDraft.fromRoomId = from.value;
    });

    const to = element('select', { id: 'creator-link-to' });
    to.setAttribute('aria-label', 'Cross-link target room');
    const toValue = view.rooms.some((room) => room.roomId === linkDraft.toRoomId)
      ? linkDraft.toRoomId
      : view.rooms[1].roomId;
    for (const room of view.rooms) to.append(option(room.roomId, room.topic, room.roomId === toValue));
    track(to, 'link-to');
    to.addEventListener('change', () => {
      linkDraft.toRoomId = to.value;
    });

    const add = button('Add cross-link', 'link-submit', () => {
      run(() => callbacks.onAddCrossLink(from.value, to.value));
    });

    const row = element('div', { className: 'creator-row' });
    row.append(from, to, add);
    section.append(row);

    if (view.edges.length === 0) {
      section.append(
        element('p', {
          className: 'note-hint',
          text: 'No cross-links yet. Add two rooms, then choose a from and to room below.',
        }),
      );
    } else {
      const list = element('ul', { className: 'creator-edge-list' });
      for (const edge of view.edges) {
        const fromRoom = view.rooms.find((room) => room.roomId === edge.fromRoomId);
        const toRoom = view.rooms.find((room) => room.roomId === edge.toRoomId);
        list.append(element('li', {
          text: `${fromRoom?.topic ?? edge.fromRoomId} → ${toRoom?.topic ?? edge.toRoomId} (${edge.relationType})`,
        }));
      }
      section.append(list);
    }
    return section;
  }

  function closeButton(): HTMLButtonElement {
    return button('Close Creator', 'close', () => callbacks.onClose());
  }

  function onKeyDown(event: KeyboardEvent): void {
    const form = event.currentTarget;
    if (!(form instanceof HTMLElement)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      callbacks.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const usable = [...form.querySelectorAll<HTMLElement>('button, input, select, textarea')].filter(
      (node) => !(node as HTMLButtonElement).disabled && node.closest('[hidden]') === null,
    );
    if (usable.length === 0) return;
    const first = usable[0];
    const last = usable[usable.length - 1];
    const active = document.activeElement;
    if (active === title) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function render(): void {
    const activeKey =
      document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focusKey : undefined;
    const scrollTop = root.scrollTop;
    controls = [];
    focusTargets = new Map();

    if (selectedRoomId && !view.rooms.some((room) => room.roomId === selectedRoomId)) {
      selectedRoomId = view.rooms[0]?.roomId ?? null;
    }
    if (removeArmedRoomId && !view.rooms.some((room) => room.roomId === removeArmedRoomId)) {
      removeArmedRoomId = null;
    }
    if (tagDraft.roomId !== selectedRoomId) {
      const room = view.rooms.find((entry) => entry.roomId === selectedRoomId);
      tagDraft.roomId = selectedRoomId ?? '';
      tagDraft.text = room ? room.tags.join(', ') : '';
    }
    if (!addDraft.parentRoomId) addDraft.parentRoomId = selectedRoomId ?? view.rooms[0]?.roomId ?? '';

    const form = element('section', { className: 'note-form creator-form' });
    form.addEventListener('keydown', onKeyDown);
    form.append(
      title,
      element('p', {
        className: 'note-hint',
        text: 'Tab moves through controls, Escape closes. Every mutation is dispatched by the host and re-rendered from committed engine state.',
      }),
      subjectSection(),
    );
    const editor = editorSection();
    if (editor) form.append(editor);
    form.append(error, result, closeButton());
    root.replaceChildren(form);

    applyPending();
    root.scrollTop = scrollTop;

    const target = activeKey ? focusTargets.get(activeKey) : undefined;
    if (target && !pending) {
      target.focus({ preventScroll: true });
    } else if (firstRender) {
      title.focus({ preventScroll: true });
    }
    firstRender = false;
  }

  function applyPending(): void {
    for (const control of controls) {
      control.disabled = pending || control.dataset.alwaysDisabled === 'true';
    }
  }

  function setPending(value: boolean): void {
    if (value) {
      const active = document.activeElement;
      pendingFocusKey =
        active instanceof HTMLElement && active.dataset.focusKey ? active.dataset.focusKey : pendingFocusKey;
    }
    pending = value;
    applyPending();
    if (!value) {
      const target = pendingFocusKey ? focusTargets.get(pendingFocusKey) : undefined;
      if (target && !(target as HTMLButtonElement).disabled) {
        target.focus({ preventScroll: true });
      } else if (!document.activeElement || document.activeElement === document.body) {
        title.focus({ preventScroll: true });
      }
      pendingFocusKey = null;
    }
  }

  function reveal(node: HTMLElement): void {
    root.scrollTop = Math.max(0, node.offsetTop - root.clientHeight / 2);
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
    result.hidden = true;
    result.textContent = '';
    reveal(error);
  }

  function showResult(message: string): void {
    result.textContent = message;
    result.hidden = false;
    error.hidden = true;
    error.textContent = '';
    reveal(result);
  }

  function run(work: () => Promise<void>): void {
    if (pending) return;
    setPending(true);
    void work()
      .catch((failure: unknown) => {
        showError(`Not saved: ${describe(failure)}. Nothing was committed. Try again.`);
      })
      .finally(() => setPending(false));
  }

  render();

  return {
    update(next) {
      view = next;
      // A committed tag write is authoritative: reflect the stored, normalized
      // tags instead of leaving the raw draft on screen.
      const room = next.rooms.find((entry) => entry.roomId === selectedRoomId);
      tagDraft.roomId = selectedRoomId ?? '';
      tagDraft.text = room ? room.tags.join(', ') : '';
      render();
    },
    setPending,
    showError,
    showResult,
    resetAddDraft() {
      addDraft.topics = '';
      render();
    },
    resetCreateDraft() {
      createDraft.subjectName = '';
      createDraft.rootTopic = '';
      createDraft.biome = '';
      render();
    },
    close() {
      root.hidden = true;
      root.replaceChildren();
    },
  };
}
