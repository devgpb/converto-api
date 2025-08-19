'use strict';

module.exports = (sequelize, DataTypes) => {
  const EventosUsuarioCliente = sequelize.define('EventosUsuarioCliente', {
    id_evento: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_cliente: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    data: {
      type: DataTypes.DATE, // troque para DATEONLY se quiser sem hora
      allowNull: false,
    },
    evento: {
      type: DataTypes.STRING,
      allowNull: null,
    },  
    confirmado: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'eventos_usuarios_clientes',
    underscored: false,
    paranoid: true,
    timestamps: true,
  });

  EventosUsuarioCliente.associate = (models) => {
    EventosUsuarioCliente.belongsTo(models.User, {
      foreignKey: 'id_usuario',
      as: 'usuario',
    });
    EventosUsuarioCliente.belongsTo(models.Clientes, {
      foreignKey: 'id_cliente',
      as: 'cliente',
    });
  };

  return EventosUsuarioCliente;
};
