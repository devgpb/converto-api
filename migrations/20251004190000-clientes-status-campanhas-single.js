'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const { UUID, STRING, DATE, INTEGER } = Sequelize;

      // 1) Criar tabelas mestre simples (id inteiro)
      await queryInterface.createTable(
        'cliente_status',
        {
          id: { type: INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
          nome: { type: STRING, allowNull: false },
          enterprise_id: { 
            type: UUID, 
            allowNull: false, 
            references: { model: 'enterprises', key: 'id' }, 
            onUpdate: 'CASCADE', 
            onDelete: 'CASCADE' 
          },
          created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          deleted_at: { type: DATE, allowNull: true },
        },
        { transaction }
      );
      await queryInterface.addIndex(
        'cliente_status',
        ['enterprise_id', 'nome'],
        { name: 'ux_cliente_status_enterprise_nome', unique: true, transaction }
      );

      await queryInterface.createTable(
        'cliente_campanhas',
        {
          id: { type: INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
          nome: { type: STRING, allowNull: false },
          enterprise_id: { 
            type: UUID, 
            allowNull: false, 
            references: { model: 'enterprises', key: 'id' }, 
            onUpdate: 'CASCADE', 
            onDelete: 'CASCADE' 
          },
          created_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          deleted_at: { type: DATE, allowNull: true },
        },
        { transaction }
      );
      await queryInterface.addIndex(
        'cliente_campanhas',
        ['enterprise_id', 'nome'],
        { name: 'ux_cliente_campanhas_enterprise_nome', unique: true, transaction }
      );

      // 2) Colunas temporárias em clientes (inteiro)
      await queryInterface.addColumn('clientes', 'status_tmp', { type: INTEGER, allowNull: true }, { transaction });
      await queryInterface.addColumn('clientes', 'campanha_tmp', { type: INTEGER, allowNull: true }, { transaction });

      // 3) Popular tabelas mestre com distintos atuais
      await queryInterface.sequelize.query(`
        INSERT INTO cliente_status (nome, enterprise_id, created_at, updated_at)
        SELECT DISTINCT c.status, c.enterprise_id, NOW(), NOW()
        FROM clientes c
        WHERE c.status IS NOT NULL AND c.status <> ''
        ON CONFLICT (enterprise_id, nome) DO NOTHING;
      `, { transaction });

      await queryInterface.sequelize.query(`
        INSERT INTO cliente_campanhas (nome, enterprise_id, created_at, updated_at)
        SELECT DISTINCT c.campanha, c.enterprise_id, NOW(), NOW()
        FROM clientes c
        WHERE c.campanha IS NOT NULL AND c.campanha <> ''
        ON CONFLICT (enterprise_id, nome) DO NOTHING;
      `, { transaction });

      // 4) Mapear valores antigos para ids nas colunas temporárias
      await queryInterface.sequelize.query(`
        UPDATE clientes c SET status_tmp = s.id
        FROM cliente_status s
        WHERE s.enterprise_id = c.enterprise_id AND s.nome = c.status AND c.status IS NOT NULL AND c.status <> '';
      `, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE clientes c SET campanha_tmp = cp.id
        FROM cliente_campanhas cp
        WHERE cp.enterprise_id = c.enterprise_id AND cp.nome = c.campanha AND c.campanha IS NOT NULL AND c.campanha <> '';
      `, { transaction });

      // 5) Substituir colunas antigas pelas novas (mantendo nomes)
      await queryInterface.removeColumn('clientes', 'status', { transaction });
      await queryInterface.removeColumn('clientes', 'campanha', { transaction });
      await queryInterface.renameColumn('clientes', 'status_tmp', 'status', { transaction });
      await queryInterface.renameColumn('clientes', 'campanha_tmp', 'campanha', { transaction });

      // 6) Adicionar FKs finais
      await queryInterface.sequelize.query(`
        ALTER TABLE clientes
        ADD CONSTRAINT fk_clientes_status FOREIGN KEY (status) REFERENCES cliente_status(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE clientes
        ADD CONSTRAINT fk_clientes_campanha FOREIGN KEY (campanha) REFERENCES cliente_campanhas(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
      `, { transaction });

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const { STRING } = Sequelize;

      // 1) Remover FKs
      await queryInterface.sequelize.query('ALTER TABLE clientes DROP CONSTRAINT IF EXISTS fk_clientes_status;', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE clientes DROP CONSTRAINT IF EXISTS fk_clientes_campanha;', { transaction });

      // 2) Colunas temporárias de texto
      await queryInterface.addColumn('clientes', 'status_old', { type: STRING, allowNull: true }, { transaction });
      await queryInterface.addColumn('clientes', 'campanha_old', { type: STRING, allowNull: true }, { transaction });

      // 3) Preencher com nomes a partir das tabelas mestre
      await queryInterface.sequelize.query(`
        UPDATE clientes c SET status_old = s.nome
        FROM cliente_status s
        WHERE c.status = s.id;
      `, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE clientes c SET campanha_old = cp.nome
        FROM cliente_campanhas cp
        WHERE c.campanha = cp.id;
      `, { transaction });

      // 4) Remover colunas inteiras e renomear de volta
      await queryInterface.removeColumn('clientes', 'status', { transaction });
      await queryInterface.removeColumn('clientes', 'campanha', { transaction });
      await queryInterface.renameColumn('clientes', 'status_old', 'status', { transaction });
      await queryInterface.renameColumn('clientes', 'campanha_old', 'campanha', { transaction });

      // 5) Remover tabelas mestre
      await queryInterface.removeIndex('cliente_campanhas', 'ux_cliente_campanhas_enterprise_nome', { transaction }).catch(() => {});
      await queryInterface.dropTable('cliente_campanhas', { transaction });
      await queryInterface.removeIndex('cliente_status', 'ux_cliente_status_enterprise_nome', { transaction }).catch(() => {});
      await queryInterface.dropTable('cliente_status', { transaction });

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }
};
