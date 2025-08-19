const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditBillingEvent = sequelize.define('AuditBillingEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  type: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  payload_json: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  stripe_event_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true
  }
}, {
  tableName: 'audit_billing_events',
  timestamps: true,
  underscored: true
});

module.exports = AuditBillingEvent;

