/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable max-params */
/* eslint-disable max-lines-per-function */
export const collmise: CollmiseCreatorFn = (options = {}) => {
  return collmiseHelper(
    { ...options },
    {
      collectors: [],
      currentlyRunningPromises: {},
      pastResultsOfPromises: {},
    }
  ) as any;
};

export interface CollmiseOptions<Id, RawData, Data = RawData> {
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
  findCachedData?: (
    id: Id
  ) =>
    | RawData
    | Data
    | undefined
    | null
    | Promise<RawData | Data | undefined | null>;
  getNotFoundError?: (id: Id) => any;
  freshRequestOptions?: CacheOptions;
  isNonEmptyData?: (
    possiblyEmptyData: RawData | Data | undefined | null
  ) => boolean;
}

interface InnerOptions<Id, RawData, Data> {
  collectors: (
    | {
        visible: true;
        collector: CollectorOptions<Id, RawData, Data, any, any, any> & {
          splitInIdClusters?: (ids: Id[]) => any[];
        };
      }
    | {
        visible: false;
        collector: InvisibleCollectorOptions<any> & {
          splitInIdClusters?: (ids: Id[]) => any[];
        };
      }
  )[];
  _passedCacheOptions?: CacheOptions;
  useFresh?: boolean | null | undefined;
  multiUseCache?: boolean | null | undefined;
  currentlyRunningPromises: {
    [id in string | number | symbol]?: Promise<Data>;
  };
  pastResultsOfPromises: {
    [id in string | number | symbol]?: { p: Promise<Data> };
  };
}

const collmiseHelper = <Id, RawData, Data, Collectors extends AnyCollectors>(
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData | Data) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>
): Collmise<Id, RawData, Data, Collectors> => {
  return {
    addCollector: (
      collector: CollectorOptions<Id, RawData, Data, any, any, any>
    ) => {
      return collmiseHelper(options, {
        ...inner,
        collectors: removeDublicateCollectors([
          ...inner.collectors,
          { visible: true, collector },
        ]),
      }) as any;
    },
    addInvisibleCollector: (collector: InvisibleCollectorOptions<any>) => {
      return collmiseHelper(options, {
        ...inner,
        collectors: [...inner.collectors, { visible: false, collector }],
      }) as any;
    },
    collectors: getCollectors(options, inner),
    on: getOnFn(options, inner),
  };
};

const removeDublicateCollectors = <
  InnerCollectors extends InnerOptions<any, any, any>["collectors"]
>(
  collectors: InnerCollectors
): InnerCollectors => {
  const names = new Set<string>();
  const reverseCollectors: InnerCollectors = [] as any;
  for (let i = collectors.length - 1; i >= 0; --i) {
    const each = collectors[i];
    if (each.visible === true && names.has(each.collector.name)) continue;
    reverseCollectors.push(each);
  }
  return reverseCollectors.reverse() as InnerCollectors;
};

function isNonEmptyData<T>(value: T): value is Exclude<T, null | undefined> {
  if (value === undefined || value === null) return false;
  return true;
}

const getOnFn = <Id, RawData, Data, Collectors extends AnyCollectors>(
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData | Data) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>
) => {
  type Single = CollmiseSingle<Id, RawData, Data>;
  return (id: Id): CollmiseSingle<Id, RawData, Data> => {
    const cacheOptions: Single["cacheOptions"] = value => {
      return getOnFn(
        options,
        typeof value === "object" && value !== null
          ? {
              ...inner,
              _passedCacheOptions: {
                ...inner._passedCacheOptions,
                ...value,
              },
            }
          : inner
      )(id);
    };
    const fresh: Single["fresh"] = (...args) => {
      const value = normalizeArgBoolean(args);
      return getOnFn(
        options,
        typeof value === "boolean"
          ? {
              ...inner,
              useFresh: value,
            }
          : inner
      )(id);
    };

    const request = getSingleRequest(id, options, inner, false);
    const submitToCollectors = getSingleRequest(id, options, inner, true);
    return {
      cacheOptions,
      fresh,
      request,
      requestAs: request as Single["requestAs"],
      submitToCollectors: submitToCollectors as Single["submitToCollectors"],
    };
  };
};

const serializeId = (id, options: CollmiseOptions<any, any>): string => {
  if (options.serializeId) return options.serializeId(id) as string;
  if (typeof id === "string" || typeof id === "number") return id + "";
  if (
    typeof id === "object" &&
    id !== null &&
    id.hasOwnProperty("toString") &&
    typeof id.toString === "function"
  ) {
    return id.toString();
  }
  return JSON.stringify(id);
};

const getSingleRequest = <Id, RawData, Data, Collectors extends AnyCollectors>(
  id: Id,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData | Data) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>,
  skipCallingOne: boolean
): CollmiseSingle<Id, RawData, Data>[
  | "request"
  | "submitToCollectors"] => async (...args): Promise<Data> => {
  const getPromise = args[0] as Parameters<
    CollmiseSingle<Id, RawData, Data>["request"]
  >[0];
  if (!skipCallingOne && !getPromise) {
    throw new Error("Collmise: argument for request is required");
  }
  const key = serializeId(id, options);
  const dataTransformer: Exclude<
    typeof options.dataTransformer,
    undefined
  > = options.dataTransformer
    ? options.dataTransformer
    : rawData => rawData as Data;

  const cacheOptions = getCacheOptions(options, inner);

  const isNotEmpty = options.isNonEmptyData || isNonEmptyData;

  if (!skipCallingOne) {
    if (cacheOptions.useCache && typeof options.findCachedData === "function") {
      const cachedData = await options.findCachedData(id);
      if (isNotEmpty(cachedData)) {
        return dataTransformer(cachedData!); // TODO: what if calling many is required?
      }
    }
    if (
      cacheOptions.joinConcurrentRequests &&
      inner.currentlyRunningPromises[key]
    ) {
      return inner.currentlyRunningPromises[key]!; // TODO: what if calling many is required?
    }
    if (cacheOptions.useResponseCache && inner.pastResultsOfPromises[key]) {
      return inner.pastResultsOfPromises[key]!.p; // TODO: what if calling many is required?
    }
  }
  if (!skipCallingOne) {
    let promise: Promise<Data> | undefined = undefined;
    try {
      promise = toPromise(getPromise(id) as Promise<Data | RawData>).then(
        dataTransformer
      ) as Promise<Data>;
      if (cacheOptions.cacheResponse) {
        inner.currentlyRunningPromises[key] = promise;
      }
      const data = await promise;

      saveResponse(key, promise, cacheOptions, options, inner);
      return data;
    } catch (e) {
      if (inner.currentlyRunningPromises[key] === promise) {
        delete inner.currentlyRunningPromises[key];
      }
      throw e;
    }
  }
};

const saveResponse = (
  key: string,
  promise: Promise<any>,
  cacheOptions: RequiredCacheOptions,
  options: CollmiseOptions<any, any, any>,
  inner: InnerOptions<any, any, any>
) => {
  const responseCacheTimeoutMS = options.responseCacheTimeoutMS || 0;
  if (cacheOptions.cacheResponse && responseCacheTimeoutMS > 0) {
    inner.pastResultsOfPromises[key] = {
      p: promise,
    };
    setTimeout(() => {
      if (
        inner.pastResultsOfPromises[key] &&
        inner.pastResultsOfPromises[key]!.p === promise
      ) {
        delete inner.pastResultsOfPromises[key];
      }
    }, responseCacheTimeoutMS);
  }
};

const toPromise = <T>(value: T): T extends Promise<any> ? T : Promise<T> => {
  return Promise.resolve(value) as any;
};

const getCollectors = <Id, RawData, Data, Collectors extends AnyCollectors>(
  options: CollmiseOptions<Id, RawData, Data>,
  inner: InnerOptions<Id, RawData, Data>
): CollectorsObjects<Collectors> => {
  const collectors = {} as CollectorsObjects<Collectors>;
  for (const each of inner.collectors) {
    if (!each.visible) continue;
    collectors[each.collector.name as keyof Collectors] = getCollectorFn(
      each.collector.name,
      options,
      inner
    );
  }
  return collectors;
};

const normalizeArgBoolean = <T>(args: [] | [T]): boolean | T => {
  if (args.length === 0) return true;
  return args[0];
};

const getCollectorFn = <
  Id,
  RawData,
  Data,
  Collectors extends AnyCollectors,
  Name extends keyof Collectors & string
>(
  name: Name,
  options: CollmiseOptions<Id, RawData, Data>,
  inner: InnerOptions<Id, RawData, Data>
) => {
  const getFn = <IdCluster>(
    idCluster: IdCluster
  ): CollmiseCollectorMain<Collectors[Name]> => {
    type V = CollmiseCollectorMain<Collectors[Name]>;
    const fresh: V["fresh"] = (...args) => {
      const value = normalizeArgBoolean(args);
      if (value === null || value === undefined) return getFn(idCluster);
      return getCollectorFn<Id, RawData, Data, Collectors, Name>(
        name,
        options,
        { ...inner, useFresh: value }
      )(idCluster);
    };
    const useCache: V["useCache"] = (...args) => {
      const value = normalizeArgBoolean(args);
      if (value === null || value === undefined) return getFn(idCluster);
      return getCollectorFn<Id, RawData, Data, Collectors, Name>(
        name,
        options,
        {
          ...inner,
          _passedCacheOptions: {
            ...inner._passedCacheOptions,
            useCache: value,
          },
        }
      )(idCluster);
    };
    const request: V["request"] = () => {
      return null as any;
      // TODO: implement
    };
    return {
      useCache,
      fresh,
      request,
      requestAs: request as V["request"],
    };
  };
  return getFn;
};

const getCacheOptions = (
  options: CollmiseOptions<any, any>,
  inner: InnerOptions<any, any, any>,
  getPureCacheOptions?: boolean
): RequiredCacheOptions => {
  if (options.consistentDataOnSameIds === false) {
    return {
      joinConcurrentRequests: false,
      useCache: false,
      useResponseCache: false,
      cacheResponse: false,
    };
  }
  if (!getPureCacheOptions && inner.useFresh) {
    return getFreshOptions(options, inner);
  }
  return {
    useCache:
      typeof options.useCache === "boolean"
        ? options.useCache
        : !!options.findCachedData,
    useResponseCache:
      typeof options.responseCacheTimeoutMS === "number" &&
      options.responseCacheTimeoutMS > 0,
    joinConcurrentRequests:
      typeof options.joinConcurrentRequests === "boolean"
        ? options.joinConcurrentRequests
        : true,
    cacheResponse: true,
    ...removeUndefinedValues(inner._passedCacheOptions || {}),
  };
};
const getFreshOptions = (
  options: CollmiseOptions<any, any>,
  inner: InnerOptions<any, any, any>
): RequiredCacheOptions => {
  return {
    joinConcurrentRequests:
      typeof options.joinConcurrentRequests === "boolean"
        ? options.joinConcurrentRequests
        : true,
    useCache: false,
    useResponseCache: false,
    cacheResponse: true,
    ...removeUndefinedValues(options.freshRequestOptions || {}),
  };
};

function removeUndefinedValues<T>(obj: T): T {
  const obj2 = { ...obj } as T;
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (obj2[key] === undefined) {
      delete obj2[key];
    }
  }
  return obj2;
}

export const unitCollmise: UnitCollmiseCreatorFn = (options = {}) => {
  return unitCollmiseHelper(options) as UnitCollmise<any>;
};

const unitDefaultId = Symbol("unitCollmiseDefaultId");

const unitCollmiseHelper = <Data>(
  options: UnitCollmiseOptions
): UnitCollmise<Data> => {
  const op = collmise<symbol, Data>(options || {});
  return op.on(unitDefaultId);
};

interface CacheOptions {
  useCache?: boolean;
  joinConcurrentRequests?: boolean;
  useResponseCache?: boolean;
  cacheResponse?: boolean;
}

type RequiredCacheOptions = {
  [key in keyof CacheOptions]-?: CacheOptions[key];
};

interface CollmiseCreatorFn {
  <Id = any, Data = any>(): Collmise<Id, Data, Data>;
  <Id, Data>(options: CollmiseOptions<Id, Data>): Collmise<Id, Data>;
  <Id, RawData, Data>(
    options: CollmiseOptions<Id, RawData, Data> & {
      dataTransformer: (data: RawData | Data) => Data;
    }
  ): Collmise<Id, RawData, Data>;
}

interface CollectorType<RawManyData = any, ManyData = any, IdCluster = any> {
  manyData: ManyData;
  idCluster: IdCluster;
  rawManyData: RawManyData;
}

interface AnyCollectors {
  [name: string]: CollectorType;
}

type CollectorsObjects<Collectors extends AnyCollectors> = {
  [collector in keyof Collectors]: (
    idCluster: Collectors[collector]["idCluster"]
  ) => CollmiseCollectorMain<Collectors[collector]>;
};

export interface Collmise<
  Id,
  RawData,
  Data = RawData,
  Collectors extends AnyCollectors = {}
> {
  on: (id: Id) => CollmiseSingle<Id, RawData, Data>;
  collectors: CollectorsObjects<Collectors>;
  addCollector: AddCollectorFn<Id, RawData, Data, Collectors>;
  addInvisibleCollector: AddInvisibleCollectorFn<Id, RawData, Data, Collectors>;
}

interface CollectorOptions<
  Id,
  RawData,
  Data,
  Name,
  IdCluster,
  RawManyData,
  ManyData = RawManyData
> {
  name: Name;
  onRequest: (
    ids: IdCluster
  ) => RawManyData | ManyData | Promise<RawManyData | ManyData>;
  findOne: (id: Id, manyData: ManyData) => RawData | Data | undefined | null;
  alwaysCallCollector?: boolean;
  mergeOnData?: (
    manyData: ManyData,
    cachedData: { id: Id; data: Data }[],
    originalArguments: IdCluster
  ) => ManyData | Promise<ManyData>;
  findCachedData?: (
    idCluster: IdCluster
  ) =>
    | RawManyData
    | ManyData
    | undefined
    | null
    | Promise<RawManyData | ManyData | undefined | null>;
  multiDataTransformer?: (
    data: RawManyData | ManyData,
    extra: {
      idCluster: IdCluster;
      originallyRequestedIds: Id[];
    }
  ) => ManyData;
}

interface InvisibleCollectorOptions<IdCluster> {
  onRequest: (ids: IdCluster) => void;
  alwaysCallCollector?: boolean;
}

export interface AddCollectorFn<
  Id,
  RawData,
  Data = RawData,
  Collectors extends AnyCollectors = {}
> {
  <Name extends string, RawManyData, ManyData = RawManyData>(
    options: CollectorOptions<
      Id,
      RawData,
      Data,
      Name,
      Id[],
      RawManyData,
      ManyData
    >
  ): Collmise<
    Id,
    RawData,
    Data,
    Collectors & { [name in Name]: CollectorType<RawManyData, ManyData, Id[]> }
  >;
  <Name extends string, IdCluster, RawManyData, ManyData = RawManyData>(
    options: CollectorOptions<
      Id,
      RawData,
      Data,
      Name,
      IdCluster,
      RawManyData,
      ManyData
    > & {
      splitInIdClusters: (ids: Id[]) => IdCluster[];
    }
  ): Collmise<
    Id,
    RawData,
    Data,
    Collectors &
      { [name in Name]: CollectorType<RawManyData, ManyData, IdCluster> }
  >;
}

export interface AddInvisibleCollectorFn<
  Id,
  RawData,
  Data = RawData,
  Collectors extends AnyCollectors = {}
> {
  (options: InvisibleCollectorOptions<Id[]>): Collmise<
    Id,
    RawData,
    Data,
    Collectors
  >;
  <IdCluster>(
    options: InvisibleCollectorOptions<Id[]> & {
      splitInIdClusters: (ids: Id[]) => IdCluster[];
    }
  ): Collmise<Id, RawData, Data, Collectors>;
}

export interface CollmiseSingle<Id, RawData, Data> {
  request: (
    fn: (id: Id) => RawData | Data | Promise<RawData | Data>
  ) => Promise<Data>;
  requestAs: <D extends Data>(fn: (id: Id) => D | Promise<D>) => Promise<D>;
  submitToCollectors: () => Promise<Data>;
  fresh: (
    freshLoad: boolean | undefined | null
  ) => CollmiseSingle<Id, RawData, Data>;
  cacheOptions: (
    options: CacheOptions | undefined | null
  ) => CollmiseSingle<Id, RawData, Data>;
}

export interface CollmiseCollectorMain<Collector extends CollectorType> {
  request: (
    getForClaster?: (
      ids: Collector["idCluster"]
    ) =>
      | Collector["rawManyData"]
      | Collector["manyData"]
      | Promise<Collector["rawManyData"] | Collector["manyData"]>
  ) => Promise<Collector["manyData"]>;
  requestAs: <D extends Collector["manyData"]>(
    getForClaster?: (ids: Collector["idCluster"]) => D | Promise<D>
  ) => Promise<D>;
  fresh: (
    freshLoad: boolean | undefined | null
  ) => CollmiseCollectorMain<Collector>;
  useCache: (
    useCache: boolean | undefined | null
  ) => CollmiseCollectorMain<Collector>;
}

interface UnitCollmiseCreatorFn {
  <Data = any>(): UnitCollmise<Data>;
  <Data = any>(options: UnitCollmiseOptions): UnitCollmise<Data>;
}

interface UnitCollmiseOptions {
  /** default: 0 */
  responseCacheTimeoutMS?: number;
  freshRequestOptions?: Pick<
    CacheOptions,
    "joinConcurrentRequests" | "useResponseCache"
  >;
}

export interface UnitCollmise<Data> {
  request: (fn: () => Data | Promise<Data>) => Promise<Data>;
  requestAs: <CustomData extends Data>(
    fn: () => Promise<CustomData>
  ) => Promise<CustomData>;
  fresh: (freshLoad: boolean | undefined | null) => UnitCollmise<Data>;
  cacheOptions: (
    options:
      | Pick<CacheOptions, "joinConcurrentRequests" | "useResponseCache">
      | undefined
      | null
  ) => UnitCollmise<Data>;
}
