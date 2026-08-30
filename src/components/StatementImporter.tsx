"use client";

import { onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type DragEvent,
} from "react";

import { CATEGORY_COLORS, DEFAULT_CATEGORY_RULES, getNextCategoryColor } from "@/lib/categoryRules";

import { parseBankStatement } from "@/lib/bankStatementParser";
import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase";
import { hashFile } from "@/lib/processedStatements";
import type {
  CategoryRule,
  CategoryRuleDirection,
  ParsedStatement,
  ProcessedStatementRecord,
  StatementTransaction,
} from "@/lib/types";

type ImportState =
  | { status: "idle" }
  | { status: "processing"; fileName: string }
  | {
      status: "ready";
      fileName: string;
      fileHash: string;
      statementText: string;
      statement: ParsedStatement;
      duplicateRecord: ProcessedStatementRecord | null;
    }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

type StatementDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      statement: ParsedStatement;
      page?: number;
      totalPages?: number;
      totalCount?: number;
      hasNextPage?: boolean;
      hasPreviousPage?: boolean;
    }
  | { status: "error"; message: string };

type AccountSummary = {
  key: string;
  bankName: string;
  accountNumberMasked: string;
  statementCount: number;
};

type TransactionFilters = {
  fromDate: string;
  toDate: string;
  year: string;
  month: string;
  category: string;
  direction: "" | "withdrawal" | "deposit";
  minAmount: string;
  maxAmount: string;
  query: string;
};

type RulesState =
  | { status: "signed_out" }
  | { status: "loading" }
  | { status: "ready"; rules: CategoryRule[] }
  | { status: "saving"; rules: CategoryRule[] }
  | { status: "error"; message: string; rules: CategoryRule[] };

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const emptyTransactionFilters: TransactionFilters = {
  fromDate: "",
  toDate: "",
  year: "",
  month: "",
  category: "",
  direction: "",
  minAmount: "",
  maxAmount: "",
  query: "",
};

type FinancePageMode = "import" | "categories" | "statements";

export function StatementImporter({ mode }: { mode: FinancePageMode }) {
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
  });
  const [isDragActive, setIsDragActive] = useState(false);
  const [processedStatements, setProcessedStatements] = useState<
    ProcessedStatementRecord[]
  >([]);
  const [processedStatementsStatus, setProcessedStatementsStatus] = useState<
    "signed_out" | "loading" | "ready" | "error"
  >("signed_out");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [selectedAccountKeys, setSelectedAccountKeys] = useState<string[]>([]);
  const [submittingFingerprints, setSubmittingFingerprints] = useState<
    Record<string, boolean>
  >({});
  const [selectedStatementHash, setSelectedStatementHash] = useState<
    string | null
  >(null);
  const [statementDetailState, setStatementDetailState] =
    useState<StatementDetailState>({ status: "idle" });
  const [rulesState, setRulesState] = useState<RulesState>({
    status: "signed_out",
  });
  const [reprocessState, setReprocessState] = useState<SaveState>({
    status: "idle",
  });
  const [clearState, setClearState] = useState<SaveState>({ status: "idle" });
  const [storedReprocessState, setStoredReprocessState] = useState<SaveState>({
    status: "idle",
  });
  const [transactionFilters, setTransactionFilters] = useState<TransactionFilters>(
    emptyTransactionFilters,
  );
  const [transactionPage, setTransactionPage] = useState(1);

  const firebase = useMemo(() => getFirebaseClient(), []);
  const showImport = mode === "import";
  const showCategories = mode === "categories";
  const showStatements = mode === "statements";
  const pageCopy = {
    import: {
      title: "Bank statement importer",
      description:
        "Drop an HDFC text statement to parse transactions, review the output, and import it to Firestore.",
    },
    categories: {
      title: "Category rules",
      description:
        "Manage Firestore-backed category rules and reprocess a selected statement when rules change.",
    },
    statements: {
      title: "Statement viewer",
      description:
        "Choose an account from Firestore, then filter and search its transactions.",
    },
  }[mode];

  const accountSummaries = useMemo<AccountSummary[]>(() => {
    const accounts = new Map<string, AccountSummary>();

    for (const statement of processedStatements) {
      const key = getAccountKey(statement);
      const account = accounts.get(key);

      if (account) {
        account.statementCount += 1;
      } else {
        accounts.set(key, {
          key,
          bankName: statement.bankName,
          accountNumberMasked: statement.accountNumberMasked,
          statementCount: 1,
        });
      }
    }

    return Array.from(accounts.values());
  }, [processedStatements]);

  const categoryColorsMap = useMemo(() => {
    const colors: Record<string, string> = {};
    if ("rules" in rulesState) {
      for (const rule of rulesState.rules) {
        if (rule.color) {
          colors[rule.category] = rule.color;
        }
      }
    }
    return colors;
  }, [rulesState]);

  const categoryRuleOptions = useMemo(
    () =>
      "rules" in rulesState
        ? Array.from(
            new Set(
              rulesState.rules
                .map((rule) => rule.category.trim())
                .filter(Boolean),
            ),
          ).sort()
        : [],
    [rulesState],
  );

  const selectedAccountStatements = useMemo(() => {
    if (!selectedAccountKeys.length) {
      return processedStatements;
    }

    return processedStatements.filter((statement) =>
      selectedAccountKeys.includes(getAccountKey(statement)),
    );
  }, [processedStatements, selectedAccountKeys]);

  const loadProcessedStatements = useCallback(async (user: User) => {
    setProcessedStatementsStatus("loading");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/statements", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const body = (await response.json()) as {
        error?: string;
        statements?: ProcessedStatementRecord[];
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not load processed statements.");
      }

      setProcessedStatements(body.statements ?? []);
      setProcessedStatementsStatus("ready");
    } catch {
      setProcessedStatements([]);
      setProcessedStatementsStatus("error");
    }
  }, []);

  const loadStatementDetail = useCallback(
    async (user: User, fileHash: string) => {
      setStatementDetailState({ status: "loading" });

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/statements/${fileHash}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const body = (await response.json()) as {
          error?: string;
          statement?: ParsedStatement;
        };

        if (!response.ok || !body.statement) {
          throw new Error(body.error ?? "Could not load statement.");
        }

        setStatementDetailState({
          status: "ready",
          statement: body.statement,
        });
      } catch (error) {
        setStatementDetailState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load statement.",
        });
      }
    },
    [],
  );

  const loadAccountTransactions = useCallback(
    async (
      user: User,
      accountKey: string,
      filters: TransactionFilters,
      page: number,
    ) => {
      setStatementDetailState({ status: "loading" });

      try {
        const idToken = await user.getIdToken();
        const query = new URLSearchParams({
          accountKey,
          page: String(page),
          pageSize: "100",
        });

        for (const [key, value] of Object.entries(filters)) {
          if (value) {
            query.set(key, value);
          }
        }

        const response = await fetch(`/api/transactions?${query.toString()}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const body = (await response.json()) as {
          error?: string;
          statement?: ParsedStatement;
          page?: number;
          totalPages?: number;
          totalCount?: number;
          hasNextPage?: boolean;
          hasPreviousPage?: boolean;
        };

        if (!response.ok || !body.statement) {
          throw new Error(body.error ?? "Could not load account transactions.");
        }

        setStatementDetailState({
          status: "ready",
          statement: body.statement,
          page: body.page,
          totalPages: body.totalPages,
          totalCount: body.totalCount,
          hasNextPage: body.hasNextPage,
          hasPreviousPage: body.hasPreviousPage,
        });
      } catch (error) {
        setStatementDetailState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load account transactions.",
        });
      }
    },
    [],
  );

  const loadCategoryRules = useCallback(async (user: User) => {
    setRulesState({ status: "loading" });

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/category-rules", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const body = (await response.json()) as {
        error?: string;
        rules?: CategoryRule[];
      };

      if (!response.ok || !body.rules) {
        throw new Error(body.error ?? "Could not load category rules.");
      }

      setRulesState({ status: "ready", rules: body.rules });
    } catch (error) {
      setRulesState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not load category rules.",
        rules: [],
      });
    }
  }, []);

  useEffect(() => {
    if (!firebase) {
      return;
    }

    return onAuthStateChanged(firebase.auth, setFirebaseUser);
  }, [firebase]);

  useEffect(() => {
    if (!firebaseUser) {
      const timeoutId = window.setTimeout(() => {
        setProcessedStatements([]);
        setProcessedStatementsStatus("signed_out");
        setSelectedAccountKeys([]);
        setSelectedStatementHash(null);
        setStatementDetailState({ status: "idle" });
        setRulesState({ status: "signed_out" });
        setReprocessState({ status: "idle" });
        setClearState({ status: "idle" });
        setStoredReprocessState({ status: "idle" });
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      void loadProcessedStatements(firebaseUser);
      if (showCategories || showStatements) {
        void loadCategoryRules(firebaseUser);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    firebaseUser,
    loadCategoryRules,
    loadProcessedStatements,
    showCategories,
    showStatements,
  ]);

  useEffect(() => {
    if (showStatements && firebaseUser && processedStatementsStatus === "ready") {
      void loadAccountTransactions(
        firebaseUser,
        selectedAccountKeys.join(","),
        transactionFilters,
        transactionPage,
      );
    }
  }, [
    showStatements,
    firebaseUser,
    processedStatementsStatus,
    selectedAccountKeys,
    transactionFilters,
    transactionPage,
    loadAccountTransactions,
  ]);

  async function handleSignIn() {
    if (!firebase) {
      return;
    }

    const result = await signInWithPopup(firebase.auth, firebase.googleProvider);
    setFirebaseUser(result.user);
  }

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setImportState({
        status: "error",
        message: "For this first version, upload the text statement export.",
      });
      return;
    }

    setImportState({ status: "processing", fileName: file.name });

    try {
      const [fileHash, statementText] = await Promise.all([
        hashFile(file),
        file.text(),
      ]);
      const duplicateRecord =
        processedStatements.find((statement) => statement.fileHash === fileHash) ??
        null;
      const statement = parseBankStatement(statementText, { fileName: file.name });

      setSaveState({ status: "idle" });
      setImportState({
        status: "ready",
        fileName: file.name,
        fileHash,
        statementText,
        statement,
        duplicateRecord,
      });
    } catch (error) {
      setImportState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not process this statement.",
      });
    }
  }

  const handleToggleAccount = useCallback((key: string) => {
    setSelectedAccountKeys((current) => {
      const exists = current.includes(key);
      return exists ? current.filter((k) => k !== key) : [...current, key];
    });
    setTransactionPage(1);
    setSelectedStatementHash(null);
    setImportState({ status: "idle" });
    setSaveState({ status: "idle" });
  }, []);

  const handleToggleAllAccounts = useCallback(() => {
    setSelectedAccountKeys([]);
    setTransactionPage(1);
    setSelectedStatementHash(null);
    setImportState({ status: "idle" });
    setSaveState({ status: "idle" });
  }, []);

  const monthTags = useMemo(() => {
    const list = [];
    const date = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const yearStr = String(d.getFullYear());
      const monthStr = String(d.getMonth() + 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      list.push({ year: yearStr, month: monthStr, label });
    }
    return list;
  }, []);

  const otherMonthOptions = useMemo(() => {
    const list = [];
    const date = new Date();
    for (let i = 3; i < 15; i++) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const yearStr = String(d.getFullYear());
      const monthStr = String(d.getMonth() + 1);
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      list.push({ year: yearStr, month: monthStr, label });
    }
    return list;
  }, []);

  const handleSelectMonthTag = useCallback((yearStr: string, monthStr: string) => {
    setTransactionFilters((current) => ({
      ...current,
      year: yearStr,
      month: monthStr,
    }));
    setTransactionPage(1);
  }, []);

  const handleClearMonthFilter = useCallback(() => {
    setTransactionFilters((current) => ({
      ...current,
      year: "",
      month: "",
    }));
    setTransactionPage(1);
  }, []);

  const handleSelectOtherMonth = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const val = event.target.value;
    if (!val) {
      setTransactionFilters((current) => ({
        ...current,
        year: "",
        month: "",
      }));
    } else {
      const [yearStr, monthStr] = val.split("-");
      setTransactionFilters((current) => ({
        ...current,
        year: yearStr || "",
        month: monthStr || "",
      }));
    }
    setTransactionPage(1);
  }, []);

  function handleTransactionFiltersChange(nextFilters: TransactionFilters) {
    setTransactionFilters(nextFilters);
    setTransactionPage(1);
  }

  function handleTransactionPageChange(nextPage: number) {
    setTransactionPage(nextPage);
  }

  async function handleTransactionCategoryChange(
    transactionId: string,
    transactionFingerprint: string | undefined,
    category: string,
  ) {
    if (mode === "import") {
      setImportState((currentState) => {
        if (currentState.status !== "ready") {
          return currentState;
        }

        const updatedTransactions = currentState.statement.transactions.map((t) =>
          t.id === transactionId ? { ...t, categoryHint: category } : t,
        );

        return {
          ...currentState,
          statement: {
            ...currentState.statement,
            transactions: updatedTransactions,
          },
        };
      });
    } else if (mode === "statements" && firebaseUser && transactionFingerprint) {
      let originalCategory = "Uncategorized";
      setStatementDetailState((currentState) => {
        if (currentState.status !== "ready") return currentState;
        const tx = currentState.statement.transactions.find(
          (t) => t.transactionFingerprint === transactionFingerprint,
        );
        if (tx) {
          originalCategory = tx.categoryHint;
        }
        return currentState;
      });

      setStatementDetailState((currentState) => {
        if (currentState.status !== "ready") return currentState;

        const updatedTransactions = currentState.statement.transactions.map((t) =>
          t.transactionFingerprint === transactionFingerprint
            ? { ...t, categoryHint: category }
            : t,
        );

        return {
          ...currentState,
          statement: {
            ...currentState.statement,
            transactions: updatedTransactions,
          },
        };
      });

      setSubmittingFingerprints((curr) => ({ ...curr, [transactionFingerprint]: true }));

      try {
        const idToken = await firebaseUser.getIdToken();
        const response = await fetch("/api/transactions", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transactionFingerprint,
            category,
          }),
        });

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error ?? "Failed to update category.");
        }

        await loadCategoryRules(firebaseUser);
      } catch (error) {
        setStatementDetailState((currentState) => {
          if (currentState.status !== "ready") return currentState;

          const revertedTransactions = currentState.statement.transactions.map((t) =>
            t.transactionFingerprint === transactionFingerprint
              ? { ...t, categoryHint: originalCategory }
              : t,
          );

          return {
            ...currentState,
            statement: {
              ...currentState.statement,
              transactions: revertedTransactions,
            },
          };
        });

        alert(error instanceof Error ? error.message : "Failed to update category.");
      } finally {
        setSubmittingFingerprints((curr) => {
          const next = { ...curr };
          delete next[transactionFingerprint];
          return next;
        });
      }
    }
  }

  async function handleConfirmImport() {
    if (importState.status !== "ready") {
      return;
    }

    if (!firebase || !firebaseUser) {
      setSaveState({
        status: "error",
        message: "Sign in with Google before importing to Firestore.",
      });
      return;
    }

    setSaveState({ status: "saving" });

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/statements/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileHash: importState.fileHash,
          fileName: importState.fileName,
          statement: importState.statement,
          statementText: importState.statementText,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        transactionCount?: number;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not import statement.");
      }

      setSaveState({
        status: "saved",
        message: `Saved ${body.transactionCount ?? 0} transactions to Firestore for review.`,
      });
      await loadProcessedStatements(firebaseUser);
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not import statement.",
      });
    }
  }

  async function handleSaveCategoryRules(rules: CategoryRule[]) {
    if (!firebaseUser) {
      return;
    }

    setRulesState({ status: "saving", rules });
    setReprocessState({ status: "idle" });

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/category-rules", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rules }),
      });
      const body = (await response.json()) as {
        error?: string;
        rules?: CategoryRule[];
      };

      if (!response.ok || !body.rules) {
        throw new Error(body.error ?? "Could not save category rules.");
      }

      setRulesState({ status: "ready", rules: body.rules });
      if (selectedStatementHash) {
        await handleReprocessStatement();
      }
    } catch (error) {
      setRulesState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save category rules.",
        rules,
      });
    }
  }

  async function handleReprocessStatement() {
    if (!firebaseUser || !selectedStatementHash) {
      return;
    }

    setReprocessState({ status: "saving" });

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch(
        `/api/statements/${selectedStatementHash}/reprocess`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );
      const body = (await response.json()) as {
        error?: string;
        transactionCount?: number;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not reprocess statement.");
      }

      setReprocessState({
        status: "saved",
        message: `Reprocessed ${body.transactionCount ?? 0} transactions.`,
      });
      await loadStatementDetail(firebaseUser, selectedStatementHash);
    } catch (error) {
      setReprocessState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not reprocess statement.",
      });
    }
  }

  async function handleClearImportedStatements() {
    if (!firebaseUser) {
      return;
    }

    const confirmed = window.confirm(
      "Clear all imported statements and transactions for your account? Category rules will be kept.",
    );

    if (!confirmed) {
      return;
    }

    setClearState({ status: "saving" });

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/statements", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const body = (await response.json()) as {
        error?: string;
        deletedStatementCount?: number;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not clear imported statements.");
      }

      setProcessedStatements([]);
      setSelectedAccountKeys([]);
      setSelectedStatementHash(null);
      setTransactionFilters(emptyTransactionFilters);
      setTransactionPage(1);
      setStatementDetailState({ status: "idle" });
      setImportState({ status: "idle" });
      setSaveState({ status: "idle" });
      setClearState({
        status: "saved",
        message: `Cleared ${body.deletedStatementCount ?? 0} imported statements.`,
      });
    } catch (error) {
      setClearState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not clear imported statements.",
      });
    }
  }

  async function handleReprocessStoredStatements() {
    if (!firebaseUser) {
      return;
    }

    const confirmed = window.confirm(
      "Re-evaluate category rules for all uncategorized transactions? This will check them against the latest saved rules.",
    );

    if (!confirmed) {
      return;
    }

    setStoredReprocessState({ status: "saving" });

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/statements/reprocess-stored", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const body = (await response.json()) as {
        error?: string;
        reprocessedStatementCount?: number;
        skippedStatementCount?: number;
        transactionCount?: number;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not reprocess stored statements.");
      }

      setSelectedAccountKeys([]);
      setSelectedStatementHash(null);
      setStatementDetailState({ status: "idle" });
      setStoredReprocessState({
        status: "saved",
        message: `Reprocessed ${body.reprocessedStatementCount ?? 0} statements into ${body.transactionCount ?? 0} transactions. Skipped ${body.skippedStatementCount ?? 0}.`,
      });
      await loadProcessedStatements(firebaseUser);
    } catch (error) {
      setStoredReprocessState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not reprocess stored statements.",
      });
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragActive(false);

    const file = event.dataTransfer.files.item(0);
    if (file) {
      void processFile(file);
    }
  }

  const displayedStatement =
    importState.status === "ready"
      ? importState.statement
      : statementDetailState.status === "ready"
        ? statementDetailState.statement
        : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-6 rounded-4xl border border-white/10 bg-white/3 p-6 shadow-2xl shadow-black/30 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">
              Track Everything AI
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {pageCopy.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              {pageCopy.description}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">Firebase connection</p>
            <p className="mt-2">
              {isFirebaseConfigured
                ? "Configured from environment variables."
                : "Waiting for .env.local Firebase values."}
            </p>
            {firebaseUser ? (
              <p className="mt-3 text-cyan-200">
                Signed in as {firebaseUser.email}
              </p>
            ) : (
              <button
                className="mt-4 cursor-pointer rounded-full bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!firebase}
                onClick={() => void handleSignIn()}
                type="button"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </header>

        {showImport || showStatements ? (
        <section
          className={
            showImport && showStatements
              ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
              : "grid gap-6"
          }
        >
          {showImport ? (
          <div className="rounded-4xl border border-dashed border-cyan-300/40 bg-cyan-300/4 p-4">
            <label
              className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border border-white/10 p-8 text-center transition ${
                isDragActive ? "bg-cyan-300/10" : "bg-slate-900/80"
              }`}
              onDragLeave={() => setIsDragActive(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDrop={handleDrop}
            >
              <input
                accept=".txt,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.item(0);
                  if (file) {
                    void processFile(file);
                  }
                }}
                type="file"
              />
              <span className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
                Upload statement
              </span>
              <h2 className="mt-5 text-2xl font-semibold text-white">
                Drag and drop your bank statement
              </h2>
              <p className="mt-3 max-w-xl text-slate-300">
                This MVP parses HDFC `.txt` exports. PDF, Gmail attachment
                import, and Firebase Storage upload can reuse this same
                processing pipeline next.
              </p>
            </label>
          </div>
          ) : null}

          {showStatements ? (
            <div className="flex flex-col gap-6 w-full">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Transactions</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    View and categorize transactions across your accounts.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="cursor-pointer rounded-full border border-cyan-300/20 px-3.5 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !firebaseUser || storedReprocessState.status === "saving"
                    }
                    onClick={() => void handleReprocessStoredStatements()}
                    type="button"
                  >
                    {storedReprocessState.status === "saving"
                      ? "Reprocessing..."
                      : "Reprocess files"}
                  </button>
                  <button
                    className="cursor-pointer rounded-full border border-red-300/20 px-3.5 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!firebaseUser || clearState.status === "saving"}
                    onClick={() => void handleClearImportedStatements()}
                    type="button"
                  >
                    {clearState.status === "saving" ? "Clearing..." : "Clear imports"}
                  </button>
                </div>
              </div>

              {clearState.status === "saved" ? (
                <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3.5 text-sm text-emerald-100">
                  {clearState.message}
                </p>
              ) : null}
              {clearState.status === "error" ? (
                <p className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3.5 text-sm text-red-100">
                  {clearState.message}
                </p>
              ) : null}
              {storedReprocessState.status === "saved" ? (
                <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3.5 text-sm text-emerald-100">
                  {storedReprocessState.message}
                </p>
              ) : null}
              {storedReprocessState.status === "error" ? (
                <p className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3.5 text-sm text-red-100">
                  {storedReprocessState.message}
                </p>
              ) : null}

              {processedStatementsStatus === "ready" && accountSummaries.length > 0 && (
                <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 flex flex-col gap-6">
                  {/* Account Selector */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                      Filter by Accounts
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={handleToggleAllAccounts}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer border ${
                          selectedAccountKeys.length === 0
                            ? "bg-cyan-300 text-slate-950 border-cyan-300"
                            : "bg-slate-800 text-slate-300 border-white/5 hover:border-white/20"
                        }`}
                      >
                        All Accounts
                      </button>
                      {accountSummaries.map((account) => {
                        const isSelected = selectedAccountKeys.includes(account.key);
                        return (
                          <button
                            key={account.key}
                            type="button"
                            onClick={() => handleToggleAccount(account.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition cursor-pointer border ${
                              isSelected
                                ? "bg-cyan-300/15 text-cyan-200 border-cyan-300/40"
                                : "bg-slate-900/50 text-slate-400 border-white/5 hover:border-white/10"
                            }`}
                          >
                            <span>
                              {account.bankName} {account.accountNumberMasked}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-slate-500">
                              {account.statementCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Month Selector */}
                  <div className="border-t border-white/5 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                      Filter by Month
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleClearMonthFilter}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer border ${
                          !transactionFilters.year && !transactionFilters.month
                            ? "bg-cyan-300 text-slate-950 border-cyan-300"
                            : "bg-slate-800 text-slate-300 border-white/5 hover:border-white/20"
                        }`}
                      >
                        All Months
                      </button>
                      {monthTags.map((tag) => {
                        const isSelected =
                          transactionFilters.year === tag.year &&
                          transactionFilters.month === tag.month;
                        return (
                          <button
                            key={`${tag.year}-${tag.month}`}
                            type="button"
                            onClick={() => handleSelectMonthTag(tag.year, tag.month)}
                            className={`px-4 py-2 rounded-full text-xs font-medium transition cursor-pointer border ${
                              isSelected
                                ? "bg-cyan-300/15 text-cyan-200 border-cyan-300/40"
                                : "bg-slate-900/50 text-slate-400 border-white/5 hover:border-white/10"
                            }`}
                          >
                            {tag.label}
                          </button>
                        );
                      })}
                      <select
                        onChange={handleSelectOtherMonth}
                        value={
                          transactionFilters.year && transactionFilters.month
                            ? `${transactionFilters.year}-${transactionFilters.month}`
                            : ""
                        }
                        className="rounded-full border border-white/10 bg-slate-950 px-4 py-2 text-xs text-white outline-none focus:border-cyan-300/70 cursor-pointer hover:border-white/20 transition"
                      >
                        <option value="">Other Months...</option>
                        {otherMonthOptions.map((opt) => (
                          <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {processedStatementsStatus === "signed_out" ? (
                <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
                  Sign in to load processed statements from Firebase.
                </p>
              ) : null}
              {processedStatementsStatus === "loading" ? (
                <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
                  Loading statements from Firebase...
                </p>
              ) : null}
              {processedStatementsStatus === "error" ? (
                <p className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
                  Could not load statements from Firebase.
                </p>
              ) : null}
              {processedStatementsStatus === "ready" && !accountSummaries.length ? (
                <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
                  No statements processed in Firebase yet.
                </p>
              ) : null}


            </div>
          ) : null}
        </section>
        ) : null}

        {showCategories ? (
        <CategoryRulesPanel
          onSave={(rules) => void handleSaveCategoryRules(rules)}
          onReprocessAll={() => void handleReprocessStoredStatements()}
          reprocessState={reprocessState}
          rulesState={rulesState}
          selectedStatementHash={selectedStatementHash}
          storedReprocessState={storedReprocessState}
        />
        ) : null}

        {showImport ? (
        <StatusPanel importState={importState} />
        ) : null}

        {showImport && importState.status === "ready" ? (
          <ImportCommitPanel
            canSave={Boolean(firebaseUser)}
            onConfirmImport={() => void handleConfirmImport()}
            saveState={saveState}
          />
        ) : null}

        {(showImport || showStatements) && statementDetailState.status === "loading" ? (
          <section className="rounded-4xl border border-white/10 bg-white/3 p-8 text-slate-300">
            Loading statement from Firebase...
          </section>
        ) : null}

        {(showImport || showStatements) && statementDetailState.status === "error" ? (
          <section className="rounded-4xl border border-red-300/20 bg-red-500/10 p-8 text-red-100">
            {statementDetailState.message}
          </section>
        ) : null}

        {(showImport || showStatements) && displayedStatement ? (
          <StatementView
            categories={showStatements ? categoryRuleOptions : undefined}
            categoryColorsMap={categoryColorsMap}
            submittingFingerprints={submittingFingerprints}
            filters={showStatements ? transactionFilters : undefined}
            onFiltersChange={
              showStatements ? handleTransactionFiltersChange : undefined
            }
            onPageChange={
              showStatements ? handleTransactionPageChange : undefined
            }
            onCategoryChange={handleTransactionCategoryChange}
            pageInfo={
              showStatements
                ? {
                    page: statementDetailState.status === "ready"
                      ? statementDetailState.page ?? transactionPage
                      : transactionPage,
                    totalPages: statementDetailState.status === "ready"
                      ? statementDetailState.totalPages ?? 1
                      : 1,
                    totalCount: statementDetailState.status === "ready"
                      ? statementDetailState.totalCount ??
                        displayedStatement.transactionCount
                      : displayedStatement.transactionCount,
                    hasNextPage: statementDetailState.status === "ready"
                      ? Boolean(statementDetailState.hasNextPage)
                      : false,
                    hasPreviousPage: statementDetailState.status === "ready"
                      ? Boolean(statementDetailState.hasPreviousPage)
                      : false,
                  }
                : undefined
            }
            serverBacked={showStatements}
            statement={displayedStatement}
          />
        ) : (showImport || showStatements) &&
          (statementDetailState.status === "loading" ||
          statementDetailState.status === "error" ? null : (
          <section className="rounded-4xl border border-white/10 bg-white/3 p-8 text-slate-300">
            {showImport
              ? "Upload a statement to preview parsed transactions here."
              : "Choose an account from Firebase to see transactions here."}
          </section>
        ))}
      </section>
    </main>
  );
}

function StatusPanel({ importState }: { importState: ImportState }) {
  if (importState.status === "idle") {
    return null;
  }

  if (importState.status === "processing") {
    return (
      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-cyan-100">
        Processing {importState.fileName}...
      </div>
    );
  }

  if (importState.status === "error") {
    return (
      <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-red-100">
        {importState.message}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">
      {importState.duplicateRecord ? (
        <>
          Already processed on{" "}
          {formatDateTime(importState.duplicateRecord.processedAt)}. Parsed
          again for review.
        </>
      ) : (
        <>
          Processed {importState.fileName}. Review the parsed transactions
          before importing to Firestore.
        </>
      )}
    </div>
  );
}

function ImportCommitPanel({
  canSave,
  onConfirmImport,
  saveState,
}: {
  canSave: boolean;
  onConfirmImport: () => void;
  saveState: SaveState;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-4xl border border-white/10 bg-white/3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Confirm Firestore import
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          The backend verifies your Firebase ID token, checks for duplicate file
          hashes, then writes statement metadata and pending-review transactions
          under your private per-user Firestore path.
        </p>
        {saveState.status === "saved" ? (
          <p className="mt-3 text-sm text-emerald-200">{saveState.message}</p>
        ) : null}
        {saveState.status === "error" ? (
          <p className="mt-3 text-sm text-red-200">{saveState.message}</p>
        ) : null}
      </div>

      <button
        className="cursor-pointer rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canSave || saveState.status === "saving"}
        onClick={onConfirmImport}
        type="button"
      >
        {saveState.status === "saving"
          ? "Importing..."
          : "Confirm import to Firestore"}
      </button>
    </section>
  );
}

function CategoryRulesPanel({
  onSave,
  onReprocessAll,
  reprocessState,
  rulesState,
  selectedStatementHash,
  storedReprocessState,
}: {
  onSave: (rules: CategoryRule[]) => void;
  onReprocessAll: () => void;
  reprocessState: SaveState;
  rulesState: RulesState;
  selectedStatementHash: string | null;
  storedReprocessState: SaveState;
}) {
  const rules = useMemo(
    () => ("rules" in rulesState ? rulesState.rules : []),
    [rulesState],
  );
  const [draftRules, setDraftRules] = useState<CategoryRule[]>(rules);
  const isSaving = rulesState.status === "saving";
  const hasUnsavedChanges =
    JSON.stringify(draftRules) !== JSON.stringify(rules);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraftRules(rules);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [rules]);

  function updateRule(index: number, nextRule: CategoryRule) {
    setDraftRules((currentRules) =>
      currentRules.map((rule, ruleIndex) =>
        ruleIndex === index ? nextRule : rule,
      ),
    );
  }

  function addRule() {
    setDraftRules((currentRules) => [
      ...currentRules,
      {
        id: `rule-${Date.now()}`,
        category: "New category",
        keywords: [],
        direction: "any",
        priority: currentRules.length + 1,
        enabled: true,
        color: getNextCategoryColor(currentRules.length),
      },
    ]);
  }

  function removeRule(index: number) {
    setDraftRules((currentRules) =>
      currentRules.filter((_, ruleIndex) => ruleIndex !== index),
    );
  }

  function saveRules() {
    const prioritizedRules = draftRules.map((rule, index) => ({
      ...rule,
      priority: index + 1,
    }));

    onSave(prioritizedRules);
  }

  function resetRules() {
    setDraftRules(rules);
  }

  if (rulesState.status === "signed_out") {
    return null;
  }

  return (
    <section className="rounded-4xl border border-white/10 bg-white/3 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Category rules</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Rules are stored in Firestore and applied on import/reprocess.
            Keywords match against transaction narration in priority order.
          </p>
          {rulesState.status === "loading" ? (
            <p className="mt-3 text-sm text-cyan-200">Loading rules...</p>
          ) : null}
          {rulesState.status === "error" ? (
            <p className="mt-3 text-sm text-red-200">{rulesState.message}</p>
          ) : null}
          {hasUnsavedChanges ? (
            <p className="mt-3 text-sm text-amber-200">
              You have unsaved rule changes.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="cursor-pointer rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            onClick={addRule}
            type="button"
          >
            Add rule
          </button>
          <button
            className="cursor-pointer rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasUnsavedChanges || isSaving}
            onClick={resetRules}
            type="button"
          >
            Reset
          </button>
          <button
            className="cursor-pointer rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasUnsavedChanges || isSaving}
            onClick={saveRules}
            type="button"
          >
            {isSaving ? "Saving..." : "Save rules"}
          </button>
          <button
            className="cursor-pointer rounded-full border border-cyan-300/30 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving || storedReprocessState.status === "saving"}
            onClick={onReprocessAll}
            type="button"
          >
            {storedReprocessState.status === "saving"
              ? "Re-evaluating..."
              : "Re-evaluate categories"}
          </button>
        </div>
      </div>

      <p className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-sm text-slate-400">
        Re-evaluate categories reparses stored statement files and applies the
        latest saved rules to all imported transactions.
      </p>

      {storedReprocessState.status === "saved" ? (
        <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">
          {storedReprocessState.message}
        </p>
      ) : null}
      {storedReprocessState.status === "error" ? (
        <p className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
          {storedReprocessState.message}
        </p>
      ) : null}

      {selectedStatementHash ? (
        <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
          Saving rules will automatically reprocess the selected statement.
        </p>
      ) : null}

      {reprocessState.status === "saving" ? (
        <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
          Reprocessing selected statement...
        </p>
      ) : null}
      {reprocessState.status === "saved" ? (
        <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">
          {reprocessState.message}
        </p>
      ) : null}
      {reprocessState.status === "error" ? (
        <p className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
          {reprocessState.message}
        </p>
      ) : null}

      {draftRules.length ? (
        <div className="mt-5 grid gap-3">
          {draftRules.map((rule, index) => (
            <CategoryRuleEditor
              index={index}
              key={rule.id}
              onRemove={() => removeRule(index)}
              onUpdate={(nextRule) => updateRule(index, nextRule)}
              rule={rule}
            />
          ))}
        </div>
      ) : rulesState.status === "ready" ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
          No rules yet. Add one to start categorizing transactions.
        </p>
      ) : null}
    </section>
  );
}

function ColorPicker({
  selectedColor,
  onChange,
}: {
  selectedColor: string;
  onChange: (color: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block text-left w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white hover:border-white/20 transition w-full cursor-pointer"
      >
        <span
          className="w-4 h-4 rounded-full shrink-0 border border-white/10"
          style={{ backgroundColor: selectedColor || "#64748b" }}
        />
        <svg
          className="h-3 w-3 text-slate-400 shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 rounded-xl border border-white/10 bg-slate-950 p-2 shadow-2xl w-40">
          <div className="grid grid-cols-5 gap-1.5 justify-items-center">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setIsOpen(false);
                }}
                className={`w-5 h-5 rounded-full hover:scale-110 transition cursor-pointer border ${
                  selectedColor === color ? "border-white" : "border-white/15"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRuleEditor({
  index,
  onRemove,
  onUpdate,
  rule,
}: {
  index: number;
  onRemove: () => void;
  onUpdate: (rule: CategoryRule) => void;
  rule: CategoryRule;
}) {
  const [keywordText, setKeywordText] = useState(rule.keywords.join(", "));
  const lastKeywordsRef = useRef(rule.keywords);

  useEffect(() => {
    if (JSON.stringify(rule.keywords) !== JSON.stringify(lastKeywordsRef.current)) {
      setKeywordText(rule.keywords.join(", "));
      lastKeywordsRef.current = rule.keywords;
    }
  }, [rule.keywords]);

  const handleKeywordChange = (text: string) => {
    setKeywordText(text);
    const nextKeywords = text
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    lastKeywordsRef.current = nextKeywords;
    onUpdate({
      ...rule,
      keywords: nextKeywords,
    });
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 lg:grid-cols-[56px_1fr_2fr_150px_100px_88px] lg:items-center">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
        <input
          checked={rule.enabled}
          onChange={(event) =>
            onUpdate({ ...rule, enabled: event.target.checked })
          }
          type="checkbox"
        />
        #{index + 1}
      </label>
      <input
        className="cursor-pointer rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) => onUpdate({ ...rule, category: event.target.value })}
        placeholder="Category"
        value={rule.category}
      />
      <input
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) => handleKeywordChange(event.target.value)}
        placeholder="Keywords, comma separated"
        value={keywordText}
      />
      <select
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) =>
          onUpdate({
            ...rule,
            direction: event.target.value as CategoryRuleDirection,
          })
        }
        value={rule.direction}
      >
        <option value="any">Any</option>
        <option value="withdrawal">Debit</option>
        <option value="deposit">Credit</option>
      </select>
      <ColorPicker
        selectedColor={rule.color ?? "#64748b"}
        onChange={(nextColor) => onUpdate({ ...rule, color: nextColor })}
      />
      <button
        className="cursor-pointer rounded-xl border border-red-300/20 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/10"
        onClick={onRemove}
        type="button"
      >
        Remove
      </button>
    </div>
  );
}

function getCategoryColor(category: string, customMap: Record<string, string>) {
  if (category === "Uncategorized") {
    return "#64748b";
  }
  if (customMap[category]) {
    return customMap[category];
  }
  const defaultRule = DEFAULT_CATEGORY_RULES.find((r) => r.category === category);
  if (defaultRule?.color) {
    return defaultRule.color;
  }
  // Hash name to color
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[index] ?? "#64748b";
}

function CategoryCell({
  categoryHint,
  categories,
  categoryColorsMap,
  onCategoryChange,
  isSubmitting = false,
}: {
  categoryHint: string;
  categories: string[];
  categoryColorsMap: Record<string, string>;
  onCategoryChange: (category: string) => void;
  isSubmitting?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const allCategories = useMemo(() => {
    const set = new Set(categories);
    set.add(categoryHint);
    set.delete("Uncategorized");
    return ["Uncategorized", ...Array.from(set).sort()];
  }, [categories, categoryHint]);

  const currentColor = getCategoryColor(categoryHint, categoryColorsMap);

  return (
    <div className="relative inline-block text-left w-48 text-xs sm:text-sm" ref={dropdownRef}>
      <div className="h-10 flex items-center">
        {isEditing ? (
          <div className="flex items-center gap-1 w-full bg-slate-950 rounded-xl border border-white/20 p-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="w-full bg-transparent px-1.5 py-0.5 text-xs text-white outline-none"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = newCategoryName.trim();
                  if (val) {
                    onCategoryChange(val);
                  }
                  setIsEditing(false);
                  setNewCategoryName("");
                  setIsOpen(false);
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setNewCategoryName("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const val = newCategoryName.trim();
                if (val) {
                  onCategoryChange(val);
                }
                setIsEditing(false);
                setNewCategoryName("");
                setIsOpen(false);
              }}
              className="cursor-pointer rounded-lg bg-cyan-300 px-2 py-1 text-[10px] font-semibold text-slate-950 hover:bg-cyan-200"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setNewCategoryName("");
              }}
              className="cursor-pointer rounded-lg border border-white/10 px-1.5 py-1 text-[10px] text-slate-300 hover:bg-white/10"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center justify-between w-full rounded-xl border border-white/10 px-3 py-2 text-left text-white outline-none hover:border-white/20 hover:bg-slate-900/80 transition ${
              isSubmitting ? "shimmer-bg opacity-85 pointer-events-none" : "bg-slate-950"
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse-subtle"
                style={{ backgroundColor: currentColor }}
              />
              <span className="truncate">{categoryHint}</span>
            </span>
            <svg
              className="h-4 w-4 text-slate-400 ml-2 shrink-0 transition-transform duration-200"
              style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && !isEditing && (
        <div className="absolute left-0 mt-1 z-50 w-full rounded-xl border border-white/10 bg-slate-950 p-1 shadow-2xl">
          <div className="max-h-60 overflow-y-auto">
            {allCategories.map((cat) => {
              const catColor = getCategoryColor(cat, categoryColorsMap);
              const isSelected = cat === categoryHint;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    onCategoryChange(cat);
                    setIsOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full text-left rounded-lg px-2.5 py-1.5 text-xs sm:text-sm transition ${
                    isSelected
                      ? "bg-cyan-300/15 text-white font-medium"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: catColor }}
                  />
                  <span className="truncate">{cat}</span>
                </button>
              );
            })}
            <div className="h-px bg-white/10 my-1" />
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 w-full text-left rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-cyan-300 font-medium hover:bg-cyan-300/10 transition"
            >
              <span className="text-base font-bold leading-none shrink-0">+</span>
              <span className="truncate">Add custom category...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatementView({
  categories: externalCategories,
  categoryColorsMap = {},
  submittingFingerprints = {},
  filters: externalFilters,
  onFiltersChange,
  onPageChange,
  onCategoryChange,
  pageInfo,
  serverBacked = false,
  statement,
}: {
  categories?: string[];
  categoryColorsMap?: Record<string, string>;
  submittingFingerprints?: Record<string, boolean>;
  filters?: TransactionFilters;
  onFiltersChange?: (filters: TransactionFilters) => void;
  onPageChange?: (page: number) => void;
  onCategoryChange?: (
    transactionId: string,
    transactionFingerprint: string | undefined,
    category: string,
  ) => void;
  pageInfo?: {
    page: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  serverBacked?: boolean;
  statement: ParsedStatement;
}) {
  const [localFilters, setLocalFilters] = useState<TransactionFilters>(
    emptyTransactionFilters,
  );
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"transactions" | "dashboard">("transactions");
  const filters = externalFilters ?? localFilters;
  const updateFilters = onFiltersChange ?? setLocalFilters;

  const handleSelectCategoryFromDashboard = useCallback((categoryName: string) => {
    setActiveTab("transactions");
    updateFilters({
      ...filters,
      category: categoryName,
    });
    setShowFilters(true);
  }, [filters, updateFilters]);
  const transactionCategories = useMemo(
    () =>
      Array.from(
        new Set(
          statement.transactions
            .map((transaction) => transaction.categoryHint)
            .filter(Boolean),
        ),
      ).sort(),
    [statement.transactions],
  );
  const categories = useMemo(() => {
    const combined = new Set(externalCategories ?? []);
    transactionCategories.forEach((c) => combined.add(c));
    return Array.from(combined).sort();
  }, [externalCategories, transactionCategories]);
  const filteredTransactions = useMemo(
    () =>
      serverBacked
        ? statement.transactions
        : filterTransactions(statement.transactions, filters),
    [filters, serverBacked, statement.transactions],
  );

  const dashboardStats = useMemo<{
    totalWithdrawals: number;
    totalDeposits: number;
    netCashflow: number;
    savingsRate: number;
    sortedCategories: Array<{ name: string; amount: number }>;
    largestWithdrawal: StatementTransaction | null;
    largestDeposit: StatementTransaction | null;
  }>(() => {
    let totalWithdrawals = 0;
    let totalDeposits = 0;
    const categorySpending: Record<string, number> = {};
    const categoryDeposits: Record<string, number> = {};
    let largestWithdrawal: StatementTransaction | null = null;
    let largestDeposit: StatementTransaction | null = null;

    filteredTransactions.forEach((tx) => {
      const withdrawal = tx.withdrawalAmount ?? 0;
      const deposit = tx.depositAmount ?? 0;

      totalWithdrawals += withdrawal;
      totalDeposits += deposit;

      if (withdrawal > 0) {
        categorySpending[tx.categoryHint] = (categorySpending[tx.categoryHint] || 0) + withdrawal;
        if (!largestWithdrawal || withdrawal > (largestWithdrawal.withdrawalAmount ?? 0)) {
          largestWithdrawal = tx;
        }
      }

      if (deposit > 0) {
        categoryDeposits[tx.categoryHint] = (categoryDeposits[tx.categoryHint] || 0) + deposit;
        if (!largestDeposit || deposit > (largestDeposit.depositAmount ?? 0)) {
          largestDeposit = tx;
        }
      }
    });

    const netCashflow = totalDeposits - totalWithdrawals;
    const savingsRate = totalDeposits > 0 ? (netCashflow / totalDeposits) * 100 : 0;

    const sortedCategories = Object.entries(categorySpending)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalWithdrawals,
      totalDeposits,
      netCashflow,
      savingsRate,
      sortedCategories,
      largestWithdrawal,
      largestDeposit,
    };
  }, [filteredTransactions]);

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-4xl border border-white/10 bg-white/3 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-5 mb-5">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Transactions
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {statement.transactionCount} rows. Closing balance:{" "}
              {statement.closingBalance === null
                ? "Unknown"
                : currencyFormatter.format(statement.closingBalance)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-white/5 cursor-pointer"
          >
            <span>{showFilters ? "Hide filters" : "Show filters"}</span>
            <svg
              className="h-4 w-4 text-cyan-300 transition-transform duration-200"
              style={{ transform: showFilters ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-white/10 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            className={`cursor-pointer px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "transactions"
                ? "border-cyan-300 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Transactions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`cursor-pointer px-5 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "dashboard"
                ? "border-cyan-300 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Dashboard
          </button>
        </div>

        {showFilters && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
            <TransactionFiltersPanel
              categories={categories}
              filters={filters}
              onChange={updateFilters}
            />
          </div>
        )}

        {/* Tab Contents: Transactions */}
        {activeTab === "transactions" && (
          <div className="flex flex-col gap-5">
              <p className="text-sm text-slate-500">
                Showing {filteredTransactions.length} of{" "}
                {pageInfo?.totalCount ?? statement.transactions.length} rows.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-separate border-spacing-y-2 text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Narration</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr className="bg-slate-900/80" key={transaction.transactionFingerprint ?? transaction.id}>
                        <td className="rounded-l-2xl px-3 py-3 text-slate-300">
                          {transaction.date}
                        </td>
                        <td className="max-w-xl px-3 py-3 text-white">
                          <p className="line-clamp-2">{transaction.narration}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Ref {transaction.referenceNumber}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {onCategoryChange ? (
                            <CategoryCell
                              categoryHint={transaction.categoryHint}
                              categories={categories}
                              categoryColorsMap={categoryColorsMap}
                              isSubmitting={Boolean(
                                submittingFingerprints[transaction.transactionFingerprint ?? ""]
                              )}
                              onCategoryChange={(category) =>
                                onCategoryChange(
                                  transaction.id,
                                  transaction.transactionFingerprint,
                                  category,
                                )
                              }
                            />
                          ) : (
                            transaction.categoryHint
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-red-200">
                          {transaction.withdrawalAmount === null
                            ? "-"
                            : currencyFormatter.format(transaction.withdrawalAmount)}
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-200">
                          {transaction.depositAmount === null
                            ? "-"
                            : currencyFormatter.format(transaction.depositAmount)}
                        </td>
                        <td className="rounded-r-2xl px-3 py-3 text-right text-slate-200">
                          {currencyFormatter.format(transaction.closingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredTransactions.length ? (
                  <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
                    No transactions match the current filters.
                  </p>
                ) : null}
              </div>
              {pageInfo && onPageChange ? (
                <PaginationControls onPageChange={onPageChange} pageInfo={pageInfo} />
              ) : null}
            </div>
        )}

        {/* Tab Contents: Dashboard */}
        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-6 mt-4">
            {/* Top Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Deposits</p>
                <p className="text-2xl font-bold text-emerald-400 mt-2">
                  {currencyFormatter.format(dashboardStats.totalDeposits)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Withdrawals</p>
                <p className="text-2xl font-bold text-red-400 mt-2">
                  {currencyFormatter.format(dashboardStats.totalWithdrawals)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Net Cashflow</p>
                <p className={`text-2xl font-bold mt-2 ${dashboardStats.netCashflow >= 0 ? "text-cyan-300" : "text-amber-500"}`}>
                  {currencyFormatter.format(dashboardStats.netCashflow)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Savings Rate</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {dashboardStats.savingsRate.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Bottom Row: Spending Breakdown & Data Insights */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Category Spending Breakdown */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Spending by Category</h3>
                {dashboardStats.sortedCategories.length === 0 ? (
                  <p className="text-sm text-slate-400">No withdrawal transactions found to compute category spending.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {dashboardStats.sortedCategories.map((cat) => {
                      const percentage = dashboardStats.totalWithdrawals > 0
                        ? (cat.amount / dashboardStats.totalWithdrawals) * 100
                        : 0;
                      const color = getCategoryColor(cat.name, categoryColorsMap);
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => handleSelectCategoryFromDashboard(cat.name)}
                          className="w-full flex flex-col gap-1.5 text-left cursor-pointer hover:bg-white/5 p-2 rounded-xl transition"
                        >
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="flex items-center gap-2 font-medium text-slate-300">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              {cat.name}
                            </span>
                            <span className="text-slate-400 font-normal">
                              {currencyFormatter.format(cat.amount)} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, backgroundColor: color }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Data Insights */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 flex flex-col gap-4">
                <h3 className="text-lg font-semibold text-white">Data Insights</h3>

                {/* Largest Expense */}
                {dashboardStats.largestWithdrawal ? (
                  <div className="rounded-xl bg-slate-950 p-4 border border-white/5 flex flex-col gap-1">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Largest Expense</p>
                    <p className="text-base font-bold text-red-300">
                      {currencyFormatter.format(dashboardStats.largestWithdrawal.withdrawalAmount ?? 0)}
                    </p>
                    <p className="text-xs text-slate-300 line-clamp-1">
                      {dashboardStats.largestWithdrawal.narration}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Date: {dashboardStats.largestWithdrawal.date} | Category: {dashboardStats.largestWithdrawal.categoryHint}
                    </p>
                  </div>
                ) : null}

                {/* Largest Income */}
                {dashboardStats.largestDeposit ? (
                  <div className="rounded-xl bg-slate-950 p-4 border border-white/5 flex flex-col gap-1">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Largest Deposit</p>
                    <p className="text-base font-bold text-emerald-300">
                      {currencyFormatter.format(dashboardStats.largestDeposit.depositAmount ?? 0)}
                    </p>
                    <p className="text-xs text-slate-300 line-clamp-1">
                      {dashboardStats.largestDeposit.narration}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Date: {dashboardStats.largestDeposit.date} | Category: {dashboardStats.largestDeposit.categoryHint}
                    </p>
                  </div>
                ) : null}

                {/* Cashflow Alert Card */}
                <div className={`rounded-xl p-4 border ${
                  dashboardStats.netCashflow >= 0
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-100"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-100"
                }`}>
                  <p className="text-xs font-bold uppercase tracking-wide">Cashflow Summary</p>
                  <p className="text-xs mt-1.5 leading-relaxed">
                    {dashboardStats.netCashflow >= 0
                      ? `Great job! Your cashflow is in the positive by ${currencyFormatter.format(dashboardStats.netCashflow)} this period, yielding a savings rate of ${dashboardStats.savingsRate.toFixed(1)}%.`
                      : `Alert: Your spending exceeded deposits by ${currencyFormatter.format(Math.abs(dashboardStats.netCashflow))} during this period. Review your category spending to identify cost reductions.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PaginationControls({
  onPageChange,
  pageInfo,
}: {
  onPageChange: (page: number) => void;
  pageInfo: {
    page: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}) {
  const pages = getVisiblePages(pageInfo.page, pageInfo.totalPages);

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
      <button
        className="cursor-pointer rounded-xl border border-white/10 px-4 py-2 font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!pageInfo.hasPreviousPage}
        onClick={() => onPageChange(pageInfo.page - 1)}
        type="button"
      >
        Previous
      </button>
      <div className="flex flex-wrap items-center gap-2">
        {pages.map((page) => (
          <button
            className={`cursor-pointer rounded-xl px-3 py-2 font-semibold transition ${
              page === pageInfo.page
                ? "bg-cyan-300 text-slate-950"
                : "border border-white/10 text-slate-100 hover:bg-white/10"
            }`}
            key={page}
            onClick={() => onPageChange(page)}
            type="button"
          >
            {page}
          </button>
        ))}
      </div>
      <button
        className="cursor-pointer rounded-xl border border-white/10 px-4 py-2 font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!pageInfo.hasNextPage}
        onClick={() => onPageChange(pageInfo.page + 1)}
        type="button"
      >
        Next
      </button>
    </div>
  );
}

function TransactionFiltersPanel({
  categories,
  filters,
  onChange,
}: {
  categories: string[];
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
}) {
  const [draftFilters, setDraftFilters] =
    useState<TransactionFilters>(filters);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraftFilters(filters);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [filters]);

  function updateFilter(key: keyof TransactionFilters, value: string) {
    setDraftFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  function applyFilters() {
    onChange(draftFilters);
  }

  function clearFilters() {
    setDraftFilters(emptyTransactionFilters);
    onChange(emptyTransactionFilters);
  }

  return (
    <form
      className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
    >
      <input
        className="cursor-pointer rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) => updateFilter("fromDate", event.target.value)}
        type="date"
        value={draftFilters.fromDate}
      />
      <input
        className="cursor-pointer rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) => updateFilter("toDate", event.target.value)}
        type="date"
        value={draftFilters.toDate}
      />

      <select
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) => updateFilter("category", event.target.value)}
        value={draftFilters.category}
      >
        <option value="">Any category</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <select
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        onChange={(event) =>
          updateFilter(
            "direction",
            event.target.value as TransactionFilters["direction"],
          )
        }
        value={draftFilters.direction}
      >
        <option value="">Debit or credit</option>
        <option value="withdrawal">Debit</option>
        <option value="deposit">Credit</option>
      </select>
      <input
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        inputMode="decimal"
        onChange={(event) => updateFilter("minAmount", event.target.value)}
        placeholder="Min amount"
        value={draftFilters.minAmount}
      />
      <input
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70"
        inputMode="decimal"
        onChange={(event) => updateFilter("maxAmount", event.target.value)}
        placeholder="Max amount"
        value={draftFilters.maxAmount}
      />
      <input
        className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/70 xl:col-span-3"
        onChange={(event) => updateFilter("query", event.target.value)}
        placeholder="Search narration tokens, e.g. badminton"
        value={draftFilters.query}
      />
      <button
        className="cursor-pointer rounded-xl bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        type="submit"
      >
        Apply filters
      </button>
      <button
        className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
        onClick={clearFilters}
        type="button"
      >
        Clear filters
      </button>
    </form>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function filterTransactions(
  transactions: ParsedStatement["transactions"],
  filters: TransactionFilters,
) {
  const fromTime = filters.fromDate
    ? new Date(`${filters.fromDate}T00:00:00.000Z`).getTime()
    : null;
  const toTime = filters.toDate
    ? new Date(`${filters.toDate}T23:59:59.999Z`).getTime()
    : null;
  const minAmount = filters.minAmount ? Number(filters.minAmount) : null;
  const maxAmount = filters.maxAmount ? Number(filters.maxAmount) : null;
  const queryTokens = filters.query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

  return transactions.filter((transaction) => {
    const transactionTime = getTransactionTime(transaction);

    if (fromTime !== null && transactionTime !== null && transactionTime < fromTime) {
      return false;
    }

    if (toTime !== null && transactionTime !== null && transactionTime > toTime) {
      return false;
    }

    if (filters.year && transaction.year !== Number(filters.year)) {
      return false;
    }

    if (filters.month && transaction.month !== Number(filters.month)) {
      return false;
    }

    if (filters.category && transaction.categoryHint !== filters.category) {
      return false;
    }

    if (filters.direction && transaction.direction !== filters.direction) {
      return false;
    }

    if (minAmount !== null && transaction.amount < minAmount) {
      return false;
    }

    if (maxAmount !== null && transaction.amount > maxAmount) {
      return false;
    }

    if (queryTokens.length) {
      const tokens =
        transaction.searchTokens ??
        transaction.narration
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .filter(Boolean);

      return queryTokens.every((queryToken) =>
        tokens.some((token) => token.includes(queryToken)),
      );
    }

    return true;
  });
}

function getVisiblePages(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function getTransactionTime(transaction: ParsedStatement["transactions"][number]) {
  if (transaction.transactionDateIso) {
    return new Date(transaction.transactionDateIso).getTime();
  }

  const match = transaction.date.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);

  return Date.UTC(fullYear, Number(month) - 1, Number(day));
}

function getAccountKey(statement: ProcessedStatementRecord) {
  return `${statement.bankName}:${statement.accountNumberMasked}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
