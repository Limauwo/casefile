<script lang="ts">
  import '../app.css';
  import { Shield, LayoutDashboard, FolderOpen, FolderArchive, Clock, Settings, Search, AlertTriangle, Map, Menu, X as XIcon } from 'lucide-svelte';
  import { searchQuery, filterStatus, filterPriority, clearAllData, initializeStore } from '$lib/store';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  $: currentPath = $page?.url?.pathname || '/';
  let showSettingsModal = false;
  let showMobileMenu = false;

  function filterAndGo(status: string) {
    $filterStatus = status as any;
    goto('/');
    showMobileMenu = false;
  }

  onMount(() => {
    initializeStore();
  });

  $: breadcrumb = (() => {
    if (currentPath === '/') return 'command-center';
    if (currentPath === '/evidence-board') return 'evidence-board';
    if (currentPath.startsWith('/case/')) return `dossier`;
    return currentPath.replace('/', '');
  })();
</script>

<div class="flex h-screen overflow-hidden bg-background">
  <!-- Sidebar (desktop) -->
  <aside class="w-64 border-r border-border bg-surface flex-col hidden md:flex">
    <div class="p-6 border-b border-border">
      <div class="flex items-center gap-3 text-accent mb-1">
        <Shield size={24} />
        <h1 class="font-mono font-bold text-xl tracking-wider">CASEFILE</h1>
      </div>
      <p class="font-mono text-xs text-secondary tracking-widest">SYS.ID // 8472-X</p>
    </div>

    <nav class="flex-1 overflow-y-auto py-4">
      <ul class="space-y-1 px-3">
        <li>
          <a href="/" class="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm {currentPath === '/' ? 'bg-border text-primary font-medium' : 'text-secondary hover:text-primary hover:bg-border/50'}">
            <LayoutDashboard size={18} />
            Command Center
          </a>
        </li>
        <li>
          <a href="/evidence-board" class="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm {currentPath === '/evidence-board' ? 'bg-border text-primary font-medium' : 'text-secondary hover:text-primary hover:bg-border/50'}">
            <Map size={18} />
            Evidence Board
          </a>
        </li>
        <li class="pt-4 pb-2 px-3">
          <p class="font-mono text-xs text-secondary font-semibold tracking-wider">INVESTIGATIONS</p>
        </li>
        <li>
          <button on:click={() => filterAndGo('open')} class="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm {$filterStatus === 'open' && currentPath === '/' ? 'bg-border text-primary font-medium' : 'text-secondary hover:text-primary hover:bg-border/50'}">
            <FolderOpen size={18} />
            Open Cases
          </button>
        </li>
        <li>
          <button on:click={() => filterAndGo('in_progress')} class="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm {$filterStatus === 'in_progress' && currentPath === '/' ? 'bg-border text-primary font-medium' : 'text-secondary hover:text-primary hover:bg-border/50'}">
            <Clock size={18} />
            In Progress
          </button>
        </li>
        <li>
          <button on:click={() => filterAndGo('closed')} class="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm {$filterStatus === 'closed' && currentPath === '/' ? 'bg-border text-primary font-medium' : 'text-secondary hover:text-primary hover:bg-border/50'}">
            <FolderArchive size={18} />
            Closed Cases
          </button>
        </li>
        <li class="pt-4 pb-2 px-3">
          <p class="font-mono text-xs text-secondary font-semibold tracking-wider">PRIORITY</p>
        </li>
        <li>
          <select bind:value={$filterPriority} class="w-full bg-background border border-border text-sm rounded-sm px-3 py-1.5 focus:outline-none focus:border-accent text-primary appearance-none mx-3 font-mono" style="width: calc(100% - 24px)">
            <option value="all">ALL PRIORITIES</option>
            <option value="low">LOW</option>
            <option value="medium">MEDIUM</option>
            <option value="high">HIGH</option>
            <option value="critical">CRITICAL</option>
          </select>
        </li>
      </ul>
    </nav>
    
    <div class="p-4 border-t border-border">
      <button on:click={() => showSettingsModal = true} class="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm text-secondary hover:text-primary hover:bg-border/50 transition-colors">
        <Settings size={18} />
        System Settings
      </button>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
    <!-- Topbar -->
    <header class="h-16 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0">
      <div class="flex items-center gap-4">
        <!-- Mobile menu button -->
        <button on:click={() => showMobileMenu = !showMobileMenu} class="md:hidden text-secondary hover:text-primary transition-colors">
          <Menu size={20} />
        </button>
        <div class="font-mono text-sm text-secondary hidden sm:block">
          <span class="text-primary">root</span> / {breadcrumb}
        </div>
      </div>
      
      <div class="flex items-center gap-6">
        <div class="relative hidden sm:block">
          <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input 
            type="text" 
            bind:value={$searchQuery}
            placeholder="Search records..." 
            class="bg-background border border-border text-sm rounded-sm pl-10 pr-4 py-1.5 focus:outline-none focus:border-accent text-primary w-64 placeholder-secondary font-mono"
          />
        </div>
        
        <div class="flex items-center gap-4">
          <div class="text-xs font-mono text-secondary">
            {new Date().toISOString().split('T')[0]}
          </div>
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-status animate-pulse"></div>
            <span class="text-xs font-mono text-status">SYS.ONLINE</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Mobile sidebar overlay -->
    {#if showMobileMenu}
      <div class="fixed inset-0 z-50 md:hidden">
        <button class="absolute inset-0 bg-background/80" on:click={() => showMobileMenu = false} aria-label="Close menu"></button>
        <div class="absolute left-0 top-0 h-full w-64 bg-surface border-r border-border flex flex-col z-10">
          <div class="p-4 border-b border-border flex items-center justify-between">
            <div class="flex items-center gap-2 text-accent">
              <Shield size={20} />
              <span class="font-mono font-bold">CASEFILE</span>
            </div>
            <button on:click={() => showMobileMenu = false} class="text-secondary hover:text-primary">
              <XIcon size={20} />
            </button>
          </div>
          <nav class="flex-1 py-4 overflow-y-auto">
            <ul class="space-y-1 px-3">
              <li>
                <a href="/" on:click={() => showMobileMenu = false} class="flex items-center gap-3 px-3 py-2 text-sm {currentPath === '/' ? 'bg-border text-primary' : 'text-secondary'}">
                  <LayoutDashboard size={18} /> Command Center
                </a>
              </li>
              <li>
                <a href="/evidence-board" on:click={() => showMobileMenu = false} class="flex items-center gap-3 px-3 py-2 text-sm {currentPath === '/evidence-board' ? 'bg-border text-primary' : 'text-secondary'}">
                  <Map size={18} /> Evidence Board
                </a>
              </li>
              <li class="pt-4 pb-2 px-3"><p class="font-mono text-xs text-secondary font-semibold tracking-wider">FILTER BY STATUS</p></li>
              <li><button on:click={() => filterAndGo('all')} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary"><LayoutDashboard size={18} /> All Cases</button></li>
              <li><button on:click={() => filterAndGo('open')} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary"><FolderOpen size={18} /> Open Cases</button></li>
              <li><button on:click={() => filterAndGo('in_progress')} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary"><Clock size={18} /> In Progress</button></li>
              <li><button on:click={() => filterAndGo('closed')} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary"><FolderArchive size={18} /> Closed</button></li>
              <li class="pt-4"><button on:click={() => { showSettingsModal = true; showMobileMenu = false; }} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary"><Settings size={18} /> Settings</button></li>
            </ul>
          </nav>
        </div>
      </div>
    {/if}

    <!-- Page Content -->
    <div class="flex-1 overflow-auto p-4 lg:p-8">
      <slot />
    </div>
  </main>
</div>

<!-- Settings Modal for Clearing Data -->
{#if showSettingsModal}
  <div class="fixed inset-0 bg-background/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
    <div class="bg-surface border border-accent w-full max-w-sm rounded-sm shadow-2xl p-6 text-center">
      <AlertTriangle size={48} class="text-accent mx-auto mb-4" />
      <h3 class="font-mono font-bold text-lg text-primary mb-2">SYSTEM PURGE</h3>
      <p class="text-sm text-secondary mb-6">Are you sure you want to completely erase all local case data? This action will restore the terminal to factory default settings.</p>
      
      <div class="flex gap-4 justify-center">
        <button on:click={() => showSettingsModal = false} class="text-secondary hover:text-primary px-4 py-2 font-mono text-sm transition-colors">
          ABORT
        </button>
        <button on:click={() => { clearAllData(); showSettingsModal = false; }} class="bg-accent hover:bg-accent/90 text-primary px-4 py-2 rounded-sm font-mono text-sm transition-colors flex items-center gap-2">
           EXECUTE PURGE
        </button>
      </div>
    </div>
  </div>
{/if}
