<script lang="ts">
  import { page } from '$app/stores';
  import { cases, activities, notes, isInitialized, type Case, type Priority, type Status, updateCase, addNote, updateNote, deleteNote } from '$lib/store';
  import NoteEditor from '$lib/NoteEditor.svelte';
  import { formatNoteContent, getNoteContentBlocks, toggleChecklistItem } from '$lib/noteFormatting';
  import { FileText, ArrowLeft, Clock, Activity as ActivityIcon, Edit3, Trash2, Plus, X, AlertTriangle, CheckCircle, Map } from 'lucide-svelte';

  $: caseId = $page.params.id ?? '';
  $: caseItem = $cases.find(c => c.id === caseId) as Case | undefined;
  $: caseActivities = $activities
    .filter(a => a.relatedCaseId === caseId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  $: caseNotes = $notes.filter(n => n.relatedCaseId === caseId);

  // ── Edit inline metadata ──────────────────────────────────────
  let isEditing = false;
  let formTitle = '';
  let formDescription = '';
  let formPriority: Priority = 'medium';
  let formStatus: Status = 'open';
  let formDueDate = '';

  function startEdit() {
    if (!caseItem) return;
    formTitle = caseItem.title;
    formDescription = caseItem.description || '';
    formPriority = caseItem.priority;
    formStatus = caseItem.status;
    formDueDate = caseItem.dueDate || '';
    isEditing = true;
  }

  function saveEdit() {
    if (!formTitle.trim()) return;
    updateCase(caseId, {
      title: formTitle,
      description: formDescription,
      priority: formPriority,
      status: formStatus,
      dueDate: formDueDate || undefined
    });
    isEditing = false;
  }

  // ── Note Modal ────────────────────────────────────────────────
  let isNoteModalOpen = false;
  let formNoteTitle = '';
  let formNoteContent = '';
  let editingNoteId: string | null = null;

  function openNoteModal(noteId?: string) {
    if (noteId) {
      const n = caseNotes.find(x => x.id === noteId);
      if (n) {
        editingNoteId = n.id;
        formNoteTitle = n.title;
        formNoteContent = n.content;
      }
    } else {
      editingNoteId = null;
      formNoteTitle = '';
      formNoteContent = '';
    }
    isNoteModalOpen = true;
  }

  function saveNote() {
    if (!formNoteTitle.trim()) return;
    if (editingNoteId) {
      updateNote(editingNoteId, { title: formNoteTitle, content: formNoteContent });
    } else {
      addNote({ title: formNoteTitle, content: formNoteContent, relatedCaseId: caseId });
    }
    isNoteModalOpen = false;
  }

  function toggleCaseNoteChecklistItem(noteId: string, lineIndex: number) {
    const note = caseNotes.find(item => item.id === noteId);
    if (!note) return;
    updateNote(noteId, { content: toggleChecklistItem(note.content, lineIndex) });
  }

  // ── Helpers ───────────────────────────────────────────────────
  function isOverdue(dueDate?: string, status?: string) {
    if (!dueDate || status === 'closed') return false;
    return new Date(dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
  }

  function priorityColor(p: Priority) {
    const map = { critical: 'text-red-400 bg-red-950/40 border-red-800', high: 'text-accent bg-accent/10 border-accent/40', medium: 'text-primary bg-surface border-border', low: 'text-secondary bg-background border-border' };
    return map[p] ?? map.medium;
  }

  function statusColor(s: Status) {
    const map = { open: 'text-secondary border-border', in_progress: 'text-blue-400 border-blue-800', closed: 'text-status border-status/40' };
    return map[s] ?? 'text-secondary border-border';
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
  }

  const actIcons: Record<string, string> = {
    create: '✦', update: '✎', status_change: '↻', priority_change: '⬆', delete: '✕', system: '⊙'
  };
</script>

{#if !$isInitialized}
  <div class="flex flex-col items-center justify-center py-20 text-secondary animate-pulse space-y-4">
    <ActivityIcon size={48} class="opacity-50" />
    <p class="font-mono text-sm tracking-widest">DECRYPTING SECURE FILES...</p>
  </div>
{:else if !caseItem}
  <div class="p-8 text-center space-y-4">
    <AlertTriangle size={48} class="text-accent mx-auto" />
    <h2 class="text-xl text-primary font-mono font-bold">CASE NOT FOUND</h2>
    <p class="text-secondary text-sm">The requested case file does not exist or has been expunged from the system.</p>
    <a href="/" class="inline-block text-accent hover:underline font-mono text-xs border border-accent/30 px-4 py-2 rounded-sm">← RETURN TO COMMAND CENTER</a>
  </div>
{:else}
  <div class="max-w-4xl mx-auto space-y-8 pb-16">

    <!-- Back nav -->
    <a href="/" class="inline-flex items-center gap-2 text-secondary hover:text-primary font-mono text-xs transition-colors">
      <ArrowLeft size={14} /> BACK TO COMMAND CENTER
    </a>

    <!-- ── Case Header ── -->
    <div class="border-b border-border pb-6">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 mb-3">
            <span class="font-mono text-xs font-bold px-2 py-0.5 bg-surface border border-border rounded text-secondary">{caseItem.caseNumber}</span>
            <span class="font-mono text-[10px] px-2 py-0.5 border rounded-sm {priorityColor(caseItem.priority)}">{caseItem.priority.toUpperCase()}</span>
            <span class="font-mono text-[10px] px-2 py-0.5 border rounded-sm {statusColor(caseItem.status)}">{caseItem.status.replace('_', ' ').toUpperCase()}</span>
            {#if isOverdue(caseItem.dueDate, caseItem.status)}
              <span class="font-mono text-[10px] px-2 py-0.5 border border-red-700 bg-red-950/30 text-red-400 rounded-sm animate-pulse">⚠ OVERDUE</span>
            {/if}
          </div>

          {#if isEditing}
            <div class="space-y-3">
              <input type="text" bind:value={formTitle} class="w-full bg-background border border-accent text-xl rounded-sm px-3 py-2 focus:outline-none text-primary font-bold" />
              <textarea bind:value={formDescription} rows="3" placeholder="Case description..." class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary resize-none"></textarea>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label class="font-mono text-[10px] text-secondary block mb-1">STATUS</label>
                  <select bind:value={formStatus} class="w-full bg-background border border-border text-xs rounded-sm px-2 py-1.5 text-primary">
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label class="font-mono text-[10px] text-secondary block mb-1">PRIORITY</label>
                  <select bind:value={formPriority} class="w-full bg-background border border-border text-xs rounded-sm px-2 py-1.5 text-primary">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div class="md:col-span-2">
                  <label class="font-mono text-[10px] text-secondary block mb-1">DUE DATE</label>
                  <input type="date" bind:value={formDueDate} class="w-full bg-background border border-border text-xs rounded-sm px-2 py-1.5 text-primary" />
                </div>
              </div>
              <div class="flex gap-2">
                <button on:click={saveEdit} class="bg-accent hover:bg-accent/90 text-primary px-4 py-1.5 rounded-sm font-mono text-xs transition-colors">SAVE CHANGES</button>
                <button on:click={() => isEditing = false} class="text-secondary hover:text-primary px-4 py-1.5 font-mono text-xs transition-colors">CANCEL</button>
              </div>
            </div>
          {:else}
            <h1 class="text-3xl font-bold tracking-tight text-primary mb-2">{caseItem.title}</h1>
            <p class="text-secondary text-sm leading-relaxed max-w-2xl">{caseItem.description || 'No description provided.'}</p>
          {/if}
        </div>

        {#if !isEditing}
          <div class="shrink-0 flex flex-col sm:flex-row gap-2">
            {#if caseItem.status === 'in_progress'}
              <a href="/investigations/in-progress/{caseItem.id}" class="flex items-center justify-center gap-1.5 text-accent hover:bg-accent/10 border border-accent/40 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors">
                <ActivityIcon size={13} /> OPEN WORKSPACE
              </a>
            {/if}
            <button on:click={startEdit} class="flex items-center justify-center gap-1.5 text-secondary hover:text-accent border border-border hover:border-accent px-3 py-1.5 rounded-sm font-mono text-xs transition-colors">
              <Edit3 size={13} /> EDIT
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Metadata Bar ── -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-surface border border-border p-3 rounded-sm">
        <p class="text-secondary font-mono text-[10px] mb-1">CREATED</p>
        <p class="text-sm font-bold text-primary">{fmtDate(caseItem.createdAt)}</p>
      </div>
      <div class="bg-surface border border-border p-3 rounded-sm">
        <p class="text-secondary font-mono text-[10px] mb-1">LAST UPDATED</p>
        <p class="text-sm font-bold text-primary">{fmtDate(caseItem.updatedAt)}</p>
      </div>
      <div class="bg-surface border border-border p-3 rounded-sm {isOverdue(caseItem.dueDate, caseItem.status) ? 'border-red-800 bg-red-950/20' : ''}">
        <p class="text-secondary font-mono text-[10px] mb-1">DUE DATE</p>
        <p class="text-sm font-bold {isOverdue(caseItem.dueDate, caseItem.status) ? 'text-red-400' : 'text-primary'}">{caseItem.dueDate || '— NONE —'}</p>
      </div>
      <div class="bg-surface border border-border p-3 rounded-sm">
        <p class="text-secondary font-mono text-[10px] mb-1">COMPLETED</p>
        <p class="text-sm font-bold text-primary">{caseItem.completedAt ? fmtDate(caseItem.completedAt) : '— OPEN —'}</p>
      </div>
    </div>

    <!-- ── Main Body: Notes + Activity ── -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

      <!-- Notes Section -->
      <div class="lg:col-span-2 space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-2">
          <h2 class="font-mono text-sm font-semibold tracking-wider text-secondary flex items-center gap-2">
            <FileText size={15} /> INVESTIGATION NOTES
            <span class="text-xs font-normal text-border bg-border/30 px-1.5 rounded">{caseNotes.length}</span>
          </h2>
          <div class="flex gap-3">
            <a href="/evidence-board/{caseId}" class="text-xs font-mono text-secondary hover:text-accent flex items-center gap-1 transition-colors">
              <Map size={12} /> VIEW ON BOARD
            </a>
            <button on:click={() => openNoteModal()} class="text-xs font-mono text-accent hover:underline flex items-center gap-1">
              <Plus size={12} /> ADD NOTE
            </button>
          </div>
        </div>

        <div class="space-y-3">
          {#if caseNotes.length === 0}
            <div class="border border-dashed border-border bg-surface/30 p-8 rounded-sm text-center">
              <FileText size={28} class="mx-auto text-secondary mb-3 opacity-30" />
              <p class="text-secondary font-mono text-xs opacity-60">NO ATTACHED NOTES</p>
              <p class="text-secondary text-xs mt-1 opacity-40">Field notes and observations can be added and linked to this dossier.</p>
            </div>
          {/if}
          {#each caseNotes as note (note.id)}
            <div class="bg-surface border border-border p-4 rounded-sm hover:border-secondary transition-colors relative group">
              <div class="flex justify-between items-start gap-3 mb-2">
                <h3 class="font-bold text-primary text-sm">{note.title}</h3>
                <div class="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button on:click={() => openNoteModal(note.id)} class="text-secondary hover:text-accent transition-colors" title="Edit note">
                    <Edit3 size={13} />
                  </button>
                  <button on:click={() => deleteNote(note.id)} class="text-secondary hover:text-accent transition-colors" title="Delete note">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div class="text-secondary text-sm leading-relaxed">
                {#each getNoteContentBlocks(note.content || '—') as block}
                  {#if block.type === 'checklist'}
                    <label class="flex max-w-full items-start gap-2 text-left hover:text-primary">
                      <input
                        type="checkbox"
                        checked={block.checked}
                        aria-label="{block.checked ? 'Mark incomplete' : 'Mark complete'}: {block.text}"
                        on:change={() => toggleCaseNoteChecklistItem(note.id, block.lineIndex)}
                        class="mt-1 h-4 w-4 shrink-0 accent-[#A64242]"
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
              <p class="font-mono text-[10px] text-secondary/50 mt-2 pt-2 border-t border-border/50">Updated {fmt(note.updatedAt)}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Activity Timeline -->
      <div class="space-y-4">
        <h2 class="font-mono text-sm font-semibold tracking-wider text-secondary flex items-center gap-2 border-b border-border pb-2">
          <ActivityIcon size={15} /> CASE ACTIVITY
          <span class="text-xs font-normal text-border bg-border/30 px-1.5 rounded">{caseActivities.length}</span>
        </h2>

        {#if caseActivities.length === 0}
          <p class="text-secondary font-mono text-xs opacity-50">NO ACTIVITY RECORDED</p>
        {:else}
          <div class="space-y-0 border-l border-border/50 ml-1 pl-4">
            {#each caseActivities as act}
              <div class="relative pb-4">
                <div class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-surface border border-border flex items-center justify-center">
                  <span class="text-[8px] text-accent">{actIcons[act.action] ?? '•'}</span>
                </div>
                <p class="font-mono text-[10px] text-secondary/60 mb-0.5">{fmt(act.timestamp)}</p>
                <p class="text-xs text-primary leading-snug">{act.description}</p>
                <p class="font-mono text-[9px] text-accent/70 uppercase mt-0.5">{act.action.replace('_', ' ')}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ── Note Modal ── -->
  {#if isNoteModalOpen}
    <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-surface border border-border w-full max-w-lg rounded-sm shadow-2xl flex flex-col">
        <div class="flex justify-between items-center p-4 border-b border-border bg-background/50">
          <h2 class="font-mono font-bold text-lg text-primary flex items-center gap-2">
            <FileText size={18} /> {editingNoteId ? 'EDIT NOTE' : 'NEW NOTE'}
          </h2>
          <button on:click={() => isNoteModalOpen = false} class="text-secondary hover:text-primary transition-colors">
            <X size={20} />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="font-mono text-xs text-secondary">TITLE *</label>
            <input type="text" bind:value={formNoteTitle} placeholder="Observation codename..." class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary" />
          </div>
          <div class="space-y-1">
            <label class="font-mono text-xs text-secondary">CONTENT</label>
            <NoteEditor id="case-note-content" bind:value={formNoteContent} rows={6} placeholder="Field observations, leads, suspects..." />
          </div>
        </div>
        <div class="p-4 border-t border-border bg-background/50 flex justify-between items-center">
          {#if editingNoteId}
            <button on:click={() => { deleteNote(editingNoteId || ''); isNoteModalOpen = false; }} class="text-accent hover:bg-accent/10 px-3 py-1.5 rounded-sm transition-colors flex items-center gap-1 text-sm font-mono">
              <Trash2 size={14} /> DELETE NOTE
            </button>
          {:else}
            <div></div>
          {/if}
          <div class="flex gap-3">
            <button on:click={() => isNoteModalOpen = false} class="text-secondary hover:text-primary px-4 py-2 font-mono text-sm transition-colors">CANCEL</button>
            <button on:click={saveNote} class="bg-accent hover:bg-accent/90 text-primary px-4 py-2 rounded-sm font-mono text-sm transition-colors">SAVE NOTE</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
