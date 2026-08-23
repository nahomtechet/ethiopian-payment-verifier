// Export core components
export { Verifier } from './core/verifier.js';
export * from './core/types.js';
export { checkSystemHealth } from './core/health.js';
export type { BankHealthStatus } from './core/health.js';

// Export manifest helpers
export { 
  getBank, 
  getAllBanks, 
  suggestBank 
} from './manifest/loader.js';

// Export parsers
export { 
  getParser,
  registerParser,
  getRegisteredBankIds,
  isBankSupported
} from './parsers/registry.js';
export { BaseParser } from './parsers/base.js';

// Export adapter helpers
export { detectBankFromUrl } from './adapters/url-detector.js';

// Re-export all bank parsers directly
export * from './parsers/index.js';
