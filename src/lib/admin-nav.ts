/**
 * AdminNav's derived "Innehåll" links as three labelled groups (2026-10-10):
 * site facts (`contentGroups`), page copy (`editableCopy`), lists
 * (`collections`), each in config order. Pure, so `tests/admin-nav.test.ts`
 * can pin the property the old single row broke: no two chips share a label.
 * An empty group is dropped rather than rendered as a bare heading.
 */
import type { CmsConfig } from "./cms/config-types";

export interface NavLink {
  href: string;
  label: string;
}
export interface NavGroup {
  key: "facts" | "copy" | "lists";
  label: string;
  items: NavLink[];
}

export function navGroups(
  cms: Pick<CmsConfig, "contentGroups" | "editableCopy" | "collections">,
  labels: { facts: string; copy: string; lists: string },
): NavGroup[] {
  const groups: NavGroup[] = [
    {
      key: "facts",
      label: labels.facts,
      items: cms.contentGroups.map((g) => ({ href: `/admin/content/${g.key}`, label: g.label })),
    },
    {
      key: "copy",
      label: labels.copy,
      items: cms.editableCopy.map((p) => ({ href: `/admin/content/${p.page}`, label: p.label })),
    },
    {
      key: "lists",
      label: labels.lists,
      items: cms.collections.map((c) => ({ href: `/admin/collections/${c.name}`, label: c.label })),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}
