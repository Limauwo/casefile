export type MinimapItem = {
  id: string;
  kind: 'note' | 'hub';
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
};

export type MinimapViewport = { x: number; y: number; scale: number };
export type MinimapSize = { width: number; height: number };
