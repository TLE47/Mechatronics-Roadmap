/**
 * The project's shared vocabularies (`app/src/projectVocabulary.ts`).
 *
 * A component's `category` is the capstone's own word and stays printed as written; its `kind` is
 * the shared bucket a view groups by, so a second project with different BOM categories still sorts
 * into the same labels. Requirements have their own buckets for the same reason.
 *
 * These tables hold no objects and import nothing: `projectKinds.ts` is what ties a vocabulary to
 * an object kind, and `projectModel.ts` re-exports them for the readers that already use them.
 */

export type ComponentKind =
  | 'mcu'
  | 'driver'
  | 'power'
  | 'sensor'
  | 'interface'
  | 'supply'
  | 'protection'
  | 'passive'
  | 'other';

interface ComponentKindMeta {
  id: ComponentKind;
  label: string;
}

export const COMPONENT_KINDS: readonly ComponentKindMeta[] = [
  { id: 'mcu', label: 'Microcontroller' },
  { id: 'driver', label: 'Gate driver' },
  { id: 'power', label: 'Power switch' },
  { id: 'sensor', label: 'Sensing' },
  { id: 'interface', label: 'Communications' },
  { id: 'supply', label: 'Power supply' },
  { id: 'protection', label: 'Protection' },
  { id: 'passive', label: 'Passive' },
  { id: 'other', label: 'Other' },
];

/**
 * The BOM category a line is filed under, mapped to the kind a view can group by. An unknown
 * category is `other` rather than an error: a new line must not break the app, and
 * `npm run test:project` is what fails when a category has no kind yet.
 */
const CATEGORY_KIND: Readonly<Record<string, ComponentKind>> = {
  MCU: 'mcu',
  'Gate Driver': 'driver',
  'Power MOSFET': 'power',
  'Current Sense Amplifier': 'sensor',
  'Magnetic Encoder': 'sensor',
  'CAN-FD Transceiver': 'interface',
  'DC-DC Buck Converter': 'supply',
  'Low-Noise 3.3V LDO': 'supply',
  'STO Safety Gate Buffer': 'protection',
  'Kelvin Shunt Resistor': 'passive',
  'High-Freq Decoupling MLCC': 'passive',
  'Hybrid Polymer Bulk Cap': 'passive',
};

export function componentKind(category: string): ComponentKind {
  return CATEGORY_KIND[category] ?? 'other';
}

export type RequirementKind =
  | 'thermal'
  | 'electrical'
  | 'control'
  | 'sensing'
  | 'interface'
  | 'safety'
  | 'reliability'
  | 'budget';

export const REQUIREMENT_KINDS: readonly { id: RequirementKind; label: string }[] = [
  { id: 'thermal', label: 'Thermal' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'control', label: 'Control' },
  { id: 'sensing', label: 'Sensing' },
  { id: 'interface', label: 'Communications' },
  { id: 'safety', label: 'Safety' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'budget', label: 'Cost' },
];
