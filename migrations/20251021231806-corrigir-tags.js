'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const { UUID, DATE } = Sequelize;

      // Cria a tabela de associação cliente <-> tag
      await queryInterface.createTable('client_tags', {
        id_cliente: { type: UUID, allowNull: false },
        tag_id: { type: UUID, allowNull: false },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });

      await queryInterface.addConstraint('client_tags', {
        fields: ['id_cliente'],
        type: 'foreign key',
        name: 'fk_client_tags_cliente',
        references: { table: 'clientes', field: 'id_cliente' },
        onDelete: 'cascade',
        onUpdate: 'cascade',
        transaction,
      });

      await queryInterface.addConstraint('client_tags', {
        fields: ['tag_id'],
        type: 'foreign key',
        name: 'fk_client_tags_tag',
        references: { table: 'tags', field: 'id' },
        onDelete: 'cascade',
        onUpdate: 'cascade',
        transaction,
      });

      await queryInterface.addIndex('client_tags', ['id_cliente', 'tag_id'], { name: 'ux_client_tags_cliente_tag', unique: true, transaction });
      await queryInterface.addIndex('client_tags', ['tag_id'], { name: 'idx_client_tags_tag', transaction });

      // Remove a tabela de associação user <-> tag, já que tags passam a ser dos clientes
      await queryInterface.removeIndex('user_tags', 'idx_user_tags_tag', { transaction }).catch(() => {});
      await queryInterface.removeIndex('user_tags', 'ux_user_tags_user_tag', { transaction }).catch(() => {});
      await queryInterface.removeConstraint('user_tags', 'fk_user_tags_tag', { transaction }).catch(() => {});
      await queryInterface.removeConstraint('user_tags', 'fk_user_tags_user', { transaction }).catch(() => {});
      await queryInterface.dropTable('user_tags', { transaction }).catch(() => {});

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  },

  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const { UUID, DATE } = Sequelize;

      // Recria a tabela de associação user <-> tag (rollback)
      await queryInterface.createTable('user_tags', {
        user_id: { type: UUID, allowNull: false },
        tag_id: { type: UUID, allowNull: false },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });

      await queryInterface.addConstraint('user_tags', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_tags_user',
        references: { table: 'users', field: 'id_usuario' },
        onDelete: 'cascade',
        onUpdate: 'cascade',
        transaction,
      });
      await queryInterface.addConstraint('user_tags', {
        fields: ['tag_id'],
        type: 'foreign key',
        name: 'fk_user_tags_tag',
        references: { table: 'tags', field: 'id' },
        onDelete: 'cascade',
        onUpdate: 'cascade',
        transaction,
      });
      await queryInterface.addIndex('user_tags', ['user_id', 'tag_id'], { name: 'ux_user_tags_user_tag', unique: true, transaction });
      await queryInterface.addIndex('user_tags', ['tag_id'], { name: 'idx_user_tags_tag', transaction });

      // Remove a tabela client <-> tag criada no up
      await queryInterface.removeIndex('client_tags', 'idx_client_tags_tag', { transaction }).catch(() => {});
      await queryInterface.removeIndex('client_tags', 'ux_client_tags_cliente_tag', { transaction }).catch(() => {});
      await queryInterface.removeConstraint('client_tags', 'fk_client_tags_tag', { transaction }).catch(() => {});
      await queryInterface.removeConstraint('client_tags', 'fk_client_tags_cliente', { transaction }).catch(() => {});
      await queryInterface.dropTable('client_tags', { transaction }).catch(() => {});

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }
};
