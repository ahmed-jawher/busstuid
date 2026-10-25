#!/usr/bin/env node
// Switches the App target's Release configuration to manual App Store signing, for the iOS
// release workflow (.github/workflows/ios-release.yml). Only the App target is changed: passing
// these settings to xcodebuild on the command line would also reach the Swift packages, which
// refuse provisioning profiles. Run on a fresh checkout; the change is never committed.
//   node scripts/ios-signing.mjs <team id> <provisioning profile uuid>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [team, profile] = process.argv.slice(2);
if (!/^[A-Z0-9]{10}$/.test(team ?? '') || !/^[0-9A-Fa-f-]{36}$/.test(profile ?? '')) {
  console.error('usage: node scripts/ios-signing.mjs <team id> <provisioning profile uuid>');
  process.exit(1);
}

const file = fileURLToPath(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url));
const source = readFileSync(file, 'utf8');
// The App target's Release configuration (the project-level one has no CODE_SIGN_STYLE).
const block =
  /(504EC3181FED79650016851F \/\* Release \*\/ = \{[\s\S]*?)CODE_SIGN_STYLE = Automatic;/;
if (!block.test(source)) {
  console.error('App target Release configuration not found in project.pbxproj');
  process.exit(1);
}
const signing = [
  'CODE_SIGN_STYLE = Manual;',
  'CODE_SIGN_IDENTITY = "Apple Distribution";',
  '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";',
  `DEVELOPMENT_TEAM = ${team};`,
  `PROVISIONING_PROFILE_SPECIFIER = "${profile}";`,
].join('\n\t\t\t\t');
writeFileSync(file, source.replace(block, `$1${signing}`));
console.log(`App target signed with team ${team}, profile ${profile}`);
