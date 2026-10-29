<script lang="ts">
  import { cases, notes, isInitialized, type Note, type Case, addNote, updateNote, deleteNote, searchQuery } from '$lib/store';
  import { FileText, Plus, X, Edit3, Trash2, Map, Crosshair, Target } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  // Note card dimensions (must match rendered card)
  const NOTE_W = 220;
  const NOTE_H = 120; // approximate
  const HUB_W = 140;
  const HUB_H = 70;

  // Hub positions in the board (persisted per case via a local reactive map)
  let hubPositions: Record<string, { x: number; y: number }> = {};
  
  $: {
    // Initialize hub positions for new cases without clearing existing
    $cases.forEach((c, i) => {
      if (!hubPositions[c.id]) {
        hubPositions[c.id] = { x: 80 + i * 260, y: 40 };
      }
    });
  }

  // Filtered notes
  $: boardNotes = $notes.filter(n => {
    if ($searchQuery) {
      const q = $searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    }
    return true;
  });

  // Cases that have at least one note on the board
  $: activeCases = $cases.filter(c => boardNotes.some(n => n.relatedCaseId === c.id));

  // --- Dragging State ---
  type DragTarget = { kind: 'note'; id: string } | { kind: 'hub'; id: string };
  let dragging: DragTarget | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function startDragNote(e: MouseEvent, note: Note) {
    if ((e.target as HTMLElement).closest('button')) return;
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
    let x = Math.max(0, e.clientX - rect.left - dragOffsetX);
    let y = Math.max(0, e.clientY - rect.top - dragOffsetY);

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

  onDestroy(() => {
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
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
  let formRelatedCaseId = '';
  let formError = '';

  function openModal(n?: Note) {
    if (n) {
      editingNoteId = n.id;
      formTitle = n.title;
      formContent = n.content;
      formRelatedCaseId = n.relatedCaseId || '';
    } else {
      editingNoteId = null;
      formTitle = '';
      formContent = '';
      formRelatedCaseId = '';
    }
    formError = '';
    isModalOpen = true;
  }

  function saveNote() {
    if (!formTitle.trim()) {
      formError = 'A title is required.';
      return;
    }
    const noteData = {
      title: formTitle,
      content: formContent,
      relatedCaseId: formRelatedCaseId || undefined
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

<div class="max-w-none mx-auto h-full flex flex-col gap-0" style="max-height: calc(100vh - 5rem);">
  <!-- Header -->
  <div class="flex justify-between items-end border-b border-border pb-3 shrink-0 px-1 mb-2">
    <div>
      <h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
        <Map size={24} class="text-accent" />
        EVIDENCE BOARD
      </h1>
      <p class="text-secondary font-mono text-xs mt-0.5">Drag notes and case hubs to reorganize · Threads connect related evidence</p>
    </div>
    <div class="flex items-center gap-3">
      <span class="font-mono text-xs text-secondary border border-border px-2 py-1 rounded-sm">
        {boardNotes.length} NOTES · {activeCases.length} LINKED CASES
      </span>
      <button on:click={() => openModal()} class="flex items-center gap-2 bg-surface hover:bg-border text-primary border border-border px-4 py-2 rounded-sm transition-colors font-mono text-sm group">
        <Plus size={16} class="group-hover:text-accent transition-colors" />
        NEW NOTE
      </button>
    </div>
  </div>

  {#if !$isInitialized}
    <div class="flex-1 flex flex-col items-center justify-center text-secondary animate-pulse space-y-4">
      <Map size={48} class="opacity-50" />
      <p class="font-mono text-sm tracking-widest">LOADING MATRIX...</p>
    </div>
  {:else}
    <!-- Board Canvas -->
    <div
      id="evidence-board-canvas"
      class="flex-1 relative overflow-auto border border-border rounded-sm"
      style="background-color: #111315; background-image: radial-gradient(circle, #1e2226 1px, transparent 1px); background-size: 28px 28px; min-height: 600px;"
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

        <!-- Threads from note cards → case hubs -->
        {#each boardNotes as note}
          {#if note.relatedCaseId && hubPositions[note.relatedCaseId]}
            {@const hub = hubPositions[note.relatedCaseId]}
            <!-- Note center-right edge -->
            {@const nx = note.positionX + NOTE_W}
            {@const ny = note.positionY + NOTE_H / 2}
            <!-- Hub center-bottom -->
            {@const hx = hub.x + HUB_W / 2}
            {@const hy = hub.y + HUB_H}
            <path
              d={threadPath(nx, ny, hx, hy)}
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

        <!-- Solid thread between sibling notes on same case -->
        {#each activeCases as c}
          {@const siblings = boardNotes.filter(n => n.relatedCaseId === c.id)}
          {#each siblings as n1, i}
            {#if i < siblings.length - 1}
              {@const n2 = siblings[i + 1]}
              {@const x1 = n1.positionX + NOTE_W / 2}
              {@const y1 = n1.positionY + NOTE_H}
              {@const x2 = n2.positionX + NOTE_W / 2}
              {@const y2 = n2.positionY}
              <path
                d={threadPath(x1, y1, x2, y2)}
                stroke="#A64242"
                stroke-width="1"
                fill="none"
                opacity="0.25"
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
            class="absolute z-20 select-none cursor-move"
            style="left: {hubPositions[c.id].x}px; top: {hubPositions[c.id].y}px; width: {HUB_W}px;"
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
          class="absolute z-30 select-none cursor-move group"
          style="left: {note.positionX}px; top: {note.positionY}px; width: {NOTE_W}px;"
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
              class="absolute top-1.5 right-1.5 text-[#111315]/30 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity bg-[#e9e5d0] rounded p-0.5"
            >
              <Edit3 size={12} />
            </button>

            <h3 class="font-bold text-[#1a1a1a] text-xs mb-1.5 pr-5 font-mono uppercase tracking-wide">{note.title}</h3>
            <p class="text-[#333] text-xs leading-relaxed font-serif line-clamp-4">{note.content || '—'}</p>

            <div class="mt-2 pt-1.5 border-t border-[#c8c4b0] flex items-center justify-between">
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
              <span class="font-mono text-[9px] text-[#888]">{formatDate(note.updatedAt)}</span>
            </div>
          </div>
        </div>
      {/each}

      <!-- Empty State -->
      {#if boardNotes.length === 0}
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0 opacity-30">
          <FileText size={64} class="text-secondary mb-4" />
          <p class="font-mono text-sm text-secondary">THE BOARD IS EMPTY</p>
          <p class="font-mono text-xs text-secondary mt-1">Create notes and link them to cases to build your evidence matrix</p>
        </div>
      {/if}
    </div>

    <!-- Legend -->
    <div class="shrink-0 flex items-center gap-6 pt-2 px-1">
      <div class="flex items-center gap-2">
        <svg width="32" height="10"><line x1="0" y1="5" x2="32" y2="5" stroke="#A64242" stroke-width="1.5" stroke-dasharray="5 3"/></svg>
        <span class="font-mono text-[10px] text-secondary">NOTE → CASE LINK</span>
      </div>
      <div class="flex items-center gap-2">
        <svg width="32" height="10"><line x1="0" y1="5" x2="32" y2="5" stroke="#A64242" stroke-width="1" opacity="0.4"/></svg>
        <span class="font-mono text-[10px] text-secondary">SIBLING NOTES</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-accent border-2 border-background"></div>
        <span class="font-mono text-[10px] text-secondary">DRAG PIN TO MOVE</span>
      </div>
    </div>
  {/if}
</div>

<!-- Note Modal -->
{#if isModalOpen}
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
          <label class="font-mono text-xs text-secondary">TITLE *</label>
          <input type="text" bind:value={formTitle} placeholder="Operation codename..." class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary" />
        </div>
        <div class="space-y-1">
          <label class="font-mono text-xs text-secondary">FIELD NOTES</label>
          <textarea bind:value={formContent} rows="5" placeholder="Observations, leads, suspects..." class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary resize-none"></textarea>
        </div>
        <div class="space-y-1">
          <label class="font-mono text-xs text-secondary">LINK TO CASE DOSSIER</label>
          <select bind:value={formRelatedCaseId} class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary">
            <option value="">— UNASSIGNED —</option>
            {#each $cases as c}
              <option value={c.id}>[{c.caseNumber}] {c.title}</option>
            {/each}
          </select>
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
