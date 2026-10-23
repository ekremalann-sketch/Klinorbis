import assert from "node:assert/strict";
import test from "node:test";
import {createArtifactWorker} from '../scripts/artifact-runtime.mjs';
let runtime;
async function getWorker(){runtime??=await createArtifactWorker();return {fetch:(request)=>runtime.dispatchFetch(request.url,{method:request.method,headers:request.headers,redirect:'manual'})};}
test.after(async()=>{if(runtime)await runtime.dispose();});


const productTitle = /KLINORBIS \| Hastane Operasyon Kontrol Kulesi/i;

test("renders the public product presentation with security headers", async () => {
  const worker = await getWorker();

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
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request("http://localhost/requests/KLI-TEST-01", {
      headers: { accept: "text/html", "oai-authenticated-user-email": "signed-in@test.invalid" },
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
  const worker = await getWorker();
  const sections = [
    "inbox",
    "flow",
    "merkez",
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
        headers: { accept: "text/html", "oai-authenticated-user-email": "signed-in@test.invalid" },
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


test("anonymous operational navigation initiates sign-in and preserves the selected destination", async () => {
  const worker = await getWorker();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  for (const path of ["/workspace", "/inbox", "/requests/KLI-TEST-01"]) {
    const response = await worker.fetch(new Request(`https://klinorbis.ekremalan.chatgpt.site${path}`, { headers: { accept: "text/html" } }), env, ctx);
    assert.equal(response.status, 307, path);
    const target = new URL(response.headers.get("location"), "https://klinorbis.ekremalan.chatgpt.site");
    assert.equal(target.pathname, "/signin-with-chatgpt");
    assert.equal(target.searchParams.get("return_to"), path);
  }
});
