'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const { UUID, UUIDV4, STRING, TEXT, DATE } = Sequelize;

      // Tabela de Tags
      await queryInterface.createTable('tags', {
        id: { type: UUID, allowNull: false, primaryKey: true, defaultValue: UUIDV4 },
        enterprise_id: { type: UUID, allowNull: false },
        name: { type: STRING(120), allowNull: false },
        color_hex: { type: STRING(7), allowNull: true },
        description: { type: STRING(500), allowNull: true },
        created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });

      // Índices e FK de tags
      await queryInterface.addIndex('tags', ['enterprise_id'], { name: 'idx_tags_enterprise', transaction });
      await queryInterface.addIndex('tags', ['enterprise_id', 'name'], { name: 'ux_tags_enterprise_name', unique: true, transaction });
      await queryInterface.addConstraint('tags', {
        fields: ['enterprise_id'],
        type: 'foreign key',
        name: 'fk_tags_enterprise',
        references: { table: 'enterprises', field: 'id' },
        onDelete: 'cascade',
        onUpdate: 'cascade',
        transaction,
      });

      // Tabela de associação usuário<->tag
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

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('user_tags', 'idx_user_tags_tag', { transaction }).catch(() => {});
      await queryInterface.removeIndex('user_tags', 'ux_user_tags_user_tag', { transaction }).catch(() => {});
      await queryInterface.removeConstraint('user_tags', 'fk_user_tags_tag', { transaction }).catch(() => {});
      await queryInterface.removeConstraint('user_tags', 'fk_user_tags_user', { transaction }).catch(() => {});
      await queryInterface.dropTable('user_tags', { transaction });

      await queryInterface.removeConstraint('tags', 'fk_tags_enterprise', { transaction }).catch(() => {});
      await queryInterface.removeIndex('tags', 'ux_tags_enterprise_name', { transaction }).catch(() => {});
      await queryInterface.removeIndex('tags', 'idx_tags_enterprise', { transaction }).catch(() => {});
      await queryInterface.dropTable('tags', { transaction });

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }
};

