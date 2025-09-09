'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Drop existing table if present (data preservation not required)
      const tableNames = await queryInterface.showAllTables({ transaction });
      if (tableNames.map(t => (typeof t === 'object' ? t.tableName || t.name : t)).includes('mensagensPadrao')) {
        try {
          await queryInterface.removeIndex('mensagensPadrao', 'idx_mensagensPadrao_nome', { transaction });
        } catch (_) {}
        try {
          await queryInterface.dropTable('mensagensPadrao', { transaction });
        } catch (_) {}
      }

      await queryInterface.createTable('mensagensPadrao', {
        idMensagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          autoIncrement: true,
        },
        enterprise_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'enterprises', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        nome: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        mensagem: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
        deletedAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
      });

      await queryInterface.addIndex('mensagensPadrao', ['enterprise_id'], {
        name: 'idx_mensagensPadrao_enterprise_id',
        transaction,
      });
      await queryInterface.addIndex('mensagensPadrao', ['nome'], {
        name: 'idx_mensagensPadrao_nome',
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      try { await queryInterface.removeIndex('mensagensPadrao', 'idx_mensagensPadrao_enterprise_id', { transaction }); } catch (_) {}
      try { await queryInterface.removeIndex('mensagensPadrao', 'idx_mensagensPadrao_nome', { transaction }); } catch (_) {}
      try { await queryInterface.dropTable('mensagensPadrao', { transaction }); } catch (_) {}
    });
  }
};

