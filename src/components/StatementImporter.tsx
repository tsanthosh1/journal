"use client";

import { onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { useEffect, useMemo, useState, type DragEvent } from "react";

import { parseBankStatement } from "@/lib/bankStatementParser";
import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase";
import {
  findProcessedStatement,
  getProcessedStatements,
  hashFile,
  saveProcessedStatement,
} from "@/lib/processedStatements";
import type { ParsedStatement, ProcessedStatementRecord } from "@/lib/types";

type ImportState =
  | { status: "idle" }
  | { status: "processing"; fileName: string }
  | {
      status: "ready";
      fileName: string;
      fileHash: string;
      statement: ParsedStatement;
      duplicateRecord: ProcessedStatementRecord | null;
      savedRecord: ProcessedStatementRecord;
    }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

export function StatementImporter() {
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
  });
  const [isDragActive, setIsDragActive] = useState(false);
  const [processedStatements, setProcessedStatements] = useState<
    ProcessedStatementRecord[]
  >([]);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const firebase = useMemo(() => getFirebaseClient(), []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setProcessedStatements(getProcessedStatements());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!firebase) {
      return;
    }

    return onAuthStateChanged(firebase.auth, setFirebaseUser);
  }, [firebase]);

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
      const duplicateRecord = findProcessedStatement(fileHash) ?? null;
      const statement = parseBankStatement(statementText);
      const savedRecord = saveProcessedStatement(file, fileHash, statement);

      setProcessedStatements(getProcessedStatements());
      setSaveState({ status: "idle" });
      setImportState({
        status: "ready",
        fileName: file.name,
        fileHash,
        statement,
        duplicateRecord,
        savedRecord,
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

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragActive(false);

    const file = event.dataTransfer.files.item(0);
    if (file) {
      void processFile(file);
    }
  }

  const currentStatement =
    importState.status === "ready" ? importState.statement : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/30 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">
              Track Everything AI
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Bank statement importer
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Drop an HDFC text statement to parse transactions, detect already
              processed files, and prepare the data model for Firebase-backed
              finance tracking.
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
                className="mt-4 rounded-full bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!firebase}
                onClick={() => void handleSignIn()}
                type="button"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[2rem] border border-dashed border-cyan-300/40 bg-cyan-300/[0.04] p-4">
            <label
              className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-white/10 p-8 text-center transition ${
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

          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold text-white">
              Processed statements
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Tracked locally by SHA-256 file hash until Firestore credentials
              are connected.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {processedStatements.length ? (
                processedStatements.map((statement) => (
                  <div
                    className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"
                    key={statement.fileHash}
                  >
                    <p className="font-medium text-white">
                      {statement.fileName}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {statement.bankName} {statement.accountNumberMasked}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {statement.transactionCount} transactions
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
                  No statements processed in this browser yet.
                </p>
              )}
            </div>
          </aside>
        </section>

        <StatusPanel importState={importState} />

        {importState.status === "ready" ? (
          <ImportCommitPanel
            canSave={Boolean(firebaseUser)}
            onConfirmImport={() => void handleConfirmImport()}
            saveState={saveState}
          />
        ) : null}

        {currentStatement ? (
          <StatementView statement={currentStatement} />
        ) : (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-slate-300">
            Upload a statement to see parsed account metadata, totals, and
            transaction rows here.
          </section>
        )}
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
          Processed {importState.fileName} and saved its fingerprint for future
          duplicate detection.
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
    <section className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
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
        className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
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

function StatementView({ statement }: { statement: ParsedStatement }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Account"
          value={`${statement.bankName} ${statement.accountNumberMasked}`}
        />
        <MetricCard
          label="Period"
          value={`${statement.statementFrom ?? "Unknown"} - ${
            statement.statementTo ?? "Unknown"
          }`}
        />
        <MetricCard
          label="Withdrawals"
          value={currencyFormatter.format(statement.totalWithdrawals)}
        />
        <MetricCard
          label="Deposits"
          value={currencyFormatter.format(statement.totalDeposits)}
        />
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Parsed transactions
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {statement.transactionCount} rows. Closing balance:{" "}
              {statement.closingBalance === null
                ? "Unknown"
                : currencyFormatter.format(statement.closingBalance)}
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Categories are simple hints for now.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
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
              {statement.transactions.map((transaction) => (
                <tr className="bg-slate-900/80" key={transaction.id}>
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
                    {transaction.categoryHint}
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
        </div>
      </div>
    </section>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
