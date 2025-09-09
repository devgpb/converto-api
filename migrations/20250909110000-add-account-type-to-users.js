"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "users",
        "account_type",
        {
          type: Sequelize.ENUM("company", "personal"),
          allowNull: true,
          defaultValue: null,
        },
        { transaction }
      );

      // Backfill: all principal users become 'company'
      await queryInterface.sequelize.query(
        "UPDATE \"users\" SET \"account_type\" = 'company' WHERE \"principal\" IS TRUE;",
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("users", "account_type", { transaction });
      // Drop the ENUM type generated for the column
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_users_account_type";',
        { transaction }
      );
    });
  },
};

