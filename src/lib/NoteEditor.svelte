<script lang="ts">
  import { tick } from 'svelte';

  export let id: string;
  export let value = '';
  export let rows = 5;
  export let placeholder = '';

  let textarea: HTMLTextAreaElement;
  let selectionStart = 0;
  let selectionEnd = 0;

  const formats = [
    { label: 'Bold', marker: '**', className: 'font-bold' },
    { label: 'Italic', marker: '*', className: 'italic' },
    { label: 'Underline', marker: '__', className: 'underline' },
    { label: 'Strikethrough', marker: '~~', className: 'line-through' },
    { label: 'Inline code', marker: '`', className: 'font-mono' }
  ];

  function rememberSelection() {
    selectionStart = textarea.selectionStart;
    selectionEnd = textarea.selectionEnd;
  }

  async function wrapSelection(marker: string) {
    const start = selectionStart;
    const end = selectionEnd;
    const selected = value.slice(start, end);
    value = `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`;
    await tick();
    textarea.focus();
    textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
    rememberSelection();
  }

  async function insertBulletList() {
    const start = selectionStart;
    const end = selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const nextNewline = value.indexOf('\n', end);
    const lineEnd = nextNewline === -1 ? value.length : nextNewline;
    const selectedLines = value.slice(lineStart, lineEnd);
    const formattedLines = selectedLines
      .split('\n')
      .map(line => line.startsWith('- ') ? line : `- ${line}`)
      .join('\n');

    value = `${value.slice(0, lineStart)}${formattedLines}${value.slice(lineEnd)}`;
    await tick();
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + formattedLines.length);
    rememberSelection();
  }
</script>

<div class="space-y-2">
  <div class="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Format field notes">
    {#each formats as format}
      <button
        type="button"
        on:mousedown|preventDefault={rememberSelection}
        on:click={() => wrapSelection(format.marker)}
        class="border border-border hover:border-accent hover:text-accent rounded-sm px-2 py-1 text-xs text-primary {format.className}"
        aria-label={format.label}
        title={format.label}
      >
        {format.label}
      </button>
    {/each}
    <button
      type="button"
      on:mousedown|preventDefault={rememberSelection}
      on:click={insertBulletList}
      class="border border-border hover:border-accent hover:text-accent rounded-sm px-2 py-1 text-xs text-primary"
      aria-label="Bullet list"
      title="Bullet list"
    >
      • List
    </button>
    <span class="text-[10px] text-secondary ml-1">Select text, then apply formatting</span>
  </div>
  <textarea
    bind:this={textarea}
    {id}
    {rows}
    bind:value
    {placeholder}
    on:select={rememberSelection}
    on:blur={rememberSelection}
    on:keyup={rememberSelection}
    class="w-full bg-background border border-border text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-accent text-primary resize-none"
  ></textarea>
</div>
