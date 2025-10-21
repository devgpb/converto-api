'use strict';

module.exports = (sequelize, DataTypes) => {
  const Tag = sequelize.define('Tag', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enterprise_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'enterprises',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    color_hex: {
      type: DataTypes.STRING(7),
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  }, {
    tableName: 'tags',
    timestamps: true,
    underscored: true,
  });

  Tag.associate = (models) => {
    Tag.belongsTo(models.Enterprise, { foreignKey: 'enterprise_id', as: 'enterprise' });
    if (models.Clientes && models.ClienteTag) {
      Tag.belongsToMany(models.Clientes, {
        through: models.ClienteTag,
        foreignKey: 'tag_id',
        otherKey: 'id_cliente',
        as: 'clientes',
      });
    }
  };

  return Tag;
};
