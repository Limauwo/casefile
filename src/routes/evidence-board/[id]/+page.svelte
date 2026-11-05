<script lang="ts">
  import { page } from '$app/stores';
  import { cases, notes, isInitialized, type Note, type Case, addNote, updateNote, deleteNote } from '$lib/store';
  import NoteEditor from '$lib/NoteEditor.svelte';
  import EvidenceBoardMinimap from '$lib/EvidenceBoardMinimap.svelte';
  import type { MinimapItem } from '$lib/evidenceBoardMinimap';
  import { formatNoteContent, getNoteContentBlocks, toggleChecklistItem } from '$lib/noteFormatting';
  import { appPath } from '$lib/paths';
  import { FileText, Plus, X, Edit3, Trash2, Map, Target, ArrowLeft, Eye, ZoomIn, ZoomOut } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  $: caseId = $page.params.id ?? '';
  $: caseItem = $cases.find(c => c.id === caseId) as Case | undefined;

  // Note card dimensions (must match rendered card)
  const NOTE_W = 220;
  const NOTE_H = 120; // approximate
  const HUB_W = 140;
  const HUB_H = 70;
  const GRID_SIZE = 40;
  const WORLD_SIZE = 100000;
  const WORLD_ORIGIN = WORLD_SIZE / 2;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3;
  const PAN_SENSITIVITY = 0.65;
  const MARQUEE_THRESHOLD = 4;
  type Point = { x: number; y: number };
  type BoardItem = { kind: 'note' | 'hub'; id: string };
  type Interaction =
    | { mode: 'idle' }
    | { mode: 'panning'; pointerId: number; lastScreen: Point; startScreen: Point; button: number; didPan: boolean }
    | { mode: 'marquee'; pointerId: number; startWorld: Point; currentWorld: Point; startScreen: Point; moved: boolean; additive: boolean; initialSelection: Set<string> }
    | { mode: 'draggingItems'; pointerId: number; startScreen: Point; initialPositions: Record<string, Point> };
  let viewport = { x: 0, y: 0, scale: 1 };
  let interaction: Interaction = { mode: 'idle' };
  let selectedItems = new Set<string>();
  let expandedNoteContent = new Set<string>();
  let isSpacePressed = false;
  let snapToGridEnabled = true;
  let boardCanvas: HTMLDivElement;
  let boardSize = { width: 0, height: 0 };
  let hasInitializedViewport = false;
  let itemSizes: Record<string, { width: number; height: number }> = {};
  let pendingDragFrame = 0;
  let pendingDragMove: { point: Point; startScreen: Point; initialPositions: Record<string, Point> } | null = null;
  let suppressNextContextMenu = false;

  function screenToWorld(point: Point): Point {
    return {
      x: (point.x - viewport.x) / viewport.scale - WORLD_ORIGIN,
      y: (point.y - viewport.y) / viewport.scale - WORLD_ORIGIN
    };
  }

  function worldToScreen(point: Point): Point {
    return {
      x: viewport.x + (WORLD_ORIGIN + point.x) * viewport.scale,
      y: viewport.y + (WORLD_ORIGIN + point.y) * viewport.scale
    };
  }

  function boardPoint(event: PointerEvent | WheelEvent): Point {
    const rect = boardCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - boardCanvas.clientLeft,
      y: event.clientY - rect.top - boardCanvas.clientTop
    };
  }

  function selectionKey(item: BoardItem): string {
    return `${item.kind}:${item.id}`;
  }

  function isSelected(item: BoardItem): boolean {
    return selectedItems.has(selectionKey(item));
  }

  function applySelection(item: BoardItem, additive: boolean) {
    const key = selectionKey(item);
    if (!additive) {
      selectedItems = new Set([key]);
    } else {
      const next = new Set(selectedItems);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      selectedItems = next;
    }
  }

  function pointFromKey(key: string): Point | undefined {
    const separator = key.indexOf(':');
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (kind === 'note') {
      const note = boardNotes.find(item => item.id === id);
      return note ? { x: note.positionX, y: note.positionY } : undefined;
    }
    return hubPositions[id];
  }

  function trackItemSize(node: HTMLElement, key: string) {
    const updateSize = () => {
      const size = { width: node.offsetWidth, height: node.offsetHeight };
      const previous = itemSizes[key];
      if (previous?.width === size.width && previous.height === size.height) return;
      itemSizes = { ...itemSizes, [key]: size };
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    updateSize();

    return {
      destroy() {
        observer.disconnect();
        const { [key]: _removed, ...remainingSizes } = itemSizes;
        itemSizes = remainingSizes;
      }
    };
  }

  function observeBoard(node: HTMLDivElement) {
    const updateSize = () => {
      boardSize = { width: node.clientWidth, height: node.clientHeight };
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    updateSize();
    if (!hasInitializedViewport) {
      viewport = {
        x: node.clientWidth / 2 - WORLD_ORIGIN,
        y: node.clientHeight / 2 - WORLD_ORIGIN,
        scale: 1
      };
      hasInitializedViewport = true;
    }

    return { destroy: () => observer.disconnect() };
  }

  function updateItems(positions: Record<string, Point>) {
    notes.update(items => items.map(note => {
      const position = positions[`note:${note.id}`];
      return position && note.relatedCaseId === caseId
        ? { ...note, positionX: position.x, positionY: position.y }
        : note;
    }));

    const hubUpdates: Record<string, Point> = {};
    for (const [key, position] of Object.entries(positions)) {
      if (key.startsWith('hub:')) hubUpdates[key.slice(4)] = position;
    }
    if (Object.keys(hubUpdates).length > 0) {
      hubPositions = { ...hubPositions, ...hubUpdates };
    }
  }

  function moveItems(point: Point, startScreen: Point, initialPositions: Record<string, Point>) {
    const delta = {
      x: (point.x - startScreen.x) / viewport.scale,
      y: (point.y - startScreen.y) / viewport.scale
    };
    const nextPositions: Record<string, Point> = {};
    for (const [key, initial] of Object.entries(initialPositions)) {
      const next = { x: initial.x + delta.x, y: initial.y + delta.y };
      nextPositions[key] = snapToGridEnabled
        ? { x: snapToGrid(next.x), y: snapToGrid(next.y) }
        : next;
    }
    updateItems(nextPositions);
  }

  function scheduleItemMove(point: Point, startScreen: Point, initialPositions: Record<string, Point>) {
    pendingDragMove = { point, startScreen, initialPositions };
    if (pendingDragFrame) return;
    pendingDragFrame = requestAnimationFrame(() => {
      pendingDragFrame = 0;
      if (pendingDragMove) {
        moveItems(pendingDragMove.point, pendingDragMove.startScreen, pendingDragMove.initialPositions);
        pendingDragMove = null;
      }
    });
  }

  function flushItemMove(point?: Point) {
    if (pendingDragFrame) {
      cancelAnimationFrame(pendingDragFrame);
      pendingDragFrame = 0;
    }
    const pending = pendingDragMove;
    pendingDragMove = null;
    if (pending) {
      moveItems(point ?? pending.point, pending.startScreen, pending.initialPositions);
    }
  }

  function adjustZoomAt(screen: Point, amount: number) {
    const worldPoint = screenToWorld(screen);
    const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.scale * amount));
    if (nextScale === viewport.scale) return;
    viewport = {
      x: screen.x - (WORLD_ORIGIN + worldPoint.x) * nextScale,
      y: screen.y - (WORLD_ORIGIN + worldPoint.y) * nextScale,
      scale: nextScale
    };
  }

  function navigateToWorld(worldX: number, worldY: number) {
    viewport = {
      ...viewport,
      x: boardSize.width / 2 - (WORLD_ORIGIN + worldX) * viewport.scale,
      y: boardSize.height / 2 - (WORLD_ORIGIN + worldY) * viewport.scale
    };
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    if (interaction.mode !== 'idle') return;
    const point = boardPoint(event);
    if (event.ctrlKey) {
      adjustZoomAt(point, Math.exp(-event.deltaY * 0.01));
      return;
    }
    viewport = {
      ...viewport,
      x: viewport.x - event.deltaX * PAN_SENSITIVITY,
      y: viewport.y - event.deltaY * PAN_SENSITIVITY
    };
  }

  function preventContextMenu(event: MouseEvent) {
    if (!suppressNextContextMenu) return;
    event.preventDefault();
    suppressNextContextMenu = false;
  }

  function snapToGrid(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  // Keep a separate hub position for each case while navigating between boards.
  let hubPositions: Record<string, { x: number; y: number }> = {};
  
  $: {
    if (caseItem && !hubPositions[caseItem.id]) {
      const i = $cases.findIndex(c => c.id === caseItem.id);
      hubPositions[caseItem.id] = { x: 80 + i * 260, y: 40 };
    }
  }

  // Filtered notes
  $: boardNotes = $notes.filter(n => n.relatedCaseId === caseId);

  $: activeCases = caseItem ? [caseItem] : [];

  function handlePointerDown(event: PointerEvent) {
    const board = event.currentTarget as HTMLDivElement;
    const target = event.target as HTMLElement;
    const point = boardPoint(event);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const itemElement = target.closest<HTMLElement>('[data-board-item]');
    const controlsElement = target.closest('button, a, input, select, [data-board-controls]');

    if (controlsElement && event.button !== 1 && event.button !== 2) return;
    if (event.button === 2) suppressNextContextMenu = false;
    if (event.button === 1 || event.button === 2 || (event.button === 0 && isSpacePressed)) {
      if (event.button !== 2) event.preventDefault();
      board.setPointerCapture(event.pointerId);
      interaction = {
        mode: 'panning',
        pointerId: event.pointerId,
        lastScreen: point,
        startScreen: point,
        button: event.button,
        didPan: false
      };
      return;
    }
    if (event.button !== 0 || controlsElement) return;

    board.setPointerCapture(event.pointerId);
    if (itemElement) {
      const item: BoardItem = {
        kind: itemElement.dataset.boardItem as BoardItem['kind'],
        id: itemElement.dataset.itemId ?? ''
      };
      const key = selectionKey(item);
      if (additive) {
        if (selectedItems.has(key)) {
          const next = new Set(selectedItems);
          next.delete(key);
          selectedItems = next;
          interaction = { mode: 'idle' };
          event.preventDefault();
          return;
        }
        selectedItems = new Set([...selectedItems, key]);
      } else if (!selectedItems.has(key)) {
        selectedItems = new Set([key]);
      }

      const initialPositions: Record<string, Point> = {};
      for (const selectedKey of selectedItems) {
        const position = pointFromKey(selectedKey);
        if (position) initialPositions[selectedKey] = position;
      }
      interaction = {
        mode: 'draggingItems',
        pointerId: event.pointerId,
        startScreen: point,
        initialPositions
      };
      event.preventDefault();
      return;
    }

    const worldPoint = screenToWorld(point);
    interaction = {
      mode: 'marquee',
      pointerId: event.pointerId,
      startWorld: worldPoint,
      currentWorld: worldPoint,
      startScreen: point,
      moved: false,
      additive,
      initialSelection: new Set(selectedItems)
    };
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent) {
    if (interaction.mode === 'idle' || interaction.pointerId !== event.pointerId) return;
    const point = boardPoint(event);

    if (interaction.mode === 'panning') {
      const dx = point.x - interaction.lastScreen.x;
      const dy = point.y - interaction.lastScreen.y;
      viewport = { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
      const didPan = interaction.didPan ||
        Math.hypot(point.x - interaction.startScreen.x, point.y - interaction.startScreen.y) >= MARQUEE_THRESHOLD;
      interaction = { ...interaction, lastScreen: point, didPan };
      return;
    }

    if (interaction.mode === 'marquee') {
      const startScreen = worldToScreen(interaction.startWorld);
      const moved = interaction.moved ||
        Math.abs(point.x - startScreen.x) >= MARQUEE_THRESHOLD ||
        Math.abs(point.y - startScreen.y) >= MARQUEE_THRESHOLD;
      interaction = { ...interaction, currentWorld: screenToWorld(point), moved };
      return;
    }

    scheduleItemMove(point, interaction.startScreen, interaction.initialPositions);
  }

  function itemIntersectsRect(item: BoardItem, rect: { left: number; top: number; right: number; bottom: number }): boolean {
    const position = pointFromKey(selectionKey(item));
    if (!position) return false;
    const width = item.kind === 'note' ? NOTE_W : HUB_W;
    const element = document.getElementById(`${item.kind}-${item.id}`);
    const height = element?.offsetHeight ?? (item.kind === 'note' ? NOTE_H : HUB_H);
    const top = position.y - (item.kind === 'note' ? 12 : 8);
    return position.x <= rect.right &&
      position.x + width >= rect.left &&
      top <= rect.bottom &&
      top + height >= rect.top;
  }

  function finishInteraction(event: PointerEvent, cancelled = false) {
    if (interaction.mode === 'idle' || interaction.pointerId !== event.pointerId) return;
    const board = event.currentTarget as HTMLDivElement;

    if (interaction.mode === 'draggingItems') {
      flushItemMove(cancelled ? undefined : boardPoint(event));
      if (cancelled) updateItems(interaction.initialPositions);
    } else if (interaction.mode === 'panning' && interaction.button === 2 && interaction.didPan && !cancelled) {
      suppressNextContextMenu = true;
    } else if (interaction.mode === 'marquee') {
      if (!cancelled) {
        const endScreen = boardPoint(event);
        const moved = interaction.moved ||
          Math.abs(endScreen.x - interaction.startScreen.x) >= MARQUEE_THRESHOLD ||
          Math.abs(endScreen.y - interaction.startScreen.y) >= MARQUEE_THRESHOLD;
        if (!moved) {
          selectedItems = new Set();
        } else {
          const endWorld = screenToWorld(endScreen);
          const rect = {
            left: Math.min(interaction.startWorld.x, endWorld.x),
            top: Math.min(interaction.startWorld.y, endWorld.y),
            right: Math.max(interaction.startWorld.x, endWorld.x),
            bottom: Math.max(interaction.startWorld.y, endWorld.y)
          };
          const hits = [
            ...boardNotes.map(note => ({ kind: 'note' as const, id: note.id })),
            ...activeCases.map(item => ({ kind: 'hub' as const, id: item.id }))
          ].filter(item => itemIntersectsRect(item, rect)).map(selectionKey);
          selectedItems = interaction.additive
            ? new Set([...interaction.initialSelection, ...hits])
            : new Set(hits);
        }
      }
    }

    interaction = { mode: 'idle' };
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent) {
    finishInteraction(event);
  }

  function handlePointerCancel(event: PointerEvent) {
    finishInteraction(event, true);
  }

  function handleItemKeydown(event: KeyboardEvent, item: BoardItem) {
    if (event.target !== event.currentTarget || event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    applySelection(item, event.shiftKey || event.ctrlKey || event.metaKey);
  }

  function handleWindowKeyDown(event: KeyboardEvent) {
    if (event.code === 'Space' && !event.repeat && !isTypingTarget(event.target)) {
      isSpacePressed = true;
      event.preventDefault();
    }
    if (event.key === 'Escape') {
      flushItemMove();
      if (interaction.mode === 'draggingItems') updateItems(interaction.initialPositions);
      closeNotePreview();
      if (interaction.mode !== 'idle' && boardCanvas?.hasPointerCapture(interaction.pointerId)) {
        boardCanvas.releasePointerCapture(interaction.pointerId);
      }
      interaction = { mode: 'idle' };
      selectedItems = new Set();
      return;
    }

    const boardHasFocus = boardCanvas && boardCanvas.contains(document.activeElement);
    if (
      boardHasFocus &&
      !isTypingTarget(event.target) &&
      interaction.mode === 'idle' &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      const distance = event.shiftKey ? 80 : 24;
      const movement: Record<string, Point> = {
        ArrowUp: { x: 0, y: distance },
        ArrowDown: { x: 0, y: -distance },
        ArrowLeft: { x: distance, y: 0 },
        ArrowRight: { x: -distance, y: 0 }
      };
      const delta = movement[event.key];
      viewport = { ...viewport, x: viewport.x + delta.x, y: viewport.y + delta.y };
      event.preventDefault();
    }
  }

  function handleWindowKeyUp(event: KeyboardEvent) {
    if (event.code === 'Space') isSpacePressed = false;
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable ||
      target.closest('button, a, input, textarea, select, [data-board-controls]') !== null;
  }

  function handleWindowBlur() {
    isSpacePressed = false;
    if (interaction.mode !== 'idle') {
      flushItemMove();
      if (interaction.mode === 'draggingItems') updateItems(interaction.initialPositions);
      if (boardCanvas.hasPointerCapture(interaction.pointerId)) {
        boardCanvas.releasePointerCapture(interaction.pointerId);
      }
      interaction = { mode: 'idle' };
    }
  }

  onDestroy(() => {
    if (pendingDragFrame) cancelAnimationFrame(pendingDragFrame);
  });

  $: minimapItems = [
    ...boardNotes.map(note => ({
      id: note.id,
      kind: 'note' as const,
      x: note.positionX,
      y: note.positionY,
      width: itemSizes[`note:${note.id}`]?.width ?? NOTE_W,
      height: itemSizes[`note:${note.id}`]?.height ?? NOTE_H,
      selected: selectedItems.has(`note:${note.id}`)
    })),
    ...activeCases
      .filter(item => hubPositions[item.id])
      .map(item => ({
        id: item.id,
        kind: 'hub' as const,
        x: hubPositions[item.id].x,
        y: hubPositions[item.id].y,
        width: itemSizes[`hub:${item.id}`]?.width ?? HUB_W,
        height: itemSizes[`hub:${item.id}`]?.height ?? HUB_H,
        selected: selectedItems.has(`hub:${item.id}`)
      }))
  ] satisfies MinimapItem[];

  $: gridStep = GRID_SIZE * viewport.scale;
  $: gridPositionX = ((viewport.x % gridStep) + gridStep) % gridStep;
  $: gridPositionY = ((viewport.y % gridStep) + gridStep) % gridStep;
  $: marqueeRect = interaction.mode === 'marquee' && interaction.moved
    ? (() => {
        const start = worldToScreen(interaction.startWorld);
        const end = worldToScreen(interaction.currentWorld);
        return {
          left: Math.min(start.x, end.x),
          top: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y)
        };
      })()
    : null;

  // Build SVG thread paths using cubic bezier curves
  function threadPath(x1: number, y1: number, x2: number, y2: number): string {
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cy1 = y1;
    const cx2 = x1 + (x2 - x1) * 0.5;
    const cy2 = y2;
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  }

  // --- Modal State ---
  let isModalOpen = false;
  let editingNoteId: string | null = null;
  let formTitle = '';
  let formContent = '';
  let formParentIds: string[] = [];
  let formError = '';
  let previewNote: Note | null = null;

  function showNotePreview(note: Note) {
    previewNote = note;
  }

  function closeNotePreview() {
    previewNote = null;
  }

  function openModal(n?: Note) {
    if (n) {
      editingNoteId = n.id;
      formTitle = n.title;
      formContent = n.content;
      formParentIds = n.parentNoteIds ?? [];
    } else {
      editingNoteId = null;
      formTitle = '';
      formContent = '';
      formParentIds = [];
    }
    formError = '';
    isModalOpen = true;
  }

  function isDescendantOf(noteId: string, possibleDescendantId: string): boolean {
    const visited = new Set<string>();
    const pending = [noteId];

    while (pending.length > 0) {
      const currentId = pending.pop();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      for (const child of boardNotes.filter(note => note.parentNoteIds?.includes(currentId))) {
        if (child.id === possibleDescendantId) return true;
        pending.push(child.id);
      }
    }

    return false;
  }

  function canBeParent(note: Note): boolean {
    return note.id !== editingNoteId &&
      (!editingNoteId || !isDescendantOf(editingNoteId, note.id));
  }

  function toggleParent(noteId: string, event: Event) {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    formParentIds = checked
      ? [...new Set([...formParentIds, noteId])]
      : formParentIds.filter(id => id !== noteId);
  }

  function saveNote() {
    if (!formTitle.trim()) {
      formError = 'A title is required.';
      return;
    }
    if (formParentIds.some(id => !boardNotes.some(note => note.id === id && canBeParent(note)))) {
      formError = 'A route cannot link evidence to itself or create a cycle.';
      return;
    }
    const noteData = {
      title: formTitle,
      content: formContent,
      relatedCaseId: caseId,
      parentNoteIds: formParentIds
    };
    if (editingNoteId) {
      updateNote(editingNoteId, noteData);
    } else {
      const center = screenToWorld({
        x: boardCanvas.clientWidth / 2,
        y: boardCanvas.clientHeight / 2
      });
      addNote({
        ...noteData,
        positionX: center.x - NOTE_W / 2,
        positionY: center.y - NOTE_H / 2
      });
    }
    isModalOpen = false;
  }

  function toggleNoteChecklistItem(noteId: string, lineIndex: number) {
    const note = boardNotes.find(item => item.id === noteId);
    if (!note) return;
    updateNote(noteId, { content: toggleChecklistItem(note.content, lineIndex) });
  }

  function hasChecklist(content: string): boolean {
    return getNoteContentBlocks(content).some(block => block.type === 'checklist');
  }

  function toggleNoteContent(noteId: string) {
    const next = new Set(expandedNoteContent);
    if (next.has(noteId)) next.delete(noteId);
    else next.add(noteId);
    expandedNoteContent = next;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<svelte:window on:keydown={handleWindowKeyDown} on:keyup={handleWindowKeyUp} on:blur={handleWindowBlur} />

{#if !$isInitialized}
  <div class="flex-1 flex flex-col items-center justify-center text-secondary animate-pulse space-y-4">
    <Map size={48} class="opacity-50" />
    <p class="font-mono text-sm tracking-widest">LOADING MATRIX...</p>
  </div>
{:else if !caseItem}
  <div class="p-8 text-center space-y-4">
    <h2 class="text-xl text-primary font-mono font-bold">CASE NOT FOUND</h2>
    <p class="text-secondary text-sm">This evidence board is not attached to an existing case.</p>
    <a href={appPath("/evidence-board")} class="inline-flex items-center gap-2 text-accent hover:underline font-mono text-xs">
      <ArrowLeft size={14} /> ALL EVIDENCE BOARDS
    </a>
  </div>
{:else}
<div class="max-w-none mx-auto h-full flex flex-col gap-0" style="max-height: calc(100vh - 5rem);">
  <!-- Header -->
  <div class="flex justify-between items-end border-b border-border pb-3 shrink-0 px-1 mb-2">
    <div>
      <a href={appPath("/evidence-board")} class="inline-flex items-center gap-1 text-secondary hover:text-accent font-mono text-[10px] mb-1">
        <ArrowLeft size={12} /> ALL EVIDENCE BOARDS
      </a>
      <h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
        <Map size={24} class="text-accent" />
        EVIDENCE BOARD <span class="text-accent">{caseItem.caseNumber}</span>
      </h1>
      <p class="text-secondary font-mono text-xs mt-0.5">{caseItem.title} · Drag items · Middle/Right/Space-drag or two-finger scroll to pan · Ctrl-scroll to zoom</p>
    </div>
    <div class="flex items-center gap-3">
      <label for="snap-to-grid" class="inline-flex items-center gap-2 text-secondary font-mono text-[10px] cursor-pointer select-none">
        <input
          id="snap-to-grid"
          type="checkbox"
          bind:checked={snapToGridEnabled}
          class="accent-[#A64242]"
        />
        SNAP TO GRID
      </label>
      <span class="font-mono text-xs text-secondary border border-border px-2 py-1 rounded-sm">
        {boardNotes.length} NOTES · CASE-SPECIFIC
      </span>
      <button on:click={() => openModal()} class="flex items-center gap-2 bg-surface hover:bg-border text-primary border border-border px-4 py-2 rounded-sm transition-colors font-mono text-sm group">
        <Plus size={16} class="group-hover:text-accent transition-colors" />
        NEW NOTE
      </button>
    </div>
  </div>

    <!-- Board Canvas -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      id="evidence-board-canvas"
      bind:this={boardCanvas}
      use:observeBoard
      role="application"
      tabindex="0"
      aria-label="Interactive evidence board. Use middle or right mouse, or hold Space and drag to pan. Use arrow keys to pan and Shift, Control, or Command with click to select multiple items."
      class="flex-1 relative overflow-hidden border border-border rounded-sm touch-none select-none outline-none focus-visible:ring-1 focus-visible:ring-accent {interaction.mode === 'panning' ? 'cursor-grabbing' : 'cursor-grab'}"
      style="min-height: 600px; user-select: none; background-color: #111315; background-image: linear-gradient(to right, #30353a 1px, transparent 1px), linear-gradient(to bottom, #30353a 1px, transparent 1px); background-size: {gridStep}px {gridStep}px; background-position: {gridPositionX}px {gridPositionY}px;"
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={handlePointerUp}
      on:pointercancel={handlePointerCancel}
      on:lostpointercapture={handlePointerCancel}
      on:contextmenu={preventContextMenu}
      on:wheel|nonpassive={handleWheel}
    >
    <EvidenceBoardMinimap
      viewport={viewport}
      items={minimapItems}
      viewportSize={boardSize}
      worldOrigin={WORLD_ORIGIN}
      onNavigate={navigateToWorld}
    />

    {#if marqueeRect}
        <div
          aria-hidden="true"
          class="absolute z-40 border border-accent bg-accent/20 pointer-events-none"
          style="left: {marqueeRect.left}px; top: {marqueeRect.top}px; width: {marqueeRect.width}px; height: {marqueeRect.height}px;"
        ></div>
      {/if}

      <div data-board-controls class="absolute top-3 left-3 z-50 flex items-center gap-1 border border-border bg-background/90 rounded-sm p-1 shadow-lg">
        <button
          on:click={() => adjustZoomAt({ x: boardCanvas.clientWidth / 2, y: boardCanvas.clientHeight / 2 }, 1 / 1.1)}
          disabled={viewport.scale <= MIN_ZOOM}
          aria-label="Zoom out"
          title="Zoom out"
          class="p-1.5 text-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ZoomOut size={16} />
        </button>
        <span class="min-w-[3.5rem] text-center font-mono text-[10px] text-primary">{Math.round(viewport.scale * 100)}%</span>
        <button
          on:click={() => adjustZoomAt({ x: boardCanvas.clientWidth / 2, y: boardCanvas.clientHeight / 2 }, 1.1)}
          disabled={viewport.scale >= MAX_ZOOM}
          aria-label="Zoom in"
          title="Zoom in"
          class="p-1.5 text-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <div
        class="absolute top-0 left-0 origin-top-left"
        style="width: {WORLD_SIZE}px; height: {WORLD_SIZE}px; transform: translate({viewport.x}px, {viewport.y}px) scale({viewport.scale});"
      >
      <!-- SVG Thread Overlay -->
      <svg aria-hidden="true" class="absolute inset-0 pointer-events-none z-10" style="width: 100%; height: 100%; overflow: visible;">
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#A64242" opacity="0.7" />
          </marker>
          <filter id="thread-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <!-- Case hub connects to top-level evidence -->
        {#each boardNotes.filter(note => !note.parentNoteIds?.some(id => boardNotes.some(parent => parent.id === id))) as note}
          {#if hubPositions[caseId]}
            {@const hub = hubPositions[caseId]}
            {@const nx = WORLD_ORIGIN + note.positionX + NOTE_W / 2}
            {@const ny = WORLD_ORIGIN + note.positionY}
            {@const hx = WORLD_ORIGIN + hub.x + HUB_W / 2}
            {@const hy = WORLD_ORIGIN + hub.y + HUB_H}
            <path
              d={threadPath(hx, hy, nx, ny)}
              stroke="#A64242"
              stroke-width="1.5"
              stroke-dasharray="6 3"
              fill="none"
              opacity="0.65"
              filter="url(#thread-glow)"
              marker-end="url(#arrowhead)"
            />
          {/if}
        {/each}

        <!-- Parent evidence connects to each child; multiple parents create multiple routes. -->
        {#each boardNotes as child}
          {#each child.parentNoteIds ?? [] as parentId}
            {@const parent = boardNotes.find(note => note.id === parentId)}
            {#if parent}
              {@const x1 = WORLD_ORIGIN + parent.positionX + NOTE_W / 2}
              {@const y1 = WORLD_ORIGIN + parent.positionY + NOTE_H / 2}
              {@const x2 = WORLD_ORIGIN + child.positionX + NOTE_W / 2}
              {@const y2 = WORLD_ORIGIN + child.positionY + NOTE_H / 2}
              <path
                d={threadPath(x1, y1, x2, y2)}
                stroke="#A64242"
                stroke-width="1.5"
                stroke-dasharray="6 3"
                fill="none"
                opacity="0.7"
                marker-end="url(#arrowhead)"
              />
            {/if}
          {/each}
        {/each}
      </svg>

      <div role="listbox" aria-label="Evidence board items" aria-multiselectable="true" class="absolute inset-0">
      <!-- Case Hubs (draggable) -->
      {#each activeCases as c}
        {#if hubPositions[c.id]}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            id="hub-{c.id}"
            use:trackItemSize={`hub:${c.id}`}
            data-board-item="hub"
            data-item-id={c.id}
            role="option"
            tabindex="0"
            aria-selected={isSelected({ kind: 'hub', id: c.id })}
            on:keydown={(event) => handleItemKeydown(event, { kind: 'hub', id: c.id })}
            class="absolute z-20 select-none {interaction.mode === 'panning' ? 'cursor-grabbing' : 'cursor-move'} {isSelected({ kind: 'hub', id: c.id }) ? 'ring-2 ring-accent ring-offset-2 ring-offset-[#111315]' : ''}"
            style="left: {WORLD_ORIGIN + hubPositions[c.id].x}px; top: {WORLD_ORIGIN + hubPositions[c.id].y}px; width: {HUB_W}px;"
          >
            <div class="bg-background border-2 border-accent rounded-sm p-2 flex flex-col items-center text-center shadow-[0_0_20px_rgba(166,66,66,0.35)]">
              <Target size={16} class="text-accent mb-1" />
              <span class="font-bold text-xs text-primary truncate w-full" title={c.title}>{c.title}</span>
              <a
                href={appPath(`/case/${c.id}`)}
                on:click|stopPropagation
                class="font-mono text-[11px] font-bold text-accent hover:underline leading-tight mt-1"
              >
                {c.caseNumber}
              </a>
              <span class="font-mono text-[9px] text-secondary mt-0.5 uppercase truncate w-full text-center">{c.status.replace('_',' ')}</span>
            </div>
            <!-- Hub anchor pin -->
            <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-accent rounded-full border border-background shadow-md"></div>
          </div>
        {/if}
      {/each}

      <!-- Note Cards (draggable) -->
      {#each boardNotes as note (note.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          id="note-{note.id}"
          use:trackItemSize={`note:${note.id}`}
          data-board-item="note"
          data-item-id={note.id}
          role="option"
          tabindex="0"
          aria-selected={isSelected({ kind: 'note', id: note.id })}
          on:keydown={(event) => handleItemKeydown(event, { kind: 'note', id: note.id })}
          class="absolute z-30 select-none group {interaction.mode === 'panning' ? 'cursor-grabbing' : 'cursor-move'} {isSelected({ kind: 'note', id: note.id }) ? 'ring-2 ring-accent ring-offset-2 ring-offset-[#111315]' : ''}"
          style="left: {WORLD_ORIGIN + note.positionX}px; top: {WORLD_ORIGIN + note.positionY}px; width: {NOTE_W}px;"
        >
          <!-- Pin -->
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-accent rounded-full border-2 border-background shadow-lg z-40"></div>

          <div class="bg-[#e9e5d0] border-l-4 border-accent shadow-[4px_4px_16px_rgba(0,0,0,0.5)] p-3 relative overflow-hidden">
            <!-- Tape effect top -->
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-3 bg-yellow-200/40 border-x border-yellow-300/30 -translate-y-1"></div>
            
            <!-- Actions -->
            <button
              on:click|stopPropagation={() => openModal(note)}
              class="absolute top-1.5 right-1.5 text-[#111315]/50 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity bg-[#e9e5d0] rounded p-0.5"
              aria-label="Edit {note.title}"
              title="Edit evidence"
            >
              <Edit3 size={12} />
            </button>
            <h3 class="font-bold text-[#1a1a1a] text-xs mb-1.5 pr-5 font-mono uppercase tracking-wide">{note.title}</h3>
            <div class="text-[#333] text-xs leading-relaxed font-serif {expandedNoteContent.has(note.id) || hasChecklist(note.content) ? '' : 'line-clamp-4'}">
              {#each getNoteContentBlocks(note.content || '—') as block}
                {#if block.type === 'checklist'}
                  <label class="flex max-w-full items-start gap-1 text-left hover:text-accent">
                    <input
                      type="checkbox"
                      checked={block.checked}
                      aria-label="{block.checked ? 'Mark incomplete' : 'Mark complete'}: {block.text}"
                      on:pointerdown|stopPropagation
                      on:click|stopPropagation
                      on:change|stopPropagation={() => toggleNoteChecklistItem(note.id, block.lineIndex)}
                      class="mt-0.5 h-3 w-3 shrink-0 accent-[#A64242]"
                    />
                    <span class={block.checked ? 'line-through opacity-60' : ''}>
                      {@html formatNoteContent(block.text)}
                    </span>
                  </label>
                {:else}
                  {@html formatNoteContent(block.content)}
                {/if}
              {/each}
            </div>

            <div class="mt-2 pt-1.5 border-t border-[#c8c4b0] flex items-center justify-between">
              <div class="flex items-center gap-2 min-w-0">
                {#if note.relatedCaseId}
                  {@const linked = $cases.find(c => c.id === note.relatedCaseId)}
                  {#if linked}
                    <span class="font-mono text-[9px] text-accent font-bold">⚑ {linked.caseNumber}</span>
                  {:else}
                    <span class="font-mono text-[9px] text-[#888]">UNLINKED</span>
                  {/if}
                {:else}
                  <span class="font-mono text-[9px] text-[#888]">UNLINKED</span>
                {/if}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  on:pointerdown|stopPropagation
                  on:click|stopPropagation={() => toggleNoteContent(note.id)}
                  aria-expanded={expandedNoteContent.has(note.id)}
                  aria-label={expandedNoteContent.has(note.id) ? 'Collapse note content' : 'Fit all note content'}
                  class="font-mono text-[9px] leading-none text-[#555] hover:text-accent transition-colors"
                  title={expandedNoteContent.has(note.id) ? 'Collapse note content' : 'Show all note content'}
                >
                  {expandedNoteContent.has(note.id) ? 'COLLAPSE' : 'FIT CONTENT'}
                </button>
                <button
                  on:click|stopPropagation={() => showNotePreview(note)}
                  class="inline-flex items-center gap-1 font-mono text-[9px] leading-none text-[#555] hover:text-accent transition-colors"
                  aria-label="Read full note: {note.title}"
                  title="Read full note"
                >
                  <Eye size={11} class="block shrink-0" />
                  <span class="block leading-none">READ MORE</span>
                </button>
                <span class="font-mono text-[9px] text-[#888]">{formatDate(note.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      {/each}
      </div>

      <!-- Empty State -->
      {#if boardNotes.length === 0}
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0 opacity-30">
          <FileText size={64} class="text-secondary mb-4" />
          <p class="font-mono text-sm text-secondary">THE BOARD IS EMPTY</p>
          <p class="font-mono text-xs text-secondary mt-1">Add evidence to {caseItem.caseNumber} to build this case board</p>
        </div>
      {/if}
      </div>
    </div>

    <!-- Legend -->
    <div class="shrink-0 flex items-center gap-6 pt-2 px-1">
      <div class="flex items-center gap-2">
        <svg width="32" height="10"><line x1="0" y1="5" x2="32" y2="5" stroke="#A64242" stroke-width="1.5" stroke-dasharray="5 3"/></svg>
        <span class="font-mono text-[10px] text-secondary">CASE → TOP-LEVEL EVIDENCE</span>
      </div>
      <div class="flex items-center gap-2">
        <svg width="32" height="10"><line x1="0" y1="5" x2="32" y2="5" stroke="#A64242" stroke-width="1" opacity="0.4"/></svg>
        <span class="font-mono text-[10px] text-secondary">EVIDENCE ROUTE · ARROW POINTS TO CHILD</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-accent border-2 border-background"></div>
        <span class="font-mono text-[10px] text-secondary">DRAG PIN TO MOVE</span>
      </div>
    </div>
</div>
{/if}

{#if previewNote}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-[55] flex items-center justify-center p-4">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-preview-title"
      class="bg-surface border border-border w-full max-w-2xl max-h-[85vh] rounded-sm shadow-2xl flex flex-col"
    >
      <header class="flex justify-between items-center p-4 border-b border-border bg-background/50 shrink-0">
        <div class="min-w-0">
          <p class="font-mono text-[10px] text-accent">{caseItem?.caseNumber} · FIELD NOTES</p>
          <h2 id="evidence-preview-title" class="font-mono font-bold text-lg text-primary truncate">{previewNote.title}</h2>
        </div>
        <button
          on:click={closeNotePreview}
          class="text-secondary hover:text-primary transition-colors ml-3"
          aria-label="Close full note"
        >
          <X size={20} />
        </button>
      </header>
      <div class="p-6 overflow-y-auto text-primary text-sm leading-relaxed break-words">
        {@html formatNoteContent(previewNote.content || '—')}
      </div>
      <footer class="p-4 border-t border-border bg-background/50 flex justify-end shrink-0">
        <button on:click={closeNotePreview} class="bg-accent hover:bg-accent/90 text-primary px-4 py-2 rounded-sm font-mono text-xs transition-colors">
          CLOSE
        </button>
      </footer>
    </section>
  </div>
{/if}

<!-- Note Modal -->
{#if isModalOpen && caseItem}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-surface border border-border w-full max-w-lg rounded-sm shadow-2xl flex flex-col">
      <div class="flex justify-between items-center p-4 border-b border-border bg-background/50">
        <h2 class="font-mono font-bold text-lg text-primary flex items-center gap-2">
          <FileText size={18} /> {editingNoteId ? 'EDIT EVIDENCE' : 'NEW EVIDENCE'}
        </h2>
        <button on:click={() => isModalOpen = false} class="text-secondary hover:text-primary transition-colors">
          <X size={20} />
        </button>
      </div>
      <div class="p-6 space-y-4">
        {#if formError}
          <p class="text-accent text-xs font-mono border border-accent/30 bg-accent/10 px-3 py-2 rounded-sm">{formError}</p>
        {/if}
        <div class="space-y-1">
          <label for="evidence-title" class="font-mono text-xs text-secondary">TITLE *</label>
          <input id="evidence-title" type="text" bind:value={formTitle} placeholder="Operation codename..." class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary" />
        </div>
        <div class="space-y-1">
          <label for="evidence-content" class="font-mono text-xs text-secondary">FIELD NOTES</label>
          <NoteEditor id="evidence-content" bind:value={formContent} rows={5} placeholder="Observations, leads, suspects..." />
        </div>
        <fieldset class="space-y-2">
          <legend class="font-mono text-xs text-secondary">SUPPORTED BY · SELECT PARENT EVIDENCE</legend>
          {#if boardNotes.filter(canBeParent).length === 0}
            <p class="text-xs text-secondary bg-background border border-border rounded-sm px-3 py-2">No other evidence available yet. Save this evidence first to use it in a route.</p>
          {:else}
            <div class="max-h-36 overflow-y-auto space-y-1 bg-background border border-border rounded-sm p-2">
              {#each boardNotes.filter(canBeParent) as parent}
                <label class="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface text-sm text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formParentIds.includes(parent.id)}
                    on:change={(event) => toggleParent(parent.id, event)}
                    class="accent-[#A64242]"
                  />
                  <span class="font-mono text-[10px] text-accent">{parent.title}</span>
                </label>
              {/each}
            </div>
          {/if}
          <p class="text-[10px] text-secondary">Select multiple evidence items to create multiple routes. Evidence without a parent connects directly to the case.</p>
        </fieldset>
        <div class="space-y-1">
          <span class="font-mono text-xs text-secondary">CASE DOSSIER</span>
          <p class="bg-background border border-border text-sm rounded-sm px-3 py-2 text-primary">[{caseItem.caseNumber}] {caseItem.title}</p>
        </div>
      </div>
      <div class="p-4 border-t border-border bg-background/50 flex justify-between items-center">
        {#if editingNoteId}
          <button
            on:click={() => { deleteNote(editingNoteId || ''); isModalOpen = false; }}
            class="text-accent hover:bg-accent/10 px-3 py-1.5 rounded-sm transition-colors flex items-center gap-1 text-sm font-mono"
          >
            <Trash2 size={14} /> DISCARD
          </button>
        {:else}
          <div></div>
        {/if}
        <div class="flex gap-3">
          <button on:click={() => isModalOpen = false} class="text-secondary hover:text-primary px-4 py-2 font-mono text-sm transition-colors">CANCEL</button>
          <button on:click={saveNote} class="bg-accent hover:bg-accent/90 text-primary px-4 py-2 rounded-sm font-mono text-sm transition-colors">PIN EVIDENCE</button>
        </div>
      </div>
    </div>
  </div>
{/if}
