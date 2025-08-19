module.exports = (sequelize, DataTypes) => {
  const Tenant = sequelize.define('Tenant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    stripe_customer_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    status_billing: {
      type: DataTypes.ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete'),
      defaultValue: 'incomplete',
    },
  }, {
    tableName: 'tenants',
    timestamps: true,
    underscored: true,
  });

  Tenant.associate = (models) => {
    Tenant.hasMany(models.Subscription, {
      foreignKey: 'tenant_id',
      as: 'subscriptions',
    });
    Tenant.hasMany(models.User, {
      foreignKey: 'tenant_id',
      as: 'users',
    });
  };

  return Tenant;
};
