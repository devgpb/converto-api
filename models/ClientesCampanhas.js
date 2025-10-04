module.exports = (sequelize, DataTypes) => {
  const ClientesCampanhas = sequelize.define('ClientesCampanhas', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    id_cliente: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'clientes',
        key: 'id_cliente',
      },
    },
    campanha_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cliente_campanhas',
        key: 'id',
      },
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'clientes_campanhas',
    modelName: 'ClientesCampanhas',
    underscored: true,
    timestamps: true,
    paranoid: true,
  });

  ClientesCampanhas.associate = (models) => {
    ClientesCampanhas.belongsTo(models.Clientes, { foreignKey: 'id_cliente', as: 'cliente' });
    ClientesCampanhas.belongsTo(models.ClienteCampanha, { foreignKey: 'campanha_id', as: 'campanha' });
  };

  return ClientesCampanhas;
};

