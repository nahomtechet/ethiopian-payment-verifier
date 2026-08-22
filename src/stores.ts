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

/**
 * Interface for a velocity limit store.
 * Implement this to plug your own database (e.g., Redis) into the rate limiting system.
 * @since 2.2.0
 */
export interface VelocityStore {
  /**
   * Records a verification attempt and returns the total count within the window.
   * @param identifier - The phone number or account to track.
   * @returns The number of attempts in the current time window.
   */
  incrementAndGet(identifier: string): number | Promise<number>;
}

/**
 * Built-in in-memory velocity limit store.
 * Stores attempt counts in a `Map` in RAM.
 *
 * ⚠️ Data is lost on process restart and time windows are not perfectly sliding.
 * Use a custom Redis-backed `VelocityStore` for production rate limiting.
 *
 * @since 2.2.0
 */
export class InMemoryVelocityStore implements VelocityStore {
  private counts = new Map<string, { count: number; resetAt: number }>();
  private windowMs: number;

  /**
   * @param windowMinutes - The time window in minutes (e.g., 60 for per-hour limits).
   */
  constructor(windowMinutes: number = 60) {
    this.windowMs = windowMinutes * 60_000;
  }

  /**
   * Increments the count for the identifier and returns the new count.
   * Resets the count if the time window has passed.
   * @param identifier - The phone number or account to track.
   */
  incrementAndGet(identifier: string): number {
    const now = Date.now();
    const id = identifier.toLowerCase().replace(/\s/g, '');
    let record = this.counts.get(id);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + this.windowMs };
    }

    record.count += 1;
    this.counts.set(id, record);

    // Occasional cleanup to prevent memory leaks
    if (this.counts.size > 10000) {
      for (const [key, val] of this.counts.entries()) {
        if (now > val.resetAt) this.counts.delete(key);
      }
    }

    return record.count;
  }
}

// ── Enterprise Adapters ──────────────────────────────────────────────────────

/**
 * A duplicate store backed by Redis.
 * Requires an external Redis client instance (e.g. `ioredis` or `redis`).
 * @since 2.4.0
 */
export class RedisDuplicateStore implements DuplicateStore {
  /**
   * @param redisClient - An initialized Redis client (e.g., `new Redis()`).
   * @param prefix - Key prefix to avoid collisions. Default `'epv:dup:'`.
   * @param ttlSeconds - How long to keep the duplicate record (default 24h).
   */
  constructor(
    private redisClient: any, 
    private prefix: string = 'epv:dup:', 
    private ttlSeconds: number = 86400
  ) {}

  async has(reference: string): Promise<boolean> {
    const res = await this.redisClient.get(`${this.prefix}${reference}`);
    return res !== null;
  }

  async add(reference: string): Promise<void> {
    await this.redisClient.set(`${this.prefix}${reference}`, '1', 'EX', this.ttlSeconds);
  }
}

/**
 * A velocity store backed by Redis.
 * Useful for rate limiting in a distributed serverless environment.
 * @since 2.4.0
 */
export class RedisVelocityStore implements VelocityStore {
  /**
   * @param redisClient - An initialized Redis client.
   * @param prefix - Key prefix to avoid collisions. Default `'epv:vel:'`.
   * @param windowMinutes - The rolling window size in minutes.
   */
  constructor(
    private redisClient: any, 
    private prefix: string = 'epv:vel:', 
    private windowMinutes: number = 60
  ) {}

  async incrementAndGet(identifier: string): Promise<number> {
    const key = `${this.prefix}${identifier.toLowerCase().replace(/\s/g, '')}`;
    const multi = this.redisClient.multi ? this.redisClient.multi() : this.redisClient;
    
    // Simplistic rolling window approximation using INCR + EXPIRE
    multi.incr(key);
    // If it's a new key, we need to set expiry. We can just set expiry on every request for simplicity,
    // though EXPIRE overrides it. A better approach is checking TTL, but for a lightweight adapter this is fine.
    // Or we use basic Redis INCR and if count is 1, set EXPIRE.
    
    // We'll execute INCR directly to get the count
    const count = await this.redisClient.incr(key);
    if (count === 1) {
      await this.redisClient.expire(key, this.windowMinutes * 60);
    }
    return count;
  }
}

/**
 * A duplicate store backed by Prisma ORM.
 * Expects a Prisma delegate that has `findUnique` and `create` methods.
 * @since 2.4.0
 */
export class PrismaDuplicateStore implements DuplicateStore {
  /**
   * @param prismaModel - e.g., `prisma.paymentReceipt`
   * @param referenceField - The field name storing the transaction ID (default `'reference'`).
   */
  constructor(
    private prismaModel: any,
    private referenceField: string = 'reference'
  ) {}

  async has(reference: string): Promise<boolean> {
    const record = await this.prismaModel.findUnique({
      where: { [this.referenceField]: reference }
    });
    return !!record;
  }

  async add(reference: string): Promise<void> {
    // In many use cases, you might save the whole record yourself.
    // This just marks it as seen if you're using EPV to strictly block duplicates pre-insertion.
    try {
      await this.prismaModel.create({
        data: { [this.referenceField]: reference }
      });
    } catch (e: any) {
      // Ignore unique constraint violations gracefully
      if (e.code === 'P2002') return;
      throw e;
    }
  }
}

/**
 * A velocity store backed by Prisma ORM.
 * Expects a Prisma delegate with `upsert` and `deleteMany` (for cleanup) or manual date logic.
 * @since 2.4.0
 */
export class PrismaVelocityStore implements VelocityStore {
  private windowMs: number;

  /**
   * @param prismaModel - e.g., `prisma.velocityLimit`
   * @param identifierField - The field name storing the identifier (default `'identifier'`).
   * @param windowMinutes - The rolling window size in minutes.
   */
  constructor(
    private prismaModel: any,
    private identifierField: string = 'identifier',
    windowMinutes: number = 60
  ) {
    this.windowMs = windowMinutes * 60_000;
  }

  async incrementAndGet(identifier: string): Promise<number> {
    const id = identifier.toLowerCase().replace(/\s/g, '');
    const now = new Date();
    const expiry = new Date(now.getTime() + this.windowMs);

    // This is a naive implementation; for production Prisma usage you might use raw SQL 
    // to do an atomic UPSERT with INCR or handle constraints explicitly.
    try {
      const record = await this.prismaModel.findUnique({ where: { [this.identifierField]: id } });
      if (!record || now > record.resetAt) {
        const newRec = await this.prismaModel.upsert({
          where: { [this.identifierField]: id },
          update: { count: 1, resetAt: expiry },
          create: { [this.identifierField]: id, count: 1, resetAt: expiry }
        });
        return newRec.count;
      }

      const updated = await this.prismaModel.update({
        where: { [this.identifierField]: id },
        data: { count: { increment: 1 } }
      });
      return updated.count;
    } catch (err) {
      // Fallback if atomic operations conflict
      return 1;
    }
  }
}
