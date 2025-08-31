'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Habilita a extensão unaccent no Postgres (idempotente)
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
  },
  async down(queryInterface) {
    // Remove a extensão (caso não queira mais). Cuidado: pode ser usada por outras partes.
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS unaccent;');
  }
};