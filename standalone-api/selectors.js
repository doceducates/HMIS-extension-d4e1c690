/**
 * CSS Selectors for Portal Automation (Playwright & Headless Worker)
 * Verified against live HMIS Lahore General Hospital deployment.
 */
module.exports = {
    LOGIN: {
        HOSPITAL_SELECT: '#hospitalId',
        USERNAME_INPUT: '#username',
        PASSWORD_INPUT: '#password',
        CAPTCHA_NUM1: 'input[name="num1"]',
        CAPTCHA_NUM2: 'input[name="num2"]',
        CAPTCHA_ANSWER: 'input[name="user_answer"]',
        SUBMIT_BTN: 'button[type="submit"]',
        ERROR_BANNER: '.alert.alert-danger, .alert.alert-warning, .text-danger'
    },
    DEPARTMENT: {
        DEPT_SELECT: 'select[wire\\:model\\.defer="departmentId"]',
        CLINIC_SELECT: 'select[wire\\:model\\.defer="clinicId"]',
        NEXT_BTN: 'button[wire\\:click="loadDepartment"]'
    },
    DASHBOARD: {
        PATIENT_TABLE: '.right_col table tbody',
        ANY_PATIENT_LINK: 'a[id^="tokenPatButton_"], a[id^="tokenArrowButton_"]',
        REFRESH_BTN: '#newPatientBtn, a[id="newPatientBtn"]',
        EMPTY_QUEUE_INDICATOR: '.dataTables_empty'
    },
    NAV: {
        CHECKOUT_BTN: '.btn-patient-checkout',
        SWITCH_ROLE: '.login-roles-list .dropdown-toggle',
    },
    RADIOLOGY: {
        WORKLIST_URL: '/radiology/proceeded-patients',
        TRACKING_URL: '/radiology/tracking-list',
        PUBLISHED_URL: '/radiology/published-reports',
        COMBINE_RESULT_URL: '/radiology/combine-add-result',

        // Search inputs & triggers
        SEARCH_MRN: 'input[wire\\:model\\.defer="searchMrn"], input[wire\\:model\\.defer="searchFilters.mrn"], input[placeholder*="MRN" i]',
        SEARCH_ACCESSION: 'input[wire\\:model\\.defer="searchAccession"], input[wire\\:model\\.defer="searchFilters.accession"], input[placeholder*="Accession" i]',
        SEARCH_BTN: 'button[wire\\:click="searchRecords"], button.btn-theme-green, button:has-text("Search")',
        RESET_SEARCH_BTN: 'button[wire\\:click="clearSearch"], button.reset-bth',
        TIME_FILTER_SELECT: 'select[wire\\:model="time_list"], select[name="time_list"]',

        // Worklist Table & Actions
        PATIENT_TABLE_ROWS: '.right_col table tbody tr, table tbody tr',
        ADD_RESULT_BTN: 'a[wire\\:click*="addSampleResult"], button[wire\\:click*="addSampleResult"], a:has-text("Add Result")',
        PATHOLOGY_HISTORY_BTN: 'a[wire\\:click*="history("], a:has-text("Pathology History")',
        ACCESSION_LINK: 'a[href*="accession="]',
        MRN_LINK: 'a[href*="combine-add-result"][href*="mrn="]',
        
        // Modal & Module Select
        MODAL_CONTAINER: '#AddSampleResult',
        MODULE_SELECT: '#changeModule',
        
        // PACS & History triggers inside modal
        PACS_STUDIES_BTN: 'a[wire\\:click*="getPatientStudies"]',
        PATIENT_HISTORY_MODAL_BTN: 'a[wire\\:click*="patientHistoryModal"]',
        ADD_HISTORY_BTN: 'a[wire\\:click*="Addhistory"]',
        ADD_VITALS_BTN: 'a[wire\\:click*="Addvital"]',

        // TinyMCE Iframes
        HISTORY_IFRAME: 'iframe[id*="_history_"][id$="_ifr"]',
        REPORT_IFRAME: 'iframe[id*="_report_"][id$="_ifr"]',
        IMPRESSION_IFRAME: 'iframe[id*="_impression_"][id$="_ifr"]',
        
        // Native Textareas
        HISTORY_TEXTAREA: 'textarea[id*="_history_"]',
        REPORT_TEXTAREA: 'textarea[id*="_report_"]',
        IMPRESSION_TEXTAREA: 'textarea[id*="_impression_"]',
        COMMENTS_TEXTAREA: '#comments',
        
        // Template Selection Pickers (Livewire model)
        TEMPLATE_REMARKS_REPORT: 'select[wire\\:model*="radiology_template_remarks"]',
        
        // Action Buttons
        SAVE_DRAFT_BTN: 'button[wire\\:click="save(\'save\')"]',
        SUBMIT_FINAL_BTN: 'button[wire\\:click="save(\'submit\')"]', // LOCKED FOR CLINICAL TESTING
        CLOSE_MODAL_BTN: '#btn_closeAddAccessionResult',
        
        // Confirmation banners
        ALERT_SUCCESS: '.alert-success, .swal2-success, .toast-success, .alert:has-text("successfully")',
        ALERT_ERROR: '.alert-danger, .swal2-error, .toast-error, .alert:has-text("error")'
    }
};
