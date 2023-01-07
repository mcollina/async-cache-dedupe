type StorageOptionsType = "redis" | "memory";

interface StorageRedisOptions {
  client: any;
  log?: any;
  invalidation?: { referencesTTL: number } | boolean;
}

interface StorageMemoryOptions {
  size?: number;
  log?: any;
  invalidation?: boolean;
}

type Events = {
  onDedupe?: (key: any) => any;
  onError?: (err: any) => any;
  onHit?: (key: any) => any;
  onMiss?: (key: any) => any;
};

/** StorageInputRedis and StorageInputMemory are a 'necessary evil' instead of function overloading for createCache as typescript seems to ignore a nested overload as this one. */
type StorageInputRedis = {
  type: "redis";
  options?: StorageRedisOptions;
};

type StorageInputMemory = {
  type: "memory";
  options?: StorageMemoryOptions;
};

declare class StorageInterface {
  constructor(options: any);

  get(key: string): Promise<undefined | any>;
  set(
    key: string,
    value: any,
    ttl: number,
    references?: string[]
  ): Promise<void>;
  remove(key: string): Promise<void>;
  invalidate(references: string[]): Promise<void>;
  clear(name: string): Promise<void>;
  refresh(): Promise<void>;
}

declare function createCache(
  options?: {
    storage?: StorageInputRedis | StorageInputMemory;
    ttl?: number;
  } & Events
): Cache;

declare class Cache {
  constructor(
    options: {
      ttl: number;
      storage: StorageOptionsType;
    } & Events
  );
}

declare function createStorage(
  type: "redis",
  options: StorageRedisOptions
): StorageInterface;
declare function createStorage(
  type: "memory",
  options: StorageMemoryOptions
): StorageInterface;
declare function createStorage(
  type: StorageOptionsType,
  options: StorageRedisOptions | StorageMemoryOptions
): StorageInterface;

export { createCache, Cache, createStorage };
