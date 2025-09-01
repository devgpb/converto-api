'use strict';

const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) Adiciona coluna UUID temporária em clientes
    await queryInterface.addColumn('clientes', 'id_cliente_uuid', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // 2) Gera UUIDs para cada cliente e aplica
    const [clientes] = await queryInterface.sequelize.query('SELECT id_cliente FROM clientes');
    const mapping = clientes.map((row) => ({ oldId: row.id_cliente, newId: uuidv4() }));

    for (const m of mapping) {
      await queryInterface.sequelize.query(
        'UPDATE clientes SET id_cliente_uuid = :newId WHERE id_cliente = :oldId',
        { replacements: { newId: m.newId, oldId: m.oldId } }
      );
    }

    // 3) Adiciona coluna UUID temporária na tabela de eventos (relacionamento)
    await queryInterface.addColumn('eventos_usuarios_clientes', 'id_cliente_uuid', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // 4) Propaga o mapeamento para a tabela de eventos
    for (const m of mapping) {
      await queryInterface.sequelize.query(
        'UPDATE eventos_usuarios_clientes SET id_cliente_uuid = :newId WHERE id_cliente = :oldId',
        { replacements: { newId: m.newId, oldId: m.oldId } }
      );
    }

    // 5) Ajusta chaves/colunas em clientes: drop PK, remove int, renomeia uuid para id_cliente, recria PK
    // Em Postgres, precisamos soltar a PK antes de remover a coluna.
    // Descobre o nome da constraint de PK (assumindo padrão 'clientes_pkey')
    await queryInterface.sequelize.query('ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_pkey');

    await queryInterface.removeColumn('clientes', 'id_cliente');
    await queryInterface.renameColumn('clientes', 'id_cliente_uuid', 'id_cliente');

    // Define NOT NULL e PK
    await queryInterface.changeColumn('clientes', 'id_cliente', {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    });

    await queryInterface.sequelize.query('ALTER TABLE clientes ADD PRIMARY KEY (id_cliente)');

    // 6) Ajusta tabela de eventos: remove coluna int e renomeia uuid
    await queryInterface.removeColumn('eventos_usuarios_clientes', 'id_cliente');
    await queryInterface.renameColumn('eventos_usuarios_clientes', 'id_cliente_uuid', 'id_cliente');

    await queryInterface.changeColumn('eventos_usuarios_clientes', 'id_cliente', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Reverte para INTEGER (sem preservar mapeamento original)
    // 1) Adiciona colunas temporárias inteiras
    await queryInterface.addColumn('clientes', 'id_cliente_int', {
      type: Sequelize.INTEGER,
      allowNull: true,
      autoIncrement: true,
      primaryKey: false,
    });

    await queryInterface.addColumn('eventos_usuarios_clientes', 'id_cliente_int', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // 2) Preenche com sequência simples baseada na ordem atual
    // Cria uma sequência temporária
    await queryInterface.sequelize.query('CREATE SEQUENCE IF NOT EXISTS clientes_tmp_seq START 1');
    await queryInterface.sequelize.query('UPDATE clientes SET id_cliente_int = nextval(\'clientes_tmp_seq\')');

    // 3) Propaga (join aproximado por posição pode não bater 1:1, por isso o down não é lossless)
    // Aqui mantemos nulo pois mapeamento reverso não é trivial sem tabela auxiliar.

    // 4) Troca as colunas
    await queryInterface.sequelize.query('ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_pkey');
    await queryInterface.removeColumn('clientes', 'id_cliente');
    await queryInterface.renameColumn('clientes', 'id_cliente_int', 'id_cliente');
    await queryInterface.changeColumn('clientes', 'id_cliente', {
      type: Sequelize.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    });

    await queryInterface.removeColumn('eventos_usuarios_clientes', 'id_cliente');
    await queryInterface.renameColumn('eventos_usuarios_clientes', 'id_cliente_int', 'id_cliente');
    await queryInterface.changeColumn('eventos_usuarios_clientes', 'id_cliente', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  }
};

