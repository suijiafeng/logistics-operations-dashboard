// 只用到的高德 2.0 表面。不引入完整 @types，避免没装高德时类型检查被一套用不到的声明拖住。

export interface AMapMap {
  add(overlay: unknown): void
  remove(overlay: unknown): void
  setFitView(overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number): void
  resize(): void
  destroy(): void
}

export interface AMapPolyline {
  setPath(path: number[][]): void
}

export interface AMapMarker {
  setPosition(position: [number, number]): void
  setAngle(angle: number): void
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap
  Polyline: new (options: Record<string, unknown>) => AMapPolyline
  Marker: new (options: Record<string, unknown>) => AMapMarker
}
