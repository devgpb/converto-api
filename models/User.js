module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id_usuario: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      unique: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id',
      },
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('admin', 'member', 'moderator'),
      defaultValue: 'member',
    },
    principal: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    reset_token: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    reset_token_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
  });

  User.associate = (models) => {
    User.belongsTo(models.Tenant, {
      foreignKey: 'tenant_id',
      as: 'tenant',
    });
    User.hasMany(models.Clientes, {
      foreignKey: 'id_usuario',
      as: 'clientes',
    });
    User.hasMany(models.EventosUsuarioCliente, {
      foreignKey: 'id_usuario',
      as: 'eventosClientes',
    });
    User.belongsToMany(models.Clientes, {
      through: models.EventosUsuarioCliente,
      foreignKey: 'id_usuario',
      otherKey: 'id_cliente',
      as: 'clientesEventos',
    });
    User.hasMany(models.Sugestoes, {
      foreignKey: 'id_usuario',
      as: 'sugestoes',
    });
  };

  return User;
};
