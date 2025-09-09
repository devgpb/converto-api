// models/mensagensPadrao.js
'use strict';

module.exports = function (Sequelize, DataTypes) {
  const mensagensPadrao = Sequelize.define('mensagensPadrao', {
    idMensagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    enterprise_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    nome: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    mensagem: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    Sequelize,
    tableName: 'mensagensPadrao',
    modelName: 'mensagensPadrao',
    paranoid: true,
    timestamps: true
  });

  mensagensPadrao.associate = models => {
    mensagensPadrao.belongsTo(models.Enterprise, {
      foreignKey: 'enterprise_id',
      as: 'enterprise'
    });
  };

  return mensagensPadrao;
};
