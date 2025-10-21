module.exports = (sequelize, DataTypes) => {
  const ClientesStatus = sequelize.define('ClientesStatus', {
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
    status_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'cliente_status',
        key: 'id',
      },
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'clientes_status',
    modelName: 'ClientesStatus',
    underscored: true,
    timestamps: true,
    paranoid: true,
  });

  ClientesStatus.associate = (models) => {
    ClientesStatus.belongsTo(models.Clientes, { foreignKey: 'id_cliente', as: 'cliente' });
    ClientesStatus.belongsTo(models.ClienteStatus, { foreignKey: 'status_id', as: 'status' });
  };

  return ClientesStatus;
};
