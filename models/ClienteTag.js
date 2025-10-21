'use strict';

module.exports = (sequelize, DataTypes) => {
  const ClienteTag = sequelize.define('ClienteTag', {
    id_cliente: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'clientes',
        key: 'id_cliente',
      },
    },
    tag_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tags',
        key: 'id',
      },
    },
  }, {
    tableName: 'client_tags',
    timestamps: true,
    underscored: true,
  });

  return ClienteTag;
};

