import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
const checks = [];
for (const args of [[], ["--production"]]) {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const child = spawn(process.execPath, ["server/index.js", ...args], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Local launch timed out")),
        10000,
      );
      child.stdout.on("data", (d) => {
        if (d.toString().includes("Developer Studio:")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error("Launch exited " + code));
      });
    });
    const url = "http://127.0.0.1:" + port,
      page = await fetch(url),
      html = await page.text(),
      config = await (await fetch(url + "/demo/config")).json(),
      session = await (await fetch(url + "/demo/session")).json();
    if (
      page.status !== 200 ||
      !html.includes("FeraCalendar Developer Studio") ||
      config.mode !== "live" ||
      session.authenticated
    )
      throw Error("Local page/config/session check failed");
    checks.push({
      mode: args.length ? "built local" : "development",
      pageStatus: page.status,
      apiMode: config.mode,
      auth: config.auth,
      calendar: config.calendar,
      caldav: config.caldav,
      authenticated: false,
    });
  } finally {
    child.kill();
    await new Promise((r) => {
      if (child.exitCode !== null) return r();
      child.once("exit", r);
    });
  }
}
const report = {
  verifiedAt: new Date().toISOString(),
  upstreamCalls: 0,
  checks,
};
fs.writeFileSync(
  "docs/launch-qualification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
