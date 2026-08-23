import { Verifier } from './core/verifier.js';
import { errorToMessage, Receipt, ChekiError } from './core/types.js';
import type { Result } from './core/types.js';
import { checkSystemHealth } from './core/health.js';
import { getAllBanks } from './manifest/loader.js';
import './parsers/index.js';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const BANNER = `
 Ethiopian Payment Verifier (epv) v4.0.0 
`;

function printReceipt(result: Receipt) {
  p.note(
    `${pc.green('Amount:')}      ${pc.bold(result.amount || 'Unknown')} ${pc.bold(result.currency || 'ETB')}
${pc.green('Sender:')}      ${result.senderName || 'Unknown'}
${pc.green('Receiver:')}    ${result.receiverName || 'Unknown'}
${pc.green('Date:')}        ${result.date || 'Unknown'}
${result.sourceUrl ? `\n${pc.cyan('Source URL:')}  ${pc.underline(result.sourceUrl)}` : ''}`,
    'RECEIPT TICKET'
  );
}

async function interactiveMode() {
  console.clear();
  p.intro(pc.bgGreen(pc.black(BANNER)));

  const actionGroup = await p.group({
    action: () => p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'verify', label: 'Verify a receipt online' },
        { value: 'parse', label: 'Parse an offline receipt file' },
        { value: 'health', label: 'Check bank API health status' },
        { value: 'info', label: 'List supported banks' }
      ]
    })
  }, {
    onCancel: () => { p.cancel('Operation cancelled.'); process.exit(0); }
  });

  if (actionGroup.action === 'health' || actionGroup.action === 'info') {
    return { action: actionGroup.action, bank: '', input: '' };
  }

  const detailsGroup = await p.group({
    bank: () => p.select({
      message: 'Select bank:',
      options: [
        { value: 'cbe', label: 'CBE Commercial Bank of Ethiopia' },
        { value: 'telebirr', label: 'Telebirr' },
        { value: 'boa', label: 'Bank of Abyssinia (BOA)' },
        { value: 'mpesa', label: 'M-Pesa' },
        { value: 'dashen', label: 'Dashen Bank' },
        { value: 'zemen', label: 'Zemen Bank' },
        { value: 'awash', label: 'Awash Bank' },
        { value: 'cbebirr', label: 'CBEBirr' },
      ]
    }),
    input: () => p.text({
      message: actionGroup.action === 'verify' ? 'Enter transaction number or receipt link:' : 'Enter path to receipt file:',
      placeholder: actionGroup.action === 'verify' ? 'e.g. FT23... or https://...' : './receipt.txt',
      validate: (value) => {
        if (!value) return 'Please enter a value.';
      }
    })
  }, {
    onCancel: () => { p.cancel('Operation cancelled.'); process.exit(0); }
  });

  return { action: actionGroup.action, bank: detailsGroup.bank, input: detailsGroup.input };
}

async function main() {
  const originalArgs = process.argv.slice(2);
  let isInteractive = originalArgs.length === 0;

  if (originalArgs.includes('--help') || originalArgs.includes('-h')) {
    console.log(`
${pc.bgGreen(pc.black(BANNER))}
Verify receipts across 10 Ethiopian banks natively.

${pc.bold('Usage:')}
  epv                     ${pc.gray('(Starts interactive mode)')}
  epv verify <bank> <ref> [options]
  epv parse <bank> <file> [options]
  epv info                ${pc.gray('(List supported banks)')}
  epv health              ${pc.gray('(Check bank API health)')}

${pc.bold('Examples:')}
  epv verify cbe FT243209X10 --account 12345678
  epv verify telebirr CHQ09121O
  epv health

${pc.bold('Options:')}
  --account    Receiving account number (required for CBE)
  --phone      Payer phone number (required for CBEBirr)
  --json       Output raw JSON instead of human readable text
`);
    process.exit(0);
  }

  while (true) {
    let args = isInteractive ? [] : originalArgs;
    let command = args[0];
    let bank = args[1];
    let input = args[2];
    let isJson = args.includes('--json');

    // Interactive Mode
    if (isInteractive) {
      const config = await interactiveMode();
      command = config.action as string;
      bank = config.bank as string;
      input = config.input as string;
    }

    if (!['verify', 'parse', 'info', 'health'].includes(command)) {
      console.error(pc.red(`Unknown command: ${command}`));
      if (!isInteractive) process.exit(1); else continue;
    }

    if (command === 'info') {
      const banks = getAllBanks();
      p.intro(pc.bgBlue(pc.white(' Supported Banks ')));
      for (const b of banks) {
        const status = b.status === "live" ? pc.green("OK") : pc.yellow("SOON");
        const acct = b.requiresAccount ? pc.gray(` (requires ${b.accountDigits}-digit account)`) : "";
        console.log(`  ${status.padEnd(14)} ${pc.bold(b.id.padEnd(12))} ${b.name}${acct}`);
      }
      p.outro(`${banks.length} banks total, ${banks.filter(b => b.status === "live").length} live.`);
      if (!isInteractive) process.exit(0);
    } 
    else if (command === 'health') {
      const s = p.spinner();
      s.start('Pinging bank endpoints...');
      const checks = await checkSystemHealth();
      s.stop('Health check complete.');
      
      p.intro(pc.bgCyan(pc.black(' System Health ')));
      for (const check of checks) {
        let statusColor = pc.gray;
        if (check.status === 'reachable') statusColor = pc.green;
        if (check.status === 'unreachable') statusColor = pc.red;
        if (check.status === 'geo-blocked') statusColor = pc.yellow;

        const latencyStr = check.latencyMs > 0 ? `(${check.latencyMs}ms)` : '';
        console.log(`  ${statusColor(check.status.toUpperCase().padEnd(16))} ${pc.bold(check.id.padEnd(12))} ${check.name} ${pc.gray(latencyStr)}`);
      }
      p.outro();
      if (!isInteractive) process.exit(0);
    }
    else {
      if (!bank || !input) {
        console.error(pc.red('Error: Bank and input are required for this command. Use "epv --help".'));
        if (!isInteractive) process.exit(1); else continue;
      }

      const getArg = (flag: string) => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
      };

      const verifier = new Verifier();
      let result: Result<Receipt, ChekiError>;
      
      const s = p.spinner();

      if (command === 'verify') {
        if (!isJson) s.start(`Verifying ${input} on ${bank}...`);
        
        result = await verifier.verify({
          bank,
          reference: input,
          accountNumber: getArg('--account'),
          phoneNumber: getArg('--phone')
        });
        
        if (!isJson) {
          if (result.ok) s.stop(pc.green(`✔ Verified successfully in ${result.value.durationMs}ms!`));
          else s.stop(pc.red('✖ Verification failed.'));
        }
      } else {
        // Parse
        if (!isJson) s.start(`Reading and parsing offline data for ${bank}...`);
        
        let data = '';
        try {
          const fs = await import('fs');
          data = fs.readFileSync(input, 'utf-8');
        } catch (err: any) {
          if (!isJson) s.stop(pc.red(`✖ Error reading file ${input}: ${err.message}`));
          if (!isInteractive) process.exit(1); else continue;
        }

        result = await verifier.parseOffline({ bank, data, url: getArg('--url') });
        
        if (!isJson) {
          if (result.ok) s.stop(pc.green(`✔ Parsed successfully!`));
          else s.stop(pc.red('✖ Parsing failed.'));
        }
      }

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
        if (!isInteractive) process.exit(result.ok ? 0 : 1);
      } else {
        if (result.ok) {
          printReceipt(result.value);
        } else {
          p.cancel(errorToMessage(result.error));
          if (!isInteractive) process.exit(1);
        }
      }
    }

    if (isInteractive) {
      await p.text({ message: pc.bold('Press Enter to return to main menu...') });
    } else {
      break;
    }
  }
}

main().catch(e => {
  console.error(pc.red('Fatal error:'), e);
  process.exit(1);
});
