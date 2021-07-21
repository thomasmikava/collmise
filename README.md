# link-builders

Link builders helps you to build and maintain multiple links.

## Simple usage

```ts
import { addPrefix } from "link-builders";

const adminRawLinks = {
  users: "users",
  products: "products",
};

const adminLinks = addPrefix("admin")(adminRawLinks);

adminLinks.users() === "admin/users";
adminLinks.products() === "admin/products";
```


## Dynamic links
In case of dynamic links, use `withParams`.
As a first argument, pass function which returns string;
As a second argument, pass route path. (which later can be access by `routePath` property).

```ts
import { addPrefix, withParams } from "link-builders";

const adminLinks = addPrefix("admin")({
  users: addPrefix("users")({
    list: "",
    add: "add",
    edit: withParams(id => `${id}/edit`, `:id/edit`),
  }),
});

adminLinks.users.list() === "admin/users";
adminLinks.users.add() === "admin/users/add";
adminLinks.users.edit(5) === "admin/users/5/edit";

adminLinks.users.add.routePath === "admin/users/add";
adminLinks.users.edit.routePath === "admin/users/:id/edit";
```

You can add dynamic prefix too

```ts
import { addPrefix, withParams } from "link-builders";

const adminLinks = addPrefix("admin")({
  user: addPrefix(
    id => `users/${id}`,
    `users/:userId`
  )({
    orders: addPrefix("orders")({
      list: "",
      add: "add",
      edit: withParams(id => `${id}/edit`, `:orderId/edit`),
    }),
  }),
});

adminLinks.user.orders.list(10)() === "admin/users/10/orders";
adminLinks.user.orders.add(10)() === "admin/users/10/orders/add";
adminLinks.user.orders.edit(10)(20) === "admin/users/10/orders/20/edit";
adminLinks.user.orders.edit.routePath === "admin/users/:userId/orders/:orderId/edit";
```

You have 2 other options too for composing dynamic links.

### Split arguments
```ts
import { addPrefix, withParams, addSplittingArgumentPrefix } from "link-builders";

const adminLinks = addPrefix("admin")({
  user: addSplittingArgumentPrefix(
    id => `users/${id}`,
    `users/:userId`
  )({
    orders: addPrefix("orders")({
      list: "",
      add: "add",
      edit: withParams(id => `${id}/edit`, `:orderId/edit`),
    }),
  }),
});

adminLinks.user.orders.list(10) === "admin/users/10/orders";
adminLinks.user.orders.add(10) === "admin/users/10/orders/add";
adminLinks.user.orders.edit(10, 20) === "admin/users/10/orders/20/edit";
```


### Merge arguments (objects)
```ts
import { addPrefix, withParams, addMergingArgumentPrefix } from "link-builders";

const adminLinks = addPrefix("admin")({
  user: addMergingArgumentPrefix(
    ({ userId }) => `users/${userId}`,
    `users/:userId`
  )({
    orders: addPrefix("orders")({
      list: "",
      add: "add",
      edit: withParams(({ orderId }) => `${orderId}/edit`, `:orderId/edit`),
    }),
  }),
});


adminLinks.user.orders.list({ userId: 10 }) === "admin/users/10/orders";
adminLinks.user.orders.add({ userId: 10 }) === "admin/users/10/orders/add";
adminLinks.user.orders.edit({ userId: 10, orderId: 20 }) === "admin/users/10/orders/20/edit";

```