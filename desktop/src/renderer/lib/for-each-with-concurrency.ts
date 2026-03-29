/**
 * Runs async work over `items` with at most `concurrency` operations in flight.
 * Preserves completion order of individual updates; items are started in order.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  const worker = async (): Promise<void> => {
    let i = next++;
    while (i < items.length) {
      await fn(items[i]);
      i = next++;
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
}
