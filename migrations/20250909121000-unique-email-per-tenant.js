'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop global unique on users.email if it exists, then add composite unique (tenant_id, email)
    // Try constraint by known default name for Postgres
    try {
      await queryInterface.removeConstraint('users', 'users_email_key');
    } catch (_) {
      // Fallback: raw SQL drop if exists (Postgres)
      try {
        await queryInterface.sequelize.query('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";');
      } catch (_) {}
    }

    // Also attempt to drop a possible unique index variant
    try {
      await queryInterface.removeIndex('users', 'users_email_key');
    } catch (_) {
      try {
        await queryInterface.removeIndex('users', 'users_email_unique');
      } catch (_) {}
    }

    // Add composite unique constraint
    await queryInterface.addConstraint('users', {
      fields: ['tenant_id', 'email'],
      type: 'unique',
      name: 'users_tenant_email_key',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove composite unique and add back global unique on email
    try {
      await queryInterface.removeConstraint('users', 'users_tenant_email_key');
    } catch (_) {
      try {
        await queryInterface.sequelize.query('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_email_key";');
      } catch (_) {}
    }

    await queryInterface.addConstraint('users', {
      fields: ['email'],
      type: 'unique',
      name: 'users_email_key',
    });
  }
};

