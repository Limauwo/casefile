<script lang="ts">
  import { cases, notes, isInitialized, searchQuery } from '$lib/store';
  import { ArrowRight, FileText, Map } from 'lucide-svelte';

  $: filteredCases = $cases.filter(c => {
    const query = $searchQuery.trim().toLowerCase();
    return !query || c.caseNumber.toLowerCase().includes(query) || c.title.toLowerCase().includes(query);
  });
</script>

<div class="max-w-5xl mx-auto space-y-6">
  <div class="flex items-end justify-between border-b border-border pb-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
        <Map size={24} class="text-accent" />
        EVIDENCE BOARDS
      </h1>
      <p class="text-secondary font-mono text-xs mt-1">Select a case to open its dedicated evidence board</p>
    </div>
    <span class="font-mono text-xs text-secondary border border-border px-2 py-1 rounded-sm">
      {$cases.length} CASES
    </span>
  </div>

  {#if !$isInitialized}
    <div class="flex flex-col items-center justify-center py-20 text-secondary animate-pulse space-y-4">
      <Map size={48} class="opacity-50" />
      <p class="font-mono text-sm tracking-widest">LOADING BOARDS...</p>
    </div>
  {:else if filteredCases.length === 0}
    <div class="border border-dashed border-border bg-surface/30 p-10 rounded-sm text-center">
      <FileText size={32} class="mx-auto text-secondary mb-3 opacity-40" />
      <p class="text-secondary font-mono text-xs">NO CASES FOUND</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each filteredCases as caseItem (caseItem.id)}
        {@const caseNotes = $notes.filter(note => note.relatedCaseId === caseItem.id)}
        <a
          href="/evidence-board/{caseItem.id}"
          class="group bg-surface border border-border hover:border-accent/60 rounded-sm p-5 transition-colors"
        >
          <div class="flex justify-between items-start gap-3">
            <div class="min-w-0">
              <span class="font-mono text-[10px] text-accent font-bold">{caseItem.caseNumber}</span>
              <h2 class="text-primary font-bold mt-1 truncate" title={caseItem.title}>{caseItem.title}</h2>
            </div>
            <ArrowRight size={16} class="text-secondary group-hover:text-accent shrink-0 transition-colors" />
          </div>
          <div class="flex items-center justify-between mt-5 pt-3 border-t border-border/70">
            <span class="font-mono text-[10px] text-secondary uppercase">{caseItem.status.replace('_', ' ')}</span>
            <span class="inline-flex items-center gap-1.5 font-mono text-[10px] text-secondary">
              <FileText size={12} /> {caseNotes.length} NOTES
            </span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
