module.exports = (sequelize, DataTypes) => {
  const Clientes = sequelize.define("Clientes", {
    id_cliente: {
      type: DataTypes.UUID,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    id_usuario: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id_usuario'
      }
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },
    celular: {
      type: DataTypes.STRING,
      allowNull: false
    },
    cidade: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    indicacao: {
      type: DataTypes.STRING,
      allowNull: true
    },
    campanha: {
      type: DataTypes.STRING,
      allowNull: true
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fechado: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    tempo_status: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    ultimo_contato: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    orcamento_enviado: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    enterprise_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'enterprises',
        key: 'id',
      },
    }
  }, {
    tableName: 'clientes',
    modelName: 'Clientes',
    underscored: true,
    timestamps: true,
    paranoid: true,
  });

  Clientes.associate = (models) => {

    Clientes.belongsTo(models.User, {
        foreignKey: 'id_usuario',
        as: 'responsavel'
    });

     // acesso direto aos registros da tabela de eventos
    Clientes.hasMany(models.EventosUsuarioCliente, {
      foreignKey: 'id_cliente',
      as: 'eventosUsuarios',
    });

    // relação N:N com Usuario via a tabela com atributos extras
    Clientes.belongsToMany(models.User, {
      through: models.EventosUsuarioCliente,
      foreignKey: 'id_cliente',
      otherKey: 'id_usuario',
      as: 'usuariosEventos',
    });
    Clientes.belongsTo(models.Enterprise, {
      foreignKey: 'enterprise_id',
      as: 'enterprise',
    });
  };

  return Clientes;
};
