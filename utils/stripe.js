const Stripe = require('stripe');
require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = stripe;

