module.exports = (sequelize, DataTypes) => {
  const ClienteStatus = sequelize.define('ClienteStatus', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    enterprise_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'enterprises',
        key: 'id',
      },
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'cliente_status',
    modelName: 'ClienteStatus',
    underscored: true,
    timestamps: true,
    paranoid: true,
  });

  ClienteStatus.associate = (models) => {
    ClienteStatus.belongsTo(models.Enterprise, {
      foreignKey: 'enterprise_id',
      as: 'enterprise',
    });
  };

  return ClienteStatus;
};
