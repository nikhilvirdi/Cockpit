// js/sse.js — single shared SSE connection

let eventSource = null;
const listeners = new Map(); // eventType -> Set of callback functions

export function connect() {
    if (eventSource) return; // already connected
    eventSource = new EventSource('/api/events');

    const eventTypes = ['log:new', 'process:snapshot', 'service:statusChanged', 
                         'file:changed', 'command:output'];

    eventTypes.forEach(type => {
        eventSource.addEventListener(type, (e) => {
            const payload = JSON.parse(e.data);
            const callbacks = listeners.get(type);
            if (callbacks) {
                callbacks.forEach(cb => cb(payload));
            }
        });
    });

    eventSource.onerror = () => {
        // Browser's EventSource auto-reconnects on its own; just reflect 
        // connection state visually via the status bar indicator.
        updateConnectionIndicator(false);
    };
    eventSource.onopen = () => {
        updateConnectionIndicator(true);
    };
}

export function disconnect() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
        updateConnectionIndicator(false);
    }
}

export function on(eventType, callback) {
    if (!listeners.has(eventType)) listeners.set(eventType, new Set());
    listeners.get(eventType).add(callback);
}

export function off(eventType, callback) {
    listeners.get(eventType)?.delete(callback);
}

function updateConnectionIndicator(connected) {
    const el = document.getElementById('status-right');
    if (el) el.textContent = connected ? '●' : '○';
}
