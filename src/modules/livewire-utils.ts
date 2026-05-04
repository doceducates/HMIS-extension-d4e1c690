/**
 * Utilities for interacting specifically with Laravel Livewire components.
 * Livewire uses Alpine.js internally and requires proper event dispatching.
 */

/**
 * Sets a value on an input element and triggers the events Livewire needs to detect the change.
 */
export function setLivewireInput(element: HTMLInputElement | HTMLSelectElement, value: string) {
    element.value = value;
    // Dispatch input to update Alpine.js model
    element.dispatchEvent(new Event('input', { bubbles: true }));
    // Dispatch change to trigger Livewire component update
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Triggers a click on a Livewire-bound button, simulating user action.
 * Iterates through matches and clicks the first VISIBLE one to avoid clicking
 * buttons inside hidden tabs (e.g. multiple "Save" buttons on different tabs).
 */
export function clickLivewireElement(selector: string): boolean {
    const elements = document.querySelectorAll(selector);
    for (const el of Array.from(elements)) {
        const htmlEl = el as HTMLElement;
        // offsetParent is null when the element or its parent is display:none
        if (htmlEl.offsetParent !== null) {
            htmlEl.click();
            return true;
        }
    }
    
    // Fallback if none are considered visible (e.g. fixed positioning edge case)
    if (elements.length > 0) {
        (elements[0] as HTMLElement).click();
        return true;
    }
    return false;
}

/**
 * Waits for the Livewire loading indicator to disappear before proceeding.
 * Useful after clicking a submit button or changing a dropdown.
 */
import { WorkflowState } from './state';

export function waitForLivewire(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve) => {
        const start = Date.now();
        
        const checkLoading = () => {
            if (WorkflowState.isStopped) return resolve();
            
            // Livewire 2 typical loading indicators
            const loadingElements = document.querySelectorAll('[wire\\:loading], #wireLoadingBar, .livewire-loading');
            
            // Filter to only those actually visible on screen
            const visibleLoaders = Array.from(loadingElements).filter(el => {
                return (el as HTMLElement).offsetParent !== null;
            });

            if (visibleLoaders.length === 0) {
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                console.warn('Livewire wait timeout exceeded');
                resolve(); // resolve anyway to avoid completely hanging the workflow
            } else {
                setTimeout(checkLoading, 150);
            }
        };
        
        // Give Livewire a tiny bit of time to *start* loading first
        setTimeout(checkLoading, 100);
    });
}

/**
 * Wait for an element to appear in the DOM (useful for async Livewire components).
 */
export function waitForElement(selector: string, timeoutMs: number = 10000): Promise<Element | null> {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeoutMs);
    });
}

/**
 * Reusable toast notification system for visual progress updates.
 */
export function showToast(msg: string, isError = false) {
    const statusDiv = document.createElement('div');
    const bgColor = isError ? '#ef4444' : '#22c55e';
    const icon = isError ? '⚠️' : '🤖';
    statusDiv.style.cssText = `position: fixed; bottom: 20px; right: 20px; padding: 15px; background: ${bgColor}; color: white; font-weight: bold; border-radius: 8px; z-index: 10000; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: opacity 0.5s; font-family: sans-serif; font-size: 14px;`;
    statusDiv.innerText = `${icon} ${msg}`;
    document.body.appendChild(statusDiv);
    
    setTimeout(() => {
        statusDiv.style.opacity = '0';
        setTimeout(() => {
            if(statusDiv.parentNode) statusDiv.parentNode.removeChild(statusDiv);
        }, 500);
    }, 3500);
}
