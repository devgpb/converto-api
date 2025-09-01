'use strict';

module.exports = (sequelize, DataTypes) => {
  const EventosUsuarioCliente = sequelize.define('EventosUsuarioCliente', {
    id_evento: {
      // Mantém compatível com a migration existente (INTEGER autoincrement)
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_usuario: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    id_cliente: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    data: {
      type: DataTypes.DATE, // troque para DATEONLY se quiser sem hora
      allowNull: false,
    },
    evento: {
      type: DataTypes.STRING,
      allowNull: true,
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
    underscored: true,
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
