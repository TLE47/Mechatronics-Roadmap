import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Gauge } from 'lucide-react';
import projectDocument from '../../data/capstoneProject.json';
import { missingProjectObject } from '../../projectRef.ts';
import {
  readProject,
  testPasses,
  testsForRequirement,
  type ProjectRequirement,
  type ProjectTest,
} from '../../projectModel';
import {
  filterProjectObjects,
  findProjectObject,
  partsForRequirement,
} from '../../projectQueries';
import { ProjectBrowser } from '../project/ProjectBrowser';

interface TabRequirementsProps {
  /**
   * A requirement another surface asked to open, by its stable id. The nonce makes a second ask for
   * the same requirement fire: a link pressed twice is two gestures, not one.
   */
  focus?: { id: string; nonce: number } | null;
  /** Opens Project Mode on the part a requirement cites, by the object's stable id. */
  onOpenPart: (componentId: string) => void;
}

// The same generated document Project Mode reads: one project, one set of ids, one summary.
const PROJECT = readProject(projectDocument);

/** A requirement id opens its own row; a test id opens the requirement that test judges. */
function focusTarget(id: string): {
  requirement: ProjectRequirement | null;
  test: ProjectTest | null;
} {
  const test = findProjectObject<ProjectTest>(PROJECT, 'test', id);
  return {
    requirement:
      findProjectObject<ProjectRequirement>(PROJECT, 'requirement', id) ??
      (test ? findProjectObject<ProjectRequirement>(PROJECT, 'requirement', test.requirementId) : null),
    test,
  };
}

/**
 * Requirements as objects with ids (`components/tabs/TabRequirements.tsx`).
 *
 * A second view over `projectModel.ts`, not a list typed into this component: each requirement was
 * derived from the capstone's EDA report with its measured value, its limit and the parts that meet
 * it. Pressing one of those parts opens Project Mode on the id; Project Mode's own detail card lists
 * the requirements that cite the part it shows, so the two views are one model read twice.
 */
export const TabRequirements: React.FC<TabRequirementsProps> = ({ focus, onOpenPart }) => {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(PROJECT.requirements[0].id);
  const [focusedTestId, setFocusedTestId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterProjectObjects<ProjectRequirement>('requirement', PROJECT, query),
    [query]
  );
  // A selection the search has filtered out falls back to the first match, so the detail card never
  // describes a row the list no longer shows.
  const selected: ProjectRequirement | null =
    filtered.find((requirement) => requirement.id === selectedId) ?? filtered[0] ?? null;
  const asked = focus ? focusTarget(focus.id).requirement : null;

  useEffect(() => {
    if (!focus) return;
    const target = focusTarget(focus.id);
    if (target.requirement) {
      setQuery('');
      setSelectedId(target.requirement.id);
      setFocusedTestId(target.test?.id ?? null);
    }
  }, [focus?.id, focus?.nonce]);

  const parts = selected ? partsForRequirement(selected, PROJECT.components) : [];
  const selectedTests = selected ? testsForRequirement(PROJECT.tests, selected.id) : [];

  return (
    <div data-testid="requirements-mode" className="space-y-3">
      <header className="rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="flex items-center gap-2 text-base font-bold text-ink">
            <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            Requirements
          </h1>
          <span className="font-mono text-[11px] text-muted" data-testid="requirements-project-id">
            {PROJECT.id}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          What this project must do, the number that proves each one, and the parts that make it
          true. Every requirement has an id, just like a part.
        </p>
        <p className="mt-2 font-mono text-[11.5px] text-body" data-testid="requirements-summary">
          {PROJECT.requirements.length} requirements · {PROJECT.components.length} parts
        </p>
      </header>

      {focus && !asked && (
        <p
          data-testid="requirements-missing"
          role="status"
          className="rounded-lg border border-amber/60 bg-amber/10 px-3 py-2 text-xs text-amber"
        >
          That link cites <span className="font-mono">{focus.id}</span>. {missingProjectObject(focus.id)}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ProjectBrowser
          kind="requirement"
          project={PROJECT}
          items={filtered}
          query={query}
          onQuery={setQuery}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />

        <aside
          data-testid="requirement-detail"
          aria-live="polite"
          className="rounded-xl border border-line bg-panel p-3"
        >
          {selected ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-ink">{selected.title}</h2>
                  <p className="truncate font-mono text-[11px] text-accent">{selected.ref}</p>
                </div>
                <Gauge className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              </div>
              <p className="text-[12px] leading-snug text-body">{selected.statement}</p>
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11.5px]">
                <dt className="text-faint">Kind</dt>
                <dd className="text-body">{selected.kind}</dd>
                <dt className="text-faint">Requirement id</dt>
                <dd className="truncate font-mono text-[10.5px] text-muted" data-testid="requirement-id">
                  {selected.id}
                </dd>
              </dl>
              <div
                data-testid="requirement-tests"
                className="border-t border-line-soft pt-2"
              >
                <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Verification
                </h3>
                <div className="mt-1 space-y-1">
                  {selectedTests.map((test, index) => {
                    const pass = testPasses(test);
                    const comparator = test.check.direction === 'max' ? '≤' : '≥';
                    return (
                      <div
                        key={test.id}
                        data-testid={`requirement-test-${index}`}
                        data-test-id={test.id}
                        className={`rounded border px-2 py-1 ${
                          focusedTestId === test.id
                            ? 'border-accent bg-accent-soft'
                            : 'border-line bg-canvas'
                        }`}
                      >
                        <div className="flex min-w-0 items-baseline justify-between gap-2">
                          <span className="shrink-0 font-mono text-[10.5px] font-semibold text-accent">
                            {test.ref}
                          </span>
                          <span className="min-w-0 truncate text-[10.5px] text-muted">
                            {test.title}
                          </span>
                        </div>
                        <p
                          data-testid={`requirement-test-check-${index}`}
                          className="font-mono text-[11px] text-body"
                        >
                          {test.check.value} {test.check.unit} {comparator} {test.check.limit}{' '}
                          {test.check.unit}
                          <span
                            data-testid={`requirement-test-pass-${index}`}
                            className={`ml-2 font-semibold ${
                              pass ? 'text-emerald' : 'text-rose'
                            }`}
                          >
                            {pass ? 'pass' : 'fail'}
                          </span>
                        </p>
                        <p className="text-[10.5px] leading-snug text-faint">{test.method}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-line-soft pt-2">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Parts that meet it
                </h3>
                <ul className="mt-1 space-y-1">
                  {parts.map((component) => (
                    <li key={component.id}>
                      <button
                        type="button"
                        data-testid={`requirement-part-${PROJECT.components.indexOf(component)}`}
                        data-part-id={component.id}
                        onClick={() => onOpenPart(component.id)}
                        className="flex w-full items-baseline justify-between gap-2 rounded border border-line bg-raise px-2 py-1 text-left hover:bg-elevate"
                      >
                        <span className="min-w-0 truncate font-mono text-[11px] text-ink">
                          {component.refDes}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-faint">
                          {component.mpn}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10.5px] text-faint">
                  A part opens Project Mode on its own id; Project Mode links back here.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Pick a requirement to see its number and its parts.</p>
          )}
          <p className="mt-3 border-t border-line-soft pt-2 font-mono text-[10px] text-faint">
            generated from {PROJECT.source}
          </p>
        </aside>
      </div>
    </div>
  );
};
