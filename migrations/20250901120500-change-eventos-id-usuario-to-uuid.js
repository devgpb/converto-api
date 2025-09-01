'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Troca id_usuario (INTEGER) para UUID na tabela de eventos
    await queryInterface.addColumn('eventos_usuarios_clientes', 'id_usuario_uuid', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // Remove a coluna antiga inteira e renomeia a UUID
    await queryInterface.removeColumn('eventos_usuarios_clientes', 'id_usuario');
    await queryInterface.renameColumn('eventos_usuarios_clientes', 'id_usuario_uuid', 'id_usuario');

    // Opcional: tornar NOT NULL se não houver registros antigos nulos
    // try {
    //   await queryInterface.changeColumn('eventos_usuarios_clientes', 'id_usuario', {
    //     type: Sequelize.UUID,
    //     allowNull: false,
    //   });
    // } catch (_) { /* mantém como NULLABLE para não quebrar dados legados */ }
  },

  async down(queryInterface, Sequelize) {
    // Reverte para INTEGER
    await queryInterface.addColumn('eventos_usuarios_clientes', 'id_usuario_int', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.removeColumn('eventos_usuarios_clientes', 'id_usuario');
    await queryInterface.renameColumn('eventos_usuarios_clientes', 'id_usuario_int', 'id_usuario');
  }
};

