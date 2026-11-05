<script lang="ts">
  import { onMount } from 'svelte';
  import type { MinimapItem, MinimapSize, MinimapViewport } from '$lib/evidenceBoardMinimap';

  export let viewport: MinimapViewport;
  export let items: MinimapItem[] = [];
  export let viewportSize: MinimapSize;
  export let worldOrigin: number;
  export let onNavigate: (worldX: number, worldY: number) => void;
  export let width = 180;
  export let height = 120;
  export let margin = 12;

  const STORAGE_KEY = 'casefile:evidence-board-minimap-visible';
  const CONTENT_PADDING = 8;
  let visible = true;
  let svgElement: SVGSVGElement;
  let isDragging = false;
  let activePointerId: number | null = null;

  type Bounds = { left: number; top: number; right: number; bottom: number };

  function getItemBounds(boardItems: MinimapItem[]): Bounds | null {
    if (boardItems.length === 0) return null;
    return boardItems.reduce((bounds, item) => ({
      left: Math.min(bounds.left, item.x),
      top: Math.min(bounds.top, item.y),
      right: Math.max(bounds.right, item.x + item.width),
      bottom: Math.max(bounds.bottom, item.y + item.height)
    }), {
      left: boardItems[0].x,
      top: boardItems[0].y,
      right: boardItems[0].x + boardItems[0].width,
      bottom: boardItems[0].y + boardItems[0].height
    });
  }

  function getViewportBounds(current: MinimapViewport, size: MinimapSize): Bounds {
    return {
      left: -current.x / current.scale - worldOrigin,
      top: -current.y / current.scale - worldOrigin,
      right: (size.width - current.x) / current.scale - worldOrigin,
      bottom: (size.height - current.y) / current.scale - worldOrigin
    };
  }

  function getMapBounds(itemBounds: Bounds | null, viewBounds: Bounds): Bounds {
    const bounds = itemBounds
      ? {
          left: Math.min(itemBounds.left, viewBounds.left),
          top: Math.min(itemBounds.top, viewBounds.top),
          right: Math.max(itemBounds.right, viewBounds.right),
          bottom: Math.max(itemBounds.bottom, viewBounds.bottom)
        }
      : { ...viewBounds };
    const padding = Math.max(24, Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * 0.1);
    return {
      left: bounds.left - padding,
      top: bounds.top - padding,
      right: bounds.right + padding,
      bottom: bounds.bottom + padding
    };
  }

  function getPointOnMap(event: PointerEvent): { x: number; y: number } {
    const rect = svgElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height
    };
  }

  function navigateFromEvent(event: PointerEvent) {
    if (mapScale <= 0) return;
    const point = getPointOnMap(event);
    onNavigate(
      (point.x - mapOffsetX) / mapScale + mapBounds.left,
      (point.y - mapOffsetY) / mapScale + mapBounds.top
    );
  }

  function handlePointerDown(event: PointerEvent) {
    event.stopPropagation();
    if (event.button !== 0) return;
    isDragging = true;
    activePointerId = event.pointerId;
    svgElement.setPointerCapture(event.pointerId);
    navigateFromEvent(event);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent) {
    event.stopPropagation();
    if (!isDragging || activePointerId !== event.pointerId) return;
    navigateFromEvent(event);
  }

  function finishPointer(event: PointerEvent) {
    event.stopPropagation();
    if (activePointerId !== event.pointerId) return;
    isDragging = false;
    activePointerId = null;
    if (svgElement.hasPointerCapture(event.pointerId)) {
      svgElement.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function stopPointerDown(event: PointerEvent) {
    event.stopPropagation();
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function toggleVisibility() {
    visible = !visible;
    try {
      localStorage.setItem(STORAGE_KEY, String(visible));
    } catch (error) {
      console.error('Failed to save evidence board minimap visibility:', error);
    }
  }

  onMount(() => {
    try {
      const savedVisibility = localStorage.getItem(STORAGE_KEY);
      if (savedVisibility !== null) visible = savedVisibility === 'true';
    } catch (error) {
      console.error('Failed to load evidence board minimap visibility:', error);
    }
  });

  $: itemBounds = getItemBounds(items);
  $: viewportBounds = getViewportBounds(viewport, viewportSize);
  $: mapBounds = getMapBounds(itemBounds, viewportBounds);
  $: mapScale = Math.min(
    (width - CONTENT_PADDING * 2) / Math.max(1, mapBounds.right - mapBounds.left),
    (height - CONTENT_PADDING * 2) / Math.max(1, mapBounds.bottom - mapBounds.top)
  );
  $: mapOffsetX = (width - (mapBounds.right - mapBounds.left) * mapScale) / 2;
  $: mapOffsetY = (height - (mapBounds.bottom - mapBounds.top) * mapScale) / 2;
  $: viewportRect = {
    x: mapOffsetX + (viewportBounds.left - mapBounds.left) * mapScale,
    y: mapOffsetY + (viewportBounds.top - mapBounds.top) * mapScale,
    width: Math.max(1, (viewportBounds.right - viewportBounds.left) * mapScale),
    height: Math.max(1, (viewportBounds.bottom - viewportBounds.top) * mapScale)
  };
</script>

<div
  class="absolute z-50 select-none"
  style="top: {margin}px; right: {margin}px;"
>
  {#if visible}
    <div class="relative overflow-hidden rounded-sm border border-border bg-background/85 shadow-lg backdrop-blur-sm" style="width: {width}px; height: {height}px;">
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <svg
        bind:this={svgElement}
        viewBox="0 0 {width} {height}"
        role="application"
        aria-label="Evidence board minimap. Click or drag to navigate the board."
        class="block h-full w-full touch-none cursor-crosshair"
        on:pointerdown={handlePointerDown}
        on:pointermove={handlePointerMove}
        on:pointerup={finishPointer}
        on:pointercancel={finishPointer}
        on:lostpointercapture={finishPointer}
        on:wheel|nonpassive={handleWheel}
        on:contextmenu={handleContextMenu}
      >
        <rect width={width} height={height} fill="#111315" fill-opacity="0.82" />
        {#each items as item (item.kind + ':' + item.id)}
          <rect
            x={mapOffsetX + (item.x - mapBounds.left) * mapScale}
            y={mapOffsetY + (item.y - mapBounds.top) * mapScale}
            width={Math.max(2, item.width * mapScale)}
            height={Math.max(2, item.height * mapScale)}
            rx="1"
            fill={item.selected ? '#d77979' : item.kind === 'hub' ? '#a64242' : '#c8c4b0'}
            fill-opacity={item.selected ? 1 : 0.78}
            stroke={item.selected ? '#ffe0e0' : '#111315'}
            stroke-width={item.selected ? 1.5 : 0.5}
          />
        {/each}
        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          fill="#a64242"
          fill-opacity="0.12"
          stroke="#ef7777"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <button
        type="button"
        aria-label="Hide minimap"
        title="Hide minimap"
        class="absolute right-1 top-1 rounded-sm border border-border bg-background/90 px-1.5 py-0.5 font-mono text-[9px] text-secondary hover:text-primary"
        on:pointerdown={stopPointerDown}
        on:click|stopPropagation={toggleVisibility}
      >
        HIDE
      </button>
    </div>
  {:else}
    <button
      type="button"
      aria-label="Show minimap"
      title="Show minimap"
      class="rounded-sm border border-border bg-background/90 px-2 py-1 font-mono text-[10px] text-secondary shadow-lg hover:text-primary"
      on:pointerdown={stopPointerDown}
      on:click|stopPropagation={toggleVisibility}
    >
      MINIMAP
    </button>
  {/if}
</div>
