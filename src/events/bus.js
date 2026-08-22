const EventEmitter = require('events');

class CockpitEventBus extends EventEmitter {}

// Create the singleton instance
const eventBus = new CockpitEventBus();

// Increase max listeners to support multiple concurrent SSE clients (e.g. multiple browser tabs)
eventBus.setMaxListeners(25);

module.exports = eventBus;
