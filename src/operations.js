import operations from "../shared/operations.json" with { type: "json" };
export const operation = (method, route) => {
  const op = operations.find(
    (o) =>
      o.service === "rest" &&
      o.method === method &&
      o.route === route &&
      !o.internal,
  );
  if (!op) throw Error("Unknown operation " + route);
  return op;
};
export const davOperation = (method, route) =>
  operations.find(
    (o) => o.service === "caldav" && o.method === method && o.route === route,
  );
