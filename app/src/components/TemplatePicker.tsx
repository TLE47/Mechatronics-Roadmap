import { MODE_LABEL } from '../workflow.ts';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../workflowTemplates.ts';

/**
 * The two palettes of ready-made flows (`components/TemplatePicker.tsx`).
 *
 * A template is a starting shape to edit, never a fixed answer. Whether choosing one needs a
 * replace confirmation is the panel's question, because only the panel knows what is already drawn.
 */
export function TemplatePicker({ onChoose }: { onChoose: (template: WorkflowTemplate) => void }) {
  return (
    <div data-testid="workflow-templates" className="mt-2 space-y-2">
      {(['analysis', 'code'] as const).map((mode) => (
        <div key={mode}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
            {MODE_LABEL[mode]} palettes
          </p>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {WORKFLOW_TEMPLATES.filter((template) => template.mode === mode).map((template) => (
              <button
                key={template.id}
                type="button"
                data-testid={`workflow-template-${template.id}`}
                onClick={() => onChoose(template)}
                className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left hover:bg-raise"
              >
                <span className="text-[12.5px] font-semibold text-body">{template.name}</span>
                <span className="text-[11.5px] leading-snug text-muted">{template.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
