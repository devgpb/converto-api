module.exports = (sequelize, DataTypes) => {
  const Ligacoes = sequelize.define('Ligacoes', {
    id_ligacao: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    id_usuario: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id_usuario',
      },
    },
    id_cliente: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'clientes',
        key: 'id_cliente',
      },
    },
    data_hora: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    atendida: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'ligacoes',
    modelName: 'Ligacoes',
    underscored: true,
    timestamps: true,
    paranoid: true,
  });

  Ligacoes.associate = (models) => {
    Ligacoes.belongsTo(models.User, {
      foreignKey: 'id_usuario',
      as: 'usuario',
    });
    Ligacoes.belongsTo(models.Clientes, {
      foreignKey: 'id_cliente',
      as: 'cliente',
    });
  };

  return Ligacoes;
};

