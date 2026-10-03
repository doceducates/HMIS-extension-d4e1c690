/**
 * Rad Suite Main-World Bridge for Punjab HMIS
 *
 * Runs in Chrome MV3 "MAIN" execution world. Has direct synchronous access
 * to window.tinymce and window.Livewire inside hmis.punjab.gov.pk.
 */

interface SetReportDetail {
  technique?: string;
  findings: string;
  impression: string;
  clinicalHistory?: string;
  comments?: string;
  moduleId?: string;
}

(function initMainWorldBridge() {
  console.log('⚡ [Rad Suite] Main World Bridge active on HMIS.');

  window.addEventListener('RAD_SUITE_SET_REPORT', (e: any) => {
    const detail: SetReportDetail = e.detail;
    if (!detail) return;

    let updatedCount = 0;
    const tinymce = (window as any).tinymce;
    const livewire = (window as any).Livewire;

    // 1. Direct TinyMCE instance sync
    if (tinymce && tinymce.editors && tinymce.editors.length > 0) {
      tinymce.editors.forEach((ed: any) => {
        const id = (ed.id || '').toLowerCase();
        try {
          if (id.includes('report') && detail.findings) {
            let fullReport = '';
            if (detail.technique) {
              fullReport += `<p><strong>TECHNIQUE:</strong><br>${detail.technique}</p>`;
            }
            fullReport += `<p><strong>FINDINGS:</strong></p>${detail.findings}`;
            ed.setContent(fullReport);
            ed.save();
            updatedCount++;
          } else if (id.includes('impression') && detail.impression) {
            ed.setContent(`<p><strong>IMPRESSION:</strong></p>${detail.impression}`);
            ed.save();
            updatedCount++;
          } else if (id.includes('history') && detail.clinicalHistory) {
            ed.setContent(`<p>${detail.clinicalHistory}</p>`);
            ed.save();
            updatedCount++;
          }
        } catch (err) {
          console.warn('[Rad Suite Main World] Error updating editor ' + id, err);
        }
      });
    }

    // 2. Direct Livewire component sync
    if (livewire) {
      try {
        const modalContainer = document.querySelector('#AddSampleResult');
        const wireEl = modalContainer?.closest('[wire\\:id]') || document.querySelector('[wire\\:id]');
        const wireId = wireEl?.getAttribute('wire:id');
        const component = wireId ? livewire.find(wireId) : null;

        if (component) {
          // Find textareas with wire:model bindings
          const textareas = document.querySelectorAll<HTMLTextAreaElement>('#AddSampleResult textarea[wire\\:model]');
          textareas.forEach((ta) => {
            const wireModel = ta.getAttribute('wire:model');
            const id = (ta.id || '').toLowerCase();
            if (!wireModel) return;

            if (id.includes('report') && detail.findings) {
              component.set(wireModel, detail.findings);
            } else if (id.includes('impression') && detail.impression) {
              component.set(wireModel, detail.impression);
            } else if (id.includes('history') && detail.clinicalHistory) {
              component.set(wireModel, detail.clinicalHistory);
            }
          });
        }
      } catch (lwErr) {
        console.warn('[Rad Suite Main World] Error syncing Livewire component:', lwErr);
      }
    }

    // Notify completion
    window.dispatchEvent(
      new CustomEvent('RAD_SUITE_SET_REPORT_DONE', {
        detail: { success: updatedCount > 0, updatedCount },
      })
    );
  });
})();
