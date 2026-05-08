import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import {
  PrismaSessionStorage,
  type PrismaSessionStorageInterface,
} from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

function appDistribution() {
  const distribution = process.env.SHOPIFY_APP_DISTRIBUTION?.toLowerCase();

  if (distribution === "single_merchant" || distribution === "custom") {
    return AppDistribution.SingleMerchant;
  }

  return AppDistribution.AppStore;
}

const SESSION_READY_RETRIES = 5;
const SESSION_READY_RETRY_INTERVAL_MS = 1000;
const SESSION_OPERATION_RETRY_DELAYS_MS = [300, 1000, 2500];

function isTransientSessionStorageError(error: unknown) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  return /PrismaClientInitializationError|MissingSession(Storage|Table)Error|Can't reach database server|P1001|ECONNRESET|ECONNREFUSED|ETIMEDOUT|connection/i.test(
    message,
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithSessionStorageRetry<T>(
  storage: PrismaSessionStorageInterface,
  operation: () => Promise<T>,
) {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= SESSION_OPERATION_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        !isTransientSessionStorageError(error) ||
        attempt === SESSION_OPERATION_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      await storage.isReady();
      await delay(SESSION_OPERATION_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function createSessionStorage(): PrismaSessionStorageInterface {
  const storage = new PrismaSessionStorage(prisma, {
    connectionRetries: SESSION_READY_RETRIES,
    connectionRetryIntervalMs: SESSION_READY_RETRY_INTERVAL_MS,
  });

  return {
    storeSession: (session) =>
      runWithSessionStorageRetry(storage, () => storage.storeSession(session)),
    loadSession: (id) =>
      runWithSessionStorageRetry(storage, () => storage.loadSession(id)),
    deleteSession: (id) =>
      runWithSessionStorageRetry(storage, () => storage.deleteSession(id)),
    deleteSessions: (ids) =>
      runWithSessionStorageRetry(storage, () => storage.deleteSessions(ids)),
    findSessionsByShop: (shop) =>
      runWithSessionStorageRetry(storage, () =>
        storage.findSessionsByShop(shop),
      ),
    isReady: () => storage.isReady(),
  };
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: createSessionStorage(),
  distribution: appDistribution(),
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
