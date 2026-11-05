<script lang="ts">
  import { page } from '$app/stores';
  import { cases, activities, notes, isInitialized, type Activity, type Case } from '$lib/store';
  import { formatNoteContent } from '$lib/noteFormatting';
  import { Activity as ActivityIcon, AlertTriangle, ArrowLeft, Clock, FileText, Map } from 'lucide-svelte';

  $: caseId = $page.params.id ?? '';
  $: caseItem = $cases.find(item => item.id === caseId) as Case | undefined;
  $: caseActivities = $activities
    .filter(activity => activity.relatedCaseId === caseId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  $: caseNotes = $notes
    .filter(note => note.relatedCaseId === caseId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const actionLabels: Record<Activity['action'], string> = {
    create: 'CREATED',
    update: 'UPDATED',
    status_change: 'STATUS CHANGE',
    priority_change: 'PRIORITY CHANGE',
    delete: 'DELETED',
    system: 'SYSTEM'
  };

  function isOverdue(dueDate?: string, status?: Case['status']) {
    return !!dueDate && status !== 'closed' && new Date(dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString([], { dateStyle: 'medium' });
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function priorityColor(priority: Case['priority']) {
    switch (priority) {
      case 'critical': return 'text-red-400 border-red-800 bg-red-950/40';
      case 'high': return 'text-accent border-accent/40 bg-accent/10';
      case 'medium': return 'text-primary border-border bg-surface';
      case 'low': return 'text-secondary border-border bg-background';
    }
  }

  function statusColor(status: Case['status']) {
    switch (status) {
      case 'open': return 'text-secondary border-border';
      case 'in_progress': return 'text-blue-400 border-blue-800';
      case 'closed': return 'text-status border-status/40';
    }
  }
</script>

{#if !$isInitialized}
  <div class="flex flex-col items-center justify-center py-20 text-secondary animate-pulse space-y-4">
    <ActivityIcon size={48} class="opacity-50" />
    <p class="font-mono text-sm tracking-widest">LOADING INVESTIGATION...</p>
  </div>
{:else if !caseItem}
  <div class="p-8 text-center space-y-4">
    <AlertTriangle size={48} class="text-accent mx-auto" />
    <h2 class="text-xl text-primary font-mono font-bold">CASE NOT FOUND</h2>
    <p class="text-secondary text-sm">The requested investigation does not exist or has been removed.</p>
    <a href="/" class="inline-flex items-center gap-2 text-accent hover:underline font-mono text-xs border border-accent/30 px-4 py-2 rounded-sm">
      <ArrowLeft size={14} /> RETURN TO COMMAND CENTER
    </a>
  </div>
{:else}
  <div class="max-w-6xl mx-auto space-y-6 pb-12">
    <a href="/case/{caseItem.id}" class="inline-flex items-center gap-2 text-secondary hover:text-primary font-mono text-xs transition-colors">
      <ArrowLeft size={14} /> BACK TO CASE DOSSIER
    </a>

    <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border pb-5">
      <div class="min-w-0">
        <p class="font-mono text-xs text-accent tracking-widest mb-2">INVESTIGATIONS // IN PROGRESS</p>
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span class="font-mono text-xs font-bold px-2 py-0.5 bg-surface border border-border rounded text-secondary">{caseItem.caseNumber}</span>
          <span class="font-mono text-[10px] px-2 py-0.5 border rounded-sm {statusColor(caseItem.status)}">{caseItem.status.replace('_', ' ').toUpperCase()}</span>
          <span class="font-mono text-[10px] px-2 py-0.5 border rounded-sm {priorityColor(caseItem.priority)}">{caseItem.priority.toUpperCase()} PRIORITY</span>
        </div>
        <h1 class="text-3xl font-bold tracking-tight text-primary">{caseItem.title}</h1>
      </div>
      <a href="/evidence-board/{caseItem.id}" class="inline-flex items-center justify-center gap-2 text-secondary hover:text-accent border border-border hover:border-accent px-3 py-2 rounded-sm font-mono text-xs transition-colors shrink-0">
        <Map size={14} /> OPEN EVIDENCE BOARD
      </a>
    </header>

    <section aria-label="Investigation summary" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="bg-surface border border-border p-3 rounded-sm">
        <p class="text-secondary font-mono text-[10px] mb-1">CURRENT STATUS</p>
        <p class="text-sm font-bold text-primary">{caseItem.status.replace('_', ' ').toUpperCase()}</p>
      </div>
      <div class="bg-surface border border-border p-3 rounded-sm">
        <p class="text-secondary font-mono text-[10px] mb-1">PRIORITY</p>
        <p class="text-sm font-bold text-primary">{caseItem.priority.toUpperCase()}</p>
      </div>
      <div class="bg-surface border border-border p-3 rounded-sm {isOverdue(caseItem.dueDate, caseItem.status) ? 'border-red-800 bg-red-950/20' : ''}">
        <p class="text-secondary font-mono text-[10px] mb-1">DUE DATE</p>
        <p class="text-sm font-bold {isOverdue(caseItem.dueDate, caseItem.status) ? 'text-red-400' : 'text-primary'}">
          {#if isOverdue(caseItem.dueDate, caseItem.status)}OVERDUE · {/if}{caseItem.dueDate || '— NONE —'}
        </p>
      </div>
      <div class="bg-surface border border-border p-3 rounded-sm">
        <p class="text-secondary font-mono text-[10px] mb-1">LINKED EVIDENCE</p>
        <p class="text-sm font-bold text-primary">{caseNotes.length} {caseNotes.length === 1 ? 'ITEM' : 'ITEMS'}</p>
      </div>
    </section>

    <section class="bg-surface border border-border rounded-sm p-4">
      <h2 class="font-mono text-xs font-semibold tracking-wider text-secondary mb-2">CASE SUMMARY</h2>
      <p class="text-sm text-primary leading-relaxed">{caseItem.description || 'No investigation summary has been added.'}</p>
      <p class="font-mono text-[10px] text-secondary mt-3">LAST UPDATED · {formatDate(caseItem.updatedAt)}</p>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section class="lg:col-span-3 space-y-3">
        <div class="flex items-center justify-between border-b border-border pb-2">
          <h2 class="font-mono text-sm font-semibold tracking-wider text-secondary flex items-center gap-2">
            <FileText size={15} /> EVIDENCE & FIELD NOTES
            <span class="text-xs font-normal text-border bg-border/30 px-1.5 rounded">{caseNotes.length}</span>
          </h2>
        </div>

        {#if caseNotes.length === 0}
          <div class="border border-dashed border-border bg-surface/30 p-8 rounded-sm text-center">
            <FileText size={28} class="mx-auto text-secondary mb-3 opacity-40" />
            <p class="text-secondary font-mono text-xs">NO LINKED EVIDENCE</p>
            <p class="text-secondary text-xs mt-1">Add field notes from the case dossier to track evidence here.</p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each caseNotes as note (note.id)}
              <article class="bg-surface border border-border p-4 rounded-sm">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <h3 class="font-bold text-primary text-sm">{note.title}</h3>
                  <span class="font-mono text-[10px] text-secondary shrink-0">{formatDate(note.updatedAt)}</span>
                </div>
                <div class="text-secondary text-sm leading-relaxed break-words">{@html formatNoteContent(note.content || '—')}</div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section class="lg:col-span-2 space-y-3">
        <h2 class="font-mono text-sm font-semibold tracking-wider text-secondary flex items-center gap-2 border-b border-border pb-2">
          <Clock size={15} /> INVESTIGATION TIMELINE
          <span class="text-xs font-normal text-border bg-border/30 px-1.5 rounded">{caseActivities.length}</span>
        </h2>

        {#if caseActivities.length === 0}
          <p class="text-secondary font-mono text-xs opacity-60">NO ACTIVITY RECORDED</p>
        {:else}
          <div class="space-y-0 border-l border-border/50 ml-1 pl-4">
            {#each caseActivities as activity (activity.id)}
              <article class="relative pb-5">
                <div class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-surface border border-border"></div>
                <p class="font-mono text-[10px] text-secondary/70 mb-1">{formatDateTime(activity.timestamp)}</p>
                <p class="text-xs text-primary leading-snug">{activity.description}</p>
                <p class="font-mono text-[9px] text-accent/70 uppercase mt-1">{actionLabels[activity.action]}</p>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}
