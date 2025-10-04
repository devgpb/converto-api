module.exports = (sequelize, DataTypes) => {
  const ClienteCampanha = sequelize.define('ClienteCampanha', {
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
    tableName: 'cliente_campanhas',
    modelName: 'ClienteCampanha',
    underscored: true,
    timestamps: true,
    paranoid: true,
  });

  ClienteCampanha.associate = (models) => {
    ClienteCampanha.belongsTo(models.Enterprise, {
      foreignKey: 'enterprise_id',
      as: 'enterprise',
    });
  };

  return ClienteCampanha;
};
