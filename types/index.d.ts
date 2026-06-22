/**
 * Minimal interface for a Redis-compatible client.
 * This allows any Redis client implementation (ioredis, node-redis, etc.) to be used
 * without requiring ioredis to be installed for TypeScript compilation.
 */
export interface RedisCompatibleClient {
  get(key: string): Promise<string | null>;
  exists(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  set(key: string, value: string, ...args: any[]): Promise<string>;
  smembers(key: string): Promise<string[]>;
  sadd(key: string, ...members: any[]): Promise<number>;
  srem(key: string, ...members: any[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  flushall(): Promise<string>;
  pipeline(commands?: any[][]): RedisPipeline;
  scan(cursor: number, ...args: any[]): Promise<[string, string[]]>;
}

/**
 * Interface for Redis pipeline operations.
 */
export interface RedisPipeline {
  exec(): Promise<Array<[Error | null, any]>>;
}

export type StorageOptionsType = 'redis' | 'memory' | 'custom'

export type StorageOptions = {
  type: StorageOptionsType,
  options: StorageRedisOptions | StorageMemoryOptions,
}

type References = string | string[]

interface LoggerInput {
  msg: string;
  [key: string]: any;
}

interface Logger {
  debug: (input: LoggerInput) => void;
  warn: (input: LoggerInput) => void;
  error: (input: LoggerInput) => void;
}
export interface StorageRedisOptions {
  client: RedisCompatibleClient;
  log?: Logger;
  invalidation?: { referencesTTL: number } | boolean;
}

export interface StorageMemoryOptions {
  size?: number;
  log?: Logger;
  invalidation?: boolean;
}

export interface StorageCustomOptions {
  storage: StorageInterface
}

interface DataTransformer {
  serialize: (data: any) => any;
  deserialize: (data: any) => any;
}

type Events = {
  onDedupe?: (key: string) => void;
  onError?: (err: any) => void;
  onHit?: (key: string) => void;
  onMiss?: (key: string) => void;
}

export type StorageInputRedis = {
  type: 'redis';
  options?: StorageRedisOptions;
}

export type StorageInputMemory = {
  type: 'memory';
  options?: StorageMemoryOptions;
}

export type StorageInputCustom = {
  type: 'custom';
  options?: StorageCustomOptions;
}

export declare class StorageInterface {
  constructor (options: any)

  get (key: string): Promise<undefined | any>
  set (key: string, value: any, ttl: number, references?: References): Promise<void>
  remove (key: string): Promise<void>
  invalidate (references: References): Promise<void>
  clear (name: string): Promise<void>
  refresh (): Promise<void>
  getTTL (key: string): Promise<void>
  exists (key: string): Promise<boolean>
}

export declare function createCache (
  options?: {
    storage?: StorageInputRedis | StorageInputMemory | StorageInputCustom;
    ttl?: number | ((result: unknown) => number);
    transformer?: DataTransformer;
    stale?: number | ((result: unknown) => number);
  } & Events,
): Cache

export declare class Cache {
  constructor (
    options: {
      ttl: number | ((result: unknown) => number);
      stale?: number | ((result: unknown) => number);
      storage: StorageInterface;
    } & Events
  )

  define<T extends (args: any) => any, N extends string, S extends this>(
    name: N,
    opts: {
      storage?: StorageOptions;
      transformer?: DataTransformer;
      ttl?: number | ((result: Awaited<ReturnType<T>>) => number);
      stale?: number | ((result: Awaited<ReturnType<T>>) => number);
      serialize?: (...args: any[]) => any;
      references?: (
        args: Parameters<T>[0],
        key: string,
        result: Awaited<ReturnType<T>>
      ) => References | Promise<References>;
    } & Events,
    func?: T
  ): S & { [n in N]: T }
  define<T extends (args: any) => any, N extends string, S extends this>(
    name: N,
    opts: T
  ): S & { [n in N]: T }

  clear (): Promise<void>
  clear (name: string): Promise<void>
  clear (name: string, value: any): Promise<void>

  get (name: string, key: string): Promise<any>

  exists (name: string, key: string): Promise<boolean>

  set (
    name: string,
    key: string,
    value: any,
    ttl: number,
    references?: References
  ): Promise<void>

  invalidate (name: string, references: References): Promise<void>

  invalidateAll (
    references: References,
    storage?: StorageOptionsType
  ): Promise<void>
}

export declare function createStorage (type: 'redis', options: StorageRedisOptions): StorageInterface
export declare function createStorage (type: 'memory', options: StorageMemoryOptions): StorageInterface
export declare function createStorage (type: 'custom', options: StorageCustomOptions): StorageInterface
export declare function createStorage (
  type: StorageOptionsType,
  options: StorageRedisOptions | StorageMemoryOptions,
): StorageInterface
