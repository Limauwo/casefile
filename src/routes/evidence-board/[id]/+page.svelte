<script lang="ts">
  import { page } from '$app/stores';
  import { cases, notes, isInitialized, type Note, type Case, addNote, updateNote, deleteNote } from '$lib/store';
  import NoteEditor from '$lib/NoteEditor.svelte';
  import { formatNoteContent } from '$lib/noteFormatting';
  import { FileText, Plus, X, Edit3, Trash2, Map, Target, ArrowLeft, Eye, ZoomIn, ZoomOut } from 'lucide-svelte';
  import { onDestroy, onMount, tick } from 'svelte';

  $: caseId = $page.params.id ?? '';
  $: caseItem = $cases.find(c => c.id === caseId) as Case | undefined;

  // Note card dimensions (must match rendered card)
  const NOTE_W = 220;
  const NOTE_H = 120; // approximate
  const HUB_W = 140;
  const HUB_H = 70;
  const GRID_SIZE = 40;
  const WORLD_SIZE = 20000;
  const WORLD_ORIGIN = WORLD_SIZE / 2;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2;
  const PAN_SENSITIVITY = 0.4;
  type DragTarget = { kind: 'note'; id: string } | { kind: 'hub'; id: string };
  let activeTool: 'select' | 'hand' = 'select';
  let selectedTarget: DragTarget | null = null;
  let isPanning = false;
  let panLastX = 0;
  let panLastY = 0;
  let zoom = 1;
  let snapToGridEnabled = true;
  let boardCanvas: HTMLDivElement;

  async function adjustZoom(amount: number) {
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((zoom + amount) * 10) / 10));
    if (nextZoom === zoom) return;

    const centerX = (boardCanvas.scrollLeft + boardCanvas.clientWidth / 2) / zoom;
    const centerY = (boardCanvas.scrollTop + boardCanvas.clientHeight / 2) / zoom;
    zoom = nextZoom;
    await tick();
    boardCanvas.scrollLeft = centerX * zoom - boardCanvas.clientWidth / 2;
    boardCanvas.scrollTop = centerY * zoom - boardCanvas.clientHeight / 2;
  }

  function snapToGrid(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  function getDragPosition(value: number): number {
    return snapToGridEnabled ? snapToGrid(value) : value;
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

  // --- Dragging State ---
  let dragging: DragTarget | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function startDragNote(e: MouseEvent, note: Note) {
    if (e.button !== 0 || activeTool !== 'select' || (e.target as HTMLElement).closest('button')) return;
    selectedTarget = { kind: 'note', id: note.id };
    dragging = { kind: 'note', id: note.id };
    const el = document.getElementById(`note-${note.id}`);
    if (el) {
      const rect = el.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
    }
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }

  function startDragHub(e: MouseEvent, caseId: string) {
    if (e.button !== 0 || activeTool !== 'select' || (e.target as HTMLElement).closest('button, a')) return;
    selectedTarget = { kind: 'hub', id: caseId };
    dragging = { kind: 'hub', id: caseId };
    const el = document.getElementById(`hub-${caseId}`);
    if (el) {
      const rect = el.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
    }
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }

  function onDrag(e: MouseEvent) {
    if (!dragging) return;
    const board = document.getElementById('evidence-board-canvas');
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = getDragPosition((e.clientX - rect.left - board.clientLeft + board.scrollLeft - dragOffsetX) / zoom - WORLD_ORIGIN);
    const y = getDragPosition((e.clientY - rect.top - board.clientTop + board.scrollTop - dragOffsetY) / zoom - WORLD_ORIGIN);

    if (dragging.kind === 'note') {
      notes.update(ns => ns.map(n => n.id === (dragging as DragTarget & {kind:'note'}).id ? { ...n, positionX: x, positionY: y } : n));
    } else if (dragging.kind === 'hub') {
      hubPositions = { ...hubPositions, [(dragging as DragTarget & {kind:'hub'}).id]: { x, y } };
    }
  }

  function endDrag() {
    dragging = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  function startPan(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, [data-board-controls]')) return;
    if (activeTool === 'select') {
      if (e.button === 0 && !(e.target as HTMLElement).closest('[id^="note-"], [id^="hub-"]')) {
        selectedTarget = null;
      }
      return;
    }

    if (e.button !== 2) return;
    isPanning = true;
    panLastX = e.clientX;
    panLastY = e.clientY;
    window.addEventListener('mousemove', onPan);
    window.addEventListener('mouseup', endPan);
    e.preventDefault();
  }

  function onPan(e: MouseEvent) {
    if (!isPanning) return;
    const board = document.getElementById('evidence-board-canvas');
    if (!board) return;
    board.scrollLeft -= (e.clientX - panLastX) * PAN_SENSITIVITY;
    board.scrollTop -= (e.clientY - panLastY) * PAN_SENSITIVITY;
    panLastX = e.clientX;
    panLastY = e.clientY;
  }

  function handleBoardContextMenu(e: MouseEvent) {
    if (activeTool === 'hand') e.preventDefault();
  }

  function endPan() {
    isPanning = false;
    window.removeEventListener('mousemove', onPan);
    window.removeEventListener('mouseup', endPan);
  }

  onDestroy(() => {
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('mousemove', onPan);
    window.removeEventListener('mouseup', endPan);
  });

  onMount(() => {
    boardCanvas.scrollLeft = WORLD_ORIGIN * zoom - boardCanvas.clientWidth / 2;
    boardCanvas.scrollTop = WORLD_ORIGIN * zoom - boardCanvas.clientHeight / 2;
  });

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

  function handlePreviewKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeNotePreview();
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
      addNote(noteData);
    }
    isModalOpen = false;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<svelte:window on:keydown={handlePreviewKeydown} />

{#if !$isInitialized}
  <div class="flex-1 flex flex-col items-center justify-center text-secondary animate-pulse space-y-4">
    <Map size={48} class="opacity-50" />
    <p class="font-mono text-sm tracking-widest">LOADING MATRIX...</p>
  </div>
{:else if !caseItem}
  <div class="p-8 text-center space-y-4">
    <h2 class="text-xl text-primary font-mono font-bold">CASE NOT FOUND</h2>
    <p class="text-secondary text-sm">This evidence board is not attached to an existing case.</p>
    <a href="/evidence-board" class="inline-flex items-center gap-2 text-accent hover:underline font-mono text-xs">
      <ArrowLeft size={14} /> ALL EVIDENCE BOARDS
    </a>
  </div>
{:else}
<div class="max-w-none mx-auto h-full flex flex-col gap-0" style="max-height: calc(100vh - 5rem);">
  <!-- Header -->
  <div class="flex justify-between items-end border-b border-border pb-3 shrink-0 px-1 mb-2">
    <div>
      <a href="/evidence-board" class="inline-flex items-center gap-1 text-secondary hover:text-accent font-mono text-[10px] mb-1">
        <ArrowLeft size={12} /> ALL EVIDENCE BOARDS
      </a>
      <h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
        <Map size={24} class="text-accent" />
        EVIDENCE BOARD <span class="text-accent">{caseItem.caseNumber}</span>
      </h1>
      <p class="text-secondary font-mono text-xs mt-0.5">{caseItem.title} · Drag notes and case hub · 40px grid</p>
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
      class="flex-1 relative overflow-auto border border-border rounded-sm {activeTool === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}"
      style="min-height: 600px;"
      on:mousedown={startPan}
      on:contextmenu={handleBoardContextMenu}
    >
      <div class="sticky top-0 z-50 h-0 pointer-events-none">
        <div data-board-controls class="absolute top-3 left-3 flex items-center gap-1 border border-border bg-background/90 rounded-sm p-1 shadow-lg pointer-events-auto">
          <button
            on:click={() => activeTool = 'select'}
            aria-label="Select tool"
            aria-pressed={activeTool === 'select'}
            title="Select and move evidence"
            class="px-2 py-1 rounded-sm font-mono text-[10px] transition-colors {activeTool === 'select' ? 'bg-accent text-primary' : 'text-secondary hover:text-primary'}"
          >
            SELECT
          </button>
          <button
            on:click={() => activeTool = 'hand'}
            aria-label="Hand tool"
            aria-pressed={activeTool === 'hand'}
            title="Right-click and drag to pan the board"
            class="px-2 py-1 rounded-sm font-mono text-[10px] transition-colors {activeTool === 'hand' ? 'bg-accent text-primary' : 'text-secondary hover:text-primary'}"
          >
            HAND
          </button>
        </div>
        <div data-board-controls class="absolute top-3 right-3 flex items-center gap-1 border border-border bg-background/90 rounded-sm p-1 shadow-lg pointer-events-auto">
          <button
            on:click={() => adjustZoom(-0.1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            title="Zoom out"
            class="p-1.5 text-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span class="min-w-[3.5rem] text-center font-mono text-[10px] text-primary">{Math.round(zoom * 100)}%</span>
          <button
            on:click={() => adjustZoom(0.1)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            title="Zoom in"
            class="p-1.5 text-secondary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div class="relative shrink-0" style="width: {WORLD_SIZE * zoom}px; height: {WORLD_SIZE * zoom}px;">
        <div
          class="absolute top-0 left-0 origin-top-left"
          style="width: {WORLD_SIZE}px; height: {WORLD_SIZE}px; transform: scale({zoom}); background-color: #111315; background-image: linear-gradient(to right, #30353a 1px, transparent 1px), linear-gradient(to bottom, #30353a 1px, transparent 1px); background-size: {GRID_SIZE}px {GRID_SIZE}px;"
        >
      <!-- SVG Thread Overlay -->
      <svg class="absolute inset-0 pointer-events-none z-10" style="width: 100%; height: 100%; overflow: visible;">
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

      <!-- Case Hubs (draggable) -->
      {#each activeCases as c}
        {#if hubPositions[c.id]}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            id="hub-{c.id}"
            class="absolute z-20 select-none {activeTool === 'select' ? 'cursor-move' : ''} {selectedTarget?.kind === 'hub' && selectedTarget.id === c.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-[#111315]' : ''}"
            style="left: {WORLD_ORIGIN + hubPositions[c.id].x}px; top: {WORLD_ORIGIN + hubPositions[c.id].y}px; width: {HUB_W}px;"
            on:mousedown={(e) => startDragHub(e, c.id)}
          >
            <div class="bg-background border-2 border-accent rounded-sm p-2 flex flex-col items-center text-center shadow-[0_0_20px_rgba(166,66,66,0.35)]">
              <Target size={16} class="text-accent mb-1" />
              <span class="font-bold text-xs text-primary truncate w-full" title={c.title}>{c.title}</span>
              <a
                href="/case/{c.id}"
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
          class="absolute z-30 select-none group {activeTool === 'select' ? 'cursor-move' : ''} {selectedTarget?.kind === 'note' && selectedTarget.id === note.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-[#111315]' : ''}"
          style="left: {WORLD_ORIGIN + note.positionX}px; top: {WORLD_ORIGIN + note.positionY}px; width: {NOTE_W}px;"
          on:mousedown={(e) => startDragNote(e, note)}
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
            <div class="text-[#333] text-xs leading-relaxed font-serif line-clamp-4">{@html formatNoteContent(note.content || '—')}</div>

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
