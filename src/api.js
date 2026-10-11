import { pretty, redact, traceForDownload } from "../shared/data.js";
export { pretty };
export async function local(path, body) {
  const r = await fetch("/demo/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "content-type": "application/json", "x-demo-request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "HTTP " + r.status);
  return data;
}
export function snippets(request) {
  if (!request) return { curl: "", js: "" };
  const quote = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
  const headers = redact(request.headers),
    body = request.body;
  const curlHeaders = Object.entries(headers).map(([key, value]) => {
    if (key.toLowerCase() === "authorization")
      return '  --user "$CALDAV_USERNAME"';
    if (key.toLowerCase() === "x-auth-token")
      return '  --header "x-auth-token: $FERA_AUTH_TOKEN"';
    return "  --header " + quote(key + ": " + value);
  });
  const curl =
    "# Supply credentials securely; curl --user prompts for the password.\n" +
    "curl --request " +
    request.method +
    " " +
    quote(request.url) +
    (curlHeaders.length ? " \\\n" + curlHeaders.join(" \\\n") : "") +
    (body !== undefined
      ? " \\\n  --data-binary " +
        quote(typeof body === "string" ? body : JSON.stringify(body))
      : "");
  const jsHeaders = {
    ...headers,
    ...(headers["x-auth-token"]
      ? { "x-auth-token": "YOUR_IN_MEMORY_JWT" }
      : {}),
    ...(headers.authorization
      ? { authorization: "YOUR_SECURE_BASIC_HEADER" }
      : {}),
  };
  const js =
    "// Supply your own in-memory JWT or securely constructed Basic header.\nconst response = await fetch(" +
    JSON.stringify(request.url) +
    ", {\n  method: " +
    JSON.stringify(request.method) +
    ",\n  headers: " +
    JSON.stringify(jsHeaders, null, 2) +
    (body !== undefined
      ? ",\n  body: " +
        (typeof body === "string"
          ? JSON.stringify(body)
          : "JSON.stringify(" + JSON.stringify(body, null, 2) + ")")
      : "") +
    "\n});\nconst result = response.status === 204 ? null : await response.text();";
  return { curl, js };
}
export function downloadTrace(trace) {
  const url = URL.createObjectURL(
    new Blob([pretty(traceForDownload(trace))], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "feracalendar-sanitized-trace.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function saveText(text, name, type = "text/plain") {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
