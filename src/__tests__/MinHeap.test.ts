import { MinHeap as PublicMinHeap } from '@muslim-ummah/offline-navigation';
import { MinHeap as DomainMinHeap } from '../../packages/offline-navigation/src/domain/algorithms/MinHeap';
import { MinHeap } from '../utils/MinHeap';

describe('public MinHeap compatibility facade', () => {
  it('preserves the exact public/domain class reference', () => {
    expect(MinHeap).toBe(PublicMinHeap);
    expect(MinHeap).toBe(DomainMinHeap);
  });

  it('preserves generic values, empty operations and existing equal-priority order', () => {
    const heap = new MinHeap<{ id: string }>();
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
    expect(heap.isEmpty()).toBe(true);
    const values = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    values.forEach(value => heap.push(value, 1));
    expect(heap.size).toBe(4);
    expect(heap.peek()?.value).toBe(values[0]);
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop()].map(entry => entry?.value))
      .toEqual([values[0], values[3], values[2], values[1]]);
    expect(heap.size).toBe(0);
    expect(heap.isEmpty()).toBe(true);
  });
});
