import type { CollectionRule } from "@ocean/types";

export interface RuleProduct {
  title: string;
  productType: string | null;
  vendor: string | null;
  tags: readonly string[];
  status: string;
  categoryPath: string | null;
  // Lowest variant price in minor units; null when the product has no variants.
  minPrice: number | null;
}

const fold = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function compareText(
  subject: string,
  operator: CollectionRule["operator"],
  value: string,
): boolean {
  const a = fold(subject);
  const b = fold(value);
  switch (operator) {
    case "equals":
      return a === b;
    case "not_equals":
      return a !== b;
    case "contains":
      return a.includes(b);
    case "not_contains":
      return !a.includes(b);
    case "starts_with":
      return a.startsWith(b);
    case "ends_with":
      return a.endsWith(b);
    default:
      return false;
  }
}

// Merchants type prices in major units ("100" = 100.00); products store minor units.
function priceToMinor(value: string): number | null {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function compareNumber(
  subject: number | null,
  operator: CollectionRule["operator"],
  value: string,
): boolean {
  const target = priceToMinor(value);
  if (subject === null || target === null) return false;
  switch (operator) {
    case "equals":
      return subject === target;
    case "not_equals":
      return subject !== target;
    case "gt":
      return subject > target;
    case "gte":
      return subject >= target;
    case "lt":
      return subject < target;
    case "lte":
      return subject <= target;
    default:
      return false;
  }
}

export function matchesRule(product: RuleProduct, rule: CollectionRule): boolean {
  switch (rule.field) {
    case "title":
      return compareText(product.title, rule.operator, rule.value);
    case "product_type":
      return compareText(product.productType ?? "", rule.operator, rule.value);
    case "vendor":
      return compareText(product.vendor ?? "", rule.operator, rule.value);
    case "status":
      return compareText(product.status, rule.operator, rule.value);
    case "tag": {
      const hit = product.tags.some((t) =>
        compareText(
          t,
          rule.operator === "not_equals"
            ? "equals"
            : rule.operator === "not_contains"
              ? "contains"
              : rule.operator,
          rule.value,
        ),
      );
      return rule.operator === "not_equals" || rule.operator === "not_contains" ? !hit : hit;
    }
    case "category": {
      const path = fold(product.categoryPath);
      const value = fold(rule.value);
      if (rule.operator === "equals") return path === value || path.startsWith(`${value}/`);
      if (rule.operator === "not_equals") return !(path === value || path.startsWith(`${value}/`));
      return compareText(path, rule.operator, rule.value);
    }
    case "price":
      return compareNumber(product.minPrice, rule.operator, rule.value);
    default:
      return false;
  }
}

export function matchesRules(
  product: RuleProduct,
  rules: readonly CollectionRule[],
  matchAll: boolean,
): boolean {
  if (rules.length === 0) return false;
  return matchAll
    ? rules.every((r) => matchesRule(product, r))
    : rules.some((r) => matchesRule(product, r));
}
