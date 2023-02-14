import { Redis } from "ioredis";

type StorageOptionsType = "redis" | "memory";

type References = string | string[];

interface LoggerInput {
  msg: string;
  [key: string]: any;
}

interface Logger {
  debug: (input: LoggerInput) => void;
  warn: (input: LoggerInput) => void;
  error: (input: LoggerInput) => void;
}
interface StorageRedisOptions {
  client: Redis;
  log?: Logger;
  invalidation?: { referencesTTL: number } | boolean;
}

interface StorageMemoryOptions {
  size?: number;
  log?: Logger;
  invalidation?: boolean;
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
};

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
    references?: References
  ): Promise<void>;
  remove(key: string): Promise<void>;
  invalidate(references: References): Promise<void>;
  clear(name: string): Promise<void>;
  refresh(): Promise<void>;
}

declare function createCache(
  options?: {
    storage?: StorageInputRedis | StorageInputMemory;
    ttl?: number;
    transformer?: DataTransformer;
  } & Events
): Cache;

declare class Cache {
  constructor(
    options: {
      ttl: number;
      storage: StorageOptionsType;
    } & Events
  );


  define(
    name: string,
    opts: {
      storage?: StorageOptionsType;
      transformer?: DataTransformer;
      ttl?: number;
      serialize?: (...args: any[]) => any;
      references?: (...args: any[]) => References | Promise<References>;
    } & Events,
    func?: (...args: any[]) => any
  ): void;
  define(
    name: string,
    opts: (...args: any[]) => any,
  ): void;

  clear(): Promise<void>;
  clear(name: string, value: any): Promise<void>;

  get(name: string, key: string): Promise<any>;

  set(name: string, key: string, value: any, ttl: number, references?: References): Promise<void>;

  invalidate(name: string, references: References): Promise<void>;

  invalidateAll(references: References, storage?: StorageOptionsType): Promise<void>;
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

export { createCache, Cache, createStorage, StorageInterface, StorageMemoryOptions };
