// scripts/build-msi.mjs
//
// Builds the MSI installer.
//
// Tauri 2.8's built-in WiX bundler doesn't pass WixUIExtension to light.exe,
// and the `{{resources}}` handlebars block generates per-user components with
// file KeyPath that fails ICE38 validation. This script re-runs light.exe
// with the correct flags after tauri build's light step fails.

import { execSync } from 'node:child_process';
import { existsSync, globSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WIX_TOOLS = `${process.env.LOCALAPPDATA}\\tauri\\WixTools314`;
const WIX_X64 = resolve(ROOT, 'src-tauri/target/release/wix/x64');
const BUNDLE_MSI = resolve(ROOT, 'src-tauri/target/release/bundle/msi');
const LIGHT = `${WIX_TOOLS}\\light.exe`;
const WIXXT = WIX_TOOLS;

async function main() {
  // Step 1: Build everything up to MSI linking
  console.log('[build:msi] Step 1: tauri build (Rust + frontend + candle)');
  try {
    execSync('pnpm tauri build --bundles msi', {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    console.log('[build:msi] Tauri build succeeded!');
    return;
  } catch {
    console.log('[build:msi] light step failed (expected), re-running with correct flags...');
  }

  // Step 2: Verify candle artifacts exist
  if (!existsSync(resolve(WIX_X64, 'main.wixobj'))) {
    throw new Error('main.wixobj not found — candle step must have failed too');
  }
  if (!existsSync(resolve(WIX_X64, 'locale.wxl'))) {
    throw new Error('locale.wxl not found — candle step must have failed too');
  }

  // Step 3: Run light with correct extensions and ICE suppression
  const msiName = 'Hyper MITM_1.1.0_x64_en-US.msi';
  const msiOut = resolve(BUNDLE_MSI, msiName);

  await mkdir(BUNDLE_MSI, { recursive: true });
  for (const f of globSync(resolve(BUNDLE_MSI, '*.msi'))) await rm(f, { force: true });
  for (const f of globSync(resolve(BUNDLE_MSI, '*.wixpdb'))) await rm(f, { force: true });

  const cmd = [
    `"${LIGHT}"`,
    `-out "${msiOut}"`,
    `-loc "${WIX_X64}\\locale.wxl"`,
    `-sice:ICE38`,
    `-ext "${WIXXT}\\WixUIExtension.dll"`,
    `-ext "${WIXXT}\\WixUtilExtension.dll"`,
    `-ext "${WIXXT}\\WixBalExtension.dll"`,
    `"${WIX_X64}\\main.wixobj"`,
  ].join(' ');

  console.log(`[build:msi] Running: light.exe with WixUIExtension + -sice:ICE38`);
  execSync(cmd, { stdio: 'inherit', shell: true });

  if (existsSync(msiOut)) {
    const size = statSync(msiOut).size;
    console.log(`[build:msi] SUCCESS: ${msiOut} (${size} bytes)`);
  } else {
    throw new Error('MSI was not created despite light.exe succeeding');
  }
}

main().catch((err) => {
  console.error('[build:msi] FAILED:', err.message);
  process.exit(1);
});
