export const collmise: CollmiseCreatorFn = () => {
  return {} as any;
}

export const unitCollmise: UnitCollmiseCreatorFn = () => {
  return {} as any;
}

interface UnitCollmiseCreatorFn  {
  <Data = any>(): UnitCollmise<Data>;
  <Data = any>(
    options: {
      /** default: 0 */
      responseCacheTimeoutMS?: number;
      freshRequestStrategy?: Pick<CacheOptions, "joinConcurrentRequests" | "useResponseCache">;
    }
  ): UnitCollmise<Data>;
}

interface UnitCollmise<Data> {
  request: (fn: () => Data | Promise<Data>) => Promise<Data>;
  requestAs: <CustomData extends Data>(fn: () => Promise<CustomData>) => Promise<CustomData>;
  fresh: (freshLoad: boolean | undefined | null) => UnitCollmise<Data>;
  cacheOptions: (options: Pick<CacheOptions, "joinConcurrentRequests" | "useResponseCache"> | undefined | null) => UnitCollmise<Data>;
}

interface CacheOptions {
  useCache?: boolean;
  joinConcurrentRequests?: boolean;
  useResponseCache?: boolean;
}


interface CollmiseOptions<Id, RawData, Data = RawData> {
  /** default: true */
  useCache?: boolean;
  /** default: true */
  consistentDataOnSameIds?: boolean;
  /** default: 1 */
  waitForCollectingTimeMS?: number;
  /** default: true */
  joinConcurrentRequests?: boolean;
  /** default: 0 */
  responseCacheTimeoutMS?: number;
  serializeId?: (id: Id) => string | number | symbol;
   /** default: false */
  alwaysCallDirectRequest?: boolean;
  findCachedData?: (id: Id) => Data | undefined | null | Promise<Data | undefined | null>;
  getNotFoundError?: (id: Id) => any;
  freshRequestStrategy?: CacheOptions;
}

interface CollmiseCreatorFn {
  <Id = any, Data = any>(): Collmise<Id, Data, Data>;
  <Id, Data>(options: CollmiseOptions<Id, Data>): Collmise<Id, Data>;
  <Id, RawData, Data>(options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData | Data) => Data;
  }): Collmise<Id, RawData, Data>;
}

interface CollectorType<RawManyData = any, ManyData = any, Cluster = any> {
  manyData: ManyData;
  cluster: Cluster
  rawManyData: RawManyData;
}

type AnyCollectors = { [name: string]: CollectorType }

export interface Collmise<Id, RawData, Data = RawData, Collectors extends AnyCollectors = {}> {
  for: ((id: Id) => CollmiseSingle<Id, RawData, Data>);
  collectors: { [collector in keyof Collectors]: (cluster: Collectors[collector]["cluster"]) => CollmiseCollectorMain<Collectors[collector]> };
  addCollector: AddCollectorFn<Id, RawData, Data>;
}

type CollectorOptions<Id, RawData, Data, Name, Cluster, RawManyData, ManyData> = {
  name: Name;
  getMany: (ids: Cluster) => RawManyData | ManyData | Promise<RawManyData | ManyData>;
  findOne: (id: Id, manyData: ManyData) => RawData | Data | undefined | null;
  alwaysCallManyToo?: boolean;
  mergeOnData?: (manyData: ManyData, cachedData: { id: Id; data: Data }[], originalArguments: Cluster) => ManyData | Promise<ManyData>;
  findCachedData?: (cluster: Cluster) => ManyData | undefined | null | Promise<ManyData | undefined | null>;
  multiDataTransformer?: (data: RawManyData | ManyData, extra: {
    cluster: Cluster;
    originallyRequestedIds: Id[];
  }) => ManyData;
}

export interface AddCollectorFn<Id, RawData, Data = RawData, Collectors = {}> {
  <Name extends string, RawManyData, ManyData = RawManyData>(options: CollectorOptions<Id, RawData, Data, Name, Id[], RawManyData, ManyData>): Collmise<Id, RawData, Data, Collectors & { [name in Name]: CollectorType<RawManyData, ManyData, Id[]> }>;
  <Name extends string, Cluster, RawManyData, ManyData = RawManyData>(options: CollectorOptions<Id, RawData, Data, Name, Cluster, RawManyData, ManyData> & {
    splitInClusters: (ids: Id[]) => Cluster[];
  }): Collmise<Id, RawData, Data, Collectors & { [name in Name]: CollectorType<RawManyData, ManyData, Cluster> }>;
}

export interface CollmiseSingle<Id, RawData, Data> {
  request: (fn: (id: Id) => RawData | Data | Promise<RawData | Data>) => Promise<Data>;
  requestAs: <D extends Data>(fn: (id: Id) => D | Promise<D>) => Promise<D>;
  submitToCollectors: () => Promise<Data>;
  fresh: (freshLoad: boolean | undefined | null) => CollmiseSingle<Id, RawData, Data>;
  cacheOptions: (options: CacheOptions | undefined | null) => CollmiseSingle<Id, RawData, Data>;
}


export interface CollmiseCollectorMain<Collector extends CollectorType> {
  request: (getForClaster?: (ids: Collector["cluster"]) => Collector["rawManyData"] | Collector["manyData"] | Promise<Collector["rawManyData"] | Collector["manyData"]>) => Promise<Collector["manyData"]>;
  // emit: () => Promise<Data>;
  fresh: (freshLoad: boolean | undefined | null) => CollmiseCollectorMain<Collector>;
  cache: (useCache: boolean | undefined | null) => CollmiseCollectorMain<Collector>;
}
