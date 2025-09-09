"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'cpf', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'reset_token_expires',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'cpf');
  },
};

