'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ligacoes', {
      id_ligacao: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      id_usuario: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id_usuario' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      id_cliente: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clientes', key: 'id_cliente' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      data_hora: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      atendida: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      observacao: {
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
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('ligacoes', ['id_usuario']);
    await queryInterface.addIndex('ligacoes', ['id_cliente']);
    await queryInterface.addIndex('ligacoes', ['data_hora']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ligacoes');
  }
};

