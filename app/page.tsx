"use client";

import { useState } from "react";


type ResultRow = {
  dateJst: string;

  fromChain: string;
  toChain: string;

  token: string;

  amountIn: string;
  amountOut: string;

  amountDifference: string;

  amountDiffPct:
    number | null;

  travelTimeSec:
    number | null;

  status:
    | "AUTO_MATCH"
    | "REVIEW"
    | "UNRESOLVED";

  confidence: string;

  score:
    number | null;

  functionName: string;

  commitmentId: string;

  sourceTx: string;

  destinationTx: string;

  destinationFrom: string;
};


type ScanResult = {
  wallet: string;

  summary: {
    bridgeTx: number;

    autoMatched: number;

    veryHigh: number;

    high: number;

    review: number;

    unresolved: number;

    incomingTransactions: number;

    candidatePairs: number;
  };

  rows: ResultRow[];

  warnings: string[];

  unsupportedChains:
    string[];

  scanTimeMs: number;
};


// ============================================================
// CSV
// ============================================================

function csvEscape(
  value:
    string | number | null
) {
  const text =
    value === null
      ? ""
      : String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return (
      '"' +
      text.replace(
        /"/g,
        '""'
      ) +
      '"'
    );
  }

  return text;
}


function downloadHistoryCsv(
  result: ScanResult
) {
  const headers = [
    "Date",
    "From Chain",
    "To Chain",
    "Token",
    "Amount In",
    "Amount Out",
    "Amount Difference",
    "Amount Diff %",
    "Travel Time Sec",
    "Status",
    "Confidence",
    "Score",
    "Function",
    "Commitment ID",
    "Source TX",
    "Destination TX",
  ];

  const lines = [
    headers.join(","),

    ...result.rows.map(
      (row) =>
        [
          row.dateJst,
          row.fromChain,
          row.toChain,
          row.token,
          row.amountIn,
          row.amountOut,
          row.amountDifference,
          row.amountDiffPct,
          row.travelTimeSec,
          row.status,
          row.confidence,
          row.score,
          row.functionName,
          row.commitmentId,
          row.sourceTx,
          row.destinationTx,
        ]
          .map(csvEscape)
          .join(",")
    ),
  ];

  const csv =
    "\uFEFF" +
    lines.join("\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  const shortWallet =
    result.wallet.slice(
      0,
      10
    );

  anchor.href = url;

  anchor.download =
    `rhino-history-${shortWallet}.csv`;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  anchor.remove();

  URL.revokeObjectURL(
    url
  );
}


// ============================================================
// TX HELPERS
// ============================================================

function shortTx(
  hash: string
) {
  if (!hash) {
    return "—";
  }

  return (
    `${hash.slice(0, 8)}` +
    "..." +
    `${hash.slice(-6)}`
  );
}


function explorerTxUrl(
  chain: string,
  hash: string
) {
  if (!hash) {
    return "";
  }

  const explorers:
    Record<
      string,
      string
    > = {
    Ethereum:
      "https://etherscan.io/tx/",

    Arbitrum:
      "https://arbiscan.io/tx/",

    Base:
      "https://basescan.org/tx/",

    Optimism:
      "https://optimistic.etherscan.io/tx/",

    Polygon:
      "https://polygonscan.com/tx/",

    Avalanche:
      "https://snowtrace.io/tx/",

    Linea:
      "https://lineascan.build/tx/",

    Scroll:
      "https://scrollscan.com/tx/",

    Mantle:
      "https://mantlescan.xyz/tx/",

    Blast:
      "https://blastscan.io/tx/",
  };

  const base =
    explorers[chain];

  if (!base) {
    return "";
  }

  return (
    base + hash
  );
}


// ============================================================
// BADGE
// ============================================================

function badgeStyle(
  row: ResultRow
) {
  if (
    row.confidence ===
    "VERY_HIGH"
  ) {
    return (
      "bg-emerald-100 " +
      "text-emerald-700"
    );
  }

  if (
    row.confidence ===
    "HIGH"
  ) {
    return (
      "bg-blue-100 " +
      "text-blue-700"
    );
  }

  if (
    row.status ===
    "REVIEW"
  ) {
    return (
      "bg-amber-100 " +
      "text-amber-700"
    );
  }

  return (
    "bg-slate-100 " +
    "text-slate-600"
  );
}


function badgeLabel(
  row: ResultRow
) {
  if (
    row.status ===
    "UNRESOLVED"
  ) {
    return "UNRESOLVED";
  }

  if (
    row.status ===
    "REVIEW"
  ) {
    return "REVIEW";
  }

  return (
    row.confidence
      .replace(
        "_",
        " "
      )
  );
}


// ============================================================
// MAIN
// ============================================================

export default function Home() {
  const [
    wallet,
    setWallet,
  ] = useState("");

  const [
    result,
    setResult,
  ] =
    useState<
      ScanResult | null
    >(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);


  async function handleScan() {
    const address =
      wallet.trim();

    if (
      !/^0x[a-fA-F0-9]{40}$/.test(
        address
      )
    ) {
      setError(
        "正しいEVMウォレットアドレスを入力してください。"
      );

      return;
    }

    setError("");

    setResult(
      null
    );

    setLoading(
      true
    );

    try {
      const response =
        await fetch(
          "/api/scan",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  address,
                }
              ),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
          "Scan failed"
        );
      }

      setResult(
        data
      );

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Scan failed"
      );

    } finally {
      setLoading(
        false
      );
    }
  }


  return (
    <main
      className="
        min-h-screen
        bg-slate-50
        text-slate-900
      "
    >

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header
        className="
          border-b
          border-slate-200
          bg-white
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-7xl
            items-center
            justify-between
            px-6
            py-5
          "
        >
          <div
            className="
              flex
              items-center
              gap-3
            "
          >
            <div
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                bg-slate-900
                text-lg
                font-bold
                text-white
              "
            >
              R
            </div>

            <div>
              <h1
                className="
                  text-lg
                  font-semibold
                "
              >
                Rhino Bridge History
              </h1>

              <p
                className="
                  text-xs
                  text-slate-500
                "
              >
                Multi-chain bridge transaction scanner
              </p>
            </div>
          </div>

          <div
            className="
              rounded-full
              bg-emerald-50
              px-3
              py-1
              text-xs
              font-medium
              text-emerald-700
            "
          >
            Read Only
          </div>
        </div>
      </header>


      <div
        className="
          mx-auto
          max-w-7xl
          px-6
          py-10
        "
      >

        {/* =====================================================
            HERO
        ===================================================== */}

        <section
          className="mb-8"
        >
          <p
            className="
              mb-2
              text-sm
              font-medium
              text-indigo-600
            "
          >
            Rhino.fi History Scanner
          </p>

          <h2
            className="
              max-w-3xl
              text-3xl
              font-bold
              tracking-tight
              md:text-4xl
            "
          >
            EVMウォレットから

            <br
              className="
                hidden
                md:block
              "
            />

            Rhino Bridge履歴をまとめて確認
          </h2>

          <p
            className="
              mt-4
              max-w-2xl
              text-sm
              leading-6
              text-slate-600
            "
          >
            ウォレット接続や秘密鍵は不要です。
            アドレスを入力するだけで、
            複数チェーンのRhino.fi
            ブリッジ履歴を検索します。
          </p>
        </section>


        {/* =====================================================
            SEARCH
        ===================================================== */}

        <section
          className="
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-6
            shadow-sm
          "
        >
          <label
            className="
              mb-2
              block
              text-sm
              font-semibold
            "
          >
            Wallet Address
          </label>

          <div
            className="
              flex
              flex-col
              gap-3
              md:flex-row
            "
          >
            <input
              value={
                wallet
              }

              onChange={
                (e) =>
                  setWallet(
                    e.target.value
                  )
              }

              onKeyDown={
                (e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    handleScan();
                  }
                }
              }

              disabled={
                loading
              }

              placeholder="0x..."

              spellCheck={
                false
              }

              className="
                h-12
                flex-1
                rounded-xl
                border
                border-slate-300
                bg-white
                px-4
                font-mono
                text-sm
                outline-none
                transition
                focus:border-indigo-500
                focus:ring-4
                focus:ring-indigo-100
                disabled:bg-slate-100
              "
            />

            <button
              onClick={
                handleScan
              }

              disabled={
                loading
              }

              className="
                h-12
                min-w-44
                rounded-xl
                bg-slate-900
                px-7
                font-semibold
                text-white
                transition
                hover:bg-slate-700
                disabled:cursor-not-allowed
                disabled:bg-slate-400
              "
            >
              {
                loading
                  ? "Scanning..."
                  : "Scan History"
              }
            </button>
          </div>


          {
            loading && (
              <div
                className="
                  mt-4
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  bg-indigo-50
                  px-4
                  py-3
                  text-sm
                  text-indigo-700
                "
              >
                <div
                  className="
                    h-4
                    w-4
                    animate-spin
                    rounded-full
                    border-2
                    border-indigo-200
                    border-t-indigo-600
                  "
                />

                10チェーンから履歴を検索しています。
                少し時間がかかります。
              </div>
            )
          }


          {
            error && (
              <p
                className="
                  mt-3
                  text-sm
                  font-medium
                  text-red-600
                "
              >
                {error}
              </p>
            )
          }


          <p
            className="
              mt-3
              text-xs
              text-slate-500
            "
          >
            Ethereum / Arbitrum / Base /
            Optimism / Polygon / Avalanche /
            Linea / Scroll / Mantle / Blast
          </p>

          <p
            className="
              mt-1
              text-xs
              text-slate-400
            "
          >
            BNB Chain is temporarily unsupported.
          </p>
        </section>


        {/* =====================================================
            EMPTY STATE
        ===================================================== */}

        {
          !result &&
          !loading && (
            <section
              className="
                mt-10
                rounded-2xl
                border
                border-dashed
                border-slate-300
                bg-white
                px-6
                py-14
                text-center
              "
            >
              <p
                className="
                  text-lg
                  font-semibold
                  text-slate-700
                "
              >
                Walletを入力してScanしてください
              </p>

              <p
                className="
                  mt-2
                  text-sm
                  text-slate-400
                "
              >
                Rhino.fi Bridgeの送信TXと
                Destination候補を検索します。
              </p>
            </section>
          )
        }


        {/* =====================================================
            RESULT
        ===================================================== */}

        {
          result && (
            <>

              {/* RESULT TITLE */}

              <div
                className="
                  mb-3
                  mt-10
                  flex
                  flex-col
                  gap-2
                  md:flex-row
                  md:items-end
                  md:justify-between
                "
              >
                <div>
                  <h3
                    className="
                      text-xl
                      font-bold
                    "
                  >
                    Scan Result
                  </h3>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-slate-500
                    "
                  >
                    {
                      (
                        result.scanTimeMs /
                        1000
                      ).toFixed(1)
                    }
                    秒で検索完了
                  </p>
                </div>

                <div
                  className="
                    break-all
                    font-mono
                    text-xs
                    text-slate-400
                  "
                >
                  {
                    result.wallet
                  }
                </div>
              </div>


              {/* =================================================
                  STATS
              ================================================= */}

              <section
                className="
                  grid
                  gap-4
                  md:grid-cols-4
                "
              >
                <StatCard
                  label="Bridge TX"

                  value={
                    result.summary
                      .bridgeTx
                  }

                  sub="Source transactions"
                />

                <StatCard
                  label="Auto Matched"

                  value={
                    result.summary
                      .autoMatched
                  }

                  sub={
                    `${result.summary.veryHigh} very high / ` +
                    `${result.summary.high} high`
                  }
                />

                <StatCard
                  label="Needs Review"

                  value={
                    result.summary
                      .review
                  }

                  sub="Manual verification"
                />

                <StatCard
                  label="Unresolved"

                  value={
                    result.summary
                      .unresolved
                  }

                  sub="Destination unknown"
                />
              </section>


              {/* =================================================
                  TABLE
              ================================================= */}

              <section
                className="
                  mt-6
                  overflow-hidden
                  rounded-2xl
                  border
                  border-slate-200
                  bg-white
                  shadow-sm
                "
              >
                <div
                  className="
                    flex
                    flex-col
                    gap-4
                    border-b
                    border-slate-200
                    px-6
                    py-5
                    md:flex-row
                    md:items-center
                    md:justify-between
                  "
                >
                  <div>
                    <h3
                      className="
                        font-semibold
                      "
                    >
                      Bridge Transactions
                    </h3>

                    <p
                      className="
                        mt-1
                        text-xs
                        text-slate-500
                      "
                    >
                      {
                        result.rows.length
                      }
                      件
                    </p>
                  </div>


                  <div
                    className="
                      flex
                      flex-wrap
                      gap-2
                    "
                  >
                    <button
                      onClick={
                        () =>
                          downloadHistoryCsv(
                            result
                          )
                      }

                      className="
                        rounded-lg
                        border
                        border-slate-300
                        bg-white
                        px-4
                        py-2
                        text-sm
                        font-medium
                        text-slate-700
                        transition
                        hover:bg-slate-50
                      "
                    >
                      ↓ Full History CSV
                    </button>


                    <button
                      disabled

                      title="次のSTEPで実装します"

                      className="
                        rounded-lg
                        bg-indigo-100
                        px-4
                        py-2
                        text-sm
                        font-semibold
                        text-indigo-400
                      "
                    >
                      Cryptact CSV
                    </button>
                  </div>
                </div>


                <div
                  className="
                    overflow-x-auto
                  "
                >
                  <table
                    className="
                      w-full
                      min-w-[1450px]
                      text-left
                      text-sm
                    "
                  >
                    <thead
                      className="
                        bg-slate-50
                        text-xs
                        uppercase
                        tracking-wide
                        text-slate-500
                      "
                    >
                      <tr>
                        <th
                          className="
                            px-5
                            py-4
                          "
                        >
                          Date
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                          "
                        >
                          Route
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                          "
                        >
                          Token
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                            text-right
                          "
                        >
                          Amount In
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                            text-right
                          "
                        >
                          Amount Out
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                          "
                        >
                          Confidence
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                          "
                        >
                          Score
                        </th>

                        <th
                          className="
                            px-5
                            py-4
                          "
                        >
                          Bridge TX
                        </th>
                      </tr>
                    </thead>


                    <tbody
                      className="
                        divide-y
                        divide-slate-100
                      "
                    >
                      {
                        result.rows.map(
                          (
                            row,
                            index
                          ) => (
                            <tr
                              key={
                                row.sourceTx ||
                                index
                              }

                              className="
                                transition
                                hover:bg-slate-50
                              "
                            >

                              {/* DATE */}

                              <td
                                className="
                                  whitespace-nowrap
                                  px-5
                                  py-4
                                  text-xs
                                  text-slate-500
                                "
                              >
                                {
                                  row.dateJst
                                }
                              </td>


                              {/* ROUTE */}

                              <td
                                className="
                                  whitespace-nowrap
                                  px-5
                                  py-4
                                "
                              >
                                <div
                                  className="
                                    flex
                                    items-center
                                    gap-2
                                    font-medium
                                  "
                                >
                                  <span>
                                    {
                                      row.fromChain
                                    }
                                  </span>

                                  <span
                                    className="
                                      text-slate-400
                                    "
                                  >
                                    →
                                  </span>

                                  <span>
                                    {
                                      row.toChain ||
                                      "?"
                                    }
                                  </span>
                                </div>
                              </td>


                              {/* TOKEN */}

                              <td
                                className="
                                  px-5
                                  py-4
                                "
                              >
                                <span
                                  className="
                                    rounded-md
                                    bg-slate-100
                                    px-2
                                    py-1
                                    font-mono
                                    text-xs
                                    font-semibold
                                  "
                                >
                                  {
                                    row.token ||
                                    "?"
                                  }
                                </span>
                              </td>


                              {/* AMOUNT IN */}

                              <td
                                className="
                                  px-5
                                  py-4
                                  text-right
                                  font-mono
                                  text-xs
                                "
                              >
                                {
                                  row.amountIn
                                }
                              </td>


                              {/* AMOUNT OUT */}

                              <td
                                className="
                                  px-5
                                  py-4
                                  text-right
                                  font-mono
                                  text-xs
                                "
                              >
                                {
                                  row.amountOut ||
                                  "—"
                                }
                              </td>


                              {/* CONFIDENCE */}

                              <td
                                className="
                                  px-5
                                  py-4
                                "
                              >
                                <span
                                  className={
                                    `
                                      rounded-full
                                      px-2.5
                                      py-1
                                      text-xs
                                      font-semibold
                                      ${
                                        badgeStyle(
                                          row
                                        )
                                      }
                                    `
                                  }
                                >
                                  {
                                    badgeLabel(
                                      row
                                    )
                                  }
                                </span>
                              </td>


                              {/* SCORE */}

                              <td
                                className="
                                  px-5
                                  py-4
                                  font-mono
                                  text-xs
                                  text-slate-500
                                "
                              >
                                {
                                  row.score ??
                                  "—"
                                }
                              </td>


                              {/* =============================================
                                  BRIDGE TX
                              ============================================= */}

                              <td
                                className="
                                  px-5
                                  py-4
                                "
                              >
                                <div
                                  className="
                                    flex
                                    min-w-[320px]
                                    items-center
                                    gap-3
                                  "
                                >

                                  {/* SOURCE */}

                                  <div
                                    className="
                                      flex
                                      min-w-0
                                      flex-col
                                      gap-1
                                    "
                                  >
                                    <span
                                      className="
                                        text-[10px]
                                        font-semibold
                                        uppercase
                                        tracking-wide
                                        text-slate-400
                                      "
                                    >
                                      Source
                                    </span>

                                    {
                                      row.sourceTx ? (
                                        <a
                                          href={
                                            explorerTxUrl(
                                              row.fromChain,
                                              row.sourceTx
                                            )
                                          }

                                          target="_blank"

                                          rel="noopener noreferrer"

                                          title={
                                            row.sourceTx
                                          }

                                          className="
                                            rounded-md
                                            bg-indigo-50
                                            px-2
                                            py-1
                                            font-mono
                                            text-xs
                                            font-medium
                                            text-indigo-600
                                            transition
                                            hover:bg-indigo-100
                                            hover:underline
                                          "
                                        >
                                          {
                                            shortTx(
                                              row.sourceTx
                                            )
                                          }
                                        </a>
                                      ) : (
                                        <span
                                          className="
                                            text-slate-400
                                          "
                                        >
                                          —
                                        </span>
                                      )
                                    }
                                  </div>


                                  {/* ARROW */}

                                  <div
                                    className="
                                      mt-4
                                      text-lg
                                      text-slate-300
                                    "
                                  >
                                    →
                                  </div>


                                  {/* DESTINATION */}

                                  <div
                                    className="
                                      flex
                                      min-w-0
                                      flex-col
                                      gap-1
                                    "
                                  >
                                    <span
                                      className="
                                        text-[10px]
                                        font-semibold
                                        uppercase
                                        tracking-wide
                                        text-slate-400
                                      "
                                    >
                                      Destination
                                    </span>

                                    {
                                      row.destinationTx &&
                                      row.toChain ? (
                                        <a
                                          href={
                                            explorerTxUrl(
                                              row.toChain,
                                              row.destinationTx
                                            )
                                          }

                                          target="_blank"

                                          rel="noopener noreferrer"

                                          title={
                                            row.destinationTx
                                          }

                                          className="
                                            rounded-md
                                            bg-emerald-50
                                            px-2
                                            py-1
                                            font-mono
                                            text-xs
                                            font-medium
                                            text-emerald-700
                                            transition
                                            hover:bg-emerald-100
                                            hover:underline
                                          "
                                        >
                                          {
                                            shortTx(
                                              row.destinationTx
                                            )
                                          }
                                        </a>
                                      ) : (
                                        <span
                                          className="
                                            rounded-md
                                            bg-slate-100
                                            px-2
                                            py-1
                                            font-mono
                                            text-xs
                                            text-slate-400
                                          "
                                        >
                                          —
                                        </span>
                                      )
                                    }
                                  </div>

                                </div>
                              </td>

                            </tr>
                          )
                        )
                      }
                    </tbody>
                  </table>
                </div>
              </section>


              {/* =================================================
                  DETAILS
              ================================================= */}

              <section
                className="
                  mt-6
                  grid
                  gap-6
                  lg:grid-cols-2
                "
              >

                <div
                  className="
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white
                    p-6
                    shadow-sm
                  "
                >
                  <h3
                    className="
                      font-semibold
                    "
                  >
                    Scan Details
                  </h3>

                  <div
                    className="
                      mt-5
                      space-y-3
                      text-sm
                    "
                  >
                    <InfoRow
                      label="Incoming DB"

                      value={
                        String(
                          result.summary
                            .incomingTransactions
                        )
                      }
                    />

                    <InfoRow
                      label="Candidate pairs"

                      value={
                        String(
                          result.summary
                            .candidatePairs
                        )
                      }
                    />

                    <InfoRow
                      label="Auto matched"

                      value={
                        String(
                          result.summary
                            .autoMatched
                        )
                      }
                    />
                  </div>
                </div>


                <div
                  className="
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white
                    p-6
                    shadow-sm
                  "
                >
                  <h3
                    className="
                      font-semibold
                    "
                  >
                    Match Confidence
                  </h3>

                  <div
                    className="
                      mt-5
                      space-y-4
                      text-sm
                      text-slate-600
                    "
                  >
                    <p>
                      🟢 VERY HIGH —
                      時刻・金額・Token・受取先が強く一致
                    </p>

                    <p>
                      🔵 HIGH —
                      高確率のDestination候補
                    </p>

                    <p>
                      🟡 REVIEW —
                      自動確定せず確認を推奨
                    </p>

                    <p>
                      ⚪ UNRESOLVED —
                      Destinationを特定できません
                    </p>
                  </div>
                </div>

              </section>


              {/* =================================================
                  WARNINGS
              ================================================= */}

              {
                result.warnings.length >
                  0 && (
                  <details
                    className="
                      mt-6
                      rounded-xl
                      border
                      border-amber-200
                      bg-amber-50
                      p-4
                    "
                  >
                    <summary
                      className="
                        cursor-pointer
                        text-sm
                        font-semibold
                        text-amber-800
                      "
                    >
                      API warnings (
                      {
                        result.warnings
                          .length
                      }
                      )
                    </summary>

                    <div
                      className="
                        mt-3
                        space-y-2
                        text-xs
                        text-amber-700
                      "
                    >
                      {
                        result.warnings.map(
                          (
                            warning,
                            index
                          ) => (
                            <p
                              key={
                                index
                              }
                            >
                              {
                                warning
                              }
                            </p>
                          )
                        )
                      }
                    </div>
                  </details>
                )
              }

            </>
          )
        }


        {/* =====================================================
            FOOTER
        ===================================================== */}

        <footer
          className="
            py-10
            text-center
            text-xs
            text-slate-400
          "
        >
          Rhino Bridge History Scanner ·
          Read-only blockchain analysis
        </footer>

      </div>
    </main>
  );
}


// ============================================================
// COMPONENTS
// ============================================================

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div
      className="
        rounded-2xl
        border
        border-slate-200
        bg-white
        p-5
        shadow-sm
      "
    >
      <p
        className="
          text-sm
          font-medium
          text-slate-500
        "
      >
        {label}
      </p>

      <p
        className="
          mt-2
          text-3xl
          font-bold
        "
      >
        {value}
      </p>

      <p
        className="
          mt-1
          text-xs
          text-slate-400
        "
      >
        {sub}
      </p>
    </div>
  );
}


function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="
        flex
        justify-between
        border-b
        border-slate-100
        pb-2
      "
    >
      <span
        className="
          text-slate-500
        "
      >
        {label}
      </span>

      <span
        className="
          font-mono
          font-semibold
        "
      >
        {value}
      </span>
    </div>
  );
}