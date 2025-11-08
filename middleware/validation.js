const validateTenantCreation = (req, res, next) => {
  const { name, email } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Nome da empresa é obrigatório' });
  }

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email válido é obrigatório' });
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateCheckoutCreation = (req, res, next) => {
  const { tenant_id, price_id, seatCountInicial, success_url, cancel_url } = req.body;

  if (!tenant_id || typeof tenant_id !== 'string') {
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  if (!price_id || typeof price_id !== 'string') {
    return res.status(400).json({ error: 'price_id é obrigatório' });
  }

  if (!seatCountInicial || !Number.isInteger(seatCountInicial) || seatCountInicial < 1) {
    return res.status(400).json({ error: 'seatCountInicial deve ser um número inteiro positivo' });
  }

  if (!success_url || typeof success_url !== 'string' || !isValidUrl(success_url)) {
    return res.status(400).json({ error: 'success_url deve ser uma URL válida' });
  }

  if (!cancel_url || typeof cancel_url !== 'string' || !isValidUrl(cancel_url)) {
    return res.status(400).json({ error: 'cancel_url deve ser uma URL válida' });
  }

  next();
};

const validateSeatSync = (req, res, next) => {
  const { tenant_id } = req.body;

  if (!tenant_id || typeof tenant_id !== 'string') {
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  next();
};

const validatePortalRequest = (req, res, next) => {
  const { tenant_id } = req.body;

  if (!tenant_id || typeof tenant_id !== 'string') {
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  next();
};

const validateReactivationRequest = (req, res, next) => {
  const { tenant_id, success_url, cancel_url, price_id, seatCountInicial } = req.body;

  if (!tenant_id || typeof tenant_id !== 'string') {
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  if (!success_url || typeof success_url !== 'string' || !isValidUrl(success_url)) {
    return res.status(400).json({ error: 'success_url deve ser uma URL válida' });
  }

  if (!cancel_url || typeof cancel_url !== 'string' || !isValidUrl(cancel_url)) {
    return res.status(400).json({ error: 'cancel_url deve ser uma URL válida' });
  }

  if (price_id && typeof price_id !== 'string') {
    return res.status(400).json({ error: 'price_id deve ser uma string válida' });
  }

  if (seatCountInicial !== undefined) {
    const seatCountNumber = Number(seatCountInicial);
    if (!Number.isInteger(seatCountNumber) || seatCountNumber < 1) {
      return res.status(400).json({ error: 'seatCountInicial deve ser um número inteiro positivo' });
    }
    req.body.seatCountInicial = seatCountNumber;
  }

  next();
};

// Funções auxiliares
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  validateTenantCreation,
  validateCheckoutCreation,
  validateSeatSync,
  validatePortalRequest,
  validateReactivationRequest
};
