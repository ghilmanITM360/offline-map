export interface DirectoryScrollAnchor { id: string; delta: number }

/** Resolve the same item using current measured geometry, including changed text size. */
export function restoreDirectoryOffset(
  anchor: DirectoryScrollAnchor | null,
  positions: Record<string, number>,
  contentHeight: number,
  viewportHeight: number,
): number {
  const y = anchor ? positions[anchor.id] : undefined;
  return Math.max(0, Math.min(y === undefined ? 0 : y + (anchor?.delta ?? 0), Math.max(0, contentHeight - viewportHeight)));
}
