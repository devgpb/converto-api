const models = require("../models");
const Sequelize = require('sequelize');
const _upsert = require("../utils/rest").getDefaultUpsert(models.EventosUsuarioCliente, "id_evento");
// const { formatarParaBanco, convertUTCtoLocal } = require("../utils/utils");
// const { estadosPedidos, listaEmails, mapaStatusData, datasPedidos } = require('./constantes');
const { DateTime } = require("luxon");

/**
 * GET /eventos/intervalo?inicio=2025-08-14&fim=2025-08-20[&tz=America/Maceio]
 * - inicio/fim: ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm), interpretados no fuso 'tz'
 * - tz: padrão "America/Maceio"
 * Retorna todos os eventos cuja `data` (UTC no banco) cai dentro do intervalo.
 */
exports.listarEventosIntervalo = async (req, res) => {
  try {
    const { inicio, fim, tz = "America/Maceio" } = req.query;

    if (!inicio || !fim) {
      return res.status(400).json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios." });
    }

    // Calcula os limites no fuso solicitado
    const startLocal = DateTime.fromISO(inicio, { zone: tz });
    const endLocal = DateTime.fromISO(fim, { zone: tz });

    if (!startLocal.isValid || !endLocal.isValid) {
      return res.status(400).json({ error: "Formato de data inválido em 'inicio' ou 'fim'." });
    }

    // Se usuário mandar só a data (YYYY-MM-DD), normalizamos para começo/fim do dia
    const start = startLocal.toFormat("HHmmss") === "000000"
      ? startLocal.startOf("day")
      : startLocal;

    const end = endLocal.toFormat("HHmmss") === "000000"
      ? endLocal.endOf("day")
      : endLocal;

    const startUtc = start.toUTC().toJSDate();
    const endUtc = end.toUTC().toJSDate();

    const eventos = await models.EventosUsuarioCliente.findAll({
      where: { data: { [Op.between]: [startUtc, endUtc] } },
      order: [["data", "ASC"]],
    });

    // devolve também conversão para o fuso solicitado
    const resposta = eventos.map((e) => {
      const json = e.toJSON();
      json.dataISO = DateTime.fromJSDate(json.data, { zone: "utc" }).toISO();
      json.dataLocal = DateTime.fromJSDate(json.data, { zone: "utc" }).setZone(tz).toFormat("dd/MM/yyyy HH:mm");
      return json;
    });

    return res.json(resposta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao listar eventos no intervalo." });
  }
};

exports.criarEvento = async (req, res) => {
  try {
    const tz = req.body.tz || "America/Maceio";
    const entrada = req.body.data;

    // Aceita ISO ou dd/MM/yyyy HH:mm
    let dataLocal = DateTime.fromISO(entrada, { zone: tz });
    if (!dataLocal.isValid) {
      dataLocal = DateTime.fromFormat(entrada, "dd/LL/yyyy HH:mm", { zone: tz });
    }
    if (!dataLocal.isValid) {
      return res.status(400).json({ message: "Data inválida" });
    }

    req.body.data = dataLocal.toUTC().toJSDate();
    _upsert(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar evento" });
  }
};

/**
 * GET /eventos/cliente?id_cliente=123[&inicio=YYYY-MM-DD][&fim=YYYY-MM-DD][&tz=America/Maceio]
 * - id_cliente: obrigatório
 * - inicio/fim: opcionais; se vierem, filtramos por intervalo respeitando o TZ
 * - tz: padrão "America/Maceio"
 */
exports.listarEventosDoCliente = async (req, res) => {
  try {
    const { id_cliente, inicio, fim, tz = "America/Maceio" } = req.query;

    if (!id_cliente) {
      return res.status(400).json({ error: "id_cliente é obrigatório." });
    }

    const where = { id_cliente };

    if (inicio && fim) {
      const startLocal = DateTime.fromISO(inicio, { zone: tz });
      const endLocal = DateTime.fromISO(fim, { zone: tz });

      if (!startLocal.isValid || !endLocal.isValid) {
        return res.status(400).json({ error: "Formato de data inválido em 'inicio' ou 'fim'." });
      }

      const start = startLocal.toFormat("HHmmss") === "000000"
        ? startLocal.startOf("day")
        : startLocal;

      const end = endLocal.toFormat("HHmmss") === "000000"
        ? endLocal.endOf("day")
        : endLocal;

      where.data = { [Op.between]: [start.toUTC().toJSDate(), end.toUTC().toJSDate()] };
    }

    const eventos = await models.EventosUsuarioCliente.findAll({
      where,
      order: [["data", "ASC"]],
    });

    console.log(eventos);

    const resposta = eventos.map((e) => {
      const json = e.toJSON();
      json.dataISO = DateTime.fromJSDate(json.data, { zone: "utc" }).toISO();
      json.dataLocal = DateTime.fromJSDate(json.data, { zone: "utc" }).setZone(tz).toFormat("dd/MM/yyyy HH:mm");
      return json;
    });

    return res.json(resposta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao listar eventos do cliente." });
  }
};