# Ethiopian Payment Verifier

> Fast, reliable TypeScript library to parse and verify digital payment receipts from major Ethiopian banks and mobile money providers.

[![npm version](https://img.shields.io/npm/v/ethiopian-payment-verifier)](https://www.npmjs.com/package/ethiopian-payment-verifier)
[![license](https://img.shields.io/npm/l/ethiopian-payment-verifier)](LICENSE)

`ethiopian-payment-verifier` is a framework-agnostic Node.js library and CLI tool that verifies digital payment receipts by querying the public endpoints of Ethiopian financial institutions. It takes a transaction reference (or URL), detects the bank, and returns structured JSON detailing the transaction amount, date, and recipient.

## 🚀 Features

- **No API Keys Required:** Validates receipts directly against the banks' public receipt verification endpoints.
- **Auto-Detect Bank:** Give it a URL or reference, and it automatically detects the corresponding bank.
- **Universal CLI:** Verify receipts instantly from your terminal (`epv verify`).
- **Framework Agnostic:** Pure Node.js. Works seamlessly in Express, Next.js, Nuxt, or any other Node environment.
- **Type-Safe:** Written in TypeScript with strict schemas.

---

## 🏦 Supported Providers

### Banks
`cbe` (Commercial Bank of Ethiopia) · `dashen` (Dashen Bank) · `awash` (Awash Bank) · `boa` (Bank of Abyssinia) · `zemen` (Zemen Bank)

### Mobile Money
`telebirr` · `mpesa` · `cbebirr` · `ebirr`

---

## 📦 Installation

```bash
npm install ethiopian-payment-verifier
```

---

## 💻 Usage (Node.js)

The core engine revolves around the `Verifier` class.

### 1. Simple Verification

If you know the bank and the transaction reference:

```typescript
import { Verifier } from "ethiopian-payment-verifier";

async function verify() {
  const verifier = new Verifier();
  
  // Verify a CBE receipt
  const result = await verifier.verify({
    bank: "cbe",
    reference: "FT240101QW8X"
  });

  if (result.ok) {
    console.log("Success! Paid amount:", result.data.amount);
    console.log("Date:", result.data.date);
    console.log("Payer:", result.data.payerName);
  } else {
    console.error("Verification failed:", result.error.message);
  }
}
```

### 2. Auto-Detecting from URL

Many banks generate a public URL for receipts. The verifier can extract the reference and the bank automatically:

```typescript
import { Verifier } from "ethiopian-payment-verifier";

async function checkUrl(receiptUrl: string) {
  const verifier = new Verifier();
  
  const result = await verifier.verifyUrl(receiptUrl);
  
  if (result.ok) {
    console.log(`Verified ${result.data.bank} transaction:`, result.data.amount);
  }
}
```

### 3. Extra Security (Account Matching)

Some banks don't return the payee name, or you may want to ensure the money was deposited into *your* specific account. You can pass your account number to enforce a match:

```typescript
const result = await verifier.verify({
  bank: "boa",
  reference: "12345678",
  accountNumber: "1000123456789" // Will fail if the receipt went to a different account
});
```

---

## ⚡ CLI Usage

The package comes with a built-in terminal CLI called `epv` (Ethiopian Payment Verifier). You can use it directly via `npx` or by installing it globally.

### Verify a transaction

```bash
# Basic verification
npx epv verify cbe FT240101QW8X

# Verify and enforce that it was sent to a specific account
npx epv verify boa 12345678 -a 1000123456789

# Verify using a full URL
npx epv verify https://apps.cbe.com.et:100/?id=FT240101QW8X
```

### Check system health

Sometimes bank endpoints go down. You can check the status of all supported endpoints:

```bash
npx epv health
```

### List supported endpoints

```bash
npx epv info
```

---

## 🛠 Advanced

### Error Handling

The package uses a Result monad (`ok` / `err`) to handle errors gracefully without throwing runtime exceptions.

```typescript
if (!result.ok) {
  switch (result.error.code) {
    case "NETWORK_ERROR":
      console.log("The bank's server is down or unreachable.");
      break;
    case "INVALID_REFERENCE":
      console.log("The reference number doesn't match the bank's format.");
      break;
    case "ACCOUNT_MISMATCH":
      console.log("The money was sent to the wrong account!");
      break;
    case "NOT_FOUND":
      console.log("Transaction not found. This receipt might be fake.");
      break;
  }
}
```

## License

MIT License. See `LICENSE` for details.
