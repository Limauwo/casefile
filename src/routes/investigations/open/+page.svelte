<script lang="ts">
  import { cases, isInitialized, searchQuery, filterPriority, toggleCaseStatus, type Case } from '$lib/store';
  import { AlertTriangle, Clock, FileText, FolderOpen, Search } from 'lucide-svelte';
  import { appPath } from '$lib/paths';

  $: openCases = $cases.filter((caseItem: Case) => {
    if (caseItem.status !== 'open') return false;
    if ($filterPriority !== 'all' && caseItem.priority !== $filterPriority) return false;

    const query = $searchQuery.trim().toLowerCase();
    return !query ||
      caseItem.title.toLowerCase().includes(query) ||
      caseItem.caseNumber.toLowerCase().includes(query) ||
      (caseItem.description ?? '').toLowerCase().includes(query);
  }).sort((a, b) => {
    const numA = parseInt(a.caseNumber.split('-')[1] || '0', 10);
    const numB = parseInt(b.caseNumber.split('-')[1] || '0', 10);
    return numA - numB;
  });

  function isOverdue(dueDate?: string) {
    return !!dueDate && new Date(dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
  }

  function priorityColor(priority: Case['priority']) {
    switch (priority) {
      case 'critical': return 'text-accent border-accent/50 bg-accent/20';
      case 'high': return 'text-accent border-accent/30 bg-accent/10';
      case 'medium': return 'text-primary border-border bg-surface';
      case 'low': return 'text-secondary border-border bg-background';
    }
  }
</script>

<div class="max-w-6xl mx-auto space-y-8">
  <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border pb-4">
    <div>
      <p class="font-mono text-xs text-accent tracking-widest mb-2">INVESTIGATIONS // OPEN</p>
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
        <FolderOpen size={26} class="text-accent" />
        OPEN CASES
      </h1>
      <p class="text-secondary font-mono text-sm mt-2">Review and manage active case files awaiting investigation.</p>
    </div>
    <span class="font-mono text-xs text-secondary border border-border px-3 py-2 rounded-sm">
      {openCases.length} OPEN {openCases.length === 1 ? 'CASE' : 'CASES'}
    </span>
  </div>

  {#if !$isInitialized}
    <div class="flex flex-col items-center justify-center py-20 text-secondary animate-pulse space-y-4">
      <FolderOpen size={48} class="opacity-50" />
      <p class="font-mono text-sm tracking-widest">LOADING OPEN CASES...</p>
    </div>
  {:else if openCases.length === 0}
    <div class="border border-dashed border-border bg-surface/50 p-10 rounded-sm text-center">
      {#if $searchQuery || $filterPriority !== 'all'}
        <Search size={32} class="mx-auto text-secondary mb-3 opacity-50" />
        <p class="text-primary font-mono text-sm">NO MATCHING OPEN CASES</p>
        <p class="text-secondary text-xs mt-1">Try adjusting the search query or priority filter.</p>
      {:else}
        <FileText size={32} class="mx-auto text-secondary mb-3 opacity-50" />
        <p class="text-primary font-mono text-sm">NO OPEN CASES</p>
        <p class="text-secondary text-xs mt-1">All cases are either in progress or closed.</p>
      {/if}
    </div>
  {:else}
    <div class="space-y-3">
      {#each openCases as caseItem (caseItem.id)}
        <article class="group border bg-surface p-4 rounded-sm transition-colors flex gap-4 items-start {isOverdue(caseItem.dueDate) ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-secondary'}">
          <button
            type="button"
            class="mt-1 w-5 h-5 shrink-0 rounded-sm border border-border flex items-center justify-center bg-background hover:border-accent transition-colors"
            aria-label="Mark {caseItem.caseNumber} as closed"
            title="Mark as closed"
            on:click={() => toggleCaseStatus(caseItem.id)}
          ></button>

          <a href={appPath(`/case/${caseItem.id}`)} class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-mono text-xs font-bold px-1.5 py-0.5 bg-background border border-border rounded text-secondary">
                {caseItem.caseNumber}
              </span>
              <h2 class="font-semibold text-primary group-hover:text-accent transition-colors">{caseItem.title}</h2>
            </div>
            <p class="text-sm text-secondary mb-3">{caseItem.description || 'No description provided.'}</p>
            <div class="flex flex-wrap items-center gap-4 text-xs font-mono text-secondary">
              <span class="px-2 py-0.5 border rounded-sm {priorityColor(caseItem.priority)}">
                {caseItem.priority.toUpperCase()} PRIORITY
              </span>
              {#if caseItem.dueDate}
                <span class="inline-flex items-center gap-1.5 {isOverdue(caseItem.dueDate) ? 'text-accent font-bold' : ''}">
                  {#if isOverdue(caseItem.dueDate)}
                    <AlertTriangle size={12} />
                    OVERDUE · {caseItem.dueDate}
                  {:else}
                    <Clock size={12} />
                    DUE · {caseItem.dueDate}
                  {/if}
                </span>
              {/if}
            </div>
          </a>
        </article>
      {/each}
    </div>
  {/if}
</div>
