import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { importSheet } from "./api/sheet-import.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const rootPath = resolve(root);
const port = Number(process.env.AFK_HELPER_PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/sheet-import") {
      if (request.method !== "POST") {
        response.writeHead(405, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ error: "Connect your own spreadsheet in Party Setup before importing." }));
        return;
      }
      try {
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 12000) throw new Error("Connection settings are too large.");
        }
        const result = await importSheet(JSON.parse(body));
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = resolve(rootPath, `.${pathname}`);

    if (file !== rootPath && !file.startsWith(`${rootPath}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`AFK Service Helper: http://127.0.0.1:${port}`);
});
