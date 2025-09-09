"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('enterprises', 'cnpj', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'name',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('enterprises', 'cnpj');
  },
};

