const express = require('express');
const router = express.Router();
const { register, login, me } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');


const loginLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1 min
  limit: 8,                     // v7+: usa "limit" (antes era "max")
  standardHeaders: 'draft-8',   // envia RateLimit-* padrão
  legacyHeaders: false,         // desativa X-RateLimit-*
  message: { error: 'Muitas tentativas. Tente novamente em 1 minuto.' },
  // opcional: só conta tentativas que falham (2xx/3xx não contam)
  skipSuccessfulRequests: true
})

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.get('/me', authenticateToken, me);

module.exports = router;

