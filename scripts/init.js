const { sequelize } = require('../models');

(async () => {
  try {
    await sequelize.sync({ force: true });
    console.log('✅ Banco de dados inicializado com sucesso.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Falha ao inicializar o banco de dados:', error);
    process.exit(1);
  }
})();
