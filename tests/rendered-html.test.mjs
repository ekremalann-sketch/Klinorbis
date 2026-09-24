import assert from "node:assert/strict";
import test from "node:test";

const productTitle = /KLINORBIS \| Hastane Operasyon Kontrol Kulesi/i;

test("renders the public product presentation with security headers", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, productTitle);
  assert.match(html, /HASTANE OPERASYON KONTROL KULESİ/i);
});

test("renders direct operation routes instead of losing the click target", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("route-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/requests/KLI-TEST-01", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), productTitle);
});

test("every operation tab has a real routable screen", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("section-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const sections = [
    "inbox",
    "flow",
    "requests",
    "appointments",
    "calls",
    "approvals",
    "automation",
    "capacity",
    "integrations",
    "units",
    "staff",
    "reports",
    "privacy",
    "security",
    "audit",
  ];

  for (const section of sections) {
    const response = await worker.fetch(
      new Request(`http://localhost/${section}`, {
        headers: { accept: "text/html" },
      }),
      {
        ASSETS: {
          fetch: async () => new Response("Not found", { status: 404 }),
        },
      },
      {
        waitUntil() {},
        passThroughOnException() {},
      },
    );
    assert.equal(response.status, 200, `${section} must render`);
    assert.match(await response.text(), productTitle);
  }
});
