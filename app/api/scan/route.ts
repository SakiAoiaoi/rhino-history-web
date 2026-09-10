import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================
// PERIOD
// 2026年 JST
// ============================================================

const SCAN_YEAR = 2026;
const JST_OFFSET_SEC = 9 * 60 * 60;

// 2026-01-01 00:00:00 JST
const START_TIMESTAMP =
  Math.floor(Date.UTC(SCAN_YEAR, 0, 1, 0, 0, 0) / 1000) -
  JST_OFFSET_SEC;

// 2027-01-01 00:00:00 JST
const END_TIMESTAMP =
  Math.floor(Date.UTC(SCAN_YEAR + 1, 0, 1, 0, 0, 0) / 1000) -
  JST_OFFSET_SEC;


// ============================================================
// SETTINGS
// ============================================================

const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY?.trim() ?? "";

const ETHERSCAN_URL =
  "https://api.etherscan.io/v2/api";

const PAGE_SIZE = 1000;

const MAX_TIME_DIFF_SEC =
  2 * 60 * 60;

const MIN_AMOUNT_RATIO = 0.70;
const MAX_AMOUNT_RATIO = 1.02;

const AUTO_ASSIGN_MIN_SCORE = 80;
const REVIEW_MIN_SCORE = 65;

const REQUEST_TIMEOUT_MS = 8000;

const CHAIN_CONCURRENCY = 4;
const INTERNAL_CONCURRENCY = 4;


// ============================================================
// TYPES
// ============================================================

type ExplorerAction =
  | "txlist"
  | "tokentx"
  | "txlistinternal";

type ProviderName =
  | "Etherscan"
  | "Routescan"
  | "Blockscout";

type ExplorerTx =
  Record<string, string | undefined>;

type ChainConfig = {
  name: string;
  chainId: number;
  bridge: string;
  native: string;

  blockscout?: string;

  providers: ProviderName[];
};

type HistoryResult = {
  rows: ExplorerTx[];
  provider: string;
  warning?: string;
};

type ChainData = {
  config: ChainConfig;

  startBlock: number;

  normal: ExplorerTx[];
  tokens: ExplorerTx[];
  internal: ExplorerTx[];

  providers: {
    normal: string;
    tokens: string;
    internal: string;
  };

  warnings: string[];
};

type SourceRecord = {
  id: string;

  timestamp: number;
  dateJst: string;

  fromChain: string;

  token: string;
  normalizedToken: string;

  amountIn: string;
  amountNumber: number;

  sourceTx: string;

  functionName: string;
  commitmentId: string;

  assetType:
    | "ERC20"
    | "NATIVE";
};

type IncomingRecord = {
  id: string;

  timestamp: number;
  dateJst: string;

  chain: string;

  token: string;
  normalizedToken: string;

  amount: string;
  amountNumber: number;

  recipient: string;
  from: string;

  txHash: string;

  type:
    | "ERC20"
    | "NATIVE"
    | "INTERNAL";
};

type MatchEdge = {
  source: SourceRecord;
  destination: IncomingRecord;

  score: number;

  confidence:
    | "VERY_HIGH"
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  timeDiffSec: number;
  amountDiffPct: number;
};


// ============================================================
// CHAINS
//
// Base / Optimism / Scroll → Blockscout
// Avalanche → Routescan優先
// その他 → Etherscan優先
//
// BNBは現在除外
// ============================================================

const CHAINS: ChainConfig[] = [
  {
    name: "Ethereum",
    chainId: 1,
    bridge:
      "0xbca3039a18c0d2f2f84ba8a028c67290bc045afa",
    native: "ETH",
    providers: [
      "Etherscan",
      "Routescan",
    ],
  },

  {
    name: "Arbitrum",
    chainId: 42161,
    bridge:
      "0x10417734001162ea139e8b044dfe28dbb8b28ad0",
    native: "ETH",
    providers: [
      "Etherscan",
      "Routescan",
    ],
  },

  {
    name: "Base",
    chainId: 8453,
    bridge:
      "0x2f59e9086ec8130e21bd052065a9e6b2497bb102",
    native: "ETH",
    blockscout:
      "https://base.blockscout.com/api",
    providers: [
      "Blockscout",
    ],
  },

  {
    name: "Optimism",
    chainId: 10,
    bridge:
      "0x0bca65bf4b4c8803d2f0b49353ed57caaf3d66dc",
    native: "ETH",
    blockscout:
      "https://optimism.blockscout.com/api",
    providers: [
      "Blockscout",
    ],
  },

  {
    name: "Polygon",
    chainId: 137,
    bridge:
      "0xba4eee20f434bc3908a0b18da496348657133a7e",
    native: "POL",
    providers: [
      "Etherscan",
      "Routescan",
    ],
  },

  {
    name: "Avalanche",
    chainId: 43114,
    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",
    native: "AVAX",
    providers: [
      "Routescan",
      "Etherscan",
    ],
  },

  {
    name: "Linea",
    chainId: 59144,
    bridge:
      "0xcf68a2721394dcf5dcf66f6265c1819720f24528",
    native: "ETH",
    providers: [
      "Etherscan",
      "Routescan",
    ],
  },

  {
    name: "Scroll",
    chainId: 534352,
    bridge:
      "0x87627c7e586441eef9ee3c28b66662e897513f33",
    native: "ETH",
    blockscout:
      "https://scroll.blockscout.com/api",
    providers: [
      "Blockscout",
    ],
  },

  {
    name: "Mantle",
    chainId: 5000,
    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",
    native: "MNT",
    providers: [
      "Etherscan",
      "Routescan",
    ],
  },

  {
    name: "Blast",
    chainId: 81457,
    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",
    native: "ETH",
    providers: [
      "Etherscan",
      "Routescan",
    ],
  },
];


// ============================================================
// CACHE
//
// 2026開始blockは同じなので
// warm Vercel Functionでは再利用
// ============================================================

const startBlockCache =
  new Map<number, number>();


// ============================================================
// TOKEN NORMALIZATION
// ============================================================

function normalizeToken(
  symbol: string
) {
  const clean =
    symbol
      .trim()
      .toUpperCase();

  const aliases:
    Record<string, string> = {
      "USDC": "USDC",
      "USDC.E": "USDC",

      "USDT": "USDT",
      "USDT0": "USDT",
      "USD₮0": "USDT",
      "USD₮": "USDT",
      "USDT.E": "USDT",

      "ETH": "ETH",
      "WETH": "ETH",

      "AVAX": "AVAX",

      "MATIC": "POL",
      "POL": "POL",

      "MNT": "MNT",
    };

  return aliases[clean] ?? clean;
}


// ============================================================
// BASIC UTILS
// ============================================================

function sleep(ms: number) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


function normalizeAddress(
  address?: string
) {
  return (
    address ?? ""
  ).toLowerCase();
}


function txHash(
  tx: ExplorerTx
) {
  return (
    tx.hash ??
    tx.transactionHash ??
    ""
  ).toLowerCase();
}


function timestampOf(
  tx: ExplorerTx
) {
  return Number(
    tx.timeStamp ?? 0
  );
}


function isInPeriod(
  timestamp: number
) {
  return (
    timestamp >= START_TIMESTAMP &&
    timestamp < END_TIMESTAMP
  );
}


function functionNameOf(
  tx: ExplorerTx
) {
  const raw =
    tx.functionName ?? "";

  if (!raw) {
    return "";
  }

  return (
    raw.split("(")[0]?.trim() ??
    ""
  );
}


// ============================================================
// FORMAT UNITS
// ============================================================

function formatUnits(
  rawValue: string,
  decimals: number
) {
  try {
    let digits =
      BigInt(
        rawValue || "0"
      ).toString();

    if (decimals === 0) {
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

    if (!fraction) {
      return integer;
    }

    return (
      integer +
      "." +
      fraction
    );

  } catch {
    return "0";
  }
}


// ============================================================
// JST
// ============================================================

function dateJst(
  timestamp: number
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
        timestamp * 1000
      )
    )
    .replace(
      /\//g,
      "-"
    );
}


// ============================================================
// COMMITMENT ID
// ============================================================

function readAbiWord(
  input: string,
  index: number
) {
  try {
    if (
      !input ||
      !input.startsWith("0x")
    ) {
      return "";
    }

    const payload =
      input.slice(10);

    const start =
      index * 64;

    const word =
      payload.slice(
        start,
        start + 64
      );

    if (
      word.length !== 64
    ) {
      return "";
    }

    return BigInt(
      "0x" + word
    ).toString();

  } catch {
    return "";
  }
}


function getCommitmentId(
  tx: ExplorerTx
) {
  const fn =
    functionNameOf(tx)
      .toLowerCase();

  const input =
    tx.input ?? "";

  if (
    fn === "depositwithid"
  ) {
    return readAbiWord(
      input,
      2
    );
  }

  if (
    fn === "depositnativewithid"
  ) {
    return readAbiWord(
      input,
      0
    );
  }

  if (
    fn === "depositwithpermit"
  ) {
    return readAbiWord(
      input,
      6
    );
  }

  return "";
}


// ============================================================
// HTTP
// ============================================================

async function requestJson(
  url: string,
  params: URLSearchParams
) {
  let lastError = "";

  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
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
          `${url}?${params.toString()}`,
          {
            cache: "no-store",
            signal:
              controller.signal,
          }
        );

      const text =
        await response.text();

      let data:
        Record<string, unknown>;

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new Error(
          `Invalid JSON: ${text.slice(0, 120)}`
        );
      }

      const responseText =
        (
          String(
            data.result ?? ""
          ) +
          " " +
          String(
            data.message ?? ""
          )
        ).toLowerCase();

      const rateLimited =
        response.status === 429 ||
        responseText.includes(
          "rate limit"
        ) ||
        responseText.includes(
          "max rate"
        );

      if (rateLimited) {
        if (
          attempt < 2
        ) {
          await sleep(
            500 * attempt
          );

          continue;
        }

        throw new Error(
          "API rate limit"
        );
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      return data;

    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        attempt < 2
      ) {
        await sleep(
          350 * attempt
        );
      }

    } finally {
      clearTimeout(
        timer
      );
    }
  }

  throw new Error(
    lastError ||
    "Request failed"
  );
}


// ============================================================
// PROVIDER URL
// ============================================================

function getProviderUrl(
  config: ChainConfig,
  provider: ProviderName
) {
  if (
    provider ===
    "Etherscan"
  ) {
    return ETHERSCAN_URL;
  }

  if (
    provider ===
    "Routescan"
  ) {
    return (
      "https://api.routescan.io/" +
      "v2/network/mainnet/evm/" +
      `${config.chainId}/` +
      "etherscan/api"
    );
  }

  if (
    provider ===
    "Blockscout"
  ) {
    if (
      !config.blockscout
    ) {
      throw new Error(
        "Blockscout not configured"
      );
    }

    return config.blockscout;
  }

  throw new Error(
    "Unknown provider"
  );
}


// ============================================================
// PROVIDER PARAMS
// ============================================================

function addProviderParams(
  params: URLSearchParams,
  config: ChainConfig,
  provider: ProviderName
) {
  if (
    provider ===
    "Etherscan"
  ) {
    if (
      !ETHERSCAN_API_KEY
    ) {
      throw new Error(
        "ETHERSCAN_API_KEY is missing"
      );
    }

    params.set(
      "chainid",
      String(
        config.chainId
      )
    );

    params.set(
      "apikey",
      ETHERSCAN_API_KEY
    );
  }
}


// ============================================================
// GET BLOCK BY TIME
// ============================================================

async function getStartBlockFromProvider(
  config: ChainConfig,
  provider: ProviderName
) {
  const url =
    getProviderUrl(
      config,
      provider
    );

  const params =
    new URLSearchParams({
      module:
        "block",

      action:
        "getblocknobytime",

      timestamp:
        String(
          START_TIMESTAMP
        ),

      closest:
        "after",
    });

  addProviderParams(
    params,
    config,
    provider
  );

  const data =
    await requestJson(
      url,
      params
    );

  const result =
    data.result;

  if (
    typeof result ===
    "number"
  ) {
    return result;
  }

  if (
    typeof result ===
    "string"
  ) {
    const match =
      result.match(
        /^\d+$/
      );

    if (match) {
      return Number(
        result
      );
    }
  }

  if (
    result &&
    typeof result ===
    "object"
  ) {
    const obj =
      result as Record<
        string,
        unknown
      >;

    const candidate =
      obj.blockNumber ??
      obj.block_number ??
      obj.number;

    if (
      typeof candidate ===
      "number"
    ) {
      return candidate;
    }

    if (
      typeof candidate ===
      "string" &&
      /^\d+$/.test(candidate)
    ) {
      return Number(
        candidate
      );
    }
  }

  throw new Error(
    `Cannot resolve 2026 start block`
  );
}


async function resolveStartBlock(
  config: ChainConfig
) {
  const cached =
    startBlockCache.get(
      config.chainId
    );

  if (
    cached !== undefined
  ) {
    return {
      startBlock:
        cached,

      warning:
        "",
    };
  }

  const errors:
    string[] = [];

  for (
    const provider
    of config.providers
  ) {
    try {
      const block =
        await getStartBlockFromProvider(
          config,
          provider
        );

      startBlockCache.set(
        config.chainId,
        block
      );

      return {
        startBlock:
          block,

        warning:
          "",
      };

    } catch (error) {
      errors.push(
        `${provider}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }
  }

  // 取れなければ0にfallback。
  // 正確性優先。
  return {
    startBlock:
      0,

    warning:
      `${config.name}: 2026 start block lookup failed. ` +
      `Fallback to block 0. ${errors.join(" | ")}`,
  };
}


// ============================================================
// HISTORY PAGE
//
// Blockscout internalのように
// warning + result配列の場合も配列を採用
// ============================================================

async function historyPage(
  config: ChainConfig,
  provider: ProviderName,
  action: ExplorerAction,
  address: string,
  startBlock: number,
  page: number
): Promise<{
  rows: ExplorerTx[];
  warning?: string;
}> {
  const url =
    getProviderUrl(
      config,
      provider
    );

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
        "9999999999",

      page:
        String(page),

      offset:
        String(
          PAGE_SIZE
        ),

      sort:
        "asc",
    });

  addProviderParams(
    params,
    config,
    provider
  );

  const data =
    await requestJson(
      url,
      params
    );

  // 配列ならstatus=0でも利用
  if (
    Array.isArray(
      data.result
    )
  ) {
    const rows =
      data.result as ExplorerTx[];

    const message =
      String(
        data.message ?? ""
      ).trim();

    let warning:
      string | undefined;

    if (
      rows.length > 0 &&
      message &&
      message.toUpperCase() !==
        "OK"
    ) {
      warning =
        message;
    }

    return {
      rows,
      warning,
    };
  }

  const combined =
    (
      String(
        data.result ?? ""
      ) +
      " " +
      String(
        data.message ?? ""
      )
    ).toLowerCase();

  if (
    combined.includes(
      "no transactions found"
    ) ||
    combined.includes(
      "no records found"
    ) ||
    combined.includes(
      "no token transfers found"
    )
  ) {
    return {
      rows: [],
    };
  }

  throw new Error(
    `${data.message ?? ""} / ${data.result ?? ""}`
  );
}


// ============================================================
// ALL PAGES
// ============================================================

async function allPages(
  config: ChainConfig,
  provider: ProviderName,
  action: ExplorerAction,
  address: string,
  startBlock: number
) {
  const result:
    ExplorerTx[] = [];

  let warning = "";
  let page = 1;

  while (true) {
    const current =
      await historyPage(
        config,
        provider,
        action,
        address,
        startBlock,
        page
      );

    result.push(
      ...current.rows
    );

    if (
      current.warning &&
      !warning
    ) {
      warning =
        current.warning;
    }

    if (
      current.rows.length <
      PAGE_SIZE
    ) {
      break;
    }

    page++;
  }

  // 念のためTimestampでも2026に限定
  const filtered =
    result.filter(
      (tx) =>
        isInPeriod(
          timestampOf(tx)
        )
    );

  return {
    rows:
      filtered,

    warning,
  };
}


// ============================================================
// FETCH HISTORY
// ============================================================

async function fetchHistory(
  config: ChainConfig,
  action: ExplorerAction,
  address: string,
  startBlock: number
): Promise<HistoryResult> {
  const errors:
    string[] = [];

  let hadEmpty =
    false;

  let firstEmptyProvider =
    "";

  for (
    const provider
    of config.providers
  ) {
    try {
      const result =
        await allPages(
          config,
          provider,
          action,
          address,
          startBlock
        );

      if (
        result.rows.length >
        0
      ) {
        return {
          rows:
            result.rows,

          provider,

          warning:
            result.warning,
        };
      }

      hadEmpty =
        true;

      if (
        !firstEmptyProvider
      ) {
        firstEmptyProvider =
          provider;
      }

    } catch (error) {
      errors.push(
        `${provider}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }
  }

  if (hadEmpty) {
    return {
      rows: [],

      provider:
        firstEmptyProvider ||
        "No records",
    };
  }

  throw new Error(
    errors.join(" | ")
  );
}


// ============================================================
// CONCURRENCY LIMIT
// ============================================================

async function mapLimit<
  T,
  R
>(
  items: T[],
  limit: number,
  worker:
    (item: T) =>
      Promise<R>
) {
  const output =
    new Array<R>(
      items.length
    );

  let nextIndex =
    0;

  async function runner() {
    while (true) {
      const index =
        nextIndex++;

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
        runner()
    )
  );

  return output;
}


// ============================================================
// LOAD NORMAL + ERC20
//
// ★ 同じchainの2種類も並列
// ============================================================

async function loadBasicChain(
  config: ChainConfig,
  address: string
): Promise<ChainData> {
  const warnings:
    string[] = [];

  const blockInfo =
    await resolveStartBlock(
      config
    );

  if (
    blockInfo.warning
  ) {
    warnings.push(
      blockInfo.warning
    );
  }

  const startBlock =
    blockInfo.startBlock;

  const [
    normalResult,
    tokenResult,
  ] =
    await Promise.allSettled([
      fetchHistory(
        config,
        "txlist",
        address,
        startBlock
      ),

      fetchHistory(
        config,
        "tokentx",
        address,
        startBlock
      ),
    ]);

  let normal:
    ExplorerTx[] = [];

  let tokens:
    ExplorerTx[] = [];

  let normalProvider =
    "";

  let tokenProvider =
    "";

  if (
    normalResult.status ===
    "fulfilled"
  ) {
    normal =
      normalResult.value.rows;

    normalProvider =
      normalResult.value.provider;

    if (
      normalResult.value.warning
    ) {
      warnings.push(
        `${config.name} normal (${normalProvider}): ` +
        normalResult.value.warning
      );
    }

  } else {
    warnings.push(
      `${config.name} normal: ${normalResult.reason}`
    );
  }

  if (
    tokenResult.status ===
    "fulfilled"
  ) {
    tokens =
      tokenResult.value.rows;

    tokenProvider =
      tokenResult.value.provider;

    if (
      tokenResult.value.warning
    ) {
      warnings.push(
        `${config.name} ERC20 (${tokenProvider}): ` +
        tokenResult.value.warning
      );
    }

  } else {
    warnings.push(
      `${config.name} ERC20: ${tokenResult.reason}`
    );
  }

  return {
    config,
    startBlock,

    normal,
    tokens,

    internal: [],

    providers: {
      normal:
        normalProvider,

      tokens:
        tokenProvider,

      internal:
        "",
    },

    warnings,
  };
}


// ============================================================
// LOAD INTERNAL
// ============================================================

async function loadInternal(
  chain:
    ChainData,

  address:
    string
) {
  try {
    const result =
      await fetchHistory(
        chain.config,
        "txlistinternal",
        address,
        chain.startBlock
      );

    chain.internal =
      result.rows;

    chain.providers.internal =
      result.provider;

    if (
      result.warning
    ) {
      chain.warnings.push(
        `${chain.config.name} internal (${result.provider}): ${result.warning}`
      );
    }

  } catch (error) {
    chain.warnings.push(
      `${chain.config.name} internal: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}


// ============================================================
// BUILD RHINO SOURCES
// ============================================================

function buildSources(
  data: ChainData[],
  wallet: string
) {
  const sources:
    SourceRecord[] = [];

  for (
    const chain
    of data
  ) {
    const bridge =
      chain.config.bridge
        .toLowerCase();

    for (
      const tx
      of chain.normal
    ) {
      const timestamp =
        timestampOf(tx);

      if (
        !isInPeriod(
          timestamp
        )
      ) {
        continue;
      }

      if (
        normalizeAddress(
          tx.to
        ) !== bridge
      ) {
        continue;
      }

      const hash =
        txHash(tx);

      const relatedToken =
        chain.tokens.find(
          (tokenTx) =>
            txHash(
              tokenTx
            ) === hash &&

            normalizeAddress(
              tokenTx.from
            ) === wallet &&

            normalizeAddress(
              tokenTx.to
            ) === bridge
        );

      let token =
        "";

      let amount =
        "0";

      let assetType:
        "ERC20" | "NATIVE" =
        "NATIVE";

      if (
        relatedToken
      ) {
        assetType =
          "ERC20";

        token =
          relatedToken.tokenSymbol ??
          "";

        amount =
          formatUnits(
            relatedToken.value ??
              "0",

            Number(
              relatedToken.tokenDecimal ??
                0
            )
          );

      } else {
        const rawValue =
          tx.value ?? "0";

        if (
          BigInt(
            rawValue || "0"
          ) >
          BigInt(0)
        ) {
          token =
            chain.config.native;

          amount =
            formatUnits(
              rawValue,
              18
            );
        }
      }

      sources.push({
        id:
          `${chain.config.name}|${hash}`,

        timestamp,

        dateJst:
          dateJst(
            timestamp
          ),

        fromChain:
          chain.config.name,

        token,

        normalizedToken:
          normalizeToken(
            token
          ),

        amountIn:
          amount,

        amountNumber:
          Number(
            amount
          ),

        sourceTx:
          hash,

        functionName:
          functionNameOf(tx),

        commitmentId:
          getCommitmentId(tx),

        assetType,
      });
    }
  }

  sources.sort(
    (a, b) =>
      a.timestamp -
      b.timestamp
  );

  return sources;
}


// ============================================================
// BUILD INCOMING
// ============================================================

function buildIncoming(
  data: ChainData[],
  wallet: string
) {
  const incoming:
    IncomingRecord[] = [];

  for (
    const chain
    of data
  ) {

    // ERC20
    for (
      const tx
      of chain.tokens
    ) {
      const timestamp =
        timestampOf(tx);

      if (
        !isInPeriod(
          timestamp
        )
      ) {
        continue;
      }

      if (
        normalizeAddress(
          tx.to
        ) !== wallet
      ) {
        continue;
      }

      const hash =
        txHash(tx);

      const token =
        tx.tokenSymbol ?? "";

      const amount =
        formatUnits(
          tx.value ?? "0",

          Number(
            tx.tokenDecimal ??
              0
          )
        );

      incoming.push({
        id:
          `${chain.config.name}|ERC20|${hash}|` +
          `${tx.logIndex ?? tx.transactionIndex ?? ""}|` +
          `${tx.contractAddress ?? ""}|${amount}`,

        timestamp,

        dateJst:
          dateJst(
            timestamp
          ),

        chain:
          chain.config.name,

        token,

        normalizedToken:
          normalizeToken(
            token
          ),

        amount,

        amountNumber:
          Number(
            amount
          ),

        recipient:
          wallet,

        from:
          normalizeAddress(
            tx.from
          ),

        txHash:
          hash,

        type:
          "ERC20",
      });
    }


    // NORMAL NATIVE
    for (
      const tx
      of chain.normal
    ) {
      const timestamp =
        timestampOf(tx);

      if (
        !isInPeriod(
          timestamp
        )
      ) {
        continue;
      }

      if (
        normalizeAddress(
          tx.to
        ) !== wallet
      ) {
        continue;
      }

      const raw =
        tx.value ?? "0";

      if (
        BigInt(
          raw || "0"
        ) <=
        BigInt(0)
      ) {
        continue;
      }

      const amount =
        formatUnits(
          raw,
          18
        );

      const hash =
        txHash(tx);

      incoming.push({
        id:
          `${chain.config.name}|NATIVE|${hash}|${amount}`,

        timestamp,

        dateJst:
          dateJst(
            timestamp
          ),

        chain:
          chain.config.name,

        token:
          chain.config.native,

        normalizedToken:
          normalizeToken(
            chain.config.native
          ),

        amount,

        amountNumber:
          Number(
            amount
          ),

        recipient:
          wallet,

        from:
          normalizeAddress(
            tx.from
          ),

        txHash:
          hash,

        type:
          "NATIVE",
      });
    }


    // INTERNAL
    for (
      const tx
      of chain.internal
    ) {
      const timestamp =
        timestampOf(tx);

      if (
        !isInPeriod(
          timestamp
        )
      ) {
        continue;
      }

      if (
        normalizeAddress(
          tx.to
        ) !== wallet
      ) {
        continue;
      }

      const raw =
        tx.value ?? "0";

      if (
        BigInt(
          raw || "0"
        ) <=
        BigInt(0)
      ) {
        continue;
      }

      const amount =
        formatUnits(
          raw,
          18
        );

      const hash =
        txHash(tx);

      incoming.push({
        id:
          `${chain.config.name}|INTERNAL|${hash}|` +
          `${tx.traceId ?? tx.index ?? ""}|${amount}`,

        timestamp,

        dateJst:
          dateJst(
            timestamp
          ),

        chain:
          chain.config.name,

        token:
          chain.config.native,

        normalizedToken:
          normalizeToken(
            chain.config.native
          ),

        amount,

        amountNumber:
          Number(
            amount
          ),

        recipient:
          wallet,

        from:
          normalizeAddress(
            tx.from
          ),

        txHash:
          hash,

        type:
          "INTERNAL",
      });
    }
  }


  // ==========================================================
  // DEDUPE
  // ==========================================================

  const unique =
    new Map<
      string,
      IncomingRecord
    >();

  for (
    const item
    of incoming
  ) {
    unique.set(
      item.id,
      item
    );
  }

  return [
    ...unique.values(),
  ];
}


// ============================================================
// MATCH SCORE
// ============================================================

function scoreCandidate(
  source: SourceRecord,
  destination: IncomingRecord
): MatchEdge | null {
  if (
    source.fromChain ===
    destination.chain
  ) {
    return null;
  }

  if (
    source.normalizedToken !==
    destination.normalizedToken
  ) {
    return null;
  }

  if (
    source.amountNumber <= 0 ||
    destination.amountNumber <= 0
  ) {
    return null;
  }

  const timeDiffSec =
    destination.timestamp -
    source.timestamp;

  if (
    timeDiffSec < -30 ||
    timeDiffSec >
      MAX_TIME_DIFF_SEC
  ) {
    return null;
  }

  const ratio =
    destination.amountNumber /
    source.amountNumber;

  if (
    ratio <
      MIN_AMOUNT_RATIO ||
    ratio >
      MAX_AMOUNT_RATIO
  ) {
    return null;
  }

  const amountDiffPct =
    Math.abs(
      source.amountNumber -
      destination.amountNumber
    ) /
    source.amountNumber *
    100;

  let score =
    100;

  const timePenalty =
    Math.min(
      30,
      Math.abs(
        timeDiffSec
      ) /
        MAX_TIME_DIFF_SEC *
        30
    );

  const amountPenalty =
    Math.min(
      50,
      amountDiffPct * 3
    );

  score -=
    timePenalty;

  score -=
    amountPenalty;

  let confidence:
    MatchEdge["confidence"];

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

  return {
    source,
    destination,
    score,
    confidence,
    timeDiffSec,
    amountDiffPct,
  };
}


// ============================================================
// BUILD CANDIDATES
// ============================================================

function buildEdges(
  sources:
    SourceRecord[],

  incoming:
    IncomingRecord[]
) {
  const edges:
    MatchEdge[] = [];

  const bySource =
    new Map<
      string,
      MatchEdge[]
    >();

  for (
    const source
    of sources
  ) {
    const current:
      MatchEdge[] = [];

    for (
      const destination
      of incoming
    ) {
      const edge =
        scoreCandidate(
          source,
          destination
        );

      if (!edge) {
        continue;
      }

      edges.push(
        edge
      );

      current.push(
        edge
      );
    }

    current.sort(
      (a, b) =>
        b.score -
          a.score ||
        Math.abs(
          a.timeDiffSec
        ) -
          Math.abs(
            b.timeDiffSec
          )
    );

    bySource.set(
      source.id,
      current
    );
  }

  return {
    edges,
    bySource,
  };
}


// ============================================================
// ONE TO ONE
// ============================================================

function assignOneToOne(
  edges:
    MatchEdge[]
) {
  const eligible =
    edges
      .filter(
        (edge) =>
          edge.score >=
          AUTO_ASSIGN_MIN_SCORE
      )
      .sort(
        (a, b) =>
          b.score -
            a.score ||

          Math.abs(
            a.timeDiffSec
          ) -
            Math.abs(
              b.timeDiffSec
            ) ||

          a.amountDiffPct -
            b.amountDiffPct
      );

  const assignments =
    new Map<
      string,
      MatchEdge
    >();

  const usedSources =
    new Set<string>();

  const usedDestinations =
    new Set<string>();

  for (
    const edge
    of eligible
  ) {
    if (
      usedSources.has(
        edge.source.id
      )
    ) {
      continue;
    }

    if (
      usedDestinations.has(
        edge.destination.id
      )
    ) {
      continue;
    }

    assignments.set(
      edge.source.id,
      edge
    );

    usedSources.add(
      edge.source.id
    );

    usedDestinations.add(
      edge.destination.id
    );
  }

  return {
    assignments,
    usedDestinations,
  };
}


// ============================================================
// FINAL ROWS
// ============================================================

function buildRows(
  sources:
    SourceRecord[],

  bySource:
    Map<
      string,
      MatchEdge[]
    >,

  assignments:
    Map<
      string,
      MatchEdge
    >,

  usedDestinations:
    Set<string>
) {
  const rows =
    sources.map(
      (source) => {
        const assigned =
          assignments.get(
            source.id
          );

        if (assigned) {
          return {
            dateJst:
              source.dateJst,

            fromChain:
              source.fromChain,

            toChain:
              assigned.destination.chain,

            token:
              source.token,

            amountIn:
              source.amountIn,

            amountOut:
              assigned.destination.amount,

            amountDifference:
              (
                source.amountNumber -
                assigned.destination.amountNumber
              ).toString(),

            amountDiffPct:
              Number(
                assigned.amountDiffPct.toFixed(
                  6
                )
              ),

            travelTimeSec:
              assigned.timeDiffSec,

            status:
              "AUTO_MATCH",

            confidence:
              assigned.confidence,

            // UIでは非表示だが内部には残す
            score:
              Number(
                assigned.score.toFixed(
                  2
                )
              ),

            functionName:
              source.functionName,

            commitmentId:
              source.commitmentId,

            sourceTx:
              source.sourceTx,

            destinationTx:
              assigned.destination.txHash,

            destinationFrom:
              assigned.destination.from,
          };
        }

        const candidates =
          bySource.get(
            source.id
          ) ?? [];

        const bestAvailable =
          candidates.find(
            (edge) =>
              !usedDestinations.has(
                edge.destination.id
              )
          );

        const isReview =
          Boolean(
            bestAvailable &&
            bestAvailable.score >=
              REVIEW_MIN_SCORE
          );

        return {
          dateJst:
            source.dateJst,

          fromChain:
            source.fromChain,

          toChain:
            "",

          token:
            source.token,

          amountIn:
            source.amountIn,

          amountOut:
            "",

          amountDifference:
            "",

          amountDiffPct:
            null,

          travelTimeSec:
            null,

          status:
            isReview
              ? "REVIEW"
              : "UNRESOLVED",

          confidence:
            isReview
              ? bestAvailable?.confidence ??
                "MEDIUM"
              : "NONE",

          score:
            isReview &&
            bestAvailable
              ? Number(
                  bestAvailable.score.toFixed(
                    2
                  )
                )
              : null,

          functionName:
            source.functionName,

          commitmentId:
            source.commitmentId,

          sourceTx:
            source.sourceTx,

          destinationTx:
            "",

          destinationFrom:
            "",
        };
      }
    );

  return rows.reverse();
}


// ============================================================
// CHAIN STATS
// ============================================================

function buildChainStats(
  data:
    ChainData[]
) {
  return data.map(
    (chain) => ({
      chain:
        chain.config.name,

      startBlock:
        chain.startBlock,

      normal:
        chain.normal.length,

      erc20:
        chain.tokens.length,

      internal:
        chain.internal.length,

      providers:
        chain.providers,
    })
  );
}


// ============================================================
// POST /api/scan
// ============================================================

export async function POST(
  request: Request
) {
  const startedAt =
    Date.now();

  try {
    const body =
      await request.json();

    const wallet =
      String(
        body.address ?? ""
      )
        .trim()
        .toLowerCase();

    if (
      !/^0x[a-f0-9]{40}$/.test(
        wallet
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid EVM wallet address",
        },
        {
          status:
            400,
        }
      );
    }

    if (
      !ETHERSCAN_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "ETHERSCAN_API_KEY is not configured on the server.",
        },
        {
          status:
            500,
        }
      );
    }


    // ========================================================
    // STEP 1
    // 2026年 Normal + ERC20
    // ========================================================

    const chainData =
      await mapLimit(
        CHAINS,
        CHAIN_CONCURRENCY,

        (config) =>
          loadBasicChain(
            config,
            wallet
          )
      );


    // ========================================================
    // STEP 2
    // SOURCEを先に確定
    // ========================================================

    let sources =
      buildSources(
        chainData,
        wallet
      );


    // ========================================================
    // STEP 3
    // Native bridgeがある場合だけInternal取得
    //
    // しかも同じNative Assetを持つchainだけ。
    //
    // 例:
    // ETHなら Ethereum / Arb / Base / OP /
    // Linea / Scroll / Blast など
    // ========================================================

    const requiredNativeTokens =
      new Set(
        sources
          .filter(
            (source) =>
              source.assetType ===
              "NATIVE"
          )
          .map(
            (source) =>
              source.normalizedToken
          )
      );


    const chainsNeedingInternal =
      chainData.filter(
        (chain) =>
          requiredNativeTokens.has(
            normalizeToken(
              chain.config.native
            )
          )
      );


    if (
      chainsNeedingInternal.length >
      0
    ) {
      await mapLimit(
        chainsNeedingInternal,
        INTERNAL_CONCURRENCY,

        async (chain) => {
          await loadInternal(
            chain,
            wallet
          );

          return true;
        }
      );
    }


    // Source自体は変わらないが
    // 念のため再構築
    sources =
      buildSources(
        chainData,
        wallet
      );


    // ========================================================
    // STEP 4
    // DESTINATION DB
    // ========================================================

    const incoming =
      buildIncoming(
        chainData,
        wallet
      );


    // ========================================================
    // STEP 5
    // MATCH
    // ========================================================

    const {
      edges,
      bySource,
    } =
      buildEdges(
        sources,
        incoming
      );


    const {
      assignments,
      usedDestinations,
    } =
      assignOneToOne(
        edges
      );


    const rows =
      buildRows(
        sources,
        bySource,
        assignments,
        usedDestinations
      );


    // ========================================================
    // SUMMARY
    // ========================================================

    const autoMatched =
      rows.filter(
        (row) =>
          row.status ===
          "AUTO_MATCH"
      ).length;

    const veryHigh =
      rows.filter(
        (row) =>
          row.status ===
            "AUTO_MATCH" &&
          row.confidence ===
            "VERY_HIGH"
      ).length;

    const high =
      rows.filter(
        (row) =>
          row.status ===
            "AUTO_MATCH" &&
          row.confidence ===
            "HIGH"
      ).length;

    const review =
      rows.filter(
        (row) =>
          row.status ===
          "REVIEW"
      ).length;

    const unresolved =
      rows.filter(
        (row) =>
          row.status ===
          "UNRESOLVED"
      ).length;

    const warnings =
      chainData.flatMap(
        (chain) =>
          chain.warnings
      );

    const chainStats =
      buildChainStats(
        chainData
      );


    console.log(
      "RHINO 2026 SCAN",
      {
        wallet,
        bridgeTx:
          sources.length,
        incoming:
          incoming.length,
        autoMatched,
        review,
        unresolved,
        scanTimeMs:
          Date.now() -
          startedAt,
      }
    );


    return NextResponse.json({
      wallet,

      period: {
        year:
          SCAN_YEAR,

        timezone:
          "Asia/Tokyo",

        start:
          "2026-01-01 00:00:00 JST",

        end:
          "2026-12-31 23:59:59 JST",
      },

      summary: {
        bridgeTx:
          sources.length,

        autoMatched,

        veryHigh,

        high,

        review,

        unresolved,

        incomingTransactions:
          incoming.length,

        candidatePairs:
          edges.length,
      },

      rows,

      warnings,

      chainStats,

      unsupportedChains: [
        "BNB Chain",
      ],

      scanTimeMs:
        Date.now() -
        startedAt,
    });

  } catch (error) {
    console.error(
      "SCAN ERROR",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown scan error",
      },
      {
        status:
          500,
      }
    );
  }
}