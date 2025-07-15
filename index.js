// backend/index.js (PRUEBA DE ARRANQUE MÍNIMA)
const express = require('express');
const app = express();

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.status(200).send('¡El servidor mínimo viable está funcionando!');
});

app.listen(PORT, () => {
  console.log(`✅ Servidor de prueba arrancado en el puerto ${PORT}. Si ves esto, el entorno es estable.`);
});