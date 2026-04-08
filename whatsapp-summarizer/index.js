const express = require('express');
const path = require('path');

// Servidor do frontend
const app = express();
const port = 3000;

// Servir arquivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Rota raiz do frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar o servidor do frontend
app.listen(port, () => {
  console.log(`Frontend rodando em http://localhost:${port}`);
});

// Servidor do backend (WhatsApp)
const backendApp = express();
const backendPort = 3001;

backendApp.get('/health', (req, res) => {
  res.status(200).send('Backend está rodando');
});

backendApp.listen(backendPort, () => {
  console.log(`Backend rodando em http://localhost:${backendPort}`);
});