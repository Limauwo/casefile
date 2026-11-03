<script lang="ts">
  import { FileText, AlertCircle, CheckCircle, Clock, Plus, Activity, AlertTriangle, X, Trash2, FolderOpen } from 'lucide-svelte';
  import { cases, activities, isInitialized, searchQuery, filterStatus, filterPriority, addCase, updateCase, deleteCase, toggleCaseStatus, type Case, type Priority, type Status } from '$lib/store';

  // Derived state for metrics
  $: openCasesCount = $cases.filter((c: Case) => c.status === 'open').length;
  $: inProgressCount = $cases.filter((c: Case) => c.status === 'in_progress').length;
  $: highPriorityCount = $cases.filter((c: Case) => c.priority === 'high' || c.priority === 'critical').length;
  $: closedCasesCount = $cases.filter((c: Case) => c.status === 'closed').length;

  $: metrics = [
    { label: 'Open Cases', value: openCasesCount, icon: FolderOpen, color: 'text-primary' },
    { label: 'In Progress', value: inProgressCount, icon: Clock, color: 'text-primary' },
    { label: 'High Priority', value: highPriorityCount, icon: AlertCircle, color: 'text-accent' },
    { label: 'Cases Closed', value: closedCasesCount, icon: CheckCircle, color: 'text-status' },
  ];

  // Derived filtered cases
  $: filteredCases = $cases.filter((c: Case) => {
    // Status filter
    if ($filterStatus !== 'all' && c.status !== $filterStatus) return false;
    
    // Priority filter
    if ($filterPriority !== 'all' && c.priority !== $filterPriority) return false;
    
    // Search filter
    if ($searchQuery) {
      const q = $searchQuery.toLowerCase();
      return c.title.toLowerCase().includes(q) || 
             c.caseNumber.toLowerCase().includes(q) || 
             (c.description && c.description.toLowerCase().includes(q));
    }
    return true;
  }).sort((a, b) => {
    const numA = parseInt(a.caseNumber.split('-')[1] || '0', 10);
    const numB = parseInt(b.caseNumber.split('-')[1] || '0', 10);
    return numA - numB;
  });

  $: recentActivities = $activities.slice(0, 8);

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'critical': return 'text-accent border-accent/50 bg-accent/20';
      case 'high': return 'text-accent border-accent/30 bg-accent/10';
      case 'medium': return 'text-primary border-border bg-surface';
      case 'low': return 'text-secondary border-border bg-background';
      default: return 'text-primary border-border bg-surface';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'open': return 'text-secondary';
      case 'in_progress': return 'text-primary';
      case 'closed': return 'text-status line-through opacity-50';
      default: return 'text-secondary';
    }
  }

  function isOverdue(dueDate?: string, status?: string) {
    if (!dueDate || status === 'closed') return false;
    return new Date(dueDate) < new Date(new Date().setHours(0,0,0,0));
  }

  // Modal State
  let isModalOpen = false;
  let editingCaseId: string | null = null;
  let formTitle = '';
  let formDescription = '';
  let formPriority: Priority = 'medium';
  let formStatus: Status = 'open';
  let formDueDate = '';
  let formError = '';

  function openModal(c?: Case) {
    if (c) {
      editingCaseId = c.id;
      formTitle = c.title;
      formDescription = c.description || '';
      formPriority = c.priority;
      formStatus = c.status;
      formDueDate = c.dueDate || '';
    } else {
      editingCaseId = null;
      formTitle = '';
      formDescription = '';
      formPriority = 'medium';
      formStatus = 'open';
      formDueDate = '';
    }
    formError = '';
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }

  function saveCase() {
    if (!formTitle.trim()) {
      formError = 'Case title is required.';
      return;
    }

    const caseData = {
      title: formTitle,
      description: formDescription,
      priority: formPriority,
      status: formStatus,
      dueDate: formDueDate || undefined
    };

    if (editingCaseId) {
      updateCase(editingCaseId, caseData);
    } else {
      addCase(caseData);
    }
    closeModal();
  }

  let caseToDelete: string | null = null;
  function confirmDelete(id: string) {
    caseToDelete = id;
  }
  function executeDelete() {
    if (!caseToDelete) return;
    const deletedCaseId = caseToDelete;
    deleteCase(deletedCaseId);
    caseToDelete = null;
    if (editingCaseId === deletedCaseId) closeModal();
  }
</script>

<div class="max-w-6xl mx-auto space-y-8">
  
  <!-- Header Section -->
  <div class="flex justify-between items-end border-b border-border pb-4">
    <div>
      <h1 class="text-3xl font-bold tracking-tight mb-2">COMMAND CENTER</h1>
      <p class="text-secondary font-mono text-sm">Active Intelligence Dashboard // Monitor and manage ongoing investigations</p>
    </div>
    <button on:click={() => openModal()} class="flex items-center gap-2 bg-surface hover:bg-border text-primary border border-border px-4 py-2 rounded-sm transition-colors font-mono text-sm group">
      <Plus size={16} class="group-hover:text-accent transition-colors" />
      NEW CASE
    </button>
  </div>

  {#if !$isInitialized}
    <div class="flex flex-col items-center justify-center py-20 text-secondary animate-pulse space-y-4">
      <Activity size={48} class="opacity-50" />
      <p class="font-mono text-sm tracking-widest">DECRYPTING SECURE FILES...</p>
    </div>
  {:else}
    <!-- Metrics Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each metrics as metric}
      <div class="bg-surface border border-border p-4 rounded-sm flex items-start justify-between relative overflow-hidden group hover:border-secondary transition-colors">
        <div>
          <p class="text-secondary font-mono text-xs mb-1">{metric.label.toUpperCase()}</p>
          <p class="text-3xl font-bold {metric.color}">{metric.value}</p>
        </div>
        <svelte:component this={metric.icon} size={24} class="{metric.color} opacity-80" />
        <div class="absolute bottom-0 left-0 h-1 bg-border w-full">
          <div class="h-full bg-current {metric.color} opacity-20 w-1/3"></div>
        </div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    
    <!-- Main Cases List -->
    <div class="lg:col-span-2 space-y-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-mono text-sm font-semibold tracking-wider text-secondary flex items-center gap-2">
          <FileText size={16} />
          {#if $filterStatus === 'all'}ACTIVE DOSSIERS{:else}{$filterStatus.replace('_', ' ').toUpperCase()} DOSSIERS{/if}
        </h2>
        {#if $searchQuery}
          <span class="text-xs font-mono text-accent">SEARCH: "{$searchQuery}"</span>
        {/if}
      </div>

      <div class="space-y-3">
        {#if filteredCases.length === 0}
          <div class="border border-dashed border-border bg-surface/50 p-8 rounded-sm text-center">
            <FolderOpen size={32} class="mx-auto text-secondary mb-3 opacity-50" />
            <p class="text-primary font-mono text-sm">NO RECORDS FOUND</p>
            <p class="text-secondary text-xs mt-1">Try adjusting your filters or search query.</p>
          </div>
        {:else}
          {#each filteredCases as caseItem (caseItem.id)}
            <div 
              class="group border bg-surface p-4 rounded-sm transition-colors flex gap-4 relative
                     {isOverdue(caseItem.dueDate, caseItem.status) ? 'border-accent/40 bg-accent/5' : 'border-border'}"
            >
              
              <!-- Checkbox / Status -->
              <div class="pt-1">
                <button 
                  class="w-5 h-5 rounded-sm border flex items-center justify-center transition-colors bg-background z-10 relative
                         {isOverdue(caseItem.dueDate, caseItem.status) ? 'border-accent/50 hover:border-accent' : 'border-border hover:border-accent'}"
                  on:click|stopPropagation={() => toggleCaseStatus(caseItem.id)}
                >
                  {#if caseItem.status === 'closed'}
                    <CheckCircle size={14} class="text-status" />
                  {/if}
                </button>
              </div>

              <!-- Content -->
              <a href="/case/{caseItem.id}" class="flex-1 min-w-0 block">
                <div class="flex justify-between items-start mb-1">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs font-bold px-1.5 py-0.5 bg-background border border-border rounded text-secondary">
                      {caseItem.caseNumber}
                    </span>
                    <h3 class="font-semibold text-primary truncate group-hover:text-accent transition-colors
                               {caseItem.status === 'closed' ? 'text-secondary line-through' : ''}
                               {isOverdue(caseItem.dueDate, caseItem.status) ? 'text-accent' : ''}">
                      {caseItem.title}
                    </h3>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <span class="font-mono text-[10px] px-2 py-0.5 border rounded-sm {getPriorityColor(caseItem.priority)}">
                      {caseItem.priority.toUpperCase()} PRIORITY
                    </span>
                  </div>
                </div>
                
                <p class="text-sm text-secondary mb-3 line-clamp-2 {caseItem.status === 'closed' ? 'opacity-50' : ''}">
                  {caseItem.description || 'No description provided.'}
                </p>
                
                <div class="flex items-center gap-4 text-xs font-mono text-secondary">
                  {#if caseItem.dueDate}
                    <div class="flex items-center gap-1.5 {isOverdue(caseItem.dueDate, caseItem.status) ? 'text-accent font-bold' : ''}">
                      <Clock size={12} />
                      <span>DUE: {caseItem.dueDate}</span>
                    </div>
                  {/if}
                  <div class="flex items-center gap-1.5">
                    <Activity size={12} />
                    <span>STAT: {caseItem.status.replace('_', ' ').toUpperCase()}</span>
                  </div>
                </div>
              </a>
                <div class="flex flex-col gap-2 shrink-0">
                  <button
                    on:click={() => openModal(caseItem)}
                    class="text-secondary hover:text-accent opacity-0 group-hover:opacity-100 transition-all p-1"
                    title="Edit case"
                    aria-label="Edit {caseItem.caseNumber}"
                  >
                    <FileText size={14} />
                  </button>
                  <button
                    on:click={() => confirmDelete(caseItem.id)}
                    class="text-secondary hover:text-accent opacity-0 group-hover:opacity-100 transition-all p-1"
                    title="Delete case"
                    aria-label="Delete {caseItem.caseNumber}"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Sidebar / Activity -->
    <div class="space-y-6">
      <div class="border border-border bg-surface rounded-sm p-4">
        <h2 class="font-mono text-sm font-semibold tracking-wider text-secondary flex items-center gap-2 mb-4">
          <Activity size={16} />
          SYSTEM LOG
        </h2>
        
        <div class="space-y-4">
          {#if recentActivities.length === 0}
            <p class="text-secondary font-mono text-xs text-center opacity-50 py-4">NO ACTIVITY RECORDED</p>
          {/if}
          {#each recentActivities as log (log.id)}
            <div class="flex gap-3 text-sm">
              <div class="font-mono text-xs text-secondary shrink-0 pt-0.5" title={log.timestamp}>
                {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
              <div>
                <p class="text-primary text-xs mb-0.5">{log.description}</p>
                <p class="font-mono text-[10px] text-accent uppercase">ACT: {log.action.replace('_', ' ')}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="border border-accent/20 bg-accent/5 rounded-sm p-4">
        <div class="flex gap-3">
          <AlertTriangle size={20} class="text-accent shrink-0" />
          <div>
            <h3 class="font-mono text-xs font-bold text-accent mb-1">CLASSIFIED NOTICE</h3>
            <p class="text-xs text-secondary leading-relaxed">
              Unauthorized access to case files will result in immediate termination of clearance. Ensure terminal is locked when unattended.
            </p>
          </div>
        </div>
      </div>
    </div>

  </div>
  {/if}
</div>

<!-- Modal Overlay -->
{#if isModalOpen}
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-surface border border-border w-full max-w-lg rounded-sm shadow-2xl flex flex-col max-h-[90vh]">
      
      <!-- Modal Header -->
      <div class="flex justify-between items-center p-4 border-b border-border bg-background/50">
        <h2 class="font-mono font-bold text-lg text-primary flex items-center gap-2">
          {#if editingCaseId}
            <FileText size={18} /> EDIT CASE
          {:else}
            <Plus size={18} /> NEW CASE
          {/if}
        </h2>
        <button on:click={closeModal} class="text-secondary hover:text-primary transition-colors">
          <X size={20} />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-4">
        {#if formError}
          <div class="bg-accent/10 border border-accent/30 text-accent p-3 rounded-sm text-sm flex items-start gap-2">
            <AlertTriangle size={16} class="shrink-0 mt-0.5" />
            <p>{formError}</p>
          </div>
        {/if}

        <div class="space-y-1">
          <label class="font-mono text-xs text-secondary">TITLE</label>
          <input 
            type="text" 
            bind:value={formTitle} 
            placeholder="Operation name..." 
            class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary placeholder-secondary/50"
          />
        </div>

        <div class="space-y-1">
          <label class="font-mono text-xs text-secondary">DESCRIPTION</label>
          <textarea 
            bind:value={formDescription} 
            rows="3"
            placeholder="Details of the investigation..." 
            class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary placeholder-secondary/50 resize-none"
          ></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="font-mono text-xs text-secondary">PRIORITY</label>
            <select bind:value={formPriority} class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary appearance-none">
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="critical">Critical Priority</option>
            </select>
          </div>
          
          <div class="space-y-1">
            <label class="font-mono text-xs text-secondary">STATUS</label>
            <select bind:value={formStatus} class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary appearance-none">
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div class="space-y-1">
          <label class="font-mono text-xs text-secondary">DUE DATE</label>
          <input 
            type="date" 
            bind:value={formDueDate} 
            class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary"
          />
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-border bg-background/50 flex justify-between items-center">
        {#if editingCaseId}
          <button on:click={() => confirmDelete(editingCaseId || '')} class="text-accent hover:bg-accent/10 px-3 py-1.5 rounded-sm transition-colors flex items-center gap-1 text-sm font-mono">
            <Trash2 size={14} /> DELETE
          </button>
        {:else}
          <div></div>
        {/if}
        
        <div class="flex gap-3">
          <button on:click={closeModal} class="text-secondary hover:text-primary px-4 py-2 font-mono text-sm transition-colors">
            CANCEL
          </button>
          <button on:click={saveCase} class="bg-accent hover:bg-accent/90 text-primary px-4 py-2 rounded-sm font-mono text-sm transition-colors">
            SAVE RECORD
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if caseToDelete}
  <div class="fixed inset-0 bg-background/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
    <div class="bg-surface border border-accent w-full max-w-sm rounded-sm shadow-2xl p-6 text-center">
      <AlertTriangle size={48} class="text-accent mx-auto mb-4" />
      <h3 class="font-mono font-bold text-lg text-primary mb-2">CONFIRM DELETION</h3>
      <p class="text-sm text-secondary mb-6">This permanently deletes the selected case and its attached evidence notes. Activity history for this case will also remain in the system log. This action cannot be undone.</p>
      
      <div class="flex gap-4 justify-center">
        <button on:click={() => caseToDelete = null} class="text-secondary hover:text-primary px-4 py-2 font-mono text-sm transition-colors">
          ABORT
        </button>
        <button on:click={executeDelete} class="bg-accent hover:bg-accent/90 text-primary px-4 py-2 rounded-sm font-mono text-sm transition-colors flex items-center gap-2">
          <Trash2 size={16} /> EXPUNGE RECORD
        </button>
      </div>
    </div>
  </div>
{/if}
