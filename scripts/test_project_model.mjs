#!/usr/bin/env node
/**
 * The engineering project model and the document it reads (`scripts/test_project_model.mjs`).
 *
 * The parts list stopped being a literal in a component and became generated data with ids. Three
 * things can now go wrong silently: the shipped document can drift from the capstone's EDA report,
 * two lines can end up with one id, and a summary can print a total the rows do not add up to. All
 * three are refused here, on the real files, plus the malformed shapes a future generator might emit.
 *
 * Run: node --experimental-strip-types scripts/test_project_model.mjs (`npm run test:project`)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMPONENT_KINDS,
  PROJECT_SCHEMA,
  REQUIREMENT_KINDS,
  componentKind,
  projectFromReport,
  projectObjects,
  readProject,
  resolveProjectObject,
  requirementPasses,
  testPasses,
  testsForRequirement,
} from '../app/src/projectModel.ts';
import { PROJECT_KINDS, projectKind } from '../app/src/projectKinds.ts';
import { PROJECT_WORDS, openProjectObject } from '../app/src/projectPresentation.ts';
import { PROJECT_BROWSE, projectRow } from '../app/src/projectRows.ts';
import {
  filterProjectObjects,
  findProjectObject,
  partsForRequirement,
} from '../app/src/projectQueries.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const root = process.cwd();
const reportPath = '08-capstone-projects/eda-capstone1-foc-drive/foc_thermal_and_bom.json';
const documentPath = 'app/src/data/capstoneProject.json';
const report = JSON.parse(fs.readFileSync(path.join(root, reportPath), 'utf8'));
const shipped = JSON.parse(fs.readFileSync(path.join(root, documentPath), 'utf8'));
const project = readProject(shipped);

console.log('project model');

check('the shipped document validates and names the report it came from', () => {
  assert.equal(shipped.schema, PROJECT_SCHEMA);
  assert.equal(project.id, report.lab);
  assert.equal(project.source, reportPath);
  assert.ok(fs.existsSync(path.join(root, project.source)), 'the source report exists');
});

check('the shipped document is exactly what the report generates', () => {
  const generated = projectFromReport(report, reportPath);
  assert.deepEqual(
    shipped,
    JSON.parse(JSON.stringify(generated)),
    'run npm run gen:project: the app data is stale'
  );
});

check('the report the app reads is the passing one', () => {
  assert.equal(report.ok, true, 'the EDA report reports a design that failed its own checks');
});

check('one id per BOM line, and every id belongs to the project', () => {
  assert.equal(project.components.length, report.total_unique_bom_lines);
  assert.equal(new Set(project.components.map((component) => component.id)).size, project.components.length);
  for (const component of project.components) {
    assert.match(component.id, new RegExp(`^${project.id}/[a-z0-9-]+$`));
    assert.ok(component.id.endsWith(component.refDes.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')));
  }
  // The six-FET bank is one object, not six: it is one line to order and one id to cite.
  assert.equal(project.components.filter((component) => component.qty === 6).length, 2);
});

check('the summary is the components’ own sum', () => {
  const lines = project.components.length;
  const placements = project.components.reduce((total, component) => total + component.qty, 0);
  const cost = Math.round(
    project.components.reduce((total, component) => total + component.qty * component.unitCostUsd, 0) * 100
  ) / 100;
  assert.equal(project.summary.lines, lines);
  assert.equal(project.summary.placements, placements);
  assert.equal(project.summary.costUsd, cost);
  assert.equal(project.summary.placements, report.total_component_Placements);
  assert.equal(project.summary.costUsd, report.total_bom_cost_usd);
});

check('every component has a kind from the shared vocabulary', () => {
  const kinds = new Set(COMPONENT_KINDS.map((meta) => meta.id));
  for (const component of project.components) {
    assert.ok(kinds.has(component.kind), `${component.id} has kind ${component.kind}`);
    assert.notEqual(
      component.kind,
      'other',
      `${component.category} is a category with no kind - add it to CATEGORY_KIND`
    );
  }
  assert.equal(componentKind('Solar sail'), 'other', 'an unknown category is filed, not crashed');
});

check('the fields the BOM table prints are present on every line', () => {
  for (const component of project.components) {
    for (const field of ['refDes', 'mpn', 'description', 'rating']) {
      assert.ok(component[field].trim() !== '', `${component.id} has no ${field}`);
    }
    assert.ok(component.unitCostUsd > 0, `${component.id} has no cost`);
  }
});

check('the parts list a workflow cites resolves to every component', () => {
  const parts = projectObjects(project).filter((object) => object.kind === 'component');
  assert.equal(parts.length, project.components.length);
  assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
  for (const part of parts) {
    const component = project.components.find((entry) => entry.id === part.id);
    assert.ok(component, `${part.id} names no component`);
    assert.ok(part.label.includes(component.refDes), `${part.id} does not name its refDes`);
    assert.ok(part.label.includes(component.mpn), `${part.id} does not name its MPN`);
  }
});

check('the picker’s generated object table is every object the model holds', () => {
  const picker = JSON.parse(fs.readFileSync(path.join(root, 'app/src/data/capstoneObjects.json'), 'utf8'));
  assert.deepEqual(picker, projectObjects(project), 'run npm run gen:project: the picker is stale');
  assert.equal(
    picker.length,
    project.components.length + project.requirements.length + project.tests.length
  );
  assert.ok(picker.some((object) => object.kind === 'requirement'), 'the picker offers no requirement');
  assert.ok(picker.some((object) => object.kind === 'test'), 'the picker offers no test');
});

check('one declaration carries every kind and its reader', () => {
  assert.deepEqual(
    PROJECT_KINDS.map((spec) => spec.kind),
    ['component', 'requirement', 'test'],
    'the declaration lost a kind or changed the generated order'
  );
  assert.deepEqual(
    PROJECT_KINDS.map((spec) => spec.collection),
    ['components', 'requirements', 'tests'],
    'read order is the declaration order; a requirement cites a part read before it'
  );
  for (const spec of PROJECT_KINDS) {
    for (const field of ['read', 'objectLabel', 'match', 'groups']) {
      assert.equal(typeof spec[field], 'function', `${spec.kind} has no ${field}`);
    }
  }
  assert.equal(projectKind('component')?.kind, 'component');
  assert.equal(projectKind('nope'), undefined);
});

check('presentation names, draws and opens each kind without a view branch', () => {
  const labels = new Set();
  const plurals = new Set();
  for (const spec of PROJECT_KINDS) {
    const words = PROJECT_WORDS[spec.kind];
    assert.ok(words, `${spec.kind} has no label, plural or door`);
    assert.ok(labels.add(words.label).size === labels.size, `${spec.kind} shares a label`);
    assert.ok(plurals.add(words.plural).size === plurals.size, `${spec.kind} shares a plural`);
    assert.ok(PROJECT_BROWSE[spec.kind], `${spec.kind} has no browse copy`);
    const sample = {
      component: project.components[0],
      requirement: project.requirements[0],
      test: project.tests[0],
    }[spec.kind];
    assert.ok(projectRow(spec.kind, sample, 0, project), `${spec.kind} has no row`);
    assert.match(words.door ?? '', /^(project|requirement)$/, `${spec.kind} has no door`);
    assert.ok(PROJECT_BROWSE[spec.kind].countTestId.endsWith('-count'));
    assert.ok(PROJECT_BROWSE[spec.kind].emptyTestId.endsWith('-empty'));
  }
  assert.equal(PROJECT_WORDS.test.label, 'Test');
  assert.equal(PROJECT_WORDS.fault?.label ?? 'fault', 'fault', 'an unknown kind prints itself');
  const rows = {
    part: projectRow('component', project.components[0], 0, project),
    requirement: projectRow('requirement', project.requirements[0], 0, project),
    test: projectRow('test', project.tests[0], 0, project),
  };
  assert.deepEqual(rows.part.data, { 'data-part-id': project.components[0].id });
  assert.deepEqual(rows.requirement.data, { 'data-requirement-id': project.requirements[0].id });
  assert.deepEqual(rows.test.data, { 'data-test-id': project.tests[0].id });
  assert.deepEqual(
    [rows.part.testId, rows.requirement.testId, rows.test.testId],
    ['project-row-0', 'requirement-row-0', 'test-row-0']
  );
  assert.equal(rows.requirement.trailing, 'met');
  assert.equal(rows.test.trailing, 'pass');

  const opened = { project: [], requirement: [] };
  const doors = {
    project: (id) => opened.project.push(id),
    requirement: (id) => opened.requirement.push(id),
  };
  for (const spec of PROJECT_KINDS) openProjectObject(spec.kind, spec.kind, doors);
  assert.deepEqual(opened, { project: ['component'], requirement: ['requirement', 'test'] });
  assert.equal(openProjectObject('nope', 'x', doors), false);
});

check('a fourth kind is claimed, stamped and opened through the generic path, and every bad id is refused', () => {
  const fault = {
    kind: 'fault',
    collection: 'faults',
    noun: 'fault ',
    objectLabel: (item) => `${item.ref} · ${item.title}`,
    // Deliberately naive: no id ownership and no `seen` check. The generic read must claim the id
    // before this runs, or the cross-kind duplicate below would slip through.
    read: (entry) => ({ ...entry }),
    match: (item, query) => item.title.toLowerCase().includes(query.trim().toLowerCase()),
    groups: (items) => [{ key: 'bench', label: 'On the bench', items }],
  };
  const kinds = [...PROJECT_KINDS, fault];
  const copy = JSON.parse(JSON.stringify(shipped));
  copy.faults = [
    {
      id: `${project.id}/fault-encoder-stall`,
      ref: 'FAULT-01',
      title: 'Encoder stall',
      requirementId: project.requirements[0].id,
    },
  ];
  const widened = readProject(copy, kinds);
  assert.equal(widened.faults.length, 1, 'the generic read did not fill the fourth collection');
  assert.equal(widened.summary.lines, project.summary.lines, 'the summary still comes from the parts');
  const object = resolveProjectObject(widened, widened.faults[0].id, kinds);
  assert.equal(object.kind, 'fault');
  assert.equal(object.label, 'FAULT-01 · Encoder stall');
  assert.equal(filterProjectObjects('fault', widened, 'stall', kinds).length, 1);
  assert.equal(findProjectObject(widened, 'fault', widened.faults[0].id, kinds)?.ref, 'FAULT-01');
  assert.deepEqual(
    projectKind('fault', kinds).groups(widened.faults, widened).map((group) => group.key),
    ['bench']
  );

  // One contract, five outcomes: what a reader does with the id (omit, echo, substitute) and what
  // the entry itself can claim (a duplicate, a foreign id). The table keeps them side by side.
  const identityCases = [
    {
      outcome: 'omitted',
      read: (entry) => {
        const { id: _id, ...fields } = entry;
        return fields;
      },
      keeps: { id: `${project.id}/fault-encoder-stall`, ref: 'FAULT-01' },
    },
    {
      outcome: 'echoed',
      read: (entry) => ({ ...entry, id: entry.id, title: 'Encoder stall, revised' }),
      keeps: { id: `${project.id}/fault-encoder-stall`, title: 'Encoder stall, revised' },
    },
    {
      outcome: 'substituted',
      read: (entry) => ({ ...entry, id: `${project.id}/fault-imposter` }),
      refuses:
        /project: fault 08-capstone1-foc-eda\/fault-encoder-stall was read as 08-capstone1-foc-eda\/fault-imposter$/,
      because: 'the read must refuse a reader that substitutes an id',
    },
    {
      outcome: 'duplicate',
      entryId: project.components[0].id,
      refuses: /share the id/,
      because:
        'the generic read must refuse a cross-kind duplicate even when its reader never checks',
    },
    {
      outcome: 'foreign',
      entryId: 'someone-else/fault-encoder-stall',
      refuses: /does not belong/,
      because: 'the generic read must refuse a fourth-kind object outside this project',
    },
  ];
  for (const { outcome, read, keeps, refuses, entryId, because } of identityCases) {
    const document = JSON.parse(JSON.stringify(copy));
    if (entryId) document.faults[0].id = entryId;
    const readKind = { ...fault, read: read ?? fault.read };
    const run = () => readProject(document, [...PROJECT_KINDS, readKind]);
    if (refuses) {
      assert.throws(run, refuses, because);
      continue;
    }
    const result = run();
    for (const [field, value] of Object.entries(keeps)) {
      assert.equal(result.faults[0][field], value, `${outcome} reader must keep ${field}`);
    }
  }

  const opened = [];
  PROJECT_WORDS.fault = { label: 'Fault', plural: 'Faults', door: 'project' };
  try {
    assert.equal(
      openProjectObject('fault', '08-capstone1-foc-eda/fault-encoder-stall', {
        project: (id) => opened.push(id),
        requirement: () => opened.push('requirement'),
      }),
      true
    );
  } finally {
    delete PROJECT_WORDS.fault;
  }
  assert.deepEqual(opened, ['08-capstone1-foc-eda/fault-encoder-stall']);
});

check('one id resolves to the object it names, and a dangling id to nothing', () => {
  const part = resolveProjectObject(project, '08-capstone1-foc-eda/u1');
  assert.equal(part?.kind, 'component');
  assert.equal(part?.label, 'U1 · STM32G474RET6');
  const requirement = resolveProjectObject(project, '08-capstone1-foc-eda/req-therm-01');
  assert.equal(requirement?.kind, 'requirement');
  assert.equal(requirement?.label, 'REQ-THERM-01 · Stay cool at full load');
  const test = resolveProjectObject(project, '08-capstone1-foc-eda/test-therm-01');
  assert.equal(test?.kind, 'test');
  assert.equal(test?.label, 'TEST-THERM-01 · Junction temperature at full load');
  assert.equal(resolveProjectObject(project, '08-capstone1-foc-eda/ghost'), undefined);
  assert.equal(resolveProjectObject(project, ''), undefined);
  assert.equal(resolveProjectObject(project, null), undefined);
  const ids = projectObjects(project).map((object) => object.id);
  assert.equal(new Set(ids).size, ids.length, 'two objects share an id');
});

check('Project Mode finds a part by any word it prints, and by its id', () => {
  const encoder = project.components.find((component) => component.id.endsWith('/u6'));
  assert.ok(encoder, 'the encoder is in the generated document');
  for (const query of [encoder.id, 'u6', 'ma732', 'Magnetic Encoder', 'Sensing']) {
    assert.ok(
      filterProjectObjects('component', project, query).some((part) => part.id === encoder.id),
      `“${query}” must find ${encoder.id}`
    );
  }
  assert.equal(
    filterProjectObjects('component', project, 'STM32').some((part) => part.id === encoder.id),
    false,
    'a part must not match another part’s words'
  );

  const filtered = filterProjectObjects('component', project, encoder.id);
  assert.deepEqual(filtered.map((component) => component.id), [encoder.id]);
  assert.equal(filterProjectObjects('component', project, '').length, project.components.length);
});

check('the kind groups cover every part once and drop the empty kinds', () => {
  const groups = projectKind('component').groups(project.components, project);
  assert.deepEqual(
    groups.map((group) => group.key),
    COMPONENT_KINDS.filter((meta) =>
      project.components.some((component) => component.kind === meta.id)
    ).map((meta) => meta.id)
  );
  const grouped = groups.flatMap((group) => group.items.map((component) => component.id));
  assert.equal(grouped.length, project.components.length, 'a part is in no group or in two');
  assert.equal(new Set(grouped).size, grouped.length, 'a part is in two groups');
  for (const group of groups) {
    assert.ok(group.items.every((component) => component.kind === group.key));
  }
});

check('an id names one part, and a dangling id names none', () => {
  assert.equal(
    findProjectObject(project, 'component', project.components[0].id)?.id,
    project.components[0].id
  );
  assert.equal(findProjectObject(project, 'component', '08-capstone1-foc-eda/ghost'), null);
  assert.equal(findProjectObject(project, 'component', ''), null);
  assert.equal(findProjectObject(project, 'component', null), null);
});

check('a stale or impossible document is refused', () => {
  const copy = () => JSON.parse(JSON.stringify(shipped));
  const stale = copy();
  stale.summary.costUsd = 0;
  assert.throws(() => readProject(stale), /summary says/);

  const duplicate = copy();
  duplicate.components[1].id = duplicate.components[0].id;
  assert.throws(() => readProject(duplicate), /share the id/);

  const foreign = copy();
  foreign.components[0].id = 'someone-else/u1';
  assert.throws(() => readProject(foreign), /does not belong/);

  const unknownKind = copy();
  unknownKind.components[0].kind = 'rocket';
  assert.throws(() => readProject(unknownKind), /not a component kind/);

  const schema = copy();
  schema.schema = 'mechalab.project/0';
  assert.throws(() => readProject(schema), /schema is/);

  const empty = copy();
  empty.components = [];
  empty.summary = { lines: 1, placements: 1, costUsd: 1 };
  assert.throws(() => readProject(empty), /no components/);
});

check('every requirement names parts it cites by id, and every kind is used', () => {
  const kinds = new Set(REQUIREMENT_KINDS.map((meta) => meta.id));
  const refs = new Set();
  const ids = new Set();
  for (const requirement of project.requirements) {
    assert.match(requirement.id, new RegExp(`^${project.id}/[a-z0-9-]+$`));
    assert.ok(ids.add(requirement.id).size === ids.size, `${requirement.id} shares an id`);
    assert.ok(refs.add(requirement.ref).size === refs.size, `${requirement.ref} shares a ref`);
    assert.ok(kinds.has(requirement.kind), `${requirement.ref} has kind ${requirement.kind}`);
    assert.ok(requirement.partIds.length > 0, `${requirement.ref} cites no part`);
    for (const partId of requirement.partIds) {
      assert.ok(
        project.components.some((component) => component.id === partId),
        `${requirement.ref} cites ${partId}, which is not a component`
      );
    }
  }
  const used = new Set(project.requirements.map((requirement) => requirement.kind));
  assert.deepEqual([...used].sort(), [...kinds].sort(), 'a requirement kind has no requirement');
});

check('every requirement is judged by a test with the report’s number', () => {
  const thermal = report.thermal_and_switching;
  const erc = report.erc_verification;
  const derated = project.components.filter((component) => component.derated).length;
  const expected = {
    'REQ-THERM-01': thermal.steady_state_tj_c,
    'REQ-THERM-02': thermal.pulse_tj_c,
    'REQ-ELEC-01': thermal.inverter_efficiency_pct,
    'REQ-ELEC-02': thermal.v_ds_peak_turnoff_v,
    'REQ-CTRL-01': erc.complimentary_pwm_channels,
    'REQ-SENSE-01': erc.kelvin_sense_pairs,
    'REQ-COMMS-01': 1,
    'REQ-SAFE-01': erc.dual_channel_sto_verified ? 2 : 1,
    'REQ-RELI-01': derated,
    'REQ-COST-01': report.total_bom_cost_usd,
  };
  assert.deepEqual(
    project.tests.map((test) => test.ref).sort(),
    Object.keys(expected).map((ref) => ref.replace('REQ-', 'TEST-')).sort(),
    'a test was added or lost without a report value'
  );
  assert.equal(project.tests.length, project.requirements.length, 'one test per requirement');
  const requirementIds = new Set(project.requirements.map((requirement) => requirement.id));
  for (const test of project.tests) {
    assert.match(test.id, new RegExp(`^${project.id}/[a-z0-9-]+$`));
    assert.ok(requirementIds.has(test.requirementId), `${test.ref} names no requirement`);
    assert.equal(
      test.check.value,
      expected[test.ref.replace('TEST-', 'REQ-')],
      `${test.ref} states ${test.check.value}, the report says ${expected[test.ref.replace('TEST-', 'REQ-')]}`
    );
    assert.equal(
      testsForRequirement(project.tests, test.requirementId).length,
      1,
      `${test.ref} is not the one test judging its requirement`
    );
  }
  const passed = project.tests.filter(testPasses);
  assert.equal(passed.length, project.tests.length, 'the report is the passing one');
  assert.ok(
    project.requirements.every((requirement) => requirementPasses(requirement, project.tests)),
    'a requirement with a passing test is not met'
  );
});

check('a test passes on the right side of its limit, boundary included', () => {
  assert.equal(testPasses({ check: { value: 90, unit: '°C', limit: 110, direction: 'max' } }), true);
  assert.equal(testPasses({ check: { value: 110, unit: '°C', limit: 110, direction: 'max' } }), true);
  assert.equal(testPasses({ check: { value: 111, unit: '°C', limit: 110, direction: 'max' } }), false);
  assert.equal(testPasses({ check: { value: 99, unit: '%', limit: 97, direction: 'min' } }), true);
  assert.equal(testPasses({ check: { value: 97, unit: '%', limit: 97, direction: 'min' } }), true);
  assert.equal(testPasses({ check: { value: 96, unit: '%', limit: 97, direction: 'min' } }), false);
});

check('a requirement is met only when every test judging it passes', () => {
  const requirement = project.requirements[0];
  const own = testsForRequirement(project.tests, requirement.id);
  const failing = own.map((test) => ({
    ...test,
    check: {
      ...test.check,
      value: test.check.direction === 'max' ? test.check.limit + 1 : test.check.limit - 1,
    },
  }));
  assert.equal(requirementPasses(requirement, own), true);
  assert.equal(requirementPasses(requirement, failing), false);
  assert.equal(requirementPasses(requirement, []), false, 'no test is no evidence');
  assert.equal(requirementPasses(requirement, [own[0], failing[0]]), false, 'one miss fails it');
});

check('a requirement is found by its reference, its words, its kind or a cited part', () => {
  const safety = project.requirements.find((requirement) => requirement.ref === 'REQ-SAFE-01');
  assert.ok(safety);
  for (const query of [
    safety.ref,
    'TEST-SAFE-01',
    'Safe Torque Off',
    'Safety',
    'ERC dual-channel STO verification',
    'u10',
    'SN74LVC2G08DCUR',
  ]) {
    assert.ok(
      filterProjectObjects('requirement', project, query).some(
        (requirement) => requirement.ref === safety.ref
      ),
      `“${query}” must find ${safety.ref}`
    );
  }
  assert.equal(
    filterProjectObjects('requirement', project, 'MA732GQ-Z').some(
      (requirement) => requirement.ref === safety.ref
    ),
    false,
    'a requirement must not match another requirement’s part'
  );
  assert.deepEqual(
    filterProjectObjects('requirement', project, safety.ref).map((entry) => entry.ref),
    ['REQ-SAFE-01']
  );
  assert.equal(findProjectObject(project, 'requirement', safety.id)?.ref, 'REQ-SAFE-01');
  assert.equal(findProjectObject(project, 'requirement', '08-capstone1-foc-eda/ghost'), null);
  assert.equal(findProjectObject(project, 'requirement', null), null);
  const safetyTest = findProjectObject(project, 'test', '08-capstone1-foc-eda/test-safe-01');
  assert.equal(safetyTest?.ref, 'TEST-SAFE-01');
  assert.equal(findProjectObject(project, 'test', '08-capstone1-foc-eda/ghost'), null);
  assert.equal(findProjectObject(project, 'test', null), null);
});

check('the requirement groups cover every requirement once and drop empty kinds', () => {
  const groups = projectKind('requirement').groups(project.requirements, project);
  const grouped = groups.flatMap((group) => group.items.map((requirement) => requirement.id));
  assert.equal(grouped.length, project.requirements.length, 'a requirement is in no group or in two');
  assert.equal(new Set(grouped).size, grouped.length, 'a requirement is in two groups');
  for (const group of groups) {
    assert.ok(group.items.every((requirement) => requirement.kind === group.key));
    assert.ok(group.items.length > 0);
  }
});

check('part ↔ requirement resolves both ways through the same ids', () => {
  for (const requirement of project.requirements) {
    const parts = partsForRequirement(requirement, project.components);
    assert.deepEqual(
      parts.map((part) => part.id),
      requirement.partIds,
      `${requirement.ref} prints its parts out of citation order`
    );
    for (const part of parts) {
      assert.ok(
        project.requirements
          .filter((entry) => entry.partIds.includes(part.id))
          .includes(requirement),
        `${part.id} does not link back to ${requirement.ref}`
      );
    }
  }
  const stm = project.components.find((component) => component.id.endsWith('/u1'));
  const refs = project.requirements
    .filter((requirement) => requirement.partIds.includes(stm.id))
    .map((requirement) => requirement.ref);
  assert.ok(refs.includes('REQ-CTRL-01'));
  assert.ok(refs.includes('REQ-COMMS-01'));
  assert.deepEqual(
    project.requirements.filter((requirement) =>
      requirement.partIds.includes('08-capstone1-foc-eda/ghost')
    ),
    []
  );
});

check('a requirement with a dangling part, a bad ref or a missing list is refused', () => {
  const copy = () => JSON.parse(JSON.stringify(shipped));
  const dangling = copy();
  dangling.requirements[0].partIds[0] = '08-capstone1-foc-eda/ghost';
  assert.throws(() => readProject(dangling), /cites part 08-capstone1-foc-eda\/ghost/);

  const duplicate = copy();
  duplicate.requirements[1].id = duplicate.requirements[0].id;
  assert.throws(() => readProject(duplicate), /share the id/);

  const foreign = copy();
  foreign.requirements[0].id = 'someone-else/req-therm-01';
  assert.throws(() => readProject(foreign), /does not belong/);

  const badRef = copy();
  badRef.requirements[0].ref = 'thermal';
  assert.throws(() => readProject(badRef), /stable reference/);

  const badKind = copy();
  badKind.requirements[0].kind = 'vibes';
  assert.throws(() => readProject(badKind), /not a requirement kind/);

  const badDirection = copy();
  badDirection.tests[0].check.direction = 'about';
  assert.throws(() => readProject(badDirection), /must be max or min/);

  const missing = copy();
  delete missing.requirements;
  assert.throws(() => readProject(missing), /no requirements/);

  const noTests = copy();
  delete noTests.tests;
  assert.throws(() => readProject(noTests), /no tests/);

  const untested = copy();
  untested.tests.shift();
  assert.throws(() => readProject(untested), /has no test/);

  const danglingTest = copy();
  danglingTest.tests[0].requirementId = '08-capstone1-foc-eda/ghost';
  assert.throws(() => readProject(danglingTest), /judges .*, which no requirement has/);

  const duplicateTest = copy();
  duplicateTest.tests[1].id = duplicateTest.tests[0].id;
  assert.throws(() => readProject(duplicateTest), /share the id/);

  const badTestRef = copy();
  badTestRef.tests[0].ref = 'thermal';
  assert.throws(() => readProject(badTestRef), /stable reference/);
});

check('a malformed report is refused before it can be written', () => {
  const copy = () => JSON.parse(JSON.stringify(report));
  const noBom = copy();
  noBom.bom = [];
  assert.throws(() => projectFromReport(noBom, reportPath), /no BOM/);

  const untyped = copy();
  untyped.bom[0].mpn = '';
  assert.throws(() => projectFromReport(untyped, reportPath), /mpn is not text/);

  const unsafe = copy();
  unsafe.bom[0].derating_ok = 'yes';
  assert.throws(() => projectFromReport(unsafe, reportPath), /derating_ok is not true or false/);

  const miscounted = copy();
  miscounted.total_component_Placements = 1;
  assert.throws(() => projectFromReport(miscounted, reportPath), /summary says/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
