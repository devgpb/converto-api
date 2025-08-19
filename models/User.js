const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'member'),
    defaultValue: 'member'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true
});

module.exports = User;

