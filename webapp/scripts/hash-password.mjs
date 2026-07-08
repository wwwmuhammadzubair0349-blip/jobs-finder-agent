#!/usr/bin/env node
/**
 * Generate AUTH_PASSWORD_HASH (PBKDF2) + a random AUTH_SECRET for the dashboard.
 * The hash format matches functions/_shared/auth.js exactly:
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 *
 * Usage:
 *   npm run hash-password              (prompts for a password)
 *   npm run hash-password -- "mypass"  (password as arg)
 *
 * Iterations capped at 100000 (Cloudflare Workers PBKDF2 limit).
 */
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const ITERATIONS = 100000;

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

const b64 = (buf) => Buffer.from(buf).toString("base64");

async function makeHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function main() {
  let password = process.argv[2];
  if (!password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    password = await new Promise((res) => rl.question("Choose a dashboard password: ", (a) => { rl.close(); res(a); }));
  }
  if (!password || password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }
  const hash = await makeHash(password);
  const secret = b64(crypto.getRandomValues(new Uint8Array(32)));

  console.log("\nAdd these to your Cloudflare Pages environment variables:\n");
  console.log(`AUTH_USER=<choose a username>`);
  console.log(`AUTH_PASSWORD_HASH=${hash}`);
  console.log(`AUTH_SECRET=${secret}`);
  console.log("");
}

main();
