'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cancellation_reasons', {
      id_motivo: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      stripe_subscription_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      motivo: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      descricao: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
    await queryInterface.addIndex('cancellation_reasons', ['tenant_id']);
    await queryInterface.addIndex('cancellation_reasons', ['stripe_subscription_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cancellation_reasons');
  }
};

