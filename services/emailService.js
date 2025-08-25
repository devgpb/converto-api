const path = require('path');
const ejs = require('ejs');
const { sendMail } = require('../utils/email');

const sendTemplate = async (to, subject, templateName, data = {}) => {
  const templatePath = path.join(__dirname, '..', 'templates', 'email', `${templateName}.ejs`);
  const html = await ejs.renderFile(templatePath, data);
  await sendMail(to, subject, undefined, html);
};

const sendPasswordResetEmail = async (user, link) => {
  await sendTemplate(
    user.email,
    'Recuperação de Senha',
    'passwordReset',
    { name: user.name || 'Usuário', link }
  );
};

module.exports = { sendPasswordResetEmail };
