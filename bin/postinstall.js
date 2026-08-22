#!/usr/bin/env node

/**
 * Post-install script for ethiopian-payment-verifier.
 * Displays a colorful ASCII animation to welcome the developer.
 */

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const asciiArt = `
${CYAN}   _____ ____ _    __${RESET}
${CYAN}  / ___// __ \\ |  / /${RESET}  ${BOLD}${YELLOW}Ethiopian Payment Verifier${RESET}
${CYAN}  \\__ \\/ /_/ / | / / ${RESET}  ${GREEN}Successfully installed!${RESET}
${CYAN} ___/ / ____/| |/ /  ${RESET}  ${BLUE}Ready to verify CBE, Telebirr & more.${RESET}
${CYAN}/____/_/     |___/   ${RESET}
`;

// Simple frame-by-frame animation simulation by printing lines with slight delay
// Note: postinstall scripts run during `npm install` and usually block, so we keep it fast.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAnimation() {
  console.log("");
  const lines = asciiArt.split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    console.log(line);
    await sleep(80); // 80ms delay per line for a quick "draw" effect
  }
  
  console.log(`\n${BOLD}📖 Documentation:${RESET} https://github.com/nahomtechet/ethiopian-payment-verifier\n`);
}

runAnimation().catch(() => {});
