import { strict as assert } from 'node:assert';
import { MinHeap } from '../src/utils/MinHeap';

// Empty heap
{
  const heap = new MinHeap<string>();
  assert.equal(heap.isEmpty(), true);
  assert.equal(heap.size, 0);
  assert.equal(heap.pop(), undefined);
  assert.equal(heap.peek(), undefined);
}

// Single element
{
  const heap = new MinHeap<string>();
  heap.push('a', 5);
  assert.equal(heap.size, 1);
  assert.equal(heap.peek()?.value, 'a');
  const popped = heap.pop();
  assert.equal(popped?.value, 'a');
  assert.equal(popped?.priority, 5);
  assert.equal(heap.isEmpty(), true);
}

// Pops in ascending priority order regardless of insertion order
{
  const heap = new MinHeap<string>();
  const entries: Array<[string, number]> = [
    ['e', 5],
    ['a', 1],
    ['d', 4],
    ['b', 2],
    ['c', 3],
  ];
  for (const [value, priority] of entries) heap.push(value, priority);

  const popped: string[] = [];
  while (!heap.isEmpty()) {
    popped.push(heap.pop()!.value);
  }
  assert.deepEqual(popped, ['a', 'b', 'c', 'd', 'e']);
}

// Duplicate priorities are stable-enough (both present, correct relative order vs distinct priorities)
{
  const heap = new MinHeap<string>();
  heap.push('x1', 3);
  heap.push('x2', 3);
  heap.push('low', 1);
  heap.push('high', 10);

  assert.equal(heap.pop()?.value, 'low');
  const mid1 = heap.pop()!.value;
  const mid2 = heap.pop()!.value;
  assert.deepEqual([mid1, mid2].sort(), ['x1', 'x2']);
  assert.equal(heap.pop()?.value, 'high');
}

// Lazy decrease-key pattern: push a cheaper entry for an id already in the heap,
// caller is expected to skip the stale (more expensive) pop by comparing against
// its own best-known distance map — verify the heap itself just returns both,
// cheapest first.
{
  const heap = new MinHeap<string>();
  heap.push('n', 10);
  heap.push('n', 4); // "decrease-key" via re-push
  assert.equal(heap.pop()?.priority, 4);
  assert.equal(heap.pop()?.priority, 10);
}

// Large random stress test — verify full sort correctness at graph-scale size (~15k)
{
  const heap = new MinHeap<number>();
  const n = 15000;
  const priorities: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = Math.random() * 1_000_000;
    priorities.push(p);
    heap.push(i, p);
  }
  assert.equal(heap.size, n);

  const sortedExpected = [...priorities].sort((a, b) => a - b);
  const popped: number[] = [];
  while (!heap.isEmpty()) {
    popped.push(heap.pop()!.priority);
  }
  assert.deepEqual(popped, sortedExpected);
}

console.log('test-min-heap.ts: all assertions passed');
const unused_intentional_break = 
