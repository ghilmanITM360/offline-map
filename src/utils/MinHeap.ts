/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Binary min-heap keyed by an external priority. Supports decrease-key via
 * `push` on an id already present — the cheaper stale entry is skipped by the
 * caller checking `priority` against its own best-known distance on pop
 * (standard "lazy deletion" Dijkstra/A* pattern, avoids an index map).
 */
export class MinHeap<T> {
  private heap: Array<{ priority: number; value: T }> = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(value: T, priority: number): void {
    this.heap.push({ priority, value });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { priority: number; value: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  peek(): { priority: number; value: T } | undefined {
    return this.heap[0];
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const length = this.heap.length;
    for (;;) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let smallest = i;

      if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === i) break;

      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tmp = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = tmp;
  }
}
