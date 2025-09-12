'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('subscriptions', 'cancel_at_period_end', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('subscriptions', 'cancel_at_period_end');
  }
};

