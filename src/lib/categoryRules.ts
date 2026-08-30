import type {
  CategoryRule,
  CategoryRuleDirection,
  StatementTransaction,
} from "@/lib/types";

export const CATEGORY_COLORS = [
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#3b82f6", // Blue
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#f97316", // Orange
  "#f43f5e", // Rose
];

export function getNextCategoryColor(existingCount: number) {
  return CATEGORY_COLORS[existingCount % CATEGORY_COLORS.length] ?? "#64748b";
}

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  {
    id: "income-credit",
    category: "Income / Credit",
    keywords: [],
    direction: "deposit",
    priority: 10,
    enabled: true,
    color: "#10b981",
  },
  {
    id: "credit-card-payment",
    category: "Credit card payment",
    keywords: ["CREDIT CA", "CC ", "AUTOPAY"],
    direction: "withdrawal",
    priority: 20,
    enabled: true,
    color: "#06b6d4",
  },
  {
    id: "utilities",
    category: "Utilities",
    keywords: ["TNEB", "ELECTRIC"],
    direction: "withdrawal",
    priority: 30,
    enabled: true,
    color: "#f59e0b",
  },
  {
    id: "investment",
    category: "Investment",
    keywords: ["GROWW", "INVEST"],
    direction: "withdrawal",
    priority: 40,
    enabled: true,
    color: "#8b5cf6",
  },
  {
    id: "food-groceries",
    category: "Food / Groceries",
    keywords: ["BLINKIT", "ZEPTO", "FRUIT", "PROTEINS"],
    direction: "withdrawal",
    priority: 50,
    enabled: true,
    color: "#ec4899",
  },
  {
    id: "upi-spend",
    category: "UPI spend",
    keywords: ["UPI"],
    direction: "withdrawal",
    priority: 100,
    enabled: true,
    color: "#3b82f6",
  },
];

export function applyCategoryRules(
  transaction: StatementTransaction,
  rules: CategoryRule[],
) {
  const matchingRule = [...rules]
    .filter((rule) => rule.enabled)
    .sort((left, right) => left.priority - right.priority)
    .find((rule) => matchesRule(transaction, rule));

  return matchingRule?.category ?? "Uncategorized";
}

export function categorizeTransactions(
  transactions: StatementTransaction[],
  rules: CategoryRule[],
) {
  return transactions.map((transaction) => ({
    ...transaction,
    categoryHint: applyCategoryRules(transaction, rules),
  }));
}

export function sanitizeCategoryRules(rules: CategoryRule[]) {
  return rules
    .filter((rule) => rule.category.trim())
    .map((rule, index) => {
      const sanitized: any = {
        id:
          sanitizeRuleId(rule.id) ||
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `rule-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`),
        category: rule.category.trim(),
        keywords: rule.keywords
          .map((keyword) => keyword.trim())
          .filter(Boolean)
          .slice(0, 25),
        direction: sanitizeDirection(rule.direction),
        priority: Number.isFinite(rule.priority) ? rule.priority : index + 1,
        enabled: Boolean(rule.enabled),
      };

      if (typeof rule.color === "string" && rule.color) {
        sanitized.color = rule.color;
      }

      return sanitized as CategoryRule;
    });
}

function matchesRule(transaction: StatementTransaction, rule: CategoryRule) {
  if (rule.direction !== "any" && rule.direction !== transaction.direction) {
    return false;
  }

  if (!rule.keywords.length) {
    return true;
  }

  const narration = transaction.narration.toUpperCase();

  return rule.keywords.some((keyword) =>
    narration.includes(keyword.toUpperCase()),
  );
}

function sanitizeRuleId(id: string) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeDirection(direction: CategoryRuleDirection) {
  return direction === "deposit" || direction === "withdrawal"
    ? direction
    : "any";
}
