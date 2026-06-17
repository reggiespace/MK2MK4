#!/usr/bin/env node
/**
 * Initialize operator account on Docker startup.
 * Runs after migrations to ensure database schema exists.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function main() {
  const email = process.env.OPERATOR_EMAIL;
  const password = process.env.OPERATOR_PASSWORD;
  const dbUrl = process.env.DATABASE_URL;

  if (!email || !password || !dbUrl) {
    console.log('[init-operator] Skipping: OPERATOR_EMAIL, OPERATOR_PASSWORD, or DATABASE_URL not set');
    return;
  }

  try {
    // Lazy-load Prisma to avoid errors if DB isn't ready
    const { PrismaClient } = require('@prisma/client');
    const { PrismaPg } = require('@prisma/adapter-pg');

    const adapter = new PrismaPg({ connectionString: dbUrl });
    const prisma = new PrismaClient({ adapter });

    // Simple hash: bcryptjs would require installation, use a placeholder
    // For dev, we'll store a hash format compatible with bcryptjs
    // In production, use proper bcrypt
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);

    const op = await prisma.operator.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    console.log(`[init-operator] ✓ Operator ready: ${op.email}`);
    await prisma.$disconnect();
  } catch (err) {
    if (err.message && err.message.includes('connect')) {
      // DB not ready yet, will retry
      console.log('[init-operator] Database not ready, will retry...');
      process.exit(1);
    }
    console.error('[init-operator] Error:', err.message);
    process.exit(1);
  }
}

main();
