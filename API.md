
## Caching

If you have a storage for fast-accessing resources, we can avoid sending request by caching.

```js
const booksCollmise = collmise({
  findCachedData: id => {
    // custom implementation for finding cached data; We can pass asynchronous function too
    const store = getReduxStore();
    if (store.books[id]) return store.books[id].data;
  }
});
```

Individual requests will check cache first. If you call fresh request, then cache will not be checked.

<br />

In case of collectors, we can only request books that are not cached. For that we must pass `mergeOnData` function, which will be responsible for merging cached data to response.

```js
const booksCollmise = collmise({
  findCachedData: id => {
    // custom logic
  }
}).addCollector({
  name: "manyByIds",
  findOne: (bookId, books) => books.find(book => book.id === bookId),
  onRequest: (bookIds) => fetch(`/api/v1.0/books?ids=${bookIds.join()}`).then(response => response.json()),
  mergeOnData: (uncachedBooks, cachedBooksInfo) => { // uncachedBooks is undefined or response received from request
    const books = uncachedBooks || [];
    return [...books, ...cachedBooksInfo.map(e => e.data)]; // cachedBooksInfo is an array of { id, data } objects
  }
}); 
```

Finally, replace `getManyBooksByIds` implementation

```js

const getManyBooksByIds = (bookIds, loadFresh = false) => {
  return booksCollmise.collectors.manyByIds(bookIds).fresh(loadFresh).request();
}
```

Now if we call `getManyBooksByIds`, we will request only the books that are not cached. If all the desired books are cached, then the request will not be sent at all.
If you call with `loadFresh` true, then cache will not be checked.

Guess what? If we call `getManyBooksByIds` in short amount of time intervals (within `collectingTimeoutMS` range), then all the passed ids will be combined and one request will be sent!

## Clustering

You might not want to combine all the requested resources and send just one request.
You can divide them into groups, called clusters.

Let's say that every book belongs to some library and we can only request book if we know both library id and book id. Also, we can request many books only in single library in one request.

```js
const booksCollmise = collmise().addCollector({
	name: "many",
	findOne: (requestedBook, books) =>
		books.find(
			book =>
				book.id === requestedBook.bookId &&
				book.libraryId === requestedBook.libraryId
		),
	onRequest: query =>
		fetch(
			`/api/v1.0/books?libraryId=${
				query.libraryId
			}&bookIds=${query.bookIds.join()}`
		).then((response) => response.json()),
	splitInIdClusters: (
		identifications /* let's receive array of { libraryId, bookId } */
	) => {
		// implement custom logic. Let's return the data directly just for showing
		// return an array of { cluster: any, ids: array }
		return [
			{
				cluster: {
					libraryId: 1,
					bookIds: [2, 5, 6],
				},
				ids: [
					{
						libraryId: 1,
						bookId: 2,
					},
					{
						libraryId: 1,
						bookId: 5,
					},
					{
						libraryId: 1,
						bookId: 6,
					},
				],
			},
			{
				cluster: {
					libraryId: 2,
					bookIds: [8, 10, 12],
				},
				ids: [
					{
						libraryId: 2,
						bookId: 8,
					},
					{
						libraryId: 2,
						bookId: 10,
					},
					{
						libraryId: 2,
						bookId: 12,
					},
				],
			},
		];
	},
	clusterToIds: cluster =>
		cluster.bookIds.map(bookId => ({
			bookId,
			libraryId: cluster.libraryId,
		})), // since our cluster has a shape of { libraryId, bookIds }
});
```

```js
booksCollmise.collectors.many({
  libraryId: 1,
  bookIds: [2, 5]
}).request();

booksCollmise.on({
  libraryId: 2,
  bookId: 8
}).request(() => fetch(`/api/v1.0/books?libraryId=2&bookId=8`).then(response => response.json()));

booksCollmise.collectors.many({
  libraryId: 1,
  bookIds: [5, 6]
}).request();

booksCollmise.collectors.many({
  libraryId: 2,
  bookIds: [10, 12]
}).request();

```

These 4 requests will be combined into 2 clusters and only 2 requests will actually be sent 🎩🎩

Note that if you don't pass `clusterToIds` function, then the requests of multiple books will not be combined, just the individual ones will be collected and combined.

In case of non=primitive ids, it's recommended to pass custom serialization function for converting ids to strings. In our case, let's do like this:

```js
const booksCollmise = collmise({
  serializeId: ({ libraryId, bookId }) => `l:${libraryId};b:${bookId}`
})
```

If you do not pass `serializeId` function, in case of objects regular JSON.stringify will be used for converting to string.


## Data transformation

You can transform received data as you wish by passing `dataTransformer` function.

```js
const booksCollmise = collmise({
  dataTransformer: book => {
    const { createdAt, updatedAt, ...strippedBook } = book;
    return strippedBook;
  }
})
```

In case of collectors, pass `multiDataTransformer` function, in which you will receive 2 arguments, response data and grouped cluster for which the data was requested.

## Custom errors

In case of collecting and combining individual requests, at the end, `findOne` function of collector will be called to find that individual requested data.
If `null` or `undefined` is returned, the error will be thrown.
You can change this logic by passing `isNonEmptyData` function. You will receive data as a sole argument and if you return false, error will be thrown.
You can also control, what error you want to throw by passing `getNotFoundError`. You will receive id of requested data and you should return error, but don't throw it, since collmise is responsible for throwing. Just return the error object.

