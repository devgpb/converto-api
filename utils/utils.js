const fs = require('fs');
const moment = require('moment');
const Model = require('sequelize/lib/model');
const models = require('../models');

const DATA_HORA_PADRAO = 'DD/MM/YYYY HH:mm:ss';
const TIME_ZONE_PADRAO = 'America/Sao_Paulo';

exports.convertUTCtoLocal = function (dateString, timeZone) {
    return moment(dateString).tz(timeZone).format('YYYY-MM-DDTHH:mm:ss.SSS');
};


exports.formatarParaBanco = function (dataISO, hora, minuto) {
	if(dataISO == null || dataISO == undefined){
		return null
	}

	try {
		// Cria um objeto Date a partir da string ISO
		const partes = dataISO.split('/');
		const diaParse = parseInt(partes[0]);
		const mesParse = parseInt(partes[1]); 
		const anoParse = parseInt(partes[2]);

		console.log(diaParse,mesParse,anoParse)


		// Extrai ano, mês e dia se o formato for simples
		// const ano = data.getFullYear();
		// const mes = (data.getMonth() + 1).toString().padStart(2, '0'); // +1 porque getMonth() retorna 0-11
		// const dia = data.getDate().toString().padStart(2, '0');
	
		// Prepara a hora e o minuto
		const horaFormatada = hora.toString().padStart(2, '0');
		const minutoFormatado = minuto.toString().padStart(2, '0');
		console.log( `${anoParse}-${mesParse}-${diaParse}T${horaFormatada}:${minutoFormatado}:00.000Z`)
	
		// Combina tudo no formato desejado` ${anoParse}-${mesParse}-${diaParse} ${horaFormatada}:${minutoFormatado}:00 -0300`;
		return  `${anoParse}-${mesParse}-${diaParse}T${horaFormatada}:${minutoFormatado}:00.000Z`;

	} catch (error) {
		return null
	}
    
  }

exports.getDateToPattern = function (date, toPattern, fromPattern) {
	if (typeof fromPattern === "string")
		return moment(date, fromPattern).format(toPattern);
	else
		return moment(date).format(toPattern);
};

exports.getCurrentDateWithMilliseconds = function () {
	return moment().format("YYYY-MM-DD HH:mm:ss:SSS");
};

function getUnixByDatePattern (date, pattern) {
	if (typeof pattern === "string")
		return moment(date, pattern).unix();
	else
		return moment(date).unix();
}

exports.getUnixByDatePattern = getUnixByDatePattern;

exports.getDateFromOnePatternToAnother = function (date, from, to) {
	return moment(date, from).format(to);
};

exports.appendToFileSync = function (file, data, callback) {
	fs.appendFileSync(file, data);
	if (callback)
		callback();
};

/**
 * Recebe um número representando um timestamp posix, converte para um timezone e para um padrão
 */
exports.obterDataFormatadaDePosixParaTimezone = function (posix, padrao, timeZone) {
	if (!timeZone)
		timeZone = TIME_ZONE_PADRAO;
	if (!padrao)
		padrao = DATA_HORA_PADRAO;

	var data = getDataFromPosixTime(posix, "YYYY-MM-DD HH:mm:ss");
	var utc = moment.utc(data).toDate();
	var local = moment(utc).tz(timeZone).format(padrao);

	return local;
};

exports.isDataEmPadrao = function (date, padrao) {
	return moment(date, padrao).format(padrao) === date;
};

exports.getDataAtual = function () {
	var date = moment(new Date(), "DD/MM/YYYY");
	return date;
};

exports.getDataHoraAtual = function () {
	var date = moment(new Date());
	return date;
};

exports.getHoraAtual = function () {
	var date = moment(new Date(), "HH:mm:ss");
	return exports.getDataFormatadaPorPadrao(date, "HH:mm:ss");
};

exports.getSegundosEntreDuasDatas = function (start, end) {
	var duration = moment.duration(end.diff(start));
	var segundos = duration.asSeconds();

	return segundos;
};

exports.getHorasEntreDuasDatas = function (start, end) {
	var duration = moment.duration(end.diff(start));
	var segundos = duration.asHours();

	return segundos;
};

exports.getDiasEntreDuasDatas = function (start, end) {
	var duration = moment.duration(end.diff(start));
	var segundos = duration.asDays();

	return segundos;
};

exports.getHorasEntreDuasHoras = function (start, end, endNextDay, startNextDay) {
	var start = moment("2017-05-01 " + start);
	var end = moment("2017-05-01 " + end);

	if (startNextDay === true)
		start.add(1, 'days');

	if (endNextDay === true)
		end.add(1, 'days');

	var duration = moment.duration(end.diff(start));
	var hours = duration.asHours();
	return hours;
};

exports.getSegundosEntreDoisPosix = function (start, end) {
	return end - start;
};

function getDataFromPosixTime (posix, padrao) {
	var dateString = moment.unix(posix).tz("UTC").format(padrao ? padrao : DATA_HORA_PADRAO);
	return dateString;
};

exports.getDataFromPosixTime = getDataFromPosixTime;

exports.getDataFormatadaPorPadrao = function (d, padrao) {
	var m = moment(d);
	return m.format(padrao);
};

exports.getMomentPorPadrao = function (m, padrao) {
	return moment(m, padrao);
};

exports.parseDataPorPadrao = function (d, padrao) {
	return moment(d, padrao).toDate();
};

exports.getApenasDataFormatada = function (d) {
	var m = moment(d);
	return m.format("DD/MM/YYYY");
};

exports.getApenasDataAtual = function () {
	return moment(new Date(), "DD/MM/YYYY").format("DD/MM/YYYY");
};

exports.getDataFormatada = function (d) {
	var m = moment(d);
	return m.format("DD/MM/YYYY HH:mm:ss");
};

exports.getDateOnlyWithoutTimezone = function (d) {
	if (d) {
		var result = moment(d).format("YYYY-MM-DD HH:mm:ss");
		return result !== "Invalid date" ? result : null;
	} else {
		return null;
	}
};

exports.segundosParaTempo = function (segundos) {
	var time = moment.duration(segundos, "Seconds");
	return formatTime(time.get("Hours")) + ":" + formatTime(time.get("Minutes")) + ":" + formatTime(time.get("Seconds"));
};

exports.getDurationInUnit = function (valor, unit) {
	return moment.duration(valor, unit);
};

function formatTime (num) {
	return num > 9 ? num : "0" + num;
}

exports.formatTime = formatTime;

/**
 * Retorna uma string com o SQL que seria executado caso o método findAll
 * fosse chamado no model usando o queryOptions
 * @param {SequelizeModel} model modelo da tabela a ser consultada
 * @param {SequelizeQueryObject} queryOptions objeto de consulta
 */
exports.getSequelizeSelectSQL = function (model, queryOptions) {
	queryOptions.include = queryOptions.include || [];
	queryOptions.model = model;
	Model.$validateIncludedElements.bind(model)(queryOptions);
	return models.sequelize.dialect.QueryGenerator.selectQuery(model.tableName, queryOptions, model).slice(0, -1);
};

exports.minToDuration = function minToDuration (min, removeSeconds = false) {
	let hh = Math.floor(Math.abs(min) / 60).toString().padStart(2, '0');
	let mm = Math.floor(Math.abs(min) % 60).toString().padStart(2, '0');
	return `${min < 0 ? '-' : ''}${hh}:${mm}${removeSeconds ? "" : ":00"}`;
};

exports.maxDate = function maxDate (dateA, dateB) {
	if (!dateA && dateB)
		return dateB;

	if (!dateB && dateA)
		return dateA;

	if (moment(dateB) >= moment(dateA))
		return dateB;

	return dateA;
};

exports.minDate = function minDate (dateA, dateB) {
	if (!dateA && dateB)
		return dateB;

	if (!dateB && dateA)
		return dateA;

	if (moment(dateB) <= moment(dateA))
		return dateB;

	return dateA;
};

exports.formataTexto = function (str){
	return str
    .trim()
    .split(/\s+/)
    .map(word =>
      word.charAt(0).toUpperCase() +
      word.slice(1).toLowerCase()
    )
    .join(' ');
}
