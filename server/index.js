import "dotenv/config";
import express from "express";
import { createApp } from "./app.js";
if (process.env.DEMO_MODE && process.env.DEMO_MODE !== "live")
  throw Error(
    "Only live mode is supported; test fixtures belong in intercepted tests",
  );
const app = createApp();
let vite;
if (process.argv.includes("--production")) app.use(express.static("dist"));
else {
  vite = await (
    await import("vite")
  ).createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4179),
  server = app.listen(port, "127.0.0.1", () =>
    console.log(
      `FeraCalendar Developer Studio: http://127.0.0.1:${port} (live API mode)`,
    ),
  );
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    app.locals.close();
    await vite?.close();
    server.close(() => process.exit(0));
  });
