export type TabId =
  | 'tab-arch'
  | 'tab-bode'
  | 'tab-foc'
  | 'tab-pend'
  | 'tab-models'
  | 'tab-cadpcb'
  | 'tab-sysid'
  | 'tab-eskf'
  | 'tab-links'
  | 'tab-pyodide'
  | 'tab-placement';

export interface TourStep {
  tab: TabId;
  targetId: string | null;
  title: string;
  desc: string;
  preset?: () => void;
  enter?: () => void;
}

export interface BomItem {
  refDes: string;
  mpn: string;
  functionDesc: string;
  rating: string;
}
