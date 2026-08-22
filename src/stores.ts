/**
 * Interface for a duplicate transaction guard store.
 * Implement this to plug your own database into the duplicate detection system.
 *
 * @example
 * // Custom Prisma DB adapter
 * const store: DuplicateStore = {
 *   has: async (ref) => !!(await db.payment.findUnique({ where: { reference: ref } })),
 *   add: async (ref) => { await db.payment.create({ data: { reference: ref } }); }
 * };
 * @since 2.0.0
 */
export interface DuplicateStore {
  /**
   * Returns true if this reference ID has already been verified.
   * @param reference - The transaction reference ID to check.
   */
  has(reference: string): boolean | Promise<boolean>;

  /**
   * Records a reference ID as verified so future calls to `has()` return true.
   * @param reference - The transaction reference ID to store.
   */
  add(reference: string): void | Promise<void>;
}

/**
 * Interface for a sender/account blocklist store.
 * Implement this to plug your own database into the blacklist system.
 *
 * @example
 * // Custom Redis adapter
 * const store: BlacklistStore = {
 *   isBlocked: async (id) => await redis.sismember('blocklist', id) === 1
 * };
 * @since 2.0.0
 */
export interface BlacklistStore {
  /**
   * Returns true if this phone number or account is blocked.
   * @param identifier - The phone number or account number to check.
   */
  isBlocked(identifier: string): boolean | Promise<boolean>;
}

/**
 * Built-in in-memory duplicate transaction guard.
 * Stores verified reference IDs in a `Set` in RAM.
 *
 * ⚠️ Data is lost on process restart. Use a custom `DuplicateStore` adapter for persistence.
 *
 * @example
 * const verifier = new PaymentVerifier({
 *   duplicateGuard: new InMemoryDuplicateStore()
 * });
 * @since 2.0.0
 */
export class InMemoryDuplicateStore implements DuplicateStore {
  private seen = new Set<string>();

  /**
   * Returns true if this reference ID has already been verified in this process session.
   * @param reference - The transaction reference ID to check.
   */
  has(reference: string): boolean {
    return this.seen.has(reference.toUpperCase());
  }

  /**
   * Marks a reference ID as verified.
   * @param reference - The transaction reference ID to store.
   */
  add(reference: string): void {
    this.seen.add(reference.toUpperCase());
  }

  /**
   * Returns the number of reference IDs currently tracked.
   */
  get size(): number {
    return this.seen.size;
  }

  /**
   * Clears all stored reference IDs. Useful in tests.
   */
  clear(): void {
    this.seen.clear();
  }
}

/**
 * Built-in static blocklist store backed by an array of strings.
 * Performs case-insensitive partial matching on phone numbers and account IDs.
 *
 * @example
 * const verifier = new PaymentVerifier({
 *   blacklist: new StaticBlacklistStore(['0911223344', '0922112233'])
 * });
 * @since 2.0.0
 */
export class StaticBlacklistStore implements BlacklistStore {
  private entries: string[];

  constructor(entries: string[]) {
    this.entries = entries.map(e => e.toLowerCase().replace(/\s/g, ''));
  }

  /**
   * Returns true if the identifier matches any entry in the blocklist.
   * @param identifier - The phone number or account to check.
   */
  isBlocked(identifier: string): boolean {
    const normalized = identifier.toLowerCase().replace(/\s/g, '');
    return this.entries.some(entry => normalized.includes(entry) || entry.includes(normalized));
  }
}
