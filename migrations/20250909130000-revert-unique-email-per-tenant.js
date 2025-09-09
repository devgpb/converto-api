'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove composite unique (tenant_id, email) if present
    try {
      await queryInterface.removeConstraint('users', 'users_tenant_email_key');
    } catch (_) {
      try {
        await queryInterface.sequelize.query('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_email_key";');
      } catch (_) {}
    }

    // Add back global unique on email
    try {
      await queryInterface.addConstraint('users', {
        fields: ['email'],
        type: 'unique',
        name: 'users_email_key',
      });
    } catch (e) {
      // If already exists, ignore
    }
  },

  async down(queryInterface, Sequelize) {
    // Recreate composite unique, and drop global unique
    try {
      await queryInterface.removeConstraint('users', 'users_email_key');
    } catch (_) {
      try {
        await queryInterface.sequelize.query('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";');
      } catch (_) {}
    }
    try {
      await queryInterface.addConstraint('users', {
        fields: ['tenant_id', 'email'],
        type: 'unique',
        name: 'users_tenant_email_key',
      });
    } catch (_) {}
  }
};

