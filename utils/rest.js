const crypto = require('crypto');

function getDefaultUpsert (model, idKey, trataResultado) {
	return function (req, res) {
		var params = req.body;
		if (!params[idKey]) {
			// Inserção
			model.create(params).then(function (ret) {
				res.status(201).json(ret);
			}).catch(function (e) {
				trataErro(e, res);
			});
		} else {
			// Atualização
			model.update(params, {
				where: { [idKey]: params[idKey] }
			}).then(function (ret) {
				if (trataResultado)
					ret = trataResultado(params, req);

				res.status(201).json(ret);
			}).catch(function (e) {
				trataErro(e, res);
			});
		}
	};
};

function getDefaultGet (model, order, include, trataResultado) {
	return function (req, res) {
		var param = req.query.id ? {where: {id: req.query.id}} : {where: {}};
		param = req.query.wh ? {where: JSON.parse(req.query.wh)} : param;
		if (order)
			param.order = order;
		if (include)
			param.include = include;
		if (req.query.limit)
			param.limit = req.query.limit;

		model.findAll(param).then(function (ret) {
			if (trataResultado)
				ret = trataResultado(ret);

			res.json(ret);
		}).catch(function (e) {
			trataErro(e, res);
		});
	};
};

function trataErro (e, res) {
	var msg = e;
	if (typeof e === "object") {
		msg = e.message;
		console.log(msg);
		console.log(e.stack);
	}

	res.status(500).json({message: msg});
};

async function generateShortCode() {
    return code = crypto.randomBytes(4).toString('hex');
}

module.exports = { getDefaultUpsert, getDefaultGet, generateShortCode };
