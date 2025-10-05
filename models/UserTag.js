'use strict';

module.exports = (sequelize, DataTypes) => {
  const UserTag = sequelize.define('UserTag', {
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id_usuario',
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
    tableName: 'user_tags',
    timestamps: true,
    underscored: true,
  });

  return UserTag;
};

