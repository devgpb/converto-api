const { sequelize } = require('../models');
const { DataTypes } = require('sequelize');

(async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.addColumn('users', 'reset_token', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'reset_token_expires', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    console.log('✅ Colunas de recuperação de senha adicionadas com sucesso.');
  } catch (error) {
    console.error('❌ Falha ao adicionar colunas de recuperação de senha:', error);
  } finally {
    await sequelize.close();
  }
})();
