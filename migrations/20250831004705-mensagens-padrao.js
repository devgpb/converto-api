'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.sequelize.transaction(async (transaction) => {
        await queryInterface.createTable('mensagensPadrao', {
          idMensagem: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          nome: {
            type: Sequelize.STRING(255),
            allowNull: false
          },
          mensagem: {
            type: Sequelize.TEXT,
            allowNull: false
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW
          },
          deletedAt: {
            type: Sequelize.DATE,
            allowNull: true
          }
        }, {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        });

        await queryInterface.addIndex('mensagensPadrao', ['nome'], {
          name: 'idx_mensagensPadrao_nome',
          transaction
        });
      });
    } catch (error) {
      console.error('Erro ao criar tabela mensagensPadrao:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.sequelize.transaction(async (transaction) => {
        await queryInterface.removeIndex('mensagensPadrao', 'idx_mensagensPadrao_nome', { transaction });
        await queryInterface.dropTable('mensagensPadrao', { transaction });
      });
    } catch (error) {
      console.error('Erro ao remover tabela mensagensPadrao:', error);
      throw error;
    }
  }
};
