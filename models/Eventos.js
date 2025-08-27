module.exports = (sequelize, DataTypes) => {
    const Eventos = sequelize.define("Eventos", {
        id_evento: {
            type: DataTypes.UUID,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        nome: {
            type: DataTypes.STRING,
            allowNull: false
        },
        detalhes: {
            type: DataTypes.STRING
        },
        data: {
            type: DataTypes.DATE,
            allowNull: false
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
        }
    }, {
        tableName: 'eventos',
        modelName: 'Eventos',
        paranoid: true,  // Modo paranoia ativado para soft deletes usando o campo "deleted_at"
        underscored: true,
        timestamps: true  // Garante os campos created_at e updated_at
    });

    Eventos.associate = models => {
        // Associações podem ser definidas aqui, por exemplo:
        // Eventos.hasMany(models.OutroModelo, { foreignKey: 'id_evento', as: 'alias' });
    };

    return Eventos;
};
