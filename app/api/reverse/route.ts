import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;


// ============================================================
// SETTINGS
// ============================================================

const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY?.trim() ?? "";

const ETHERSCAN_V2 =
  "https://api.etherscan.io/v2/api";

const BASE_BLOCKSCOUT =
  "https://base.blockscout.com/api/v2";

const LOOKBACK_SEC =
  2 * 60 * 60;

const FUTURE_ALLOWANCE_SEC =
  30;

const PAGE_SIZE =
  1000;

const REQUEST_TIMEOUT_MS =
  8000;


// ============================================================
// TYPES
// ============================================================

type Json =
  Record<string, any>;

type Provider =
  | "etherscan"
  | "routescan"
  | "blockscout";


type SourceChain = {
  name: string;

  chainId: number;

  bridge: string;

  native: string;

  provider: Provider;

  apiUrl?: string;

  explorer: string;
};


type Receipt = {
  index: number;

  kind:
    | "ERC20"
    | "NATIVE";

  token: string;

  normalizedToken: string;

  amount: string;

  amountNumber: number;

  recipient: string;

  from: string;

  tokenAddress: string;

  likelyRecipient: boolean;
};


type SourceDeposit = {
  chain: string;

  timestamp: number;

  dateJst: string;

  token: string;

  normalizedToken: string;

  amount: string;

  amountNumber: number;

  sender: string;

  txHash: string;

  explorerUrl: string;
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


// ============================================================
// RHINO EVM DEPOSIT CONTRACTS
//
// Destination = Base なので Base 自体は除外
// BNBは現在保留
// ============================================================

const SOURCE_CHAINS:
  SourceChain[] = [

  {
    name: "Ethereum",

    chainId: 1,

    bridge:
      "0xbca3039a18c0d2f2f84ba8a028c67290bc045afa",

    native:
      "ETH",

    provider:
      "etherscan",

    explorer:
      "https://etherscan.io/tx/",
  },


  {
    name: "Arbitrum",

    chainId:
      42161,

    bridge:
      "0x10417734001162ea139e8b044dfe28dbb8b28ad0",

    native:
      "ETH",

    provider:
      "etherscan",

    explorer:
      "https://arbiscan.io/tx/",
  },


  {
    name:
      "Optimism",

    chainId:
      10,

    bridge:
      "0x0bca65bf4b4c8803d2f0b49353ed57caaf3d66dc",

    native:
      "ETH",

    provider:
      "blockscout",

    apiUrl:
      "https://optimism.blockscout.com/api",

    explorer:
      "https://optimistic.etherscan.io/tx/",
  },


  {
    name:
      "Polygon",

    chainId:
      137,

    bridge:
      "0xba4eee20f434bc3908a0b18da496348657133a7e",

    native:
      "POL",

    provider:
      "etherscan",

    explorer:
      "https://polygonscan.com/tx/",
  },


  {
    name:
      "Avalanche",

    chainId:
      43114,

    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",

    native:
      "AVAX",

    provider:
      "routescan",

    explorer:
      "https://snowtrace.io/tx/",
  },


  {
    name:
      "Linea",

    chainId:
      59144,

    bridge:
      "0xcf68a2721394dcf5dcf66f6265c1819720f24528",

    native:
      "ETH",

    provider:
      "etherscan",

    explorer:
      "https://lineascan.build/tx/",
  },


  {
    name:
      "Scroll",

    chainId:
      534352,

    bridge:
      "0x87627c7e586441eef9ee3c28b66662e897513f33",

    native:
      "ETH",

    provider:
      "blockscout",

    apiUrl:
      "https://scroll.blockscout.com/api",

    explorer:
      "https://scrollscan.com/tx/",
  },


  {
    name:
      "Mantle",

    chainId:
      5000,

    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",

    native:
      "MNT",

    provider:
      "etherscan",

    explorer:
      "https://mantlescan.xyz/tx/",
  },


  {
    name:
      "Blast",

    chainId:
      81457,

    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",

    native:
      "ETH",

    provider:
      "etherscan",

    explorer:
      "https://blastscan.io/tx/",
  },
];


// ============================================================
// UTILS
// ============================================================

function normalizeAddress(
  value?: string
) {
  return (
    value ?? ""
  ).toLowerCase();
}


function normalizeToken(
  value: string
) {
  const token =
    value
      .trim()
      .toUpperCase();

  const aliases:
    Record<string, string> = {

    "USDC":
      "USDC",

    "USDC.E":
      "USDC",

    "USDBC":
      "USDC",

    "USDC.E.E":
      "USDC",

    "USDT":
      "USDT",

    "USDT0":
      "USDT",

    "USD₮0":
      "USDT",

    "USD₮":
      "USDT",

    "USDT.E":
      "USDT",

    "ETH":
      "ETH",

    "WETH":
      "ETH",

    "AVAX":
      "AVAX",

    "POL":
      "POL",

    "MATIC":
      "POL",

    "MNT":
      "MNT",
  };


  return (
    aliases[token] ??
    token
  );
}


function formatUnits(
  raw:
    string,

  decimals:
    number
) {
  try {

    let digits =
      BigInt(
        raw || "0"
      ).toString();


    if (
      decimals === 0
    ) {
      return digits;
    }


    digits =
      digits.padStart(
        decimals + 1,
        "0"
      );


    const integer =
      digits.slice(
        0,
        -decimals
      );


    let fraction =
      digits.slice(
        -decimals
      );


    fraction =
      fraction.replace(
        /0+$/,
        ""
      );


    return fraction
      ? `${integer}.${fraction}`
      : integer;


  } catch {

    return String(
      raw ?? "0"
    );
  }
}


function dateJst(
  timestamp:
    number
) {
  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      timeZone:
        "Asia/Tokyo",

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit",

      hour12:
        false,
    }
  )
    .format(
      new Date(
        timestamp *
        1000
      )
    )
    .replace(
      /\//g,
      "-"
    );
}


function timestampFromIso(
  value?: string
) {
  if (!value) {
    return 0;
  }

  return Math.floor(
    Date.parse(
      value
    ) /
    1000
  );
}


// ============================================================
// HTTP
// ============================================================

async function fetchJson(
  url:
    string
) {
  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),

      REQUEST_TIMEOUT_MS
    );


  try {

    const response =
      await fetch(
        url,
        {
          cache:
            "no-store",

          signal:
            controller.signal,
        }
      );


    const text =
      await response.text();


    if (
      !response.ok
    ) {

      throw new Error(
        `HTTP ${response.status}: ${text.slice(0, 150)}`
      );
    }


    try {

      return JSON.parse(
        text
      ) as Json;


    } catch {

      throw new Error(
        `Invalid JSON: ${text.slice(0, 150)}`
      );
    }


  } finally {

    clearTimeout(
      timer
    );
  }
}


// ============================================================
// BASE DESTINATION PARSER
// ============================================================

async function loadBaseTransaction(
  txHash:
    string
) {

  const encoded =
    encodeURIComponent(
      txHash
    );


  const [
    tx,
    tokenTransfers,
    internalTransfers,
  ] =
    await Promise.all([

      fetchJson(
        `${BASE_BLOCKSCOUT}/transactions/${encoded}`
      ),

      fetchJson(
        `${BASE_BLOCKSCOUT}/transactions/${encoded}/token-transfers`
      )
        .catch(
          () => ({
            items: [],
          })
        ),

      fetchJson(
        `${BASE_BLOCKSCOUT}/transactions/${encoded}/internal-transactions`
      )
        .catch(
          () => ({
            items: [],
          })
        ),
    ]);


  const timestamp =
    timestampFromIso(
      tx.timestamp
    );


  if (!timestamp) {

    throw new Error(
      "Base TX timestamp could not be read."
    );
  }


  const receipts:
    Receipt[] = [];


  // ==========================================================
  // ERC20
  // ==========================================================

  const tokenItems =
    Array.isArray(
      tokenTransfers.items
    )
      ? tokenTransfers.items
      : [];


  for (
    const item
    of tokenItems
  ) {

    const token =
      item.token ?? {};

    const total =
      item.total ?? {};


    if (
      String(
        token.type ?? ""
      ).toUpperCase() !==
      "ERC-20"
    ) {
      continue;
    }


    const symbol =
      String(
        token.symbol ??
        ""
      );


    const rawValue =
      String(
        total.value ??
        "0"
      );


    const decimals =
      Number(
        token.decimals ??
        total.decimals ??
        18
      );


    const amount =
      formatUnits(
        rawValue,
        decimals
      );


    const recipient =
      normalizeAddress(
        item.to?.hash
      );


    const from =
      normalizeAddress(
        item.from?.hash
      );


    if (
      !recipient ||
      Number(amount) <= 0
    ) {
      continue;
    }


    receipts.push({

      index:
        receipts.length,

      kind:
        "ERC20",

      token:
        symbol,

      normalizedToken:
        normalizeToken(
          symbol
        ),

      amount,

      amountNumber:
        Number(
          amount
        ),

      recipient,

      from,

      tokenAddress:
        normalizeAddress(
          token.address_hash
        ),

      likelyRecipient:
        item.to?.is_contract ===
        false,
    });
  }


  // ==========================================================
  // INTERNAL NATIVE
  // ==========================================================

  const internalItems =
    Array.isArray(
      internalTransfers.items
    )
      ? internalTransfers.items
      : [];


  for (
    const item
    of internalItems
  ) {

    if (
      item.success === false
    ) {
      continue;
    }


    const raw =
      String(
        item.value ??
        "0"
      );


    try {

      if (
        BigInt(
          raw
        ) <=
        BigInt(0)
      ) {
        continue;
      }


    } catch {

      continue;
    }


    const recipient =
      normalizeAddress(
        item.to?.hash
      );


    if (!recipient) {
      continue;
    }


    const amount =
      formatUnits(
        raw,
        18
      );


    receipts.push({

      index:
        receipts.length,

      kind:
        "NATIVE",

      token:
        "ETH",

      normalizedToken:
        "ETH",

      amount,

      amountNumber:
        Number(
          amount
        ),

      recipient,

      from:
        normalizeAddress(
          item.from?.hash
        ),

      tokenAddress:
        "",

      likelyRecipient:
        item.to?.is_contract ===
        false,
    });
  }


  // ==========================================================
  // TOP-LEVEL NATIVE
  // ==========================================================

  const topValue =
    String(
      tx.value ??
      "0"
    );


  try {

    if (
      BigInt(
        topValue
      ) >
      BigInt(0)
    ) {

      const recipient =
        normalizeAddress(
          tx.to?.hash
        );


      if (recipient) {

        const amount =
          formatUnits(
            topValue,
            18
          );


        receipts.push({

          index:
            receipts.length,

          kind:
            "NATIVE",

          token:
            "ETH",

          normalizedToken:
            "ETH",

          amount,

          amountNumber:
            Number(
              amount
            ),

          recipient,

          from:
            normalizeAddress(
              tx.from?.hash
            ),

          tokenAddress:
            "",

          likelyRecipient:
            tx.to?.is_contract ===
            false,
        });
      }
    }

  } catch {
    // ignore
  }


  // ==========================================================
  // DEDUPE
  // ==========================================================

  const unique =
    new Map<
      string,
      Receipt
    >();


  for (
    const receipt
    of receipts
  ) {

    const key =
      [
        receipt.kind,

        receipt.token,

        receipt.amount,

        receipt.recipient,

        receipt.from,
      ].join("|");


    if (
      !unique.has(
        key
      )
    ) {

      unique.set(
        key,
        receipt
      );
    }
  }


  const cleanReceipts =
    [
      ...unique.values(),
    ]
      .map(
        (
          receipt,
          index
        ) => ({
          ...receipt,
          index,
        })
      )
      .sort(
        (
          a,
          b
        ) => {

          if (
            a.likelyRecipient !==
            b.likelyRecipient
          ) {

            return a.likelyRecipient
              ? -1
              : 1;
          }


          return (
            b.amountNumber -
            a.amountNumber
          );
        }
      );


  return {

    txHash:
      normalizeAddress(
        tx.hash ??
        txHash
      ),

    timestamp,

    dateJst:
      dateJst(
        timestamp
      ),

    status:
      String(
        tx.status ??
        ""
      ),

    method:
      String(
        tx.method ??
        ""
      ),

    from:
      normalizeAddress(
        tx.from?.hash
      ),

    to:
      normalizeAddress(
        tx.to?.hash
      ),

    blockNumber:
      Number(
        tx.block_number ??
        0
      ),

    receipts:
      cleanReceipts,
  };
}


// ============================================================
// LEGACY API HELPERS
// ============================================================

function sourceApiUrl(
  chain:
    SourceChain
) {

  if (
    chain.provider ===
    "etherscan"
  ) {

    return ETHERSCAN_V2;
  }


  if (
    chain.provider ===
    "routescan"
  ) {

    return (
      "https://api.routescan.io/" +
      "v2/network/mainnet/evm/" +
      `${chain.chainId}/etherscan/api`
    );
  }


  if (
    chain.provider ===
    "blockscout"
  ) {

    if (
      !chain.apiUrl
    ) {

      throw new Error(
        "Blockscout URL missing"
      );
    }


    return chain.apiUrl;
  }


  throw new Error(
    "Unsupported provider"
  );
}


function providerParams(
  chain:
    SourceChain,

  params:
    URLSearchParams
) {

  if (
    chain.provider ===
    "etherscan"
  ) {

    if (
      !ETHERSCAN_API_KEY
    ) {

      throw new Error(
        "ETHERSCAN_API_KEY missing"
      );
    }


    params.set(
      "chainid",
      String(
        chain.chainId
      )
    );


    params.set(
      "apikey",
      ETHERSCAN_API_KEY
    );
  }
}


// ============================================================
// GET BLOCK BY TIMESTAMP
// ============================================================

async function blockByTime(
  chain:
    SourceChain,

  timestamp:
    number,

  closest:
    "before" |
    "after"
) {

  const params =
    new URLSearchParams({

      module:
        "block",

      action:
        "getblocknobytime",

      timestamp:
        String(
          timestamp
        ),

      closest,
    });


  providerParams(
    chain,
    params
  );


  const json =
    await fetchJson(
      `${sourceApiUrl(chain)}?${params.toString()}`
    );


  const result =
    json.result;


  if (
    typeof result ===
    "number"
  ) {

    return result;
  }


  if (
    typeof result ===
      "string" &&
    /^\d+$/.test(
      result
    )
  ) {

    return Number(
      result
    );
  }


  if (
    result &&
    typeof result ===
    "object"
  ) {

    const possible =
      result.blockNumber ??
      result.block_number ??
      result.number;


    if (
      typeof possible ===
      "number"
    ) {

      return possible;
    }


    if (
      typeof possible ===
        "string" &&
      /^\d+$/.test(
        possible
      )
    ) {

      return Number(
        possible
      );
    }
  }


  throw new Error(
    `${chain.name}: block-by-time failed`
  );
}


// ============================================================
// ACCOUNT ROWS
// ============================================================

async function accountRows(
  chain:
    SourceChain,

  action:
    "txlist" |
    "tokentx",

  address:
    string,

  startBlock:
    number,

  endBlock:
    number
) {

  const all:
    Json[] = [];


  for (
    let page = 1;
    page <= 3;
    page++
  ) {

    const params =
      new URLSearchParams({

        module:
          "account",

        action,

        address,

        startblock:
          String(
            startBlock
          ),

        endblock:
          String(
            endBlock
          ),

        page:
          String(
            page
          ),

        offset:
          String(
            PAGE_SIZE
          ),

        sort:
          "asc",
      });


    providerParams(
      chain,
      params
    );


    const json =
      await fetchJson(
        `${sourceApiUrl(chain)}?${params.toString()}`
      );


    if (
      Array.isArray(
        json.result
      )
    ) {

      const rows =
        json.result as Json[];


      all.push(
        ...rows
      );


      if (
        rows.length <
        PAGE_SIZE
      ) {

        break;
      }


      continue;
    }


    const message =
      (
        String(
          json.result ??
          ""
        ) +
        " " +
        String(
          json.message ??
          ""
        )
      )
        .toLowerCase();


    if (
      message.includes(
        "no transactions"
      ) ||

      message.includes(
        "no records"
      ) ||

      message.includes(
        "no token transfers"
      )
    ) {

      break;
    }


    throw new Error(
      `${chain.name}: ${json.message ?? ""} / ${json.result ?? ""}`
    );
  }


  return all;
}


// ============================================================
// DISCOVER RHINO DEPOSITS
// ============================================================

async function discoverDeposits(
  chain:
    SourceChain,

  startTimestamp:
    number,

  endTimestamp:
    number
) {

  const startBlock =
    await blockByTime(
      chain,
      startTimestamp,
      "after"
    );


  const endBlock =
    await blockByTime(
      chain,
      endTimestamp,
      "before"
    );


  const [
    normal,
    tokens,
  ] =
    await Promise.all([

      accountRows(
        chain,
        "txlist",
        chain.bridge,
        startBlock,
        endBlock
      ),

      accountRows(
        chain,
        "tokentx",
        chain.bridge,
        startBlock,
        endBlock
      ),
    ]);


  const bridge =
    normalizeAddress(
      chain.bridge
    );


  const deposits:
    SourceDeposit[] = [];


  for (
    const tx
    of normal
  ) {

    if (
      normalizeAddress(
        tx.to
      ) !==
      bridge
    ) {

      continue;
    }


    if (
      String(
        tx.isError ??
        "0"
      ) ===
      "1"
    ) {

      continue;
    }


    const hash =
      normalizeAddress(
        tx.hash
      );


    const timestamp =
      Number(
        tx.timeStamp ??
        0
      );


    if (
      timestamp <
        startTimestamp ||

      timestamp >
        endTimestamp
    ) {

      continue;
    }


    const sender =
      normalizeAddress(
        tx.from
      );


    const tokenTransfer =
      tokens.find(
        (
          transfer
        ) =>

          normalizeAddress(
            transfer.hash
          ) === hash &&

          normalizeAddress(
            transfer.to
          ) === bridge &&

          normalizeAddress(
            transfer.from
          ) === sender
      );


    if (
      tokenTransfer
    ) {

      const symbol =
        String(
          tokenTransfer.tokenSymbol ??
          ""
        );


      const amount =
        formatUnits(
          String(
            tokenTransfer.value ??
            "0"
          ),

          Number(
            tokenTransfer.tokenDecimal ??
            0
          )
        );


      if (
        Number(
          amount
        ) > 0
      ) {

        deposits.push({

          chain:
            chain.name,

          timestamp,

          dateJst:
            dateJst(
              timestamp
            ),

          token:
            symbol,

          normalizedToken:
            normalizeToken(
              symbol
            ),

          amount,

          amountNumber:
            Number(
              amount
            ),

          sender,

          txHash:
            hash,

          explorerUrl:
            chain.explorer +
            hash,
        });
      }


      continue;
    }


    // ========================================================
    // NATIVE
    // ========================================================

    const raw =
      String(
        tx.value ??
        "0"
      );


    try {

      if (
        BigInt(
          raw
        ) <=
        BigInt(0)
      ) {

        continue;
      }


    } catch {

      continue;
    }


    const amount =
      formatUnits(
        raw,
        18
      );


    deposits.push({

      chain:
        chain.name,

      timestamp,

      dateJst:
        dateJst(
          timestamp
        ),

      token:
        chain.native,

      normalizedToken:
        normalizeToken(
          chain.native
        ),

      amount,

      amountNumber:
        Number(
          amount
        ),

      sender,

      txHash:
        hash,

      explorerUrl:
        chain.explorer +
        hash,
    });
  }


  return deposits;
}


// ============================================================
// MAP LIMIT
// ============================================================

async function mapLimit<
  T,
  R
>(
  items:
    T[],

  limit:
    number,

  worker:
    (
      item: T
    ) =>
      Promise<R>
) {

  const output =
    new Array<R>(
      items.length
    );


  let cursor =
    0;


  async function run() {

    while (true) {

      const index =
        cursor++;


      if (
        index >=
        items.length
      ) {

        return;
      }


      output[index] =
        await worker(
          items[index]
        );
    }
  }


  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          ),
      },

      () =>
        run()
    )
  );


  return output;
}


// ============================================================
// MATCH
// ============================================================

function makeCandidates(
  deposits:
    SourceDeposit[],

  receipts:
    Receipt[],

  destinationTimestamp:
    number
) {

  const candidates:
    Candidate[] = [];


  for (
    const deposit
    of deposits
  ) {

    for (
      const receipt
      of receipts
    ) {

      if (
        deposit.normalizedToken !==
        receipt.normalizedToken
      ) {

        continue;
      }


      if (
        deposit.amountNumber <= 0 ||
        receipt.amountNumber <= 0
      ) {

        continue;
      }


      const timeDiff =
        destinationTimestamp -
        deposit.timestamp;


      if (
        timeDiff <
        -FUTURE_ALLOWANCE_SEC
      ) {

        continue;
      }


      if (
        timeDiff >
        LOOKBACK_SEC
      ) {

        continue;
      }


      const ratio =
        receipt.amountNumber /
        deposit.amountNumber;


      if (
        ratio < 0.70 ||
        ratio > 1.03
      ) {

        continue;
      }


      const amountDiffPct =
        Math.abs(
          deposit.amountNumber -
          receipt.amountNumber
        ) /
        deposit.amountNumber *
        100;


      let score =
        100;


      const timePenalty =
        Math.min(
          30,

          Math.abs(
            timeDiff
          ) /
          LOOKBACK_SEC *
          30
        );


      const amountPenalty =
        Math.min(
          55,

          amountDiffPct *
          3
        );


      score -=
        timePenalty;

      score -=
        amountPenalty;


      // EOA受取っぽければ少し加点
      if (
        receipt.likelyRecipient
      ) {

        score +=
          2;
      }


      score =
        Math.min(
          100,
          score
        );


      let confidence:
        Candidate["confidence"];


      if (
        score >= 90
      ) {

        confidence =
          "VERY_HIGH";


      } else if (
        score >= 80
      ) {

        confidence =
          "HIGH";


      } else if (
        score >= 65
      ) {

        confidence =
          "MEDIUM";


      } else {

        confidence =
          "LOW";
      }


      candidates.push({

        sourceChain:
          deposit.chain,

        sourceDate:
          deposit.dateJst,

        sourceTx:
          deposit.txHash,

        sourceExplorerUrl:
          deposit.explorerUrl,

        token:
          deposit.token,

        amountIn:
          deposit.amount,

        amountOut:
          receipt.amount,

        recipient:
          receipt.recipient,

        destinationReceiptIndex:
          receipt.index,

        timeDiffSec:
          timeDiff,

        amountDiffPct:
          Number(
            amountDiffPct.toFixed(
              6
            )
          ),

        score:
          Number(
            score.toFixed(
              2
            )
          ),

        confidence,
      });
    }
  }


  return candidates
    .sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )
    .slice(
      0,
      15
    );
}


// ============================================================
// POST
// ============================================================

export async function POST(
  request:
    Request
) {

  const startedAt =
    Date.now();


  try {

    const body =
      await request.json();


    const destinationTx =
      String(
        body.txHash ??
        ""
      )
        .trim()
        .toLowerCase();


    if (
      !/^0x[a-f0-9]{64}$/.test(
        destinationTx
      )
    ) {

      return NextResponse.json(
        {
          error:
            "Invalid Base transaction hash.",
        },
        {
          status:
            400,
        }
      );
    }


    // ========================================================
    // 1. BASE TX ANALYZE
    // ========================================================

    const destination =
      await loadBaseTransaction(
        destinationTx
      );


    if (
      destination.receipts.length ===
      0
    ) {

      return NextResponse.json({

        destination: {
          ...destination,

          explorerUrl:
            `https://basescan.org/tx/${destinationTx}`,
        },

        candidates: [],

        warnings: [
          "このBase TXから受取Token/Native transferを抽出できませんでした。",
        ],

        nonEvm: {
          starknet:
            "NOT_YET_SEARCHED",

          solana:
            "NOT_YET_SEARCHED",
        },

        scanTimeMs:
          Date.now() -
          startedAt,
      });
    }


    // ========================================================
    // 2. SEARCH WINDOW
    // ========================================================

    const startTimestamp =
      destination.timestamp -
      LOOKBACK_SEC;


    const endTimestamp =
      destination.timestamp +
      FUTURE_ALLOWANCE_SEC;


    // ========================================================
    // 3. EVM RHINO DEPOSIT SEARCH
    // ========================================================

    const warnings:
      string[] = [];


    const perChain =
      await mapLimit(
        SOURCE_CHAINS,
        4,

        async (
          chain
        ) => {

          try {

            return await discoverDeposits(
              chain,
              startTimestamp,
              endTimestamp
            );


          } catch (
            error
          ) {

            warnings.push(
              `${chain.name}: ${
                error instanceof Error
                  ? error.message
                  : String(error)
              }`
            );


            return [];
          }
        }
      );


    const deposits =
      perChain.flat();


    // ========================================================
    // 4. MATCH
    // ========================================================

    const candidates =
      makeCandidates(
        deposits,
        destination.receipts,
        destination.timestamp
      );


    return NextResponse.json({

      destination: {
        ...destination,

        explorerUrl:
          `https://basescan.org/tx/${destinationTx}`,
      },

      searchWindow: {
        from:
          dateJst(
            startTimestamp
          ),

        to:
          dateJst(
            endTimestamp
          ),

        lookbackSec:
          LOOKBACK_SEC,
      },

      sourceDepositsFound:
        deposits.length,

      candidates,

      warnings,

      nonEvm: {
        starknet:
          "NOT_YET_SEARCHED",

        solana:
          "NOT_YET_SEARCHED",
      },

      scanTimeMs:
        Date.now() -
        startedAt,
    });


  } catch (
    error
  ) {

    console.error(
      "REVERSE LOOKUP ERROR",
      error
    );


    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Reverse lookup failed.",
      },
      {
        status:
          500,
      }
    );
  }
}