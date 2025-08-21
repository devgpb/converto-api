module.exports = (sequelize, DataTypes) => {
  const Enterprise = sequelize.define('Enterprise', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'tenants',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  }, {
    tableName: 'enterprises',
    timestamps: true,
    underscored: true,
  });

  Enterprise.associate = (models) => {
    Enterprise.belongsTo(models.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
    Enterprise.hasMany(models.Clientes, { foreignKey: 'enterprise_id', as: 'clientes' });
  };

  return Enterprise;
};
