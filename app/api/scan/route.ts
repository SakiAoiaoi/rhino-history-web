import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================
// SETTINGS
// ============================================================

const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY?.trim() ?? "";

const ETHERSCAN_URL =
  "https://api.etherscan.io/v2/api";

const PAGE_SIZE = 1000;
const MAX_TIME_DIFF_SEC = 2 * 60 * 60;

const MIN_AMOUNT_RATIO = 0.70;
const MAX_AMOUNT_RATIO = 1.02;

const AUTO_ASSIGN_MIN_SCORE = 80;
const REVIEW_MIN_SCORE = 65;


// ============================================================
// TYPES
// ============================================================

type ExplorerAction =
  | "txlist"
  | "tokentx"
  | "txlistinternal";

type ExplorerTx = Record<
  string,
  string | undefined
>;

type ChainConfig = {
  name: string;
  chainId: number;
  bridge: string;
  native: string;
  blockscout?: string;
};

type ChainData = {
  config: ChainConfig;
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
// BNBは一旦除外
// ============================================================

const CHAINS: ChainConfig[] = [

  {
    name: "Ethereum",
    chainId: 1,

    bridge:
      "0xbca3039a18c0d2f2f84ba8a028c67290bc045afa",

    native: "ETH",
  },

  {
    name: "Arbitrum",
    chainId: 42161,

    bridge:
      "0x10417734001162ea139e8b044dfe28dbb8b28ad0",

    native: "ETH",
  },

  {
    name: "Base",
    chainId: 8453,

    bridge:
      "0x2f59e9086ec8130e21bd052065a9e6b2497bb102",

    native: "ETH",

    blockscout:
      "https://base.blockscout.com/api",
  },

  {
    name: "Optimism",
    chainId: 10,

    bridge:
      "0x0bca65bf4b4c8803d2f0b49353ed57caaf3d66dc",

    native: "ETH",

    blockscout:
      "https://optimism.blockscout.com/api",
  },

  {
    name: "Polygon",
    chainId: 137,

    bridge:
      "0xba4eee20f434bc3908a0b18da496348657133a7e",

    native: "POL",
  },

  {
    name: "Avalanche",
    chainId: 43114,

    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",

    native: "AVAX",
  },

  {
    name: "Linea",
    chainId: 59144,

    bridge:
      "0xcf68a2721394dcf5dcf66f6265c1819720f24528",

    native: "ETH",
  },

  {
    name: "Scroll",
    chainId: 534352,

    bridge:
      "0x87627c7e586441eef9ee3c28b66662e897513f33",

    native: "ETH",

    blockscout:
      "https://scroll.blockscout.com/api",
  },

  {
    name: "Mantle",
    chainId: 5000,

    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",

    native: "MNT",
  },

  {
    name: "Blast",
    chainId: 81457,

    bridge:
      "0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1",

    native: "ETH",
  },
];


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
// UTIL
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


function dateJst(
  timestamp: number
) {
  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      timeZone: "Asia/Tokyo",

      year: "numeric",
      month: "2-digit",
      day: "2-digit",

      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",

      hour12: false,
    }
  )
    .format(
      new Date(
        timestamp * 1000
      )
    )
    .replace(/\//g, "-");
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
    raw
      .split("(")[0]
      ?.trim()
      ?? ""
  );
}


// ============================================================
// COMMITMENT ID
//
// ExplorerがfunctionNameを返してくれれば
// ABI calldataから直接読む
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

    // 0x + 4byte selector
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
    // address, amount, commitmentId
    return readAbiWord(
      input,
      2
    );
  }

  if (
    fn ===
    "depositnativewithid"
  ) {
    return readAbiWord(
      input,
      0
    );
  }

  if (
    fn ===
    "depositwithpermit"
  ) {
    return readAbiWord(
      input,
      6
    );
  }

  return "";
}


// ============================================================
// EXPLORER RESPONSE
// ============================================================

function noRecords(
  data: Record<
    string,
    unknown
  >
) {
  if (
    Array.isArray(
      data.result
    ) &&
    data.result.length === 0
  ) {
    return true;
  }

  const text =
    (
      String(
        data.result ?? ""
      ) +
      " " +
      String(
        data.message ?? ""
      )
    ).toLowerCase();

  return (
    text.includes(
      "no transactions found"
    ) ||
    text.includes(
      "no records found"
    ) ||
    text.includes(
      "no token transfers found"
    )
  );
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
    attempt <= 4;
    attempt++
  ) {

    try {

      const response =
        await fetch(
          `${url}?${params.toString()}`,
          {
            cache: "no-store",
          }
        );

      const text =
        await response.text();

      let data:
        Record<
          string,
          unknown
        >;

      try {

        data =
          JSON.parse(text);

      } catch {

        throw new Error(
          `Invalid JSON: ${
            text.slice(
              0,
              150
            )
          }`
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

        await sleep(
          attempt * 1000
        );

        continue;
      }

      if (!response.ok) {

        throw new Error(
          `HTTP ${
            response.status
          }`
        );
      }

      return data;

    } catch (error) {

      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      if (attempt < 4) {

        await sleep(
          attempt * 750
        );
      }
    }
  }

  throw new Error(
    lastError ||
    "Request failed"
  );
}


// ============================================================
// ETHERSCAN V2
// ============================================================

async function etherscanPage(
  config: ChainConfig,
  action: ExplorerAction,
  address: string,
  page: number
) {

  if (!ETHERSCAN_API_KEY) {

    throw new Error(
      "ETHERSCAN_API_KEY is missing"
    );
  }

  const params =
    new URLSearchParams({

      chainid:
        String(
          config.chainId
        ),

      module:
        "account",

      action,

      address,

      startblock:
        "0",

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

      apikey:
        ETHERSCAN_API_KEY,
    });

  const data =
    await requestJson(
      ETHERSCAN_URL,
      params
    );

  if (noRecords(data)) {
    return [];
  }

  if (
    String(
      data.status ?? ""
    ) !== "1"
  ) {

    throw new Error(
      `${
        data.message ?? ""
      } / ${
        data.result ?? ""
      }`
    );
  }

  if (
    !Array.isArray(
      data.result
    )
  ) {

    throw new Error(
      "Unexpected Etherscan result"
    );
  }

  return (
    data.result as ExplorerTx[]
  );
}


// ============================================================
// ROUTESCAN
// ============================================================

async function routescanPage(
  config: ChainConfig,
  action: ExplorerAction,
  address: string,
  page: number
) {

  const url =
    "https://api.routescan.io/" +
    "v2/network/mainnet/evm/" +
    `${config.chainId}/` +
    "etherscan/api";

  const params =
    new URLSearchParams({

      module:
        "account",

      action,

      address,

      startblock:
        "0",

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

  const data =
    await requestJson(
      url,
      params
    );

  if (noRecords(data)) {
    return [];
  }

  if (
    String(
      data.status ?? ""
    ) !== "1"
  ) {

    throw new Error(
      `${
        data.message ?? ""
      } / ${
        data.result ?? ""
      }`
    );
  }

  if (
    !Array.isArray(
      data.result
    )
  ) {

    throw new Error(
      "Unexpected Routescan result"
    );
  }

  return (
    data.result as ExplorerTx[]
  );
}


// ============================================================
// BLOCKSCOUT
// ============================================================

async function blockscoutPage(
  config: ChainConfig,
  action: ExplorerAction,
  address: string,
  page: number
) {

  if (
    !config.blockscout
  ) {

    throw new Error(
      "Blockscout not configured"
    );
  }

  const params =
    new URLSearchParams({

      module:
        "account",

      action,

      address,

      startblock:
        "0",

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

  const data =
    await requestJson(
      config.blockscout,
      params
    );

  if (noRecords(data)) {
    return [];
  }

  if (
    String(
      data.status ?? ""
    ) !== "1"
  ) {

    throw new Error(
      `${
        data.message ?? ""
      } / ${
        data.result ?? ""
      }`
    );
  }

  if (
    !Array.isArray(
      data.result
    )
  ) {

    throw new Error(
      "Unexpected Blockscout result"
    );
  }

  return (
    data.result as ExplorerTx[]
  );
}


// ============================================================
// PAGINATION
// ============================================================

type PageFunction = (
  config: ChainConfig,
  action: ExplorerAction,
  address: string,
  page: number
) => Promise<ExplorerTx[]>;


async function allPages(
  fn: PageFunction,
  config: ChainConfig,
  action: ExplorerAction,
  address: string
) {

  const result:
    ExplorerTx[] = [];

  let page = 1;

  while (true) {

    const rows =
      await fn(
        config,
        action,
        address,
        page
      );

    result.push(
      ...rows
    );

    if (
      rows.length <
      PAGE_SIZE
    ) {
      break;
    }

    page++;

    await sleep(250);
  }

  return result;
}


// ============================================================
// AUTO PROVIDER
// ============================================================

async function fetchHistory(
  config: ChainConfig,
  action: ExplorerAction,
  address: string
): Promise<{
  rows: ExplorerTx[];
  provider: string;
}> {

  const providers: {
    name: string;
    fn: PageFunction;
  }[] = [

    {
      name: "Etherscan",
      fn: etherscanPage,
    },

    {
      name: "Routescan",
      fn: routescanPage,
    },

    {
      name: "Blockscout",
      fn: blockscoutPage,
    },
  ];

  const errors: string[] =
    [];

  for (
    const provider
    of providers
  ) {

    try {

      const rows =
        await allPages(
          provider.fn,
          config,
          action,
          address
        );

      return {
        rows,
        provider:
          provider.name,
      };

    } catch (error) {

      errors.push(
        `${
          provider.name
        }: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }
  }

  throw new Error(
    errors.join(" | ")
  );
}


// ============================================================
// LOAD CHAIN
// ============================================================

async function loadChain(
  config: ChainConfig,
  address: string
): Promise<ChainData> {

  const warnings:
    string[] = [];

  let normal:
    ExplorerTx[] = [];

  let tokens:
    ExplorerTx[] = [];

  let internal:
    ExplorerTx[] = [];

  let normalProvider = "";
  let tokenProvider = "";
  let internalProvider = "";

  try {

    const result =
      await fetchHistory(
        config,
        "txlist",
        address
      );

    normal =
      result.rows;

    normalProvider =
      result.provider;

  } catch (error) {

    warnings.push(
      `${config.name} normal: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }


  await sleep(450);


  try {

    const result =
      await fetchHistory(
        config,
        "tokentx",
        address
      );

    tokens =
      result.rows;

    tokenProvider =
      result.provider;

  } catch (error) {

    warnings.push(
      `${config.name} ERC20: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }


  await sleep(450);


  try {

    const result =
      await fetchHistory(
        config,
        "txlistinternal",
        address
      );

    internal =
      result.rows;

    internalProvider =
      result.provider;

  } catch (error) {

    warnings.push(
      `${config.name} internal: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }


  return {

    config,

    normal,
    tokens,
    internal,

    providers: {
      normal:
        normalProvider,

      tokens:
        tokenProvider,

      internal:
        internalProvider,
    },

    warnings,
  };
}


// ============================================================
// CONCURRENCY = 2
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

  let nextIndex = 0;

  async function runWorker() {

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
      () => runWorker()
    )
  );

  return output;
}


// ============================================================
// SOURCE TX
// ============================================================

function buildSources(
  data:
    ChainData[],
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

      let token = "";
      let amount = "0";

      if (relatedToken) {

        token =
          relatedToken
            .tokenSymbol ??
          "";

        amount =
          formatUnits(
            relatedToken
              .value ??
              "0",

            Number(
              relatedToken
                .tokenDecimal ??
                0
            )
          );

      } else {

        const rawValue =
          tx.value ?? "0";

        if (
          BigInt(
            rawValue || "0"
          ) > BigInt(0)
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

      const timestamp =
        timestampOf(tx);

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
          Number(amount),

        sourceTx:
          hash,

        functionName:
          functionNameOf(tx),

        commitmentId:
          getCommitmentId(tx),
      });
    }
  }

  sources.sort(
    (
      a,
      b
    ) =>
      a.timestamp -
      b.timestamp
  );

  return sources;
}


// ============================================================
// DESTINATION DATABASE
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

    // --------------------------------------------------------
    // ERC20
    // --------------------------------------------------------

    for (
      const tx
      of chain.tokens
    ) {

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

      const timestamp =
        timestampOf(tx);

      const extra =
        tx.logIndex ??
        tx.transactionIndex ??
        "";

      incoming.push({

        id:
          `${chain.config.name}` +
          `|ERC20|${hash}` +
          `|${extra}` +
          `|${tx.contractAddress ?? ""}` +
          `|${amount}`,

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
          Number(amount),

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


    // --------------------------------------------------------
    // NATIVE
    // --------------------------------------------------------

    for (
      const tx
      of chain.normal
    ) {

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
        ) <= BigInt(0)
      ) {
        continue;
      }

      const amount =
        formatUnits(
          raw,
          18
        );

      const timestamp =
        timestampOf(tx);

      const hash =
        txHash(tx);

      incoming.push({

        id:
          `${chain.config.name}` +
          `|NATIVE|${hash}` +
          `|${amount}`,

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
          Number(amount),

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


    // --------------------------------------------------------
    // INTERNAL
    // --------------------------------------------------------

    for (
      const tx
      of chain.internal
    ) {

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
        ) <= BigInt(0)
      ) {
        continue;
      }

      const amount =
        formatUnits(
          raw,
          18
        );

      const timestamp =
        timestampOf(tx);

      const hash =
        txHash(tx);

      const extra =
        tx.traceId ??
        tx.index ??
        "";

      incoming.push({

        id:
          `${chain.config.name}` +
          `|INTERNAL|${hash}` +
          `|${extra}` +
          `|${amount}`,

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
          Number(amount),

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


  // exact duplicate除去

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
// SCORE
// ============================================================

function scoreCandidate(
  source: SourceRecord,
  destination:
    IncomingRecord
): MatchEdge | null {

  // 同一チェーンは除外
  if (
    source.fromChain ===
    destination.chain
  ) {
    return null;
  }


  // Token一致
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
    timeDiffSec < -30
  ) {
    return null;
  }


  if (
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
    MIN_AMOUNT_RATIO
  ) {
    return null;
  }


  if (
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


  let score = 100;


  const timePenalty =
    Math.min(
      30,

      (
        Math.abs(
          timeDiffSec
        ) /
        MAX_TIME_DIFF_SEC
      ) * 30
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


  if (score >= 90) {

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
// MATCH ALL
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
      (
        a,
        b
      ) => {

        if (
          b.score !==
          a.score
        ) {
          return (
            b.score -
            a.score
          );
        }

        return (
          Math.abs(
            a.timeDiffSec
          ) -
          Math.abs(
            b.timeDiffSec
          )
        );
      }
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
// GLOBAL ONE-TO-ONE
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
        (
          a,
          b
        ) => {

          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          if (
            Math.abs(
              a.timeDiffSec
            ) !==
            Math.abs(
              b.timeDiffSec
            )
          ) {

            return (
              Math.abs(
                a.timeDiffSec
              ) -
              Math.abs(
                b.timeDiffSec
              )
            );
          }

          return (
            a.amountDiffPct -
            b.amountDiffPct
          );
        }
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
// PUBLIC RESULTS
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


        // ====================================================
        // AUTO MATCH
        // ====================================================

        if (assigned) {

          return {

            dateJst:
              source.dateJst,

            fromChain:
              source.fromChain,

            toChain:
              assigned
                .destination
                .chain,

            token:
              source.token,

            amountIn:
              source.amountIn,

            amountOut:
              assigned
                .destination
                .amount,

            amountDifference:
              (
                source.amountNumber -
                assigned
                  .destination
                  .amountNumber
              ).toString(),

            amountDiffPct:
              Number(
                assigned
                  .amountDiffPct
                  .toFixed(6)
              ),

            travelTimeSec:
              assigned
                .timeDiffSec,

            status:
              "AUTO_MATCH",

            confidence:
              assigned
                .confidence,

            score:
              Number(
                assigned
                  .score
                  .toFixed(2)
              ),

            functionName:
              source
                .functionName,

            commitmentId:
              source
                .commitmentId,

            sourceTx:
              source
                .sourceTx,

            destinationTx:
              assigned
                .destination
                .txHash,

            destinationFrom:
              assigned
                .destination
                .from,
          };
        }


        // ====================================================
        // REVIEW / UNRESOLVED
        // ====================================================

        const candidates =
          bySource.get(
            source.id
          ) ?? [];


        // 他Sourceが使用済みの
        // DestinationはReview候補から外す

        const bestAvailable =
          candidates.find(
            (edge) =>
              !usedDestinations.has(
                edge.destination.id
              )
          );


        const isReview =
          bestAvailable &&
          bestAvailable.score >=
            REVIEW_MIN_SCORE;


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
              ? bestAvailable
                  ?.confidence ??
                "MEDIUM"
              : "NONE",

          score:
            isReview
              ? Number(
                  bestAvailable
                    ?.score
                    .toFixed(2)
                )
              : null,

          functionName:
            source
              .functionName,

          commitmentId:
            source
              .commitmentId,

          sourceTx:
            source
              .sourceTx,

          destinationTx:
            "",

          destinationFrom:
            "",
        };
      }
    );


  // Webでは新しい順

  return rows.reverse();
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


    // ========================================================
    // VALIDATE
    // ========================================================

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
          status: 400,
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
          status: 500,
        }
      );
    }


    // ========================================================
    // LOAD ALL CHAIN HISTORY
    // ========================================================

    const chainData =
      await mapLimit(
        CHAINS,
        2,

        (config) =>
          loadChain(
            config,
            wallet
          )
      );


    // ========================================================
    // SOURCE
    // ========================================================

    const sources =
      buildSources(
        chainData,
        wallet
      );


    // ========================================================
    // DESTINATION DATABASE
    // ========================================================

    const incoming =
      buildIncoming(
        chainData,
        wallet
      );


    // ========================================================
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
        (data) =>
          data.warnings
      );


    return NextResponse.json({

      wallet,

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

      unsupportedChains: [
        "BNB Chain",
      ],

      scanTimeMs:
        Date.now() -
        startedAt,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown scan error",
      },
      {
        status: 500,
      }
    );
  }
}