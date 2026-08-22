import { PaymentVerifier, parseSMS, detectProvider } from './index.js';
import { BANKS } from './banks.js';

/**
 * Command-line interface logic.
 * Handled via `bin/epv.js` -> `node dist/cli.js`.
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
Ethiopian Payment Verifier CLI (v2.3.0)

Usage:
  epv verify <reference-or-sms>
  epv parse <sms-text>
  epv health

Examples:
  epv verify CHQ0FJ403O
  epv parse "You received 500 ETB. Ref: CHQ0FJ403O"
  epv health
    `);
    process.exit(0);
  }

  if (command === 'parse') {
    const input = args.slice(1).join(' ');
    if (!input) {
      console.error('Error: Please provide SMS text to parse.');
      process.exit(1);
    }
    const result = parseSMS(input);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (command === 'verify') {
    const input = args.slice(1).join(' ');
    if (!input) {
      console.error('Error: Please provide a reference ID, URL, or SMS text to verify.');
      process.exit(1);
    }

    const provider = detectProvider(input);
    if (provider === 'unknown') {
      console.error('Error: Could not identify a payment provider from the input.');
      process.exit(1);
    }

    console.log(`Provider detected: ${BANKS[provider].name}`);
    console.log(`Verifying online...`);

    const verifier = new PaymentVerifier();
    try {
      const result = await verifier.verifyOnline(input);
      console.log('\nVerification Result:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'SUCCESS' ? 0 : 1);
    } catch (err: any) {
      console.error(`\nVerification Failed: ${err.message}`);
      process.exit(1);
    }
  }

  if (command === 'health') {
    console.log('Health check feature coming soon...');
    // A complete health check would ping all provider portals here
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run "epv help" for usage.');
  process.exit(1);
}

// Only execute if this file is run directly (not imported)
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.endsWith('cli.js'))) {
  main().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}
