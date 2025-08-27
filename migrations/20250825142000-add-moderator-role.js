'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS \'moderator\';');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('CREATE TYPE "enum_users_role_new" AS ENUM(\'admin\', \'member\');', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE "users" ALTER COLUMN "role" TYPE "enum_users_role_new" USING "role"::text::"enum_users_role_new";', { transaction });
      await queryInterface.sequelize.query('DROP TYPE "enum_users_role";', { transaction });
      await queryInterface.sequelize.query('ALTER TYPE "enum_users_role_new" RENAME TO "enum_users_role";', { transaction });
    });
  }
};
