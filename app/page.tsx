"use client";

import {
  useState,
} from "react";


type Receipt = {
  index: number;

  kind:
    | "ERC20"
    | "NATIVE";

  token: string;

  amount: string;

  recipient: string;

  from: string;

  tokenAddress: string;

  likelyRecipient: boolean;
};


type Candidate = {
  sourceChain: string;

  sourceDate: string;

  sourceTx: string;

  sourceExplorerUrl: string;

  token: string;

  amountIn: string;

  amountOut: string;

  recipient: string;

  destinationReceiptIndex: number;

  timeDiffSec: number;

  amountDiffPct: number;

  score: number;

  confidence:
    | "VERY_HIGH"
    | "HIGH"
    | "MEDIUM"
    | "LOW";
};


type ReverseResult = {
  destination: {
    txHash: string;

    timestamp: number;

    dateJst: string;

    status: string;

    method: string;

    from: string;

    to: string;

    blockNumber: number;

    explorerUrl: string;

    receipts:
      Receipt[];
  };

  searchWindow?: {
    from: string;
    to: string;
    lookbackSec: number;
  };

  sourceDepositsFound?: number;

  candidates:
    Candidate[];

  warnings:
    string[];

  nonEvm: {
    starknet: string;
    solana: string;
  };

  scanTimeMs: number;
};


// ============================================================
// HELPERS
// ============================================================

function shortHash(
  hash:
    string
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


function confidenceStyle(
  confidence:
    Candidate["confidence"]
) {

  if (
    confidence ===
    "VERY_HIGH"
  ) {

    return (
      "bg-emerald-100 " +
      "text-emerald-700"
    );
  }


  if (
    confidence ===
    "HIGH"
  ) {

    return (
      "bg-blue-100 " +
      "text-blue-700"
    );
  }


  if (
    confidence ===
    "MEDIUM"
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


// ============================================================
// MAIN
// ============================================================

export default function Home() {

  const [
    txHash,
    setTxHash,
  ] =
    useState("");


  const [
    result,
    setResult,
  ] =
    useState<
      ReverseResult |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  // ==========================================================
  // LOOKUP
  // ==========================================================

  async function handleLookup() {

    const hash =
      txHash
        .trim();


    if (
      !/^0x[a-fA-F0-9]{64}$/.test(
        hash
      )
    ) {

      setError(
        "正しいBase TX Hashを入力してください。"
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
          "/api/reverse",
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
                  txHash:
                    hash,
                }
              ),
          }
        );


      const text =
        await response.text();


      let data:
        ReverseResult |
        {
          error?: string;
        };


      try {

        data =
          JSON.parse(
            text
          );


      } catch {

        throw new Error(
          text ||
          `HTTP ${response.status}`
        );
      }


      if (
        !response.ok
      ) {

        throw new Error(
          "error" in data &&
          data.error
            ? data.error
            : `HTTP ${response.status}`
        );
      }


      setResult(
        data as
        ReverseResult
      );


    } catch (
      err
    ) {

      setError(
        err instanceof Error
          ? err.message
          : "Reverse Lookup failed."
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

      {/* HEADER */}

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
                Rhino Reverse Lookup
              </h1>

              <p
                className="
                  text-xs
                  text-slate-500
                "
              >
                Trace a Base receipt back to its possible source
              </p>

            </div>

          </div>


          <div
            className="
              flex
              gap-2
            "
          >

            <span
              className="
                rounded-full
                bg-blue-50
                px-3
                py-1
                text-xs
                font-medium
                text-blue-700
              "
            >
              Base Destination
            </span>


            <span
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
            </span>

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

        {/* HERO */}

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
            Rhino.fi Reverse Lookup
          </p>


          <h2
            className="
              max-w-4xl
              text-3xl
              font-bold
              tracking-tight
              md:text-4xl
            "
          >
            Baseに届いたTXから
            <br
              className="
                hidden
                md:block
              "
            />
            送り元のRhino Bridgeを逆に探す
          </h2>


          <p
            className="
              mt-4
              max-w-3xl
              text-sm
              leading-6
              text-slate-600
            "
          >
            Base側のDestination TXを解析し、
            Token・数量・Recipient・時刻から、
            直前のRhino.fi EVM Depositを検索します。
            StarknetとSolanaは次のSTEPで追加します。
          </p>

        </section>


        {/* INPUT */}

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

          <div
            className="
              grid
              gap-4
              md:grid-cols-[180px_1fr]
            "
          >

            <div>

              <label
                className="
                  mb-2
                  block
                  text-sm
                  font-semibold
                "
              >
                Destination Chain
              </label>


              <div
                className="
                  flex
                  h-12
                  items-center
                  rounded-xl
                  border
                  border-slate-200
                  bg-slate-50
                  px-4
                  font-semibold
                "
              >
                Base
              </div>

            </div>


            <div>

              <label
                className="
                  mb-2
                  block
                  text-sm
                  font-semibold
                "
              >
                Destination TX
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
                    txHash
                  }

                  onChange={
                    (
                      e
                    ) =>
                      setTxHash(
                        e.target.value
                      )
                  }

                  onKeyDown={
                    (
                      e
                    ) => {

                      if (
                        e.key ===
                        "Enter"
                      ) {

                        handleLookup();
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
                    px-4
                    font-mono
                    text-sm
                    outline-none
                    focus:border-indigo-500
                    focus:ring-4
                    focus:ring-indigo-100
                  "
                />


                <button

                  onClick={
                    handleLookup
                  }

                  disabled={
                    loading
                  }

                  className="
                    h-12
                    min-w-40
                    rounded-xl
                    bg-slate-900
                    px-6
                    font-semibold
                    text-white
                    hover:bg-slate-700
                    disabled:bg-slate-400
                  "
                >

                  {
                    loading
                      ? "Searching..."
                      : "Find Source"
                  }

                </button>

              </div>

            </div>

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

                Base TXを解析して、
                直前2時間のRhino Depositを探しています…

              </div>

            )
          }


          {
            error && (

              <div
                className="
                  mt-4
                  break-words
                  rounded-xl
                  bg-red-50
                  px-4
                  py-3
                  text-sm
                  text-red-700
                "
              >
                {error}
              </div>

            )
          }

        </section>


        {/* EMPTY */}

        {
          !result &&
          !loading && (

            <section
              className="
                mt-8
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
                "
              >
                Baseの受取TXを入れてください
              </p>

              <p
                className="
                  mt-2
                  text-sm
                  text-slate-400
                "
              >
                BaseScanのTX Hashをそのまま貼ればOKです。
              </p>

            </section>

          )
        }


        {/* RESULT */}

        {
          result && (

            <>

              {/* DESTINATION */}

              <section
                className="
                  mt-8
                  rounded-2xl
                  border
                  border-slate-200
                  bg-white
                  shadow-sm
                "
              >

                <div
                  className="
                    border-b
                    border-slate-200
                    px-6
                    py-5
                  "
                >

                  <div
                    className="
                      flex
                      flex-wrap
                      items-center
                      justify-between
                      gap-3
                    "
                  >

                    <div>

                      <h3
                        className="
                          text-lg
                          font-bold
                        "
                      >
                        Destination
                      </h3>

                      <p
                        className="
                          mt-1
                          text-sm
                          text-slate-500
                        "
                      >
                        Base · {
                          result.destination.dateJst
                        } JST
                      </p>

                    </div>


                    <a
                      href={
                        result.destination.explorerUrl
                      }

                      target="_blank"

                      rel="noopener noreferrer"

                      className="
                        rounded-lg
                        bg-blue-50
                        px-3
                        py-2
                        font-mono
                        text-xs
                        text-blue-700
                        hover:underline
                      "
                    >
                      {
                        shortHash(
                          result.destination.txHash
                        )
                      }
                    </a>

                  </div>

                </div>


                <div
                  className="
                    grid
                    gap-3
                    p-6
                  "
                >

                  {
                    result.destination
                      .receipts
                      .map(
                        (
                          receipt
                        ) => (

                          <div
                            key={
                              receipt.index
                            }

                            className="
                              rounded-xl
                              border
                              border-slate-200
                              p-4
                            "
                          >

                            <div
                              className="
                                flex
                                flex-wrap
                                items-start
                                justify-between
                                gap-4
                              "
                            >

                              <div>

                                <div
                                  className="
                                    flex
                                    items-center
                                    gap-2
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
                                      receipt.token
                                    }
                                  </span>


                                  {
                                    receipt.likelyRecipient && (

                                      <span
                                        className="
                                          rounded-full
                                          bg-emerald-50
                                          px-2
                                          py-1
                                          text-[10px]
                                          font-semibold
                                          text-emerald-700
                                        "
                                      >
                                        LIKELY RECEIPT
                                      </span>

                                    )
                                  }

                                </div>


                                <p
                                  className="
                                    mt-3
                                    font-mono
                                    text-xl
                                    font-bold
                                  "
                                >
                                  {
                                    receipt.amount
                                  }
                                </p>

                              </div>


                              <div
                                className="
                                  max-w-xl
                                  text-right
                                "
                              >

                                <p
                                  className="
                                    text-xs
                                    text-slate-400
                                  "
                                >
                                  Recipient
                                </p>

                                <p
                                  className="
                                    mt-1
                                    break-all
                                    font-mono
                                    text-xs
                                    text-slate-600
                                  "
                                >
                                  {
                                    receipt.recipient
                                  }
                                </p>

                              </div>

                            </div>

                          </div>

                        )
                      )
                  }

                </div>

              </section>


              {/* CANDIDATES */}

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
                    border-b
                    border-slate-200
                    px-6
                    py-5
                  "
                >

                  <h3
                    className="
                      text-lg
                      font-bold
                    "
                  >
                    Possible EVM Sources
                  </h3>


                  <p
                    className="
                      mt-1
                      text-sm
                      text-slate-500
                    "
                  >
                    {
                      result.candidates.length
                    }
                    件の候補 · {
                      (
                        result.scanTimeMs /
                        1000
                      ).toFixed(1)
                    }
                    秒
                  </p>

                </div>


                {
                  result.candidates.length ===
                  0 ? (

                    <div
                      className="
                        px-6
                        py-12
                        text-center
                      "
                    >

                      <p
                        className="
                          font-semibold
                          text-slate-700
                        "
                      >
                        EVM側に強いSource候補が見つかりませんでした
                      </p>


                      <p
                        className="
                          mt-2
                          text-sm
                          text-slate-400
                        "
                      >
                        StarknetまたはSolana発の可能性もあります。
                      </p>

                    </div>

                  ) : (

                    <div
                      className="
                        overflow-x-auto
                      "
                    >

                      <table
                        className="
                          w-full
                          min-w-[1100px]
                          text-left
                          text-sm
                        "
                      >

                        <thead
                          className="
                            bg-slate-50
                            text-xs
                            uppercase
                            text-slate-500
                          "
                        >

                          <tr>

                            <th className="px-5 py-4">
                              Source
                            </th>

                            <th className="px-5 py-4">
                              Time
                            </th>

                            <th className="px-5 py-4">
                              Token
                            </th>

                            <th className="px-5 py-4 text-right">
                              In
                            </th>

                            <th className="px-5 py-4 text-right">
                              Out
                            </th>

                            <th className="px-5 py-4">
                              Δ Time
                            </th>

                            <th className="px-5 py-4">
                              Confidence
                            </th>

                            <th className="px-5 py-4">
                              Source TX
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
                            result.candidates
                              .map(
                                (
                                  candidate,
                                  index
                                ) => (

                                  <tr
                                    key={
                                      `${candidate.sourceTx}-${index}`
                                    }

                                    className="
                                      hover:bg-slate-50
                                    "
                                  >

                                    <td
                                      className="
                                        px-5
                                        py-4
                                        font-semibold
                                      "
                                    >
                                      {
                                        candidate.sourceChain
                                      }
                                      {" → Base"}
                                    </td>


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
                                        candidate.sourceDate
                                      }
                                    </td>


                                    <td
                                      className="
                                        px-5
                                        py-4
                                        font-mono
                                      "
                                    >
                                      {
                                        candidate.token
                                      }
                                    </td>


                                    <td
                                      className="
                                        px-5
                                        py-4
                                        text-right
                                        font-mono
                                      "
                                    >
                                      {
                                        candidate.amountIn
                                      }
                                    </td>


                                    <td
                                      className="
                                        px-5
                                        py-4
                                        text-right
                                        font-mono
                                      "
                                    >
                                      {
                                        candidate.amountOut
                                      }
                                    </td>


                                    <td
                                      className="
                                        px-5
                                        py-4
                                        font-mono
                                        text-xs
                                      "
                                    >
                                      {
                                        candidate.timeDiffSec
                                      } sec
                                    </td>


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
                                              confidenceStyle(
                                                candidate.confidence
                                              )
                                            }
                                          `
                                        }
                                      >
                                        {
                                          candidate.confidence.replace(
                                            "_",
                                            " "
                                          )
                                        }
                                      </span>

                                    </td>


                                    <td
                                      className="
                                        px-5
                                        py-4
                                      "
                                    >

                                      <a
                                        href={
                                          candidate.sourceExplorerUrl
                                        }

                                        target="_blank"

                                        rel="noopener noreferrer"

                                        title={
                                          candidate.sourceTx
                                        }

                                        className="
                                          rounded-md
                                          bg-indigo-50
                                          px-2
                                          py-1
                                          font-mono
                                          text-xs
                                          text-indigo-600
                                          hover:underline
                                        "
                                      >
                                        {
                                          shortHash(
                                            candidate.sourceTx
                                          )
                                        }
                                      </a>

                                    </td>

                                  </tr>

                                )
                              )
                          }

                        </tbody>

                      </table>

                    </div>

                  )
                }

              </section>


              {/* NON EVM */}

              <section
                className="
                  mt-6
                  rounded-2xl
                  border
                  border-slate-200
                  bg-white
                  p-6
                  shadow-sm
                "
              >

                <div
                  className="
                    flex
                    flex-col
                    gap-4
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
                      Non-EVM Source Search
                    </h3>


                    <p
                      className="
                        mt-1
                        text-sm
                        text-slate-500
                      "
                    >
                      EVMで見つからない場合は
                      Starknet / Solanaを検索します。
                    </p>

                  </div>


                  <div
                    className="
                      flex
                      gap-2
                    "
                  >

                    <button
                      disabled
                      className="
                        rounded-lg
                        bg-slate-100
                        px-4
                        py-2
                        text-sm
                        font-semibold
                        text-slate-400
                      "
                    >
                      Starknet · Next
                    </button>


                    <button
                      disabled
                      className="
                        rounded-lg
                        bg-slate-100
                        px-4
                        py-2
                        text-sm
                        font-semibold
                        text-slate-400
                      "
                    >
                      Solana · Next
                    </button>

                  </div>

                </div>

              </section>


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
                      Coverage notes (
                      {
                        result.warnings.length
                      }
                      )
                    </summary>


                    <div
                      className="
                        mt-3
                        space-y-2
                        break-words
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
                              {warning}
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


        <footer
          className="
            py-10
            text-center
            text-xs
            text-slate-400
          "
        >
          Rhino Reverse Lookup · Read-only blockchain analysis
        </footer>

      </div>

    </main>
  );
}