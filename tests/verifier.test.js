import test from "node:test";
import assert from "node:assert";
import { Verifier } from "../dist/core/verifier.js";
import { detectBankFromUrl } from "../dist/adapters/url-detector.js";
import { getAllBanks } from "../dist/manifest/loader.js";

test("URL Detector", (t) => {
  t.test("detects CBE url", () => {
    const res = detectBankFromUrl("https://apps.cbe.com.et:100/?id=FT26140P01YB60536171");
    assert.ok(res);
    assert.strictEqual(res.bank, "cbe");
    assert.strictEqual(res.reference, "FT26140P01YB");
  });

  t.test("detects BOA url", () => {
    const res = detectBankFromUrl("https://cs.bankofabyssinia.com/slip/?trx=AB12345");
    assert.ok(res);
    assert.strictEqual(res.bank, "boa");
    assert.strictEqual(res.reference, "AB12345");
  });
  
  t.test("detects Awash url", () => {
    const res = detectBankFromUrl("https://awashpay.awashbank.com:8225/-AW123");
    assert.ok(res);
    assert.strictEqual(res.bank, "awash");
    assert.strictEqual(res.reference, "AW123");
  });
});

test("Manifest Loader", () => {
  const banks = getAllBanks();
  assert.ok(banks.length > 0);
  assert.ok(banks.find(b => b.id === "cbe"));
  assert.ok(banks.find(b => b.id === "telebirr"));
});

test("Verifier Core", async (t) => {
  const verifier = new Verifier();

  await t.test("gracefully fails on unknown bank", async () => {
    const result = await verifier.verify({
      bank: "fake-bank",
      reference: "123"
    });
    
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.kind, "BANK_NOT_SUPPORTED");
    }
  });
  
  await t.test("gracefully fails on unparseable invalid CBE receipt", async () => {
    const result = await verifier.verify({
      bank: "cbe",
      reference: "invalid-ref"
    });
    
    assert.strictEqual(result.ok, false);
  });
});
