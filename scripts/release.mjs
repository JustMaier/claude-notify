#!/usr/bin/env node

/**
 * Release script - bumps version, commits, tags, pushes, and deploys
 * Usage: node scripts/release.mjs [major|minor|patch]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function error(msg) {
  log(`Error: ${msg}`, colors.red);
  process.exit(1);
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
}

function execSilent(cmd) {
  return exec(cmd, { silent: true, stdio: 'pipe' }).trim();
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: error(`Invalid type: ${type}`);
  }
}

function getServiceName() {
  // Try deploy.config.json first
  try {
    const config = JSON.parse(readFileSync(join(rootDir, 'deploy.config.json'), 'utf-8'));
    if (config.name) return config.name.toLowerCase().replace(/\s+/g, '-');
  } catch {}

  // Fall back to git remote
  try {
    const remote = execSilent('git remote get-url origin');
    const match = remote.match(/\/([^\/]+?)(\.git)?$/);
    if (match) return match[1].toLowerCase();
  } catch {}

  return null;
}

async function main() {
  const type = process.argv[2] || 'patch';
  const skipDeploy = process.argv.includes('--no-deploy');

  if (!['major', 'minor', 'patch'].includes(type)) {
    error(`Invalid release type: ${type}. Use major, minor, or patch.`);
  }

  const serviceName = getServiceName();
  const steps = skipDeploy ? 5 : 6;

  log(`\nStarting ${type} release...`, colors.cyan);

  // Step 1: Check branch
  log(`\n[1/${steps}] Checking branch...`, colors.blue);
  const branch = execSilent('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') error(`Must be on main branch (currently on ${branch})`);
  log('  On main branch', colors.green);

  // Step 2: Check clean working tree
  log(`\n[2/${steps}] Checking working tree...`, colors.blue);
  if (execSilent('git status --porcelain')) {
    error('Working tree not clean. Commit or stash changes first.');
  }
  log('  Clean', colors.green);

  // Step 3: Bump version
  log(`\n[3/${steps}] Bumping version...`, colors.blue);
  const pkgPath = join(rootDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, type);
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Update lock file if exists
  try {
    exec('npm install --package-lock-only', { silent: true, stdio: 'pipe' });
  } catch {}

  log(`  ${oldVersion} -> ${newVersion}`, colors.green);

  // Step 4: Commit and tag
  log(`\n[4/${steps}] Committing...`, colors.blue);
  exec('git add package.json package-lock.json 2>/dev/null || git add package.json', { shell: true });
  exec(`git commit -m "chore: release v${newVersion}"`);
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  log(`  Tagged v${newVersion}`, colors.green);

  // Step 5: Push
  log(`\n[5/${steps}] Pushing...`, colors.blue);
  exec('git push origin main');
  exec(`git push origin v${newVersion}`);
  log('  Pushed', colors.green);

  // Step 6: Deploy
  if (!skipDeploy && serviceName) {
    log(`\n[6/${steps}] Deploying ${serviceName}...`, colors.blue);

    const cliPath = join(homedir(), '.claude', 'skills', 'deploy-local', 'cli.js');

    try {
      exec(`node "${cliPath}" deploy ${serviceName}`);
      log('  Deployed', colors.green);
    } catch (err) {
      log(`  Deploy failed: ${err.message}`, colors.yellow);
      log(`  Run manually: node ~/.claude/skills/deploy-local/cli.js deploy ${serviceName}`, colors.yellow);
    }
  } else if (!skipDeploy && !serviceName) {
    log(`\n[6/${steps}] Skipping deploy (no service name found)`, colors.yellow);
  }

  log(`\nRelease v${newVersion} complete!`, colors.cyan);

  if (serviceName) {
    log(`\nTo check deployment:`, colors.reset);
    log(`  node ~/.claude/skills/deploy-local/cli.js health ${serviceName}`, colors.reset);
  }
}

main().catch(e => error(e.message));
