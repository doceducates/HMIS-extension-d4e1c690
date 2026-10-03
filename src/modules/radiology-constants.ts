/**
 * HMIS Punjab Radiology Procedure Modules and Template Remarks
 * Verified against live HMIS Lahore General Hospital deployment.
 */

export interface HmisModuleOption {
  value: string;
  text: string;
}

export const HMIS_CT_MODULE_OPTIONS: HmisModuleOption[] = [
  { value: '803', text: 'CT BRAIN' },
  { value: '804', text: 'CT ORBIT' },
  { value: '805', text: 'CT ABDOMEN AND PELVIS' },
  { value: '806', text: 'CT CHEST' },
  { value: '807', text: 'CT KUB' },
  { value: '808', text: 'CT RENAL PROTOCOL' },
  { value: '809', text: 'CT NECK' },
  { value: '810', text: 'CT FACIAL BONES' },
  { value: '811', text: 'CT PNS' },
  { value: '812', text: 'CTPA' },
  { value: '813', text: 'HRCT CHEST' },
  { value: '814', text: 'CT ABDOMEN' },
  { value: '815', text: 'CT UPPER LIMB' },
  { value: '816', text: 'CT LOWER LIMB' },
  { value: '817', text: 'CT RENAL' },
  { value: '818', text: 'CT CERVICAL SPINE' },
  { value: '819', text: 'CT LUMBAR SPINE' },
  { value: '820', text: 'CT HRCT TEMPORAL BONE' },
  { value: '821', text: 'CT PELVIS' },
  { value: '822', text: 'CT FACE' },
  { value: '825', text: 'MLC CT SCAN 3D' },
];

export interface ActiveInvestigationDetails {
  patientName: string;
  mrn: string;
  age?: string;
  gender?: string;
  cnic?: string;
  contact?: string;
  visitToken?: string;
  investigationId?: string;
  studyId?: string;
  moduleId?: string;
  moduleName?: string;
  existingHistory?: string;
  existingReport?: string;
  existingImpression?: string;
  comments?: string;
  isModalOpen: boolean;
}

export interface PathologyHistoryItem {
  id?: string;
  date?: string;
  department: 'Pathology' | 'Radiology' | 'Other';
  testName: string;
  resultSummary?: string;
  reportedBy?: string;
  status?: string;
}
