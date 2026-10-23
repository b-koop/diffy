export type CategorySlug =
  | 'unnecessary_helpers'
  | 'excessive_defensiveness'
  | 'unnecessary_machinery_or_repeated_work'
  | 'duplicated_logic_or_state'
  | 'too_many_branches'
  | 'unclear_code'
  | 'unhelpful_comments_or_names'
  | 'code_in_wrong_place'
  | 'unneeded_backwards_compatibility'
  | 'dead_or_unrelated_code'
  | 'premature_extensibility'
  | 'low_value_tests'
  | 'other'

export interface Category {
  slug: CategorySlug
  label: string
  description: string
}

export const categories: Category[] = [
  {
    slug: 'unnecessary_helpers',
    label: 'Unnecessary helpers',
    description:
      'Extra functions that only pass through to other functions or add a step without improving understanding or reuse.',
  },
  {
    slug: 'excessive_defensiveness',
    label: 'Excessive defensiveness',
    description:
      'Checks, fallbacks, or error handling for cases already ruled out or handled elsewhere, including hiding errors callers need to see.',
  },
  {
    slug: 'unnecessary_machinery_or_repeated_work',
    label: 'Unnecessary machinery or repeated work',
    description:
      'Retries, locks, caches, background workers, or repeated calculations without a concrete need.',
  },
  {
    slug: 'duplicated_logic_or_state',
    label: 'Duplicated logic or state',
    description:
      'Reimplementing existing behavior, keeping multiple copies of the same information, or storing directly derivable values.',
  },
  {
    slug: 'too_many_branches',
    label: 'Too many branches',
    description:
      'Repeated checks, unnecessary nesting, or special cases that can be simplified while preserving behavior.',
  },
  {
    slug: 'unclear_code',
    label: 'Unclear code',
    description:
      'Code that is needlessly hard to follow: dense expressions, deeply nested logic, unexplained numbers or positions, or hand-written code packed into strings. Explain what is hard to follow and how clearer steps could express the same behavior, even if they take more lines. Do not flag concise idioms merely for being short. Respect required formats, interfaces, and performance constraints. Use unhelpful_comments_or_names when names or comments are the whole issue.',
  },
  {
    slug: 'unhelpful_comments_or_names',
    label: 'Unhelpful comments or names',
    description:
      'Comments that restate obvious code, or names that are vague, overly complicated, or obscure what the code does.',
  },
  {
    slug: 'code_in_wrong_place',
    label: 'Code in the wrong place',
    description:
      'Putting a rule in the wrong component, or making callers repeat work that belongs in the underlying component.',
  },
  {
    slug: 'unneeded_backwards_compatibility',
    label: 'Unneeded backwards compatibility',
    description:
      'Old paths, wrappers, or feature flags that no actual requirement or supported caller needs.',
  },
  {
    slug: 'dead_or_unrelated_code',
    label: 'Dead or unrelated code',
    description: 'Unused code or state, or edits outside what the task requires.',
  },
  {
    slug: 'premature_extensibility',
    label: 'Premature extensibility',
    description:
      'Frameworks, plugins, options, or extra modes for hypothetical future needs when there is only one real use case.',
  },
  {
    slug: 'low_value_tests',
    label: 'Low-value tests',
    description:
      'Tests that add little useful coverage or break after harmless implementation changes. Examples include weak assertions, excessive mocking, checks tied to internal details, and repeated tests for the same behavior.',
  },
  {
    slug: 'other',
    label: 'Other',
    description:
      'The categories are not exhaustive. If you identify a different frontend-specific slop issue, describe it in your comparison rationale and explain why it matters.',
  },
]

const norm = (s: string) => s.trim().toLowerCase()

function findBuiltIn(tag: string): Category | undefined {
  const t = norm(tag)
  return categories.find((c) => c.slug === t || norm(c.label) === t)
}

/** True when the text matches a built-in slug or label (case-insensitive). */
export const isBuiltIn = (tag: string): boolean => findBuiltIn(tag) !== undefined

/** Built-in slug if the text matches one, otherwise the trimmed custom text. */
export const resolveTag = (tag: string): string => findBuiltIn(tag)?.slug ?? tag.trim()

/** Human-readable label for a tag: built-in label, or the custom text itself. */
export const tagLabel = (tag: string): string => findBuiltIn(tag)?.label ?? tag
