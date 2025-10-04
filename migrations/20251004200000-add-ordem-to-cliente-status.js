'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const { INTEGER } = Sequelize;

      // 1) Add column (nullable no início)
      await queryInterface.addColumn(
        'cliente_status',
        'ordem',
        { type: INTEGER, allowNull: true },
        { transaction }
      );

      // 2) Backfill em batches por enterprise (ordena só pelo id)
      const [enterprises] = await queryInterface.sequelize.query(
        `SELECT DISTINCT enterprise_id FROM cliente_status WHERE deleted_at IS NULL`,
        { transaction }
      );

      for (const e of enterprises) {
        await queryInterface.sequelize.query(
          `
          WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
            FROM cliente_status
            WHERE enterprise_id = :eid AND deleted_at IS NULL
          )
          UPDATE cliente_status s
          SET ordem = r.rn
          FROM ranked r
          WHERE s.id = r.id
          `,
          { replacements: { eid: e.enterprise_id }, transaction }
        );
      }

      // 3) Agora força NOT NULL
      await queryInterface.changeColumn(
        'cliente_status',
        'ordem',
        { type: INTEGER, allowNull: false },
        { transaction }
      );

      // 4) Índice único por enterprise
      await queryInterface.addIndex(
        'cliente_status',
        ['enterprise_id', 'ordem'],
        { name: 'ux_cliente_status_enterprise_ordem', unique: true, transaction }
      );

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex(
        'cliente_status',
        'ux_cliente_status_enterprise_ordem',
        { transaction }
      ).catch(() => {});
      await queryInterface.removeColumn('cliente_status', 'ordem', { transaction });
      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }
};
