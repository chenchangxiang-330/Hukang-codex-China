/** Real TLS loopback server; a temporary test CA is trusted only by the child test process. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

test("real HTTPS mock service: shared fetch transport exchanges text/meal/label-image JSON and rejects 401", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hukang-ai-tls-"));
  let server;
  try {
    const cert = path.join(dir, "certificate.pem"),
      key = path.join(dir, "private-test-key.pem"),
      cnf = path.join(dir, "openssl.cnf");
    writeFileSync(
      cnf,
      "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Hukang local mock only\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=CA:TRUE\n",
    );
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-config",
        cnf,
        "-keyout",
        key,
        "-out",
        cert,
      ],
      { stdio: "ignore" },
    );
    const received = [];
    server = createServer(
      { key: readFileSync(key), cert: readFileSync(cert) },
      async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        received.push({
          url: req.url,
          method: req.method,
          body: JSON.parse(body),
        });
        res.setHeader("Content-Type", "application/json");
        if (req.headers.authorization !== "Bearer local-non-secret-fixture") {
          res.writeHead(401);
          res.end('{"error":{"code":"invalid_api_key"}}');
          return;
        }
        const text =
          received.length === 1
            ? "OK from TLS mock"
            : received.length === 4
              ? JSON.stringify({
                  policies: {},
                  missing: ["mock health photos"],
                })
              : received.length === 3
                ? JSON.stringify({
                    name: "TEST label",
                    columns: [
                      {
                        basis: "per_100ml",
                        rows: [
                          {
                            nutrient: "protein",
                            label: "蛋白质",
                            amount: "3.6",
                            unit: "g",
                          },
                          {
                            nutrient: "sodium",
                            label: "钠",
                            amount: null,
                            unit: "mg",
                          },
                        ],
                      },
                    ],
                  })
                : JSON.stringify({
                    name: "面条",
                    ingredients: ["面条"],
                    uncertainties: ["份量为估算"],
                    nutrients: {
                      energy: { range: [300, 500] },
                      sodium: { value: null },
                    },
                  });
        res.end(
          JSON.stringify({
            model: "local-mock",
            choices: [
              {
                finish_reason: "stop",
                message: { role: "assistant", content: text },
              },
            ],
          }),
        );
      },
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `https://127.0.0.1:${server.address().port}/v1`;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
      import assert from "node:assert/strict";
      import "./tests/register-typescript.mjs";
      const {AiService}=await import("./src/services/ai/service.ts");
      const {fetchChatTransport}=await import("./src/services/ai/protocol.ts");
      const s=new AiService(fetchChatTransport);
      s.update({provider:"custom",baseUrl:${JSON.stringify(endpoint)},model:"local-mock",apiKey:"local-non-secret-fixture"});s.consent(true, ["meal-text", "meal-image", "package-image", "label-image", "profile", "health-image"]);
      assert.equal((await s.testConnection()).response,"OK from TLS mock");
      const meal=await s.estimateMeal({imageUri:"",description:"一碗面条"});
      assert.deepEqual(meal.food.nutrients.energy.range,[300,500]);assert.equal(meal.food.nutrients.sodium.value,null);
      // Test-only destination mapping exercises real TLS without sending fixtures to a provider.
      const label=new AiService(async r=>{const response=await fetchChatTransport({...r,endpoint:${JSON.stringify(endpoint)}+"/chat/completions"});return {...response,url:r.endpoint};},async()=>({base64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",mime:"image/png",bytes:24}));
      label.update({provider:"qwen",baseUrl:"https://dashscope.aliyuncs.com/compatible-mode/v1",model:"qwen3-vl-plus",apiKey:"local-non-secret-fixture"});label.consent(true, ["meal-text", "meal-image", "package-image", "label-image", "profile", "health-image"]);
      const table=await label.readNutritionLabel("file:///test-only.png");assert.equal(table.review.columns[0].basisKind,"per_100ml");assert.equal(table.review.columns[0].rows[1].amount,"");
      await label.recommendTargets({age:"30",heightCm:"170",weightKg:"65",exerciseDescription:"无",exerciseFrequencyPerWeek:"0",revision:1,updatedAt:""},["file:///health-a.png","file:///health-b.png"]);
      s.update({apiKey:"invalid-non-secret-fixture"});s.consent(true, ["meal-text", "meal-image", "package-image", "label-image", "profile", "health-image"]);
      await assert.rejects(s.testConnection(),e=>e.code==="authentication");
      assert.equal(s.getSnapshot().connection,null);
    `,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_EXTRA_CA_CERTS: cert },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (x) => (output += x));
    child.stderr.on("data", (x) => (output += x));
    const exit = await new Promise((resolve) => child.once("exit", resolve));
    assert.equal(exit, 0, output);
    assert.equal(received.length, 5);
    assert.equal(
      received[3].body.messages[1].content.filter((p) => p.type === "image_url")
        .length,
      2,
    );
    assert.match(
      received[2].body.messages[1].content[1].image_url.url,
      /^data:image\/png;base64,/,
    );
    assert.ok(
      received.every(
        (r) => r.method === "POST" && r.url === "/v1/chat/completions",
      ),
    );
    assert.equal(received[1].body.messages[1].content, "一碗面条");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
