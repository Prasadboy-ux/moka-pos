import type { Role, User } from "@/types/auth";
import type { Category, Ingredient, Product } from "@/types/pos";
import { adoptStoreTimezone } from "@/lib/repositories/report-math";
import type {
  AppConfig,
  CategoryInput,
  CategoryRepository,
  ConfigRepository,
  IngredientInput,
  IngredientRepository,
  ProductInput,
  ProductQuery,
  ProductRepository,
  UserInput,
  UserRepository,
} from "../types";
import { ApiError, http, query, request } from "./client";

export const configRepository: ConfigRepository = {
  get: async () => {
    const settings = await request<AppConfig>(() => http.get("/config"));

    // The day keys the screens send as `from`/`to` are bucketed by the API in
    // this zone, so adopt it here — the one call every config-reading flow
    // already makes — instead of trusting the build-time env to match.
    adoptStoreTimezone(settings.storeTimezone);

    return settings;
  },
};

export const categoryRepository: CategoryRepository = {
  list: () => request<Category[]>(() => http.get("/categories")),

  create: (input: CategoryInput) =>
    request<Category>(() => http.post("/categories", input)),

  update: (id: string, input: CategoryInput) =>
    request<Category>(() => http.put(`/categories/${id}`, input)),

  /**
   * The server answers 409 `category-in-use` while products still reference the
   * category, and this re-throws as an `ApiError` carrying that reason so the UI
   * can say something specific rather than "failed".
   */
  remove: (id: string) => request<void>(() => http.delete(`/categories/${id}`)),

  reorder: (orderedIds: string[]) =>
    request<Category[]>(() => http.put("/categories/order", { ids: orderedIds })),
};

export const ingredientRepository: IngredientRepository = {
  list: () => request<Ingredient[]>(() => http.get("/ingredients")),

  /**
   * The interface returns `undefined` for a missing record, but the API answers
   * 404. Translating here keeps that promise, so no caller has to learn that a
   * missing record is an exception.
   */
  async getById(id: string): Promise<Ingredient | undefined> {
    try {
      return await request<Ingredient>(() => http.get(`/ingredients/${id}`));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  },

  create: (input: IngredientInput) =>
    request<Ingredient>(() => http.post("/ingredients", input)),

  update: (id: string, input: IngredientInput) =>
    request<Ingredient>(() => http.put(`/ingredients/${id}`, input)),

  // No `remove`. The API has no such route, by design.
};

export const productRepository: ProductRepository = {
  list: (productQuery: ProductQuery = {}) =>
    request<Product[]>(() => http.get(`/products${query({ ...productQuery })}`)),

  async getById(id: string): Promise<Product | undefined> {
    try {
      return await request<Product>(() => http.get(`/products/${id}`));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  },

  create: (input: ProductInput) =>
    request<Product>(() => http.post("/products", input)),

  update: (id: string, input: ProductInput) =>
    request<Product>(() => http.put(`/products/${id}`, input)),

  setActive: (id: string, isActive: boolean) =>
    request<Product>(() => http.patch(`/products/${id}/active`, { isActive })),

  remove: (id: string) => request<void>(() => http.delete(`/products/${id}`)),
};

export const userRepository: UserRepository = {
  list: () => request<User[]>(() => http.get("/users")),

  create: (input: UserInput) => request<User>(() => http.post("/users", input)),

  update: (id: string, input: UserInput) =>
    request<User>(() => http.put(`/users/${id}`, input)),

  setActive: (id: string, isActive: boolean) =>
    request<User>(() => http.patch(`/users/${id}/active`, { isActive })),

  resetMfa: (id: string) =>
    request<User>(() => http.post(`/users/${id}/mfa/reset`)),

  /**
   * The role is sent with the credentials so the server can refuse a mismatch
   * before it sets a session cookie. Without it, the browser could hold a valid
   * session for the wrong role while the form still showed an error.
   */
  async authenticate(username: string, password: string, role?: Role, rememberMe?: boolean) {
    try {
      const response = await request<
        | { user: User }
        | {
            mfaRequired: true;
            mfaToken: string;
            username: string;
            backupCodesRemaining: number;
          }
        | {
            mfaSetupRequired: true;
            setupToken: string;
            secret: string;
            qrUri: string;
            username: string;
          }
      >(() =>
        http.post('/auth/login', { username, password, role, rememberMe }),
      );

      if ('mfaRequired' in response) {
        return {
          ok: true as const,
          mfaRequired: true as const,
          mfaToken: response.mfaToken,
          username: response.username,
          backupCodesRemaining: response.backupCodesRemaining,
        };
      }

      if ('mfaSetupRequired' in response) {
        return {
          ok: true as const,
          mfaSetupRequired: true as const,
          setupToken: response.setupToken,
          secret: response.secret,
          qrUri: response.qrUri,
          username: response.username,
        };
      }

      return { ok: true as const, user: response.user };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;

      if (error.status === 401) {
        return {
          ok: false as const,
          reason: error.reason === 'inactive' ? ('inactive' as const) : ('invalid' as const),
        };
      }

      if (error.status === 403 && error.reason === 'role-mismatch') {
        return { ok: false as const, reason: 'role-mismatch' as const };
      }

      throw error;
    }
  },

  async verifyMfa(mfaToken: string, code: string) {
    try {
      const { user } = await request<{ user: User }>(() =>
        http.post('/auth/mfa/verify', { mfaToken, code }),
      );
      return { ok: true as const, user };
    } catch (error) {
      if (error instanceof ApiError) {
        return { ok: false as const, reason: error.message };
      }
      throw error;
    }
  },

  async confirmMfaSetup(setupToken: string, code: string) {
    try {
      const response = await request<{ user: User; backupCodes: string[] }>(() =>
        http.post('/auth/mfa/setup-confirm', { setupToken, code }),
      );
      return { ok: true as const, user: response.user, backupCodes: response.backupCodes };
    } catch (error) {
      if (error instanceof ApiError) {
        return { ok: false as const, reason: error.message };
      }
      throw error;
    }
  },

  mfaStatus: () =>
    request<{ mfaEnabled: boolean; backupCodesRemaining: number }>(() =>
      http.get('/auth/mfa/status'),
    ),

  async regenerateBackupCodes(currentPassword: string, code: string) {
    try {
      const response = await request<{ backupCodes: string[] }>(() =>
        http.post('/auth/mfa/backup-codes/regenerate', { currentPassword, code }),
      );
      return { ok: true as const, backupCodes: response.backupCodes };
    } catch (error) {
      if (error instanceof ApiError) {
        return { ok: false as const, reason: error.message };
      }
      throw error;
    }
  },
};