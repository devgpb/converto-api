module.exports = (sequelize, DataTypes) => {
  const Sugestoes = sequelize.define('Sugestoes', {
    id_sugestao: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_usuario: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id_usuario',
      },
    },
    tipo: {
      type: DataTypes.ENUM('Comentário', 'Sugestão', 'Bug'),
      allowNull: false,
    },
    mensagem: {
      type: DataTypes.STRING(800),
      allowNull: false,
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
    tableName: 'sugestoes',
    modelName: 'Sugestoes',
    paranoid: true,
    underscored: true,
    timestamps: true,
  });

  Sugestoes.associate = (models) => {
    Sugestoes.belongsTo(models.User, {
      foreignKey: 'id_usuario',
      as: 'usuario',
    });
  };

  return Sugestoes;
};
