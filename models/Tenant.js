const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  stripe_customer_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true
  },
  status_billing: {
    type: DataTypes.ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete'),
    defaultValue: 'incomplete'
  }
}, {
  tableName: 'tenants',
  timestamps: true,
  underscored: true
});

module.exports = Tenant;

