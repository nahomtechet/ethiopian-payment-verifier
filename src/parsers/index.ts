/**
 * Parser index - auto-registers all bank parsers.
 *
 * Import this module to make all parsers available.
 * To add a new bank parser: create a file, extend BaseParser,
 * register it here, and add the bank to banks.json.
 */
import { registerParser } from "./registry.js";
import { CBEParser, CBENewParser } from "./cbe.js";
import { TelebirrParser } from "./telebirr.js";
import { BOAParser } from "./boa.js";
import { MpesaParser } from "./mpesa.js";
import { DashenParser } from "./dashen.js";
import { EBirrParser } from "./ebirr.js";
import { ZemenParser } from "./zemen.js";
import { CBEBirrParser } from "./cbebirr.js";
import { SiinqeeParser } from "./siinqee.js";
import { AwashParser } from "./awash.js";

// Register all parsers
registerParser(new CBEParser());
registerParser(new CBENewParser());
registerParser(new TelebirrParser());
registerParser(new BOAParser());
registerParser(new MpesaParser());
registerParser(new DashenParser());
registerParser(new EBirrParser());
registerParser(new ZemenParser());
registerParser(new CBEBirrParser());
registerParser(new SiinqeeParser());
registerParser(new AwashParser());

// Re-export for convenience
export { CBEParser, CBENewParser } from "./cbe.js";
export { TelebirrParser } from "./telebirr.js";
export { BOAParser } from "./boa.js";
export { MpesaParser } from "./mpesa.js";
export { DashenParser } from "./dashen.js";
export { EBirrParser } from "./ebirr.js";
export { ZemenParser } from "./zemen.js";
export { CBEBirrParser } from "./cbebirr.js";
export { SiinqeeParser } from "./siinqee.js";
export { AwashParser } from "./awash.js";
export { BaseParser } from "./base.js";
export {
  registerParser,
  getParser,
  getRegisteredBankIds,
  isBankSupported,
} from "./registry.js";
export type { RegisteredParser } from "./registry.js";
