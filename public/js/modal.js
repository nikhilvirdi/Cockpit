// public/js/modal.js — Reusable 98.css Modal and Toast notification helpers
import { escapeHtml } from './utils.js';

let activeModal = null;

/**
 * Displays a 98.css styled modal dialog.
 * @param {Object} options
 * @param {string} options.title - Title bar text
 * @param {string} options.contentHtml - HTML content for window-body
 * @param {Array<{ label: string, onClick?: (modal: Object) => void, primary?: boolean }>} [options.buttons] - Action buttons
 * @param {number|string} [options.width] - Optional modal width
 * @returns {{ close: () => void, element: HTMLElement }}
 */
export function showModal({ title, contentHtml, buttons = [{ label: 'OK', primary: true }], width = '420px' }) {
    if (activeModal) {
        activeModal.close();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 1000; display: flex; align-items: center; justify-content: center;';

    const windowEl = document.createElement('div');
    windowEl.className = 'window';
    windowEl.style.cssText = `width: ${typeof width === 'number' ? width + 'px' : width}; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 2px 2px 10px rgba(0,0,0,0.5);`;

    windowEl.innerHTML = `
        <div class="title-bar">
            <div class="title-bar-text">${escapeHtml(title)}</div>
            <div class="title-bar-controls">
                <button aria-label="Close" class="modal-close-btn"></button>
            </div>
        </div>
        <div class="window-body" style="margin: 0; padding: 8px; display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 8px;">
            <div class="modal-content" style="flex: 1; min-height: 0; overflow: auto; font-size: 11px;">
                ${contentHtml}
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px;">
                <!-- buttons injected below -->
            </div>
        </div>
    `;

    const closeBtn = windowEl.querySelector('.modal-close-btn');
    const footer = windowEl.querySelector('.modal-footer');

    const modalObj = {
        element: windowEl,
        backdrop,
        close: () => {
            if (backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
            }
            if (activeModal === modalObj) {
                activeModal = null;
            }
        }
    };

    closeBtn.addEventListener('click', () => modalObj.close());
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            modalObj.close();
        }
    });

    buttons.forEach(btnConfig => {
        const btn = document.createElement('button');
        btn.textContent = btnConfig.label;
        btn.style.minWidth = '65px';
        if (btnConfig.primary) {
            btn.style.fontWeight = 'bold';
        }
        btn.addEventListener('click', () => {
            if (typeof btnConfig.onClick === 'function') {
                btnConfig.onClick(modalObj);
            } else {
                modalObj.close();
            }
        });
        footer.appendChild(btn);
    });

    backdrop.appendChild(windowEl);
    document.body.appendChild(backdrop);
    activeModal = modalObj;

    return modalObj;
}

/**
 * Displays a temporary 98.css styled toast message in the bottom-right corner.
 * @param {string} message 
 * @param {number} [duration=3000] 
 */
export function showToast(message, duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 26px; right: 8px; z-index: 2000; display: flex; flex-direction: column; gap: 4px; pointer-events: none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'window';
    toast.style.cssText = 'padding: 6px 12px; font-size: 11px; font-weight: bold; background: #ffffcc; border: 1px solid #808080; box-shadow: 2px 2px 5px rgba(0,0,0,0.3); pointer-events: auto;';
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, duration);
}
