import type { assistance } from '@/index';
import type { JournalView } from '../journal/projection';
import type {
  AssistanceMode,
  HostSettings,
  TextScale,
  TouchLayout,
} from '../settings';

/**
 * DOM journal and settings panel (P8).
 *
 * One focus-trapped modal over the paused world. Every row comes from the
 * frozen `JournalView`; the panel never imports a command and never reads
 * `EngineState`. Settings changes are reported to `main.ts`, which owns the
 * store and applies them immediately.
 *
 * Keyboard: `J` or `Escape` closes, `Tab`/`Shift+Tab` cycle, arrow keys move
 * between buttons, and `Enter` activates the focused control.
 */

export interface JournalPanelCallbacks {
  onClose(): void;
  onOpenSettings(): void;
  onSelectSubject(subjectId: string): void;
  onEnterSubject(subjectId: string): void;
  onSettingsChange(settings: HostSettings): void;
  onResetSettings(): void;
}

export interface JournalPanel {
  update(view: JournalView, settings: HostSettings, selectedSubjectId: string | null): void;
  setPending(value: boolean): void;
  showError(message: string): void;
  focusSettings(): void;
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

const FOCUSABLE =
  'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function visibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) =>
      !(node as HTMLButtonElement).disabled &&
      !node.hidden &&
      node.closest('[hidden]') === null,
  );
}

function section(title: string, id: string): HTMLElement {
  const node = element('section', { className: 'service-section journal-section' });
  node.id = id;
  node.append(element('h3', { text: title }));
  return node;
}

function definitionRows(rows: readonly (readonly [string, string])[]): HTMLElement {
  const list = element('dl', { className: 'service-records' });
  for (const [term, value] of rows) {
    list.append(element('dt', { text: term }), element('dd', { text: value }));
  }
  return list;
}

function empty(text: string): HTMLElement {
  return element('p', { className: 'note-hint', text });
}

function countLabel(value: number, one: string, many = `${one}s`): string {
  return value === 1 ? `1 ${one}` : `${value} ${many}`;
}

const REASON_LABELS: Readonly<Record<assistance.AssistanceReasonCode, string>> = {
  'graph-no-branch': 'The root room has no subtopic branch.',
  'graph-related-tag-unlinked': 'Rooms share a tag but are not linked.',
  'note-missing-required-section': 'A required note section is missing.',
  'note-validation-failed': 'A blocking note check did not pass.',
  'note-adjacent-room-unreferenced':
    'The link-references rubric score is zero for a room with an adjacent room.',
  'note-rubric-criterion-low': 'A rubric criterion scored zero.',
  'review-due': 'The room’s review is due.',
  'review-low-recall': 'The last recall rating was below the SM-2 pass threshold.',
  'fishing-recall-missed': 'A fishing recall question was not answered.',
  'device-reviews-due': 'At least one reviewable room is due.',
};

const SURFACE_LABELS: Readonly<Record<assistance.AssistanceSurface, string>> = {
  creator: 'Creator',
  scribe: 'Scribe',
  archaeologist: 'Archaeologist',
  fishing: 'Fishing',
  device: 'This device',
};

const EMPTY_REASON_LABELS: Readonly<Record<assistance.AssistanceEmptyReason, string>> = {
  'mode-off': 'Assistance is off in Settings.',
  'no-suggestions':
    'The engine found nothing to suggest right now. Clear or review a room to give it more to work with.',
  'flag-disabled': 'Adaptive assistance is disabled for this build.',
};

function assistanceSection(
  view: JournalView,
  settings: HostSettings,
): HTMLElement {
  const node = section('Assistance', 'journal-assistance');
  const result = view.assistance;
  const mode = element('p', {
    className: 'note-hint',
    text: `Mode: ${settings.assistanceMode}. Suggestions are ranked by the engine; this panel adds no advice of its own.`,
  });
  node.append(mode);

  if (!result) {
    node.append(empty('Assistance could not be projected for this save.'));
    return node;
  }

  if (result.suggestions.length === 0) {
    node.append(
      empty(
        result.emptyReason === null
          ? 'The engine returned no suggestions.'
          : EMPTY_REASON_LABELS[result.emptyReason],
      ),
    );
    return node;
  }

  const device = result.suggestions.filter((suggestion) => suggestion.surface === 'device');
  const general = result.suggestions.filter((suggestion) => suggestion.surface !== 'device');
  const list = element('ul', { className: 'service-list' });

  const appendSuggestion = (suggestion: assistance.AssistanceSuggestion): void => {
    const action = suggestion.action.detail ? ` · ${suggestion.action.detail}` : '';
    const item = element('li', {
      className: 'service-row journal-suggestion',
      text:
        `${REASON_LABELS[suggestion.reasonCode]} ` +
        `[${SURFACE_LABELS[suggestion.surface]} · ${suggestion.intensity} · priority ${suggestion.priority}${action}]`,
    });
    list.append(item);
  };

  if (device.length > 0) device.forEach(appendSuggestion);
  if (general.length > 0) general.forEach(appendSuggestion);
  node.append(list);
  return node;
}

function settingsSection(
  settings: HostSettings,
  callbacks: JournalPanelCallbacks,
): HTMLElement {
  const node = section('Settings', 'journal-settings');
  node.append(
    element('p', {
      className: 'note-hint',
      text: 'Stored on this device only. Settings are never written into the engine save.',
    }),
  );

  const form = element('div', { className: 'journal-settings-form' });

  const addSelect = <T extends string>(
    id: string,
    label: string,
    value: T,
    options: readonly { value: T; label: string }[],
    apply: (next: T) => void,
  ): void => {
    const wrapper = element('label', { className: 'journal-setting' });
    const select = element('select');
    select.id = id;
    select.dataset.journalNav = 'true';
    select.dataset.focusKey = id;
    for (const option of options) {
      const item = element('option', { text: option.label });
      item.value = option.value;
      select.append(item);
    }
    select.value = value;
    select.addEventListener('change', () => apply(select.value as T));
    wrapper.append(element('span', { text: label }), select);
    form.append(wrapper);
  };

  addSelect<HostSettings['reducedMotion']>(
    'journal-setting-reduced-motion',
    'Reduced motion',
    settings.reducedMotion,
    [
      { value: 'system', label: 'Follow system' },
      { value: 'on', label: 'Reduced motion on' },
    ],
    (next) => callbacks.onSettingsChange({ ...settings, reducedMotion: next }),
  );
  addSelect<AssistanceMode>(
    'journal-setting-assistance',
    'Assistance',
    settings.assistanceMode,
    [
      { value: 'off', label: 'Off' },
      { value: 'gentle', label: 'Gentle' },
      { value: 'standard', label: 'Standard' },
    ],
    (next) => callbacks.onSettingsChange({ ...settings, assistanceMode: next }),
  );
  addSelect<TextScale>(
    'journal-setting-text-scale',
    'Text size',
    settings.textScale,
    [
      { value: 'normal', label: 'Normal' },
      { value: 'large', label: 'Large' },
    ],
    (next) => callbacks.onSettingsChange({ ...settings, textScale: next }),
  );
  addSelect<TouchLayout>(
    'journal-setting-touch',
    'Touch controls',
    settings.touchLayout,
    [
      { value: 'auto', label: 'Auto' },
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ],
    (next) => callbacks.onSettingsChange({ ...settings, touchLayout: next }),
  );

  const reset = element('button', { id: 'journal-reset-settings', text: 'Reset settings' });
  reset.type = 'button';
  reset.dataset.journalNav = 'true';
  reset.dataset.focusKey = 'journal-reset-settings';
  reset.addEventListener('click', callbacks.onResetSettings);

  form.append(reset);
  node.append(form);
  return node;
}

function body(
  view: JournalView,
  settings: HostSettings,
  selectedSubjectId: string | null,
  callbacks: JournalPanelCallbacks,
): HTMLElement {
  const root = element('div', { className: 'journal-body' });

  const subjectRows = view.subjects.map((subject) => {
    const item = element('li', {
      className: `service-row journal-subject${
        subject.subjectId === selectedSubjectId ? ' current' : ''
      }`,
    });
    const select = element('button', {
      text: `${subject.subjectName} — ${subject.roomsCleared} / ${subject.totalRooms} rooms · ${subject.xp} XP · ${subject.rank}`,
    });
    select.type = 'button';
    select.dataset.journalNav = 'true';
    select.dataset.focusKey = `journal-subject-${subject.subjectId}`;
    select.setAttribute(
      'aria-pressed',
      subject.subjectId === selectedSubjectId ? 'true' : 'false',
    );
    select.addEventListener('click', () => callbacks.onSelectSubject(subject.subjectId));

    const enter = element('button', { text: 'Enter' });
    enter.type = 'button';
    enter.dataset.journalNav = 'true';
    enter.dataset.focusKey = `journal-enter-${subject.subjectId}`;
    enter.setAttribute('aria-label', `Enter ${subject.subjectName}`);
    enter.addEventListener('click', () => callbacks.onEnterSubject(subject.subjectId));

    item.append(select, enter);
    return item;
  });

  /* Overview */
  const overview = section('Overview', 'journal-overview');
  const active = view.subjects.find((subject) => subject.subjectId === view.activeSubjectId);
  overview.append(
    definitionRows([
      ['Active subject', active?.subjectName ?? 'No active subject'],
      ['Quest step', view.questStep],
      ['Archetype', view.archetype ?? 'Not chosen yet'],
      ['Subjects', String(view.subjects.length)],
      ['Rooms due', String(view.due.length)],
      [
        'XP awarded (records)',
        view.stats ? String(view.stats.totals.xpEarned) : 'No records yet',
      ],
    ]),
  );

  /* Subjects */
  const subjects = section('Subjects', 'journal-subjects');
  if (subjectRows.length === 0) {
    subjects.append(
      empty('No subjects yet. Start the tutorial or create a subject in the Creator.'),
    );
  } else {
    const list = element('ul', { className: 'service-list' });
    list.append(...subjectRows);
    subjects.append(
      list,
      element('p', {
        className: 'note-hint',
        text: 'Selecting a subject highlights it. Enter opens the same portal the street uses.',
      }),
    );
  }

  /* Progress */
  const progress = section('Progress', 'journal-progress');
  if (view.subjects.length === 0) {
    progress.append(
      empty('No progress yet. Clear a room to record XP, rank, and room counts here.'),
    );
  } else {
    const list = element('ul', { className: 'service-list' });
    for (const subject of view.subjects) {
      list.append(
        element('li', {
          className: 'service-row',
          text:
            `${subject.subjectName} — ${subject.roomsCleared} / ${subject.totalRooms} cleared · ` +
            `${subject.rank} · ${subject.xp} XP · ` +
            `${countLabel(subject.dueRooms, 'room')} due`,
        }),
      );
    }
    progress.append(list);
  }

  /* Badges */
  const badges = section('Badges', 'journal-badges');
  const badgeRows: HTMLElement[] = [];
  for (const subject of view.subjects) {
    for (const badge of subject.badges) {
      badgeRows.push(
        element('li', { className: 'service-row', text: `${subject.subjectName} — ${badge}` }),
      );
    }
  }
  if (badgeRows.length === 0) {
    badges.append(
      empty('No badges yet. Clearing rooms and passing reviews unlocks them.'),
    );
  } else {
    const list = element('ul', { className: 'service-list' });
    list.append(...badgeRows);
    badges.append(list);
  }

  /* Records */
  const records = section('Records', 'journal-records');
  if (!view.stats) {
    records.append(
      empty(
        'No records yet. Visit rooms, submit notes, and pass reviews to build the engine’s statistics.',
      ),
    );
  } else {
    const totals = view.stats.totals;
    records.append(
      definitionRows([
        ['Sessions completed', String(totals.sessionsCompleted)],
        ['Study time', `${totals.studyTimeMinutes} min`],
        ['Notes submitted', String(totals.notesSubmitted)],
        ['Reviews completed', String(totals.reviewsCompleted)],
        ['Fish kept', String(totals.fishKept)],
        ['Distinct fish species', String(totals.distinctFishSpecies)],
        ['Rooms visited', String(totals.uniqueRoomsVisited)],
        ['Active days', String(totals.activeDays)],
        ['Study day streak', String(totals.consecutiveStudyDayStreak)],
        ['Review day streak', String(totals.consecutiveReviewDayStreak)],
        ['Subjects with proven mastery', String(totals.subjectsWithProvenMastery)],
      ]),
      element('p', {
        className: 'note-hint',
        text: 'Every number is the engine’s statistics snapshot; the host does not re-sum progress.',
      }),
    );
  }

  /* Inventory */
  const inventory = section('Inventory', 'journal-inventory');
  if (view.inventory.length === 0) {
    inventory.append(
      empty('No equipment yet. Clearing a room with a strong note can drop gear.'),
    );
  } else {
    const list = element('ul', { className: 'service-list' });
    for (const item of view.inventory) {
      list.append(
        element('li', {
          className: 'service-row',
          text: `${item.name} — ${item.slot ?? 'not equippable'} — ${
            item.equipped ? 'equipped' : 'not equipped'
          }`,
        }),
      );
    }
    inventory.append(list);
  }

  /* Fish */
  const fish = section('Fish', 'journal-fish');
  if (view.fish.length === 0) {
    fish.append(empty('No fish yet. Clear a room, then keep a catch at a pond.'));
  } else {
    const list = element('ul', { className: 'service-list' });
    for (const entry of view.fish) {
      list.append(
        element('li', {
          className: 'service-row',
          text: `${entry.name} — ${entry.rarity} — ${entry.subjectName}`,
        }),
      );
    }
    fish.append(list);
  }

  /* Due */
  const due = section('Due', 'journal-due');
  if (view.due.length === 0) {
    due.append(
      empty('No rooms are due right now. Clear and review a room to start the schedule.'),
    );
  } else {
    const list = element('ul', { className: 'service-list' });
    for (const entry of view.due) {
      list.append(
        element('li', {
          className: 'service-row',
          text: `${entry.subjectName} — ${entry.topic} — ${entry.dueLabel}`,
        }),
      );
    }
    due.append(list);
  }

  root.append(
    overview,
    subjects,
    progress,
    badges,
    records,
    inventory,
    fish,
    due,
    assistanceSection(view, settings),
    settingsSection(settings, callbacks),
  );
  return root;
}

/** Mount the journal into its host element. */
export function mountJournalPanel(
  root: HTMLElement,
  view: JournalView,
  settings: HostSettings,
  selectedSubjectId: string | null,
  returnFocus: HTMLElement,
  callbacks: JournalPanelCallbacks,
): JournalPanel {
  root.hidden = false;
  root.replaceChildren();
  root.setAttribute('aria-labelledby', 'journal-panel-title');
  root.setAttribute('aria-describedby', 'journal-panel-subtitle');

  let pending = false;
  let pendingFocusKey = '';
  let currentView = view;
  let currentSettings = settings;
  let currentSelected = selectedSubjectId;

  function focusByKey(key: string): boolean {
    if (!key) return false;
    const match = root.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
    if (!match || (match as HTMLButtonElement).disabled) return false;
    match.focus({ preventScroll: true });
    return true;
  }

  function render(): void {
    const active = document.activeElement;
    const activeKey = active instanceof HTMLElement ? active.dataset.focusKey ?? '' : '';
    const scrollTop = root.scrollTop;
    root.replaceChildren();

    const header = element('header', { className: 'service-header journal-header' });
    const title = element('h2', { id: 'journal-panel-title', text: 'Journal' });
    title.tabIndex = -1;
    const subtitle = element('p', {
      id: 'journal-panel-subtitle',
      className: 'note-hint',
      text: 'Subjects, progress, records, due rooms, assistance, and device settings.',
    });
    const settingsButton = element('button', {
      id: 'journal-open-settings',
      text: 'Settings',
    });
    settingsButton.type = 'button';
    settingsButton.dataset.journalNav = 'true';
    settingsButton.dataset.focusKey = 'journal-open-settings';
    settingsButton.addEventListener('click', () => {
      callbacks.onOpenSettings();
      focusSettings();
    });
    const closeButton = element('button', { id: 'journal-close', text: 'Close' });
    closeButton.type = 'button';
    closeButton.dataset.journalNav = 'true';
    closeButton.dataset.focusKey = 'journal-close';
    closeButton.addEventListener('click', () => {
      if (!pending) callbacks.onClose();
    });

    header.append(title, subtitle, settingsButton, closeButton);

    const error = element('div', { id: 'journal-error' });
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const content = body(currentView, currentSettings, currentSelected, callbacks);
    const wrap = element('div', { className: 'journal-form' });
    wrap.append(header, error, content);
    root.append(wrap);

    for (const node of root.querySelectorAll<HTMLButtonElement>('button')) {
      if (node.id !== 'journal-close') node.disabled = pending;
    }
    root.scrollTop = scrollTop;
    if (!pending && activeKey && focusByKey(activeKey)) return;
    if (!pending && (!document.activeElement || !root.contains(document.activeElement))) {
      title.focus({ preventScroll: true });
    }
  }

  function focusSettings(): void {
    const heading = root.querySelector<HTMLElement>('#journal-settings h3');
    const first = root.querySelector<HTMLElement>('#journal-setting-reduced-motion');
    heading?.scrollIntoView?.({ block: 'start' });
    if (first) first.focus({ preventScroll: false });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape' || event.code === 'KeyJ') {
      event.preventDefault();
      // The host also listens on `window`. Closing detaches this panel, so
      // without this the same J press would bubble out and reopen it.
      event.stopPropagation();
      if (!pending) callbacks.onClose();
      return;
    }
    if (event.key === 'Tab') {
      const usable = visibleControls(root).filter(
        (node) => !(node as HTMLButtonElement).disabled,
      );
      if (usable.length === 0) return;
      const first = usable[0];
      const last = usable[usable.length - 1];
      const active = document.activeElement;
      if (active === root.querySelector('#journal-panel-title')) {
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
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
    ) {
      return;
    }
    const usable = visibleControls(root)
      .filter((node) => node.dataset.journalNav === 'true')
      .filter((node) => !(node as HTMLButtonElement).disabled);
    if (usable.length === 0) return;
    event.preventDefault();
    const index = usable.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next =
      index < 0
        ? usable[0]
        : usable[(index + step + usable.length) % usable.length];
    next.focus({ preventScroll: true });
  }

  root.addEventListener('keydown', onKeyDown);
  render();
  root.querySelector<HTMLElement>('#journal-panel-title')?.focus({ preventScroll: true });

  return {
    update(nextView, nextSettings, nextSelected) {
      currentView = nextView;
      currentSettings = nextSettings;
      currentSelected = nextSelected;
      render();
    },
    setPending(value) {
      if (value) {
        const active = document.activeElement;
        pendingFocusKey = active instanceof HTMLElement ? active.dataset.focusKey ?? '' : '';
      }
      pending = value;
      for (const node of root.querySelectorAll<HTMLButtonElement>('button')) {
        node.disabled = pending && node.id !== 'journal-close';
      }
      if (!value) {
        const target = pendingFocusKey;
        pendingFocusKey = '';
        if (!target || !focusByKey(target)) {
          if (!document.activeElement || !root.contains(document.activeElement)) {
            root.querySelector<HTMLElement>('#journal-panel-title')?.focus({ preventScroll: true });
          }
        }
      }
    },
    showError(message) {
      const error = root.querySelector<HTMLElement>('#journal-error');
      if (!error) return;
      error.textContent = message;
      error.hidden = false;
      error.scrollIntoView?.({ block: 'nearest' });
    },
    focusSettings,
    close() {
      root.hidden = true;
      root.replaceChildren();
      returnFocus.focus({ preventScroll: true });
    },
  };
}
