export type TabId =
  | 'tab-arch'
  | 'tab-bode'
  | 'tab-foc'
  | 'tab-pend'
  | 'tab-models'
  | 'tab-cadpcb'
  | 'tab-project'
  | 'tab-req'
  | 'tab-sysid'
  | 'tab-eskf'
  | 'tab-links'
  | 'tab-board'
  | 'tab-pyodide'
  | 'tab-placement'
  | 'tab-studio';

export interface TourStep {
  tab: TabId;
  targetId: string | null;
  title: string;
  desc: string;
  preset?: () => void;
  enter?: () => void;
}
