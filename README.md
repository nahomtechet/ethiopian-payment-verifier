# Ethiopian Payment Verifier

> Fast, reliable TypeScript library to parse and verify digital payment receipts and SMS alerts from major Ethiopian banks and mobile money providers.

[![npm version](https://img.shields.io/npm/v/ethiopian-payment-verifier)](https://www.npmjs.com/package/ethiopian-payment-verifier)
[![license](https://img.shields.io/npm/l/ethiopian-payment-verifier)](LICENSE)
[![types](https://img.shields.io/npm/types/ethiopian-payment-verifier)](https://www.npmjs.com/package/ethiopian-payment-verifier)

---

## Supported Providers

### Banks
`cbe` · `dashen` · `awash` · `boa` · `zemen`

### Mobile Money
`telebirr`

---

## Installation

```bash
npm install ethiopian-payment-verifier
# or
yarn add ethiopian-payment-verifier
```

---

## Quick Start

```typescript
import { PaymentVerifier } from 'ethiopian-payment-verifier';

const verifier = new PaymentVerifier();

// 1. Parse an incoming SMS alert (Offline, instant)
const sms = "You have received 2,500.00 ETB from 0911223344. Ref: CHQ0FJ403O on 2026-08-21.";
const parsed = verifier.parseSMS(sms);
console.log(parsed.amount);       // 2500
console.log(parsed.transactionId); // 'CHQ0FJ403O'

// 2. Verify a receipt URL/ID online (fetches the bank portal)
const result = await verifier.verifyOnline("https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O");
console.log(result.status);       // 'SUCCESS'
console.log(result.amount);       // 2500
console.log(result.payer_name);   // 'Abebe Kebede'

// 3. Validate the result against expected values
const check = verifier.verifyDetails(result, {
  amount: 2500,
  receiverName: "Remedan Wako",
  maxAgeMinutes: 120
});
console.log(check.verified); // true
console.log(check.reasons);  // []
```

---

## API Reference

### `new PaymentVerifier(options?)`

Creates a verifier instance with optional global configuration.

```typescript
const verifier = new PaymentVerifier({
  timeout: 8000,
  proxy: 'http://196.189.x.x:8080',
  userAgent: 'MyApp/1.0',
  maxAgeMinutes: 60,
  onSuccess: async (result) => {
    await db.payment.create({ data: { txnId: result.reference, amount: result.amount } });
  },
  mapResult: (result) => ({
    reference: result.reference,
    settled: result.amount,
    paidBy: result.payer_name,
  }),
});
```

---

### `verifier.detectProvider(input)`

Detects which Ethiopian provider a transaction ID, URL, or SMS belongs to.

```typescript
verifier.detectProvider("FT260821ABCD");   // 'cbe'
verifier.detectProvider("CHQ0FJ403O");     // 'telebirr'
verifier.detectProvider("hello world");    // 'unknown'
```

**Returns**: `'cbe' | 'telebirr' | 'dashen' | 'awash' | 'boa' | 'zemen' | 'unknown'`

---

### `verifier.parseSMS(smsText)`

Parses the full text of a bank SMS notification offline using regex rules.

```typescript
const result = verifier.parseSMS("Your account has been credited with 1000 ETB. Ref: FT260821ABCD...");
```

**Returns: `ParseResult`**
```typescript
interface ParseResult {
  provider: string;        // 'cbe', 'telebirr', etc.
  transactionId: string | null;
  amount: number | null;
  currency: string;        // 'ETB'
  sender: string | null;
  receiver: string | null;
  date: string | null;     // ISO 8601 string
  balance: number | null;
  raw: string;
}
```

---

### `verifier.verifyOnline(input, options?)`

Fetches and scrapes the official bank/wallet receipt portal to verify a transaction.

```typescript
const result = await verifier.verifyOnline("CHQ0FJ403O");
const result = await verifier.verifyOnline("https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O");
```

**Returns: `VerificationResult`**
```typescript
interface VerificationResult {
  payer_name: string | null;
  payer_account: string | null;
  receiver_name: string | null;
  receiver_account: string | null;
  amount: number | null;
  currency: string;
  date: string | null;     // ISO 8601 string
  reference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  rawDetails: Record<string, any>;
}
```

> **Note**: Ethiopian bank portals are geofenced. See [Proxy Configuration](#proxy-configuration) if you're running outside Ethiopia.

---

### `verifier.verifyDetails(result, expected)`

Validates the verified result against your expected business rules. Returns a structured report.

```typescript
const check = verifier.verifyDetails(result, {
  amount: 5000,
  receiverAccount: "0912345678",
  receiverName: "Abebe Kebede",
  maxAgeMinutes: 120,       // Reject receipts older than 2 hours
  strictReceiverName: false  // false = fuzzy match (default), true = exact match
});

if (!check.verified) {
  console.log("Validation failed:", check.reasons);
  // e.g. ["Amount mismatch: Received 4500 ETB (expected at least 5000 ETB)."]
}
```

| Parameter | Type | Description |
|---|---|---|
| `amount` | `number` | Minimum expected transaction amount in ETB |
| `receiverAccount` | `string?` | Expected receiver phone/account number (supports masked format like `2519****7133`) |
| `receiverName` | `string?` | Expected name of the payment receiver |
| `maxAgeMinutes` | `number?` | Maximum allowed receipt age in minutes (e.g. `120` = 2 hours) |
| `strictReceiverName` | `boolean?` | `true` = exact match, `false` = fuzzy partial match (default) |

**Returns**:
```typescript
{ verified: boolean; reasons: string[] }
```

---

## Options Reference (`VerifierOptions`)

All options can be passed to the constructor (applied globally) or to individual method calls (per-request override).

| Option | Type | Description |
|---|---|---|
| `timeout` | `number` | HTTP request timeout in milliseconds (default: no limit) |
| `proxy` | `string` | HTTP/HTTPS proxy URL, e.g. `http://user:pass@host:port` |
| `userAgent` | `string` | Custom `User-Agent` header string for scraper requests |
| `maxAgeMinutes` | `number` | Passed as default to `verifyDetails` — reject old receipts globally |
| `onSuccess` | `(result) => void \| Promise<void>` | Async callback fired automatically when a transaction verifies as `SUCCESS` |
| `mapResult` | `(result) => T` | Transform the raw `VerificationResult` into any custom shape before returning |

### `onSuccess` — Auto-Save Verified Payments

```typescript
const verifier = new PaymentVerifier({
  onSuccess: async (result) => {
    // This fires automatically when status === 'SUCCESS'
    await saveToDatabase({
      reference: result.reference,
      amount: result.amount,
      payer: result.payer_name,
      date: result.date,
    });
  }
});
```

### `mapResult` — Custom Return Shape

```typescript
const verifier = new PaymentVerifier({
  mapResult: (result) => ({
    txnId: result.reference,
    settled: result.amount,
    currency: result.currency,
    paidBy: result.payer_name,
    receivedBy: result.receiver_name,
    success: result.status === 'SUCCESS',
  })
});

const data = await verifier.verifyOnline("CHQ0FJ403O");
// data is now your custom shape, not VerificationResult
```

---

## Bank & Provider Registry

Import bank/wallet metadata (name, colors, logos) for use in UI components — browser-safe, no server required.

```typescript
import { BANKS, WALLETS, ALL_PROVIDERS, getBankBySlug } from 'ethiopian-payment-verifier/banks';

// All 32 banks
console.log(BANKS.length); // 32

// All 7 mobile wallets
console.log(WALLETS.length); // 7

// Lookup by provider slug
const cbe = getBankBySlug('cbe');
console.log(cbe.name);    // 'Commercial Bank of Ethiopia'
console.log(cbe.color);   // '#007A3D'
console.log(cbe.logoUrl); // URL to official logo
```

Each entry follows this shape:
```typescript
interface BankMeta {
  slug: string;
  name: string;
  shortName?: string;
  color: string;    // Primary brand hex color
  logoUrl: string;  // Public image URL
}
```

---

## Standalone Functions

For lightweight integrations, import individual functions directly without instantiating a class:

```typescript
import { parseSMS, verifyOnline, detectProvider, verifyDetails } from 'ethiopian-payment-verifier';

const provider = detectProvider("FT260821ABCD");  // 'cbe'

const parsed = parseSMS("Dear Customer, your account was credited...");

const result = await verifyOnline("CHQ0FJ403O", { timeout: 5000 });

const check = verifyDetails(result, { amount: 1000, maxAgeMinutes: 60 });
```

---

## Proxy Configuration

Ethiopian bank portals are geofenced — requests from cloud providers (AWS, Vercel, Render, etc.) outside Ethiopia will be blocked.

```typescript
const verifier = new PaymentVerifier({
  proxy: 'http://196.189.x.x:8080'  // An Ethiopian IP proxy
});
```

---

## License

MIT
