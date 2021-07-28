/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable max-params */
/* eslint-disable max-lines-per-function */
export const collmise: CollmiseCreatorFn = (options = {}) => {
  return collmiseHelper(
    { ...options },
    {
      collectors: [],
      req: {
        currentlyRunningPromises: {},
        promisesResponses: {},
        queue: { keySet: new Set(), singles: [] },
      },
    }
  ) as any;
};

export interface CollmiseOptions<Id, RawData, Data = RawData> {
  /** @defaultValue true */
  useCache?: boolean;
  /** @defaultValue true */
  consistentDataOnSameIds?: boolean;
  /** @defaultValue 1 */
  collectingTimeoutMS?: number;
  /** @defaultValue true */
  joinConcurrentRequests?: boolean;
  /** @defaultValue 0 */
  responseCacheTimeoutMS?: number;
  serializeId?: (id: Id) => string | number | symbol;
  /** @defaultValue false */
  alwaysCallDirectRequest?: boolean;
  findCachedData?: (
    id: Id
  ) => Data | undefined | null | Promise<Data | undefined | null>;
  getNotFoundError?: (id: Id) => any;
  freshRequestOptions?: CacheOptions;
  isNonEmptyData?: (
    possiblyEmptyData: RawData | Data | undefined | null
  ) => boolean;
}
interface UnitCollmiseCreatorFn {
  <Data = any>(): UnitCollmise<Data>;
  <RawData = any, Data = RawData>(
    options: UnitCollmiseOptions<RawData, Data> & {
      dataTransformer: (data: RawData) => Data;
    }
  ): UnitCollmise<RawData, Data>;
  <Data = any>(options: UnitCollmiseOptions<Data>): UnitCollmise<Data>;
}

interface UnitCollmiseOptions<RawData, Data = RawData> {
  /** @defaultValue true */
  useCache?: boolean;
  /** @defaultValue true */
  joinConcurrentRequests?: boolean;
  /** @defaultValue 0 */
  responseCacheTimeoutMS?: number;
  /** @defaultValue false */
  alwaysCallDirectRequest?: boolean;
  findCachedData?: () =>
    | Data
    | undefined
    | null
    | Promise<Data | undefined | null>;
  getNotFoundError?: () => any;
  freshRequestOptions?: Pick<
    CacheOptions,
    "joinConcurrentRequests" | "useResponseCache" | "cacheResponse"
  >;
  isNonEmptyData?: (
    possiblyEmptyData: RawData | Data | undefined | null
  ) => boolean;
}

type CollectorInfo<
  Id,
  RawData,
  Data,
  Name,
  IdCluster,
  RawManyData,
  ManyData = RawManyData
> =
  | {
      visible: true;
      collector: CollectorOptions<
        Id,
        RawData,
        Data,
        Name,
        IdCluster,
        RawManyData,
        ManyData
      > & {
        splitInIdClusters?: CollmiseSplitInCluster<Id, IdCluster>;
        clusterToIds?: (cluster: IdCluster) => Id[];
      };
    }
  | {
      visible: false;
      collector: InvisibleCollectorOptions<IdCluster> & {
        splitInIdClusters?: CollmiseSplitInCluster<Id, IdCluster>;
        clusterToIds?: (cluster: IdCluster) => Id[];
        mergeOnData?: (
          manyData: ManyData | undefined,
          cachedData: { id: Id; data: Data }[]
        ) => ManyData | Promise<ManyData>;
      };
    };

interface InnerOptions<Id, RawData, Data> {
  collectors: CollectorInfo<Id, RawData, Data, any, any, any>[];
  _passedCacheOptions?: CacheOptions;
  useFresh?: boolean | null | undefined;
  multiUseCache?: boolean | null | undefined;
  multiUseFresh?: boolean | null | undefined;
  req: {
    currentlyRunningPromises: {
      [id in string | number | symbol]?: Promise<Data>;
    };
    promisesResponses: {
      [id in string | number | symbol]?: { p: Promise<Data> };
    };
    delayPromise?: Promise<{
      queuedClusters: QueuedCluster<Id, RawData, Data>[];
    } | void>;
    queue: {
      singles: {
        id: Id;
        key: string;
        hasFoundData: boolean;
        skipCallingOne?: boolean;
      }[];
      keySet: Set<string>;
    };
  };
  disableSpreading?: boolean;
  disableSavingSpreadPromises?: boolean;
}

interface QueuedCluster<Id, RawData, Data> {
  cluster: any;
  ids: Id[];
  keySet: Set<string>;
  collectorPromise?: Promise<any>;
  collector: CollectorOptions<Id, RawData, Data, any, any, any>;
}

const collmiseHelper = <Id, RawData, Data, Collectors extends AnyCollectors>(
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
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
          normalizeCollectorInfo({
            visible: true,
            collector: { ...collector },
          }),
        ]),
      }) as any;
    },
    addInvisibleCollector: (collector: InvisibleCollectorOptions<any>) => {
      return collmiseHelper(options, {
        ...inner,
        collectors: [
          ...inner.collectors,
          normalizeCollectorInfo({
            visible: false,
            collector: { ...collector },
          }),
        ],
      }) as any;
    },
    collectors: getCollectors(options, inner),
    on: getOnFn(options, inner),
  };
};

const normalizeCollectorInfo = <
  Collector extends CollectorInfo<any, any, any, any, any, any>
>(
  info: Collector
): Collector => {
  if (!info.collector.splitInIdClusters && !info.collector.clusterToIds) {
    info.collector.splitInIdClusters = ids => [{ cluster: ids, ids }];
    info.collector.clusterToIds = ids => ids;
  }
  return info;
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

const getOnFn = <Id, RawData, Data>(
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
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

const getFoundPromiseOnKey = <Id, RawData, Data>(
  key: string,
  cacheOptions: RequiredCacheOptions,
  inner: InnerOptions<Id, RawData, Data>
) => {
  if (
    cacheOptions.joinConcurrentRequests &&
    inner.req.currentlyRunningPromises[key]
  ) {
    return { promise: inner.req.currentlyRunningPromises[key]! };
  }
  if (cacheOptions.useResponseCache && inner.req.promisesResponses[key]) {
    return { promise: inner.req.promisesResponses[key]!.p };
  }
  return null;
};

const getSingleRequest = <Id, RawData, Data>(
  id: Id,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
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
    : rawData => (rawData as any) as Data;

  const cacheOptions = getCacheOptions(options, inner);

  const isNotEmpty = options.isNonEmptyData || isNonEmptyData;

  let hasFoundData = false;
  let foundedDataPromsie: Data | Promise<Data> | undefined = undefined;

  const isCallingMultipleRequired = false;

  if (!skipCallingOne) {
    if (cacheOptions.useCache && typeof options.findCachedData === "function") {
      const cachedData = await options.findCachedData(id);
      if (isNotEmpty(cachedData)) {
        hasFoundData = true;
        foundedDataPromsie = cachedData! as Data;
      }
    }
    if (!hasFoundData) {
      const result = getFoundPromiseOnKey(key, cacheOptions, inner);
      if (result) {
        hasFoundData = true;
        foundedDataPromsie = result.promise;
      }
    }
  }

  if (!isCallingMultipleRequired && hasFoundData) {
    return foundedDataPromsie as Data;
  }

  const collectingTimeoutMS =
    typeof options.collectingTimeoutMS === "undefined"
      ? 1
      : options.collectingTimeoutMS;
  const hasCollectors = inner.collectors.length > 0;
  if (
    !inner.req.queue.keySet.has(key) ||
    options.consistentDataOnSameIds === false
  ) {
    inner.req.queue.keySet.add(key);
    inner.req.queue.singles.push({
      id,
      hasFoundData,
      key,
      skipCallingOne,
    });
  }

  if (collectingTimeoutMS > 0 && hasCollectors && !inner.req.delayPromise) {
    inner.req.delayPromise = getDelayPromise(
      collectingTimeoutMS,
      options,
      inner
    );
  }

  const result = await inner.req.delayPromise;

  let matchedQueues: QueuedCluster<Id, RawData, Data>[] = [];
  if (result) {
    matchedQueues = result.queuedClusters.filter(e => e.keySet.has(key));
  }

  if (
    hasFoundData &&
    (matchedQueues.length === 0 ||
      matchedQueues.every(e => !e.collector.alwaysCallCollector))
  ) {
    return foundedDataPromsie as Data;
  }

  if (
    matchedQueues.length > 0 &&
    matchedQueues.some(e => e.hasOwnProperty("collectorPromise"))
  ) {
    const collectorPromises = matchedQueues
      .filter(e => e.hasOwnProperty("collectorPromise"))
      .map(e => e.collectorPromise!.then(manyData => ({ ...e, manyData })));
    const promiseResults = await Promise.all(collectorPromises);
    if (hasFoundData) {
      return foundedDataPromsie as Data;
    }
    if (!options.alwaysCallDirectRequest) {
      const firstCollected = promiseResults.find(e => !!e.collector.findOne);
      if (firstCollected) {
        const oneData = firstCollected.collector.findOne(
          id,
          firstCollected.manyData
        );
        return transformFoundedOneData(id, oneData, options);
      }
    }
  }

  if (hasFoundData) {
    return foundedDataPromsie as Data;
  }

  if (skipCallingOne) {
    throw new Error(`no gathering collector found`);
  }

  const promResult = getFoundPromiseOnKey(key, cacheOptions, inner);
  if (promResult) {
    return promResult.promise;
  }

  return sendSingle(
    id,
    options,
    dataTransformer,
    getPromise,
    inner,
    cacheOptions
  );
};

const getDelayPromise = <Id, RawData, Data>(
  collectingTimeoutMS: number,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>
): Exclude<
  InnerOptions<Id, RawData, Data>["req"]["delayPromise"],
  undefined
> => {
  return new Promise(resolve => {
    setTimeout(() => {
      delete inner.req.delayPromise;
      const skipCallingsKeys = new Set(
        inner.req.queue.singles.filter(e => e.skipCallingOne).map(e => e.key)
      );
      const uncached = inner.req.queue.singles.filter(e => !e.hasFoundData);
      const queuedClusters: QueuedCluster<Id, RawData, Data>[] = [];

      for (const collectorInfo of inner.collectors) {
        const useAll = collectorInfo.collector.alwaysCallCollector === true;
        const singles = useAll ? inner.req.queue.singles : uncached;
        const singleIds = singles.map(e => e.id);
        const clusteredIds: ReturnType<Exclude<
          typeof collectorInfo["collector"]["splitInIdClusters"],
          undefined
        >> = collectorInfo.collector.splitInIdClusters
          ? collectorInfo.collector.splitInIdClusters(singleIds)
          : [{ cluster: singleIds, ids: singleIds }];
        for (const clusterInfo of clusteredIds) {
          if (clusterInfo.ids.length === 0) continue;
          const collectorRequest = getCollectorRequest(
            clusterInfo.cluster,
            collectorInfo,
            options,
            {
              ...inner,
              multiUseCache: false,
              disableSpreading: true,
              disableSavingSpreadPromises: true,
            }
          );
          const sendMultiRequest = !!(
            clusterInfo.ids.length > 1 ||
            (clusterInfo.ids.length === 1 &&
              skipCallingsKeys.has(serializeId(clusterInfo.ids[0], options))) ||
            collectorInfo.collector.alwaysCallCollector
          );
          const collectorPromise = sendMultiRequest
            ? collectorRequest()
            : undefined;
          if (collectorInfo.visible) {
            const queued: QueuedCluster<Id, RawData, Data> = {
              cluster: clusterInfo,
              collector: collectorInfo.collector,
              collectorPromise,
              ids: clusterInfo.ids,
              keySet: new Set(singles.map(e => e.key)),
            };
            if (!sendMultiRequest) delete queued.collectorPromise;
            queuedClusters.push(queued);
          }
        }
      }
      inner.req.queue = {
        keySet: new Set(),
        singles: [],
      };
      resolve({ queuedClusters });
    }, collectingTimeoutMS);
  });
};

const transformFoundedOneData = <Id, RawData, Data = RawData>(
  id: Id,
  oneData: Data | null | undefined,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
  }
) => {
  const isNotEmpty = options.isNonEmptyData || isNonEmptyData;
  if (isNotEmpty(oneData)) {
    return oneData! as Data;
  } else {
    const getNotFoundError =
      options.getNotFoundError || defaultGetNotFoundError;
    throw getNotFoundError(id);
  }
};

const defaultGetNotFoundError = (id: any) => {
  return new Error(`id ${id} not found`);
};

const sendSingle = async <Id, RawData, Data>(
  id: Id,
  options: CollmiseOptions<Id, RawData, Data>,
  dataTransformer: (data: RawData, id: Id) => Data,
  getPromise: (id: Id) => RawData | Promise<RawData>,
  inner: InnerOptions<Id, RawData, Data>,
  cacheOptions: RequiredCacheOptions
): Promise<Data> => {
  const promise = toPromise(getPromise(id) as Promise<RawData>).then(d =>
    dataTransformer(d, id)
  ) as Promise<Data>;
  return saveSinglePromise(id, promise, options, inner, cacheOptions);
};

const saveSinglePromise = async <Id, RawData, Data>(
  id: Id,
  singlePromise: Promise<Data>,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>,
  cacheOptions: RequiredCacheOptions
): Promise<Data> => {
  const key = serializeId(id, options);
  try {
    if (cacheOptions.cacheResponse) {
      inner.req.currentlyRunningPromises[key] = singlePromise;
    }
    const data = await singlePromise;
    saveResponse(key, singlePromise, cacheOptions, options, inner);
    return data;
  } finally {
    if (inner.req.currentlyRunningPromises[key] === singlePromise) {
      delete inner.req.currentlyRunningPromises[key];
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
    inner.req.promisesResponses[key] = {
      p: promise,
    };
    setTimeout(() => {
      if (
        inner.req.promisesResponses[key] &&
        inner.req.promisesResponses[key]!.p === promise
      ) {
        delete inner.req.promisesResponses[key];
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
        { ...inner, multiUseFresh: value }
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
          multiUseCache: value,
        }
      )(idCluster);
    };
    const collectorInfo = inner.collectors.find(
      e => e.visible === true && e.collector.name === name
    )!;
    const request = getCollectorRequest(
      idCluster,
      collectorInfo,
      options,
      inner
    ) as any;
    return {
      useCache,
      fresh,
      request,
      requestAs: request as V["request"],
    };
  };
  return getFn;
};

const getCollectorRequest = <
  Id,
  RawData,
  Data,
  Name,
  IdCluster,
  RawManyData,
  ManyData = RawManyData
>(
  idCluster: IdCluster,
  collectorInfo: CollectorInfo<
    Id,
    RawData,
    Data,
    Name,
    IdCluster,
    RawManyData,
    ManyData
  >,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>
) => {
  const mainFn = (
    getForClaster?: (cluster: IdCluster) => RawManyData | Promise<RawManyData>
  ): { mainPromise: Promise<ManyData>; waiter: Promise<void> } => {
    let useCache = true;
    if (!options.findCachedData) useCache = false;
    if (options.useCache === false) useCache = false;
    if (inner.multiUseCache === false) useCache = false;
    if (inner.multiUseFresh === true) useCache = false;
    /* if (
      inner.useFresh &&
      inner._passedCacheOptions &&
      inner._passedCacheOptions.useCache === false
    ) {
      useCache = false;
    } */
    const dataTransformer: Exclude<
      typeof options.dataTransformer,
      undefined
    > = options.dataTransformer
      ? options.dataTransformer
      : rawData => (rawData as any) as Data;

    const isNotEmpty = options.isNonEmptyData || isNonEmptyData;

    const mainLogic = (): {
      mainPromise: Promise<ManyData>;
      waiter: Promise<void>;
    } => {
      const spread = !inner.disableSpreading && !getForClaster;

      if (
        spread &&
        collectorInfo.collector.splitInIdClusters &&
        collectorInfo.collector.clusterToIds &&
        collectorInfo.collector.mergeOnData
      ) {
        const copiedInner = { ...inner };
        if (typeof inner.multiUseCache === "boolean") {
          inner._passedCacheOptions = {
            ...inner._passedCacheOptions,
            useCache: inner.multiUseCache,
          };
        }
        const ids = collectorInfo.collector.clusterToIds(idCluster);
        const allPromises = ids.map(id =>
          getSingleRequest(
            id,
            options,
            copiedInner,
            true
          )(() => Promise.reject("fake function"))
        );
        const getAll = Promise.all(allPromises);
        const mainPromise: Promise<ManyData> = getAll.then(allData =>
          collectorInfo.collector.mergeOnData!(
            undefined,
            allData.map((data, index) => ({ data, id: ids[index] }))
          )
        );
        return { mainPromise, waiter: getAll.then() };
      }

      const fetchedDataPromise = toPromise(
        getForClaster
          ? getForClaster(idCluster)
          : collectorInfo.collector.onRequest(idCluster)
      ) as Promise<RawManyData | void>;
      const mainPromise: Promise<ManyData> = fetchedDataPromise.then(
        async fetchedData => {
          const multiDataTransformer = (collectorInfo.collector as any)
            .multiDataTransformer as MultiDataTranformer<ManyData> | undefined;
          let finalData: ManyData;
          if (collectorInfo.visible && multiDataTransformer) {
            finalData = await multiDataTransformer(
              fetchedData as RawManyData,
              idCluster
            );
          } else finalData = (fetchedData as any) as ManyData;
          return finalData;
        }
      );
      return { mainPromise, waiter: Promise.resolve() };
    };

    if (
      useCache &&
      collectorInfo.collector.splitInIdClusters &&
      collectorInfo.collector.clusterToIds &&
      collectorInfo.collector.mergeOnData &&
      options.findCachedData
    ) {
      const ids = collectorInfo.collector.clusterToIds(idCluster);

      const cachedPromises = ids.map(id =>
        toPromise(options.findCachedData!(id))
      );
      const mainPromise = stickyPromise<ManyData>();
      const waiterPromise = stickyPromise<any>();
      const topPromise = Promise.all(cachedPromises).then(cachedData => {
        const cacheOptions = getCacheOptions(options, inner);

        const results = cachedData.map((data, index) => {
          const empty = !isNotEmpty(data);
          if (empty) {
            const key = serializeId(ids[index], options);
            const singleResult = getFoundPromiseOnKey(key, cacheOptions, inner);
            if (!singleResult) {
              return { empty: true as const, index, id: ids[index] };
            }
            return {
              empty: false as const,
              isPromise: true as const,
              data: singleResult.promise,
              index,
              id: ids[index],
            };
          }
          return {
            empty: false as const,
            isPromise: false as const,
            data: dataTransformer(data, ids[index]),
            index,
            id: ids[index],
          };
        });
        const hasFoundAtLeasOne = results.some(e => !e.empty);
        if (hasFoundAtLeasOne) {
          const notFoundIds = results.filter(e => e.empty).map(e => e.id);
          let manyData: ManyData | undefined = undefined;

          const successfullyCachedData = results
            .filter(e => !e.empty)
            .map(
              e =>
                new Promise<{ id: Id; data: Data }>((resolve, reject) => {
                  (toPromise(e.data) as Promise<Data>)
                    .then(data => resolve({ id: e.id, data }))
                    .catch(reject);
                })
            );
          const successfullyCachedDataPromise = Promise.all(
            successfullyCachedData
          );

          waiterPromise.attach(successfullyCachedDataPromise);

          successfullyCachedDataPromise.then().catch();

          const fn = async () => {
            if (notFoundIds.length > 0) {
              const clustersInfo = collectorInfo.collector.splitInIdClusters!(
                notFoundIds
              );

              if (clustersInfo.length !== 1) {
                throw new Error(
                  "excpected tu return exactly one cluster for ids " +
                    notFoundIds
                );
              }

              const newCluster = clustersInfo[0].cluster;

              manyData = await getCollectorRequest(
                newCluster,
                collectorInfo,
                options,
                {
                  ...inner,
                  multiUseCache: false,
                  disableSavingSpreadPromises: true,
                }
              )(getForClaster);
            }
            return collectorInfo.collector.mergeOnData!(
              manyData,
              await successfullyCachedDataPromise
            );
          };
          const finalResult = fn();
          waiterPromise.attach(finalResult);
          mainPromise.attach(finalResult);
        } else {
          const res = mainLogic();
          mainPromise.attach(res.mainPromise);
          waiterPromise.attach(res.waiter);
        }
      });
      mainPromise.attachCatch(topPromise);
      waiterPromise.attachCatch(topPromise);

      return { mainPromise, waiter: waiterPromise };
    }

    return mainLogic();
  };

  return (
    getForClaster?: (cluster: IdCluster) => RawManyData | Promise<RawManyData>
  ): Promise<ManyData> => {
    const { mainPromise, waiter } = mainFn(getForClaster);
    waiter
      .then(() =>
        saveManySingleRequests(
          mainPromise,
          idCluster,
          collectorInfo,
          options,
          inner
        )
      )
      .catch(() => {
        //
      });
    return mainPromise;
  };
};

const stickyPromise = <Data>() => {
  let final: { data: any; resolved: boolean } | null = null;
  const helper = {
    resolve: (data: Data) => {
      if (!final) final = { data, resolved: true };
    },
    reject: (error: any) => {
      if (!final) final = { data: error, resolved: false };
    },
  };
  const promise = new Promise<Data>((resolve, reject) => {
    if (final) {
      if (final.resolved) resolve(final.data);
      else reject(final.data);
    }
    helper.resolve = resolve;
    helper.reject = reject;
  });
  return Object.assign(promise, helper, {
    attach: (prom: Promise<Data>) => {
      prom.then(helper.resolve).catch(helper.reject);
    },
    attachCatch: (prom: Promise<any>) => {
      prom.catch(helper.reject);
    },
  });
};

const saveManySingleRequests = <
  Id,
  RawData,
  Data,
  Name,
  IdCluster,
  RawManyData,
  ManyData = RawManyData
>(
  promise: Promise<ManyData>,
  idCluster: IdCluster,
  collectorInfo: CollectorInfo<
    Id,
    RawData,
    Data,
    Name,
    IdCluster,
    RawManyData,
    ManyData
  >,
  options: CollmiseOptions<Id, RawData, Data> & {
    dataTransformer?: (data: RawData, id: Id) => Data;
  },
  inner: InnerOptions<Id, RawData, Data>
) => {
  if (
    !inner.disableSavingSpreadPromises &&
    collectorInfo.visible === true &&
    collectorInfo.collector.clusterToIds &&
    collectorInfo.collector.findOne
  ) {
    const ids = collectorInfo.collector.clusterToIds(idCluster);
    const cacheOptions = getCacheOptions(options, inner);
    for (const id of ids) {
      const singlePromise = promise.then(manyData => {
        return transformFoundedOneData(
          id,
          collectorInfo.collector.findOne!(id, manyData),
          options
        );
      });
      saveSinglePromise(
        id,
        singlePromise,
        options,
        inner,
        cacheOptions
      ).catch(() => {});
    }
  }
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
    return getFreshOptions(options);
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
  options: CollmiseOptions<any, any>
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
  options: UnitCollmiseOptions<Data>
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
  <Id, RawData, Data>(
    options: CollmiseOptions<Id, RawData, Data> & {
      dataTransformer: (data: RawData, id: Id) => Data;
    }
  ): Collmise<Id, RawData, Data>;
  <Id, Data>(options: CollmiseOptions<Id, Data>): Collmise<Id, Data>;
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
  onRequest: (ids: IdCluster) => RawManyData | Promise<RawManyData>;
  findOne: (id: Id, manyData: ManyData) => Data | undefined | null;
  /** @defaultValue false */
  alwaysCallCollector?: boolean;
  /** @defaultValue true */
  useCache?: boolean;
  mergeOnData?: (
    manyData: ManyData | undefined,
    cachedData: { id: Id; data: Data }[]
  ) => ManyData | Promise<ManyData>;
}

interface InvisibleCollectorOptions<IdCluster> {
  onRequest: (ids: IdCluster) => void;
  /** @defaultValue false */
  alwaysCallCollector?: boolean;
  /** @defaultValue true */
  useCache?: boolean;
}

type MultiDataTranformer<ManyData, RawManyData = any, IdCluster = any> = (
  data: RawManyData,
  idCluster: IdCluster
) => ManyData;
export interface AddCollectorFn<
  Id,
  RawData,
  Data = RawData,
  Collectors extends AnyCollectors = {}
> {
  <Name extends string, IdCluster, RawManyData, ManyData>(
    options: CollectorOptions<
      Id,
      RawData,
      Data,
      Name,
      IdCluster,
      RawManyData,
      ManyData
    > & {
      multiDataTransformer: (
        data: RawManyData,
        idCluster: IdCluster
      ) => ManyData;
      splitInIdClusters: CollmiseSplitInCluster<Id, IdCluster>;
      clusterToIds?: (cluster: IdCluster) => Id[];
    }
  ): Collmise<
    Id,
    RawData,
    Data,
    Collectors &
      { [name in Name]: CollectorType<RawManyData, ManyData, IdCluster> }
  >;
  <Name extends string, RawManyData, ManyData>(
    options: CollectorOptions<
      Id,
      RawData,
      Data,
      Name,
      Id[],
      RawManyData,
      ManyData
    > & {
      multiDataTransformer: (data: RawManyData, idCluster: Id[]) => ManyData;
    }
  ): Collmise<
    Id,
    RawData,
    Data,
    Collectors & { [name in Name]: CollectorType<RawManyData, ManyData, Id[]> }
  >;
  <Name extends string, IdCluster, RawManyData>(
    options: CollectorOptions<
      Id,
      RawData,
      Data,
      Name,
      IdCluster,
      RawManyData,
      RawManyData
    > & {
      splitInIdClusters: CollmiseSplitInCluster<Id, IdCluster>;
      clusterToIds?: (cluster: IdCluster) => Id[];
    }
  ): Collmise<
    Id,
    RawData,
    Data,
    Collectors &
      { [name in Name]: CollectorType<RawManyData, RawManyData, IdCluster> }
  >;
  <Name extends string, RawManyData>(
    options: CollectorOptions<
      Id,
      RawData,
      Data,
      Name,
      Id[],
      RawManyData,
      RawManyData
    >
  ): Collmise<
    Id,
    RawData,
    Data,
    Collectors &
      { [name in Name]: CollectorType<RawManyData, RawManyData, Id[]> }
  >;
}

export type CollmiseSplitInCluster<Id, IdCluster> = (
  ids: Id[]
) => { cluster: IdCluster; ids: Id[] }[];

export interface AddInvisibleCollectorFn<
  Id,
  RawData,
  Data = RawData,
  Collectors extends AnyCollectors = {}
> {
  <IdCluster>(
    options: InvisibleCollectorOptions<Id[]> & {
      splitInIdClusters: CollmiseSplitInCluster<Id, IdCluster>;
    }
  ): Collmise<Id, RawData, Data, Collectors>;
  (options: InvisibleCollectorOptions<Id[]>): Collmise<
    Id,
    RawData,
    Data,
    Collectors
  >;
}

export interface CollmiseSingle<Id, RawData, Data> {
  request: (fn: (id: Id) => RawData | Promise<RawData>) => Promise<Data>;
  requestAs: <D extends RawData>(fn: (id: Id) => D | Promise<D>) => Promise<D>;
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
    ) => Collector["rawManyData"] | Promise<Collector["rawManyData"]>
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

export interface UnitCollmise<RawData, Data = RawData> {
  request: (fn: () => RawData | Promise<RawData>) => Promise<Data>;
  requestAs: <CustomData extends RawData>(
    fn: () => Promise<CustomData>
  ) => Promise<CustomData>;
  fresh: (freshLoad: boolean | undefined | null) => UnitCollmise<RawData, Data>;
  cacheOptions: (
    options:
      | Pick<
          CacheOptions,
          "joinConcurrentRequests" | "useResponseCache" | "cacheResponse"
        >
      | undefined
      | null
  ) => UnitCollmise<RawData, Data>;
}
