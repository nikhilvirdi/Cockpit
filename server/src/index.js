const express = require('express');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Placeholder route for Cockpit server skeleton
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Cockpit server skeleton is running' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
