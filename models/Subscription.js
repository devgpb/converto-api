module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    id: {
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
      allowNull: false,
      unique: true,
    },
    stripe_price_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    status: {
      type: DataTypes.ENUM('active', 'trialing', 'canceled', 'unpaid', 'past_due', 'incomplete'),
      allowNull: false,
    },
    current_period_end: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    underscored: true,
  });

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'tenant',
    });
  };

  return Subscription;
};
