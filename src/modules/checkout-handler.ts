/**
 * Checkout Handler — Automates patient checkout and navigation back to queue.
 *
 * VERIFIED CHECKOUT FLOW (2026-05-04, TEHREEM AKHTAR):
 *   1. Click `.btn-patient-checkout` (green "Check Out" button, top-right)
 *   2. HMIS validates: if no diagnosis entered this visit, shows a red toast
 *      "Please fill data against Diagnosis section." — NO popup appears.
 *   3. If validation passes: SweetAlert2 popup appears:
 *        Title:   "Are you sure?"
 *        Confirm: `.swal2-confirm` (text: "Yes", green)
 *        Cancel:  `.swal2-cancel`  (text: "No",  red)
 *   4. Click `.swal2-confirm` → page redirects to /token/today
 *
 * RELEASE PATIENT TOKEN (error fallback):
 *   - Selector: `a[href*="resetTokenHomeButton"]`
 *   - No popup — instant redirect to /token/today
 */

import { HMIS_SELECTORS } from './selectors';
import { waitForLivewire } from './livewire-utils';
import { reportStatus } from './state';
import { delay, checkAbort, TIMING } from './utils';

const CHECKOUT_TOAST_ERROR_SELECTOR = '.toast-error, .alert-danger, .swal2-toast.swal2-show';

/**
 * Performs patient checkout with SweetAlert2 confirmation dialog support.
 *
 * Flow:
 *   1. Click checkout button
 *   2. Wait for either:
 *      - A validation error toast (bail out, throw so caller can release patient)
 *      - A SweetAlert2 popup (confirm it)
 *   3. After confirmation, navigate back to /token/today
 *
 * Throws if checkout fails (e.g. validation error), so caller can release patient.
 */
export async function performCheckout(): Promise<void> {
    reportStatus('Checking out patient...', 'progress');
    checkAbort();

    const checkoutBtn = document.querySelector(HMIS_SELECTORS.NAV.CHECKOUT_BTN) as HTMLElement;
    if (!checkoutBtn) {
        reportStatus('Checkout button not found — may already be checked out', 'info');
        return;
    }

    checkoutBtn.click();

    // Wait up to 4 seconds for either a validation error toast or the SweetAlert2 popup
    const confirmBtn = await waitForCheckoutPopupOrError(4000);

    if (!confirmBtn) {
        // Neither popup nor error appeared — assume checkout already completed or no popup needed
        reportStatus('No confirmation dialog appeared — assuming checkout complete', 'info');
        return;
    }

    // Click the SweetAlert2 "Yes" confirm button
    reportStatus('Confirming checkout dialog...', 'progress');
    confirmBtn.click();

    // The HMIS application automatically redirects to /token/today upon successful checkout.
    // We let the native navigation take over.
    reportStatus('Patient checkout complete ✓. Waiting for HMIS redirect...', 'success');
}

/**
 * Waits for the SweetAlert2 checkout confirmation popup OR a validation error toast.
 *
 * Returns:
 *   - The `.swal2-confirm` button element if the popup appeared → caller should click it
 *   - null if a validation error toast appeared (throws instead to signal failure)
 *   - null if timeout reached with nothing appearing
 *
 * Throws if a validation error toast is detected (so caller can trigger release).
 */
async function waitForCheckoutPopupOrError(timeoutMs: number): Promise<HTMLElement | null> {
    const pollInterval = 150;
    const maxAttempts = Math.floor(timeoutMs / pollInterval);

    for (let i = 0; i < maxAttempts; i++) {
        // Check for SweetAlert2 confirmation popup
        const swalConfirm = document.querySelector('.swal2-confirm') as HTMLElement | null;
        if (swalConfirm && swalConfirm.offsetParent !== null) {
            return swalConfirm;
        }

        // Check for validation error toast (no diagnosis filled)
        const errorToast = document.querySelector(
            '.toast-error, [class*="toast"][class*="error"], .swal2-toast.swal2-icon-error'
        ) as HTMLElement | null;
        if (errorToast && errorToast.offsetParent !== null) {
            const msg = errorToast.textContent?.trim() || 'Checkout validation failed';
            reportStatus(`Checkout blocked: ${msg}`, 'error');
            throw new Error(`Checkout blocked by HMIS validation: ${msg}`);
        }

        // Also check for red alert banners (HMIS sometimes shows inline errors)
        const inlineError = document.querySelector('.alert-danger, .alert.alert-danger') as HTMLElement | null;
        if (inlineError && inlineError.offsetParent !== null) {
            const msg = inlineError.textContent?.trim() || 'Checkout validation error';
            reportStatus(`Checkout blocked: ${msg}`, 'error');
            throw new Error(`Checkout blocked: ${msg}`);
        }

        await new Promise(r => setTimeout(r, pollInterval));
    }

    return null; // Timeout — nothing appeared
}

/**
 * Releases the patient token (error fallback — does NOT require a diagnosis).
 * Navigates directly to the release URL, no popup appears.
 */
export async function releasePatientToken(): Promise<void> {
    checkAbort();

    const releaseBtn = document.querySelector(
        'a[href*="resetTokenHomeButton"], .btn-release-token'
    ) as HTMLAnchorElement | null;

    if (!releaseBtn) {
        reportStatus('Release token button not found — navigating to queue directly', 'warning');
        window.location.href = '/token/today';
        return;
    }

    reportStatus('Releasing patient token...', 'progress');
    window.location.href = releaseBtn.href;
}