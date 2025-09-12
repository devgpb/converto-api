module.exports = (sequelize, DataTypes) => {
  const CancellationReason = sequelize.define('CancellationReason', {
    id_motivo: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id',
      },
    },
    stripe_subscription_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    motivo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'cancellation_reasons',
    timestamps: true,
    underscored: true,
  });

  CancellationReason.associate = (models) => {
    CancellationReason.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'tenant',
    });
  };

  return CancellationReason;
};

