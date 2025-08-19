const sequelize = require('../config/database');
const Tenant = require('./Tenant');
const Subscription = require('./Subscription');
const User = require('./User');
const AuditBillingEvent = require('./AuditBillingEvent');

// Definir associações
Tenant.hasMany(Subscription, { foreignKey: 'tenant_id', as: 'subscriptions' });
Subscription.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

Tenant.hasMany(User, { foreignKey: 'tenant_id', as: 'users' });
User.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = {
  sequelize,
  Tenant,
  Subscription,
  User,
  AuditBillingEvent
};

