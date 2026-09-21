#!/usr/bin/env node
// Runs PostgreSQL + the mail catcher in the foreground until Ctrl+C.
import { startStack } from './stack.js';

const stack = await startStack();
const shutdown = async () => {
  await stack.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
