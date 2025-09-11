#!/usr/bin/env node

const childProcess = require('child_process')
const path = require('path')
const unknownFlags = []

require('colors')
const pass = '✓'.green
const fail = '✗'.red

const args = require('minimist')(process.argv, {
  string: ['target'],
  unknown: (arg) => unknownFlags.push(arg),
})

const unknownArgs = []
for (const flag of unknownFlags) {
  unknownArgs.push(flag)
  const onlyFlag = flag.replace(/^-+/, '')
  if (args[onlyFlag]) {
    unknownArgs.push(args[onlyFlag])
  }
}

async function main() {
  await runElectronTests()
}

async function runElectronTests() {
  const errors = []

  const testResultsDir = process.env.ELECTRON_TEST_RESULTS_DIR

  try {
    if (testResultsDir) {
      process.env.MOCHA_FILE = path.join(testResultsDir, `test-results.xml`)
    }
    await runMainProcessElectronTests()
  } catch (err) {
    errors.push([err])
  }

  if (errors.length !== 0) {
    for (const err of errors) {
    }
    process.exit(1)
  }
}

async function runMainProcessElectronTests() {
  let exe = require('electron')
  const runnerArgs = ['spec', ...unknownArgs.slice(2)]

  // Fix issue in CI
  // "The SUID sandbox helper binary was found, but is not configured correctly."
  if (process.platform === 'linux') {
    runnerArgs.push('--no-sandbox')
  }

  const { status, signal } = childProcess.spawnSync(exe, runnerArgs, {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  })
  if (status !== 0) {
    if (status) {
      const textStatus =
        process.platform === 'win32' ? `0x${status.toString(16)}` : status.toString()
    } else {
    }
    process.exit(1)
  }
}

main().catch((error) => {
  process.exit(1)
})
