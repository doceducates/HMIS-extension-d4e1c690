/**
 * HMIS Selectors - Centralized for easy maintenance
 *
 * Verified against live HMIS DOM on 2026-04-25.
 * See docs/hmis-reference.md for full verification details.
 */
export const HMIS_SELECTORS = {
    // 1. Login Page
    LOGIN: {
        HOSPITAL_SELECT: '#hospitalId',
        USERNAME_INPUT: '#username',
        PASSWORD_INPUT: '#password',
        CAPTCHA_NUM1: 'input[name="num1"]',
        CAPTCHA_NUM2: 'input[name="num2"]',
        CAPTCHA_ANSWER: 'input[name="user_answer"]',
        SUBMIT_BTN: 'button[type="submit"]',
        ERROR_BANNER: '.alert.alert-danger, .alert.alert-warning, .text-danger',
        VALIDATION_ERROR: '.invalid-feedback, .error-message'
    },

    // 2. Department / Role Settings
    DEPARTMENT: {
        DEPT_SELECT: 'select[wire\\:model\\.defer="departmentId"]',
        CLINIC_SELECT: 'select[wire\\:model\\.defer="clinicId"]',
        NEXT_BTN: 'button[wire\\:click="loadDepartment"]'
    },

    // 3. Dashboard (Token Listing) — ✅ Verified
    DASHBOARD: {
        PATIENT_TABLE: '.right_col table tbody',
        ANY_PATIENT_LINK: 'a[id^="tokenPatButton_"], a[id^="tokenArrowButton_"]',
        // Token call button — HMIS uses <a id="newPatientBtn">, not a wire:click button
        REFRESH_BTN: '#newPatientBtn, a[id="newPatientBtn"]',
        EMPTY_QUEUE_INDICATOR: '.dataTables_empty'
    },

    // 4. Patient Side Menu
    // ⚠️ HMIS sidebar links use href="javascript:void(0)" with wire:click.
    // href*= selectors DO NOT WORK. navigateToTab() uses findByText() as
    // the reliable fallback — these CSS selectors are best-effort only.
    SIDE_MENU: {
        // Text labels to match via findByText() (used by navigateToTab fallback)
        SUMMARY_TEXT: 'Summary',
        COMPLAINTS_TEXT: 'Complaints',
        DIAGNOSIS_TEXT: 'Diagnosis',
        ORDER_TEXT: 'Order',
        INVESTIGATION_SUBTAB: '#order-investigation-tab'
    },

    // 5. Form Elements
    COMPLAINT: {
        DROPDOWN: 'button.dropdown-toggle[title="Select Complaint"]',
        DROPDOWN_SEARCH: '.bs-searchbox input',
        SAVE_BTN: 'button.btn-teal2'
    },
    DIAGNOSIS: {
        TYPE_SELECT: 'select.sl_template1',
        QUERY_INPUT: 'input.form-input.sl_template2[placeholder="Search Diagnosis..."]',
        LIST_ITEM: 'a.list-item',
        SAVE_BTN: 'button.btn-teal2'
    },
    INVESTIGATION: {
        QUERY_INPUT: 'input.form-input.sl_template2[placeholder="Search CPT..."]',
        LIST_ITEM: 'a.list-item',
        SAVE_BTN: 'button.btn-teal2'
    },

    // 6. Checkout & Navigation — ✅ Verified
    NAV: {
        CHECKOUT_BTN: '.btn-patient-checkout',
        HOME_BTN: 'a[href*="resetTokenHomeButton"]',
        SWITCH_ROLE: '.login-roles-list .dropdown-toggle',
        ROLE_OPD_ID: '1073'
    },

    // 7. Summary Extraction — Fixed: added col-md-6 containers
    SUMMARY: {
        CARDS: '.card, .panel, .section, .col-md-6',
        CARD_HEADER: 'h4, h5, h6, .card-header, strong, .section-title',
        ITEM_TEXT: 'p, li, span, .item-text, .summary-item'
    },

    // 8. Patient Demographics & Info
    // ⚠️ HMIS does NOT use dedicated classes for patient info fields.
    // Patient info is in a flat text bar: "Name: X | MRN: Y | Age: Z"
    // The INFO_BAR selector targets the container; extraction uses regex.
    PATIENT_INFO: {
        INFO_BAR: '.x_content, .patient-info-bar, [class*="patient"]',
    },

    // 9. Vitals Section
    VITALS: {
        CONTAINER: '.vitals-card, [class*="vital"], .vitals-section',
        BP: '.vitals-bp, [class*="blood"], [class*="bp"]',
        PULSE: '.vitals-pulse, [class*="pulse"], .heart-rate',
        TEMP: '.vitals-temp, [class*="temp"], .temperature',
        WEIGHT: '[class*="weight"], .patient-weight'
    },

    // 10. Clinical Data Sections
    CLINICAL: {
        COMPLAINTS: '#complaints-component, [class*="complaint"], .complaints-section',
        MEDICATIONS: '#medication-component, [class*="medicine"], .medications-section',
        ALLERGIES: '[class*="allergy"], .alert-danger, .allergies-section'
    },

    // 11. Radiology Reporting & Cross-Sectional Form (Verified via Live HMIS DOM & Trace)
    RADIOLOGY_REPORT: {
        // Modal / Container
        MODAL_CONTAINER: '#AddSampleResult',
        MODULE_SELECT: '#changeModule, select[wire\\:model="moduleId"]',
        
        // Template Selection Pickers (Live wireModel bindings)
        TEMPLATE_REMARKS_HISTORY: 'select[wire\\:model*="radiology_template_remarks"][wire\\:model*="1758"]',
        TEMPLATE_REMARKS_REPORT: 'select[wire\\:model*="radiology_template_remarks"][wire\\:model*="1759"]',
        TEMPLATE_REMARKS_IMPRESSION: 'select[wire\\:model*="radiology_template_remarks"][wire\\:model*="1760"]',
        TEMPLATE_SELECT_REPORT: 'select[wire\\:model*="radiology_template_remarks"]',
        
        // TinyMCE Editor Iframes
        HISTORY_IFRAME: 'iframe[id*="_history_"][id$="_ifr"]',
        REPORT_IFRAME: 'iframe[id*="_report_"][id$="_ifr"]',
        IMPRESSION_IFRAME: 'iframe[id*="_impression_"][id$="_ifr"]',
        
        // Native Textareas with verified wire:model and dynamic IDs
        HISTORY_TEXTAREA: 'textarea[id*="_history_"], textarea[wire\\:model*="_history"]',
        REPORT_TEXTAREA: 'textarea[id*="_report_"], textarea[wire\\:model*="_report"]',
        IMPRESSION_TEXTAREA: 'textarea[id*="_impression_"], textarea[wire\\:model*="_impression"]',
        TECHNIQUE_INPUT: 'input[name*="technique"], textarea[name*="technique"]',
        COMMENTS_TEXTAREA: '#comments, textarea[wire\\:model="comments"]',
        
        // Action Buttons
        SAVE_DRAFT_BTN: 'button[wire\\:click="save(\'save\')"]',
        SUBMIT_FINAL_BTN: 'button[wire\\:click="save(\'submit\')"]', // Locked for clinical testing
        CLOSE_MODAL_BTN: '#btn_closeAddAccessionResult',
        PATIENT_HISTORY_BTN: 'a[wire\\:click*="patientHistoryModal"], button[wire\\:click*="patientHistoryModal"]',
        IMAGE_STUDIES_BTN: 'a[wire\\:click*="getPatientStudies"], button[wire\\:click*="getPatientStudies"]',
        REJECT_BTN: 'a[wire\\:click*="patient_investigation_id"], button[wire\\:click*="patient_investigation_id"]',
        ADD_HISTORY_BTN: 'a[wire\\:click*="Addhistory"], button[wire\\:click*="Addhistory"]',
        ADD_VITALS_BTN: 'a[wire\\:click*="Addvital"], button[wire\\:click*="Addvital"]',
        
        // History Modal & Tables
        PATIENT_HISTORY_MODAL: '#patientHistoryModal, div[id*="patientHistory"], .modal.show',
        PATIENT_HISTORY_TABLES: '#patientHistoryModal table, .modal.show table',
        PATIENT_HISTORY_CLOSE: '#patientHistoryModal .close, #patientHistoryModal .btn-close, .modal.show button.btn-secondary',
        
        // Patient Worklist / Search on /radiology/proceeded-patients & tracking
        SEARCH_MRN: 'input[wire\\:model\\.defer="searchMrn"], input[wire\\:model\\.defer="searchFilters.mrn"], input[placeholder*="MRN" i]',
        SEARCH_ACCESSION: 'input[wire\\:model\\.defer="searchAccession"], input[wire\\:model\\.defer="searchFilters.accession"], input[placeholder*="Accession" i]',
        SEARCH_BTN: 'button[wire\\:click="searchRecords"], button.btn-theme-green, button:has-text("Search")',
        RESET_SEARCH_BTN: 'button[wire\\:click="clearSearch"], button.reset-bth',
        TIME_FILTER_SELECT: 'select[wire\\:model="time_list"], select[name="time_list"]',
        ADD_RESULT_BTN: 'a[wire\\:click*="addSampleResult"], button[wire\\:click*="addSampleResult"], a:has-text("Add Result")'
    }
};
