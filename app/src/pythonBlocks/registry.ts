/**
 * The Python Toolbox's catalogue (`app/src/pythonBlocks/registry.ts`).
 *
 * One metadata table drives the toolbox, its categories, its search and its sorting. Each item owns
 * a **template** — a complete statement with real fields, never a placeholder — so tapping an item
 * inserts code that already runs, and the card it becomes can be edited without first being repaired.
 *
 * Categories are for browsing, not for execution order: search reads every item regardless of the
 * selected category, and the recommended order is a beginner's learning sequence rather than a
 * Python grammar. The nine categories are the plan's initial set.
 */

import { type BlockNode, renderNode } from './ast.ts';
import { newNode } from './operations.ts';

export type ToolboxCategoryId =
  | 'variables'
  | 'data-types'
  | 'operators'
  | 'conditions'
  | 'loops'
  | 'functions'
  | 'input-output'
  | 'exceptions'
  | 'modules';

interface ToolboxCategory {
  id: ToolboxCategoryId;
  label: string;
}

/** The plan's nine categories, in the order a beginner meets them. */
export const TOOLBOX_CATEGORIES: readonly ToolboxCategory[] = [
  { id: 'variables', label: 'Variables' },
  { id: 'data-types', label: 'Data Types' },
  { id: 'operators', label: 'Operators' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'loops', label: 'Loops' },
  { id: 'functions', label: 'Functions' },
  { id: 'input-output', label: 'Input / Output' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'modules', label: 'Modules' },
];

export interface ToolboxItem {
  id: string;
  label: string;
  category: ToolboxCategoryId;
  /** The Python this item inserts, as the card previews it. */
  snippet: string;
  /** Extra words search should match — the Python names a beginner may type instead. */
  keywords: string[];
  /** Position in the beginner-friendly recommended order. Lower comes first. */
  rank: number;
  template: BlockNode;
}

interface ItemSeed {
  id: string;
  label: string;
  category: ToolboxCategoryId;
  keywords: string[];
  rank: number;
  template: BlockNode;
}

function item(seed: ItemSeed): ToolboxItem {
  return {
    ...seed,
    snippet: renderNode(seed.template, 0, '    ').join('\n'),
  };
}

function suite(
  kind: 'if' | 'elif' | 'else' | 'for' | 'while' | 'def' | 'try' | 'except' | 'finally',
  fields: BlockNode['fields'],
  body: BlockNode[] = []
): BlockNode {
  return newNode(kind, fields, body);
}

/** Every element the toolbox offers, in one list. */
export const TOOLBOX_ITEMS: readonly ToolboxItem[] = [
  item({
    id: 'assignment',
    label: 'Assignment',
    category: 'variables',
    keywords: ['variable', 'name', 'equals', '='],
    rank: 1,
    template: newNode('assign', { name: 'name', op: '=', value: '"Alex"' }),
  }),

  item({
    id: 'number',
    label: 'Whole number',
    category: 'data-types',
    keywords: ['int', 'integer', 'number', 'count'],
    rank: 3,
    template: newNode('assign', { name: 'count', op: '=', value: '0' }),
  }),
  item({
    id: 'text',
    label: 'Text',
    category: 'data-types',
    keywords: ['str', 'string', 'text', 'word'],
    rank: 4,
    template: newNode('assign', { name: 'label', op: '=', value: '"hello"' }),
  }),
  item({
    id: 'decimal',
    label: 'Decimal number',
    category: 'data-types',
    keywords: ['float', 'decimal', 'ratio'],
    rank: 18,
    template: newNode('assign', { name: 'ratio', op: '=', value: '1.5' }),
  }),
  item({
    id: 'boolean',
    label: 'True / False',
    category: 'data-types',
    keywords: ['bool', 'boolean', 'flag', 'true', 'false'],
    rank: 8,
    template: newNode('assign', { name: 'ready', op: '=', value: 'True' }),
  }),
  item({
    id: 'list',
    label: 'List',
    category: 'data-types',
    keywords: ['list', 'items', 'array', 'sequence'],
    rank: 17,
    template: newNode('assign', { name: 'items', op: '=', value: '[1, 2, 3]' }),
  }),

  item({
    id: 'add',
    label: 'Add',
    category: 'operators',
    keywords: ['plus', 'sum', '+', 'addition'],
    rank: 12,
    template: newNode('assign', { name: 'total', op: '=', value: 'a + b' }),
  }),
  item({
    id: 'subtract',
    label: 'Subtract',
    category: 'operators',
    keywords: ['minus', '-', 'difference'],
    rank: 19,
    template: newNode('assign', { name: 'left', op: '=', value: 'a - b' }),
  }),
  item({
    id: 'multiply',
    label: 'Multiply',
    category: 'operators',
    keywords: ['times', '*', 'product', 'area'],
    rank: 21,
    template: newNode('assign', { name: 'area', op: '=', value: 'width * height' }),
  }),
  item({
    id: 'compare',
    label: 'Compare',
    category: 'operators',
    keywords: ['equal', 'greater', 'less', '>=', '==', 'comparison'],
    rank: 13,
    template: newNode('assign', { name: 'is_big', op: '=', value: 'size >= 10' }),
  }),
  item({
    id: 'logic',
    label: 'Combine conditions',
    category: 'operators',
    keywords: ['and', 'or', 'not', 'logic', 'boolean'],
    rank: 20,
    template: newNode('assign', { name: 'allowed', op: '=', value: 'ready and armed' }),
  }),

  item({
    id: 'if',
    label: 'If',
    category: 'conditions',
    keywords: ['if', 'condition', 'branch', 'test'],
    rank: 5,
    template: suite('if', { condition: 'age >= 18' }),
  }),
  item({
    id: 'elif',
    label: 'Otherwise if',
    category: 'conditions',
    keywords: ['elif', 'else if', 'condition', 'branch'],
    rank: 6,
    template: suite('elif', { condition: 'age >= 13' }),
  }),
  item({
    id: 'else',
    label: 'Otherwise',
    category: 'conditions',
    keywords: ['else', 'otherwise', 'branch'],
    rank: 7,
    template: suite('else', {}),
  }),

  item({
    id: 'for',
    label: 'For each',
    category: 'loops',
    keywords: ['for', 'loop', 'each', 'iterate'],
    rank: 10,
    template: suite('for', { target: 'item', iterable: 'items' }),
  }),
  item({
    id: 'range',
    label: 'Repeat a number of times',
    category: 'loops',
    keywords: ['range', 'for', 'repeat', 'times', 'loop'],
    rank: 11,
    template: suite('for', { target: 'i', iterable: 'range(5)' }),
  }),
  item({
    id: 'while',
    label: 'While',
    category: 'loops',
    keywords: ['while', 'loop', 'until', 'condition'],
    rank: 14,
    template: suite('while', { condition: 'count < 3' }),
  }),

  item({
    id: 'def',
    label: 'Function',
    category: 'functions',
    keywords: ['def', 'function', 'define', 'parameters'],
    rank: 15,
    template: suite('def', { name: 'greet', params: 'name' }),
  }),
  item({
    id: 'return',
    label: 'Return a value',
    category: 'functions',
    keywords: ['return', 'result', 'output', 'function'],
    rank: 16,
    template: newNode('return', { value: 'result' }),
  }),

  item({
    id: 'print',
    label: 'Print',
    category: 'input-output',
    keywords: ['print', 'output', 'display', 'show'],
    rank: 2,
    template: newNode('call', { callee: 'print', args: '"Hello"' }),
  }),
  item({
    id: 'input',
    label: 'Ask for input',
    category: 'input-output',
    keywords: ['input', 'ask', 'read', 'prompt'],
    rank: 9,
    template: newNode('assign', { name: 'name', op: '=', value: 'input("Your name: ")' }),
  }),

  item({
    id: 'try',
    label: 'Try',
    category: 'exceptions',
    keywords: ['try', 'except', 'error', 'exception', 'handle'],
    rank: 22,
    template: suite('try', {}),
  }),
  item({
    id: 'except',
    label: 'Except',
    category: 'exceptions',
    keywords: ['except', 'error', 'exception', 'handle'],
    rank: 23,
    template: suite('except', { clause: 'ValueError' }),
  }),
  item({
    id: 'finally',
    label: 'Finally',
    category: 'exceptions',
    keywords: ['finally', 'always', 'cleanup'],
    rank: 24,
    template: suite('finally', {}),
  }),

  item({
    id: 'import',
    label: 'Import a module',
    category: 'modules',
    keywords: ['import', 'module', 'library', 'math'],
    rank: 25,
    template: newNode('import', {}, [], ['import math']),
  }),
  item({
    id: 'from-import',
    label: 'Import one name',
    category: 'modules',
    keywords: ['from', 'import', 'module', 'name'],
    rank: 26,
    template: newNode('import', {}, [], ['from math import sqrt']),
  }),
];

const BY_ID = new Map(TOOLBOX_ITEMS.map((entry) => [entry.id, entry]));

export function itemById(id: string): ToolboxItem | null {
  return BY_ID.get(id) ?? null;
}

/** Toolbox organisation, exactly as the plan names it. */
export type ToolboxSort = 'recommended' | 'categories' | 'az' | 'recent';

export const SORT_LABELS: Record<ToolboxSort, string> = {
  recommended: 'Recommended',
  categories: 'Categories',
  az: 'A–Z',
  recent: 'Recently used',
};

/** The category's own display order, for grouping and for the "categories" sort. */
function categoryOrder(id: ToolboxCategoryId): number {
  return TOOLBOX_CATEGORIES.findIndex((category) => category.id === id);
}

function categoryLabel(id: ToolboxCategoryId): string {
  return TOOLBOX_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

/** Items whose label, Python, keywords or category mention the query. */
export function filterItems(items: readonly ToolboxItem[], query: string): ToolboxItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((entry) => {
    const haystack = [
      entry.label,
      entry.snippet,
      categoryLabel(entry.category),
      ...entry.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/** Reorder items for the sort the learner picked. `recent` is most-recent-first item ids. */
export function sortItems(
  items: readonly ToolboxItem[],
  sort: ToolboxSort,
  recent: readonly string[] = []
): ToolboxItem[] {
  const list = [...items];
  const byRank = (a: ToolboxItem, b: ToolboxItem) => a.rank - b.rank;
  switch (sort) {
    case 'az':
      return list.sort((a, b) => a.label.localeCompare(b.label));
    case 'categories':
      return list.sort(
        (a, b) => categoryOrder(a.category) - categoryOrder(b.category) || byRank(a, b)
      );
    case 'recent': {
      const position = new Map(recent.map((id, index) => [id, index]));
      return list.sort((a, b) => {
        const aPos = position.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bPos = position.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aPos - bPos || byRank(a, b);
      });
    }
    case 'recommended':
    default:
      return list.sort(byRank);
  }
}

/**
 * The items the toolbox draws for one state: a category (or all), a search and a sort.
 *
 * Search deliberately ignores the chosen category: a learner who types `print` wants Print, not
 * "Print is not in Variables". Clearing the field returns to the category they were browsing.
 */
export function toolboxItems(options: {
  category: ToolboxCategoryId | 'all';
  query: string;
  sort: ToolboxSort;
  recent?: readonly string[];
}): ToolboxItem[] {
  const searching = options.query.trim() !== '';
  const pool =
    searching || options.category === 'all'
      ? TOOLBOX_ITEMS
      : TOOLBOX_ITEMS.filter((entry) => entry.category === options.category);
  return sortItems(filterItems(pool, options.query), options.sort, options.recent ?? []);
}
