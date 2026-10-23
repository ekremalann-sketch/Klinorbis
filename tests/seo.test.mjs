import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {createArtifactWorker} from '../scripts/artifact-runtime.mjs';
let runtime;
async function getWorker(){runtime??=await createArtifactWorker();return {fetch:(request)=>runtime.dispatchFetch(request.url,{method:request.method,headers:request.headers,redirect:'manual'})};}
test.after(async()=>{if(runtime)await runtime.dispose();});


async function render(path) {
  const worker = await getWorker();
  const response = await worker.fetch(new Request(`https://klinorbis.ekremalan.chatgpt.site${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  return response.text();
}

test("herkese açık sayfalar kendi başlık, kanonik adres, paylaşım kartı ve dil bağlantılarını taşır", async () => {
  for (const [path, title, canonical] of [
    ["/", /KLINORBIS \| Hastane Operasyon Kontrol Kulesi/, "https://klinorbis.ekremalan.chatgpt.site"],
    ["/en", /KLINORBIS \| Hospital Operations Control Tower/, "https://klinorbis.ekremalan.chatgpt.site/en"],
    ["/demo", /KLINORBIS Demo/, "https://klinorbis.ekremalan.chatgpt.site/demo"],
    ["/en/demo", /KLINORBIS Demo/, "https://klinorbis.ekremalan.chatgpt.site/en/demo"],
  ]) {
    const html = await render(path);
    assert.match(html, title, path);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}/?"`), `${path} canonical`);
    assert.match(html, /<meta property="og:image" content="https:\/\/klinorbis\.ekremalan\.chatgpt\.site\/og\/klinorbis-og\.png"/, `${path} og:image`);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /hrefLang="en"|hreflang="en"/i, `${path} hreflang`);
    assert.doesNotMatch(html, /\/workspace\/sites\/[^"']*\.vinext\/fonts\//, `${path} üretim font yolu`);
  }
  assert.match(await render("/"), /<script nonce="[^"]+" type="application\/ld\+json">/, "JSON-LD nonce ile gelir");
});

test("robots, sitemap ve security.txt yalnız herkese açık sayfaları duyurur", async () => {
  const [robots, sitemap, security] = await Promise.all(["robots.txt", "sitemap.xml", ".well-known/security.txt"].map((f) => readFile(new URL(`../public/${f}`, import.meta.url), "utf8")));
  assert.match(robots, /Disallow: \//);
  assert.match(robots, /Allow: \/demo/);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 8);
  assert.ok(!/inbox|requests|api/.test(sitemap));
  assert.match(security, /^Contact: https:/m);
  assert.ok(new Date(security.match(/^Expires: (.+)$/m)[1]) > new Date());
});
