import type { User } from "@/types/auth";
import type { Category, Ingredient, Product } from "@/types/pos";
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
  get: () => request<AppConfig>(() => http.get("/config")),
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

  /**
   * The role is sent with the credentials so the server can refuse a mismatch
   * before it sets a session cookie. Without it, the browser could hold a valid
   * session for the wrong role while the form still showed an error.
   */
  async authenticate(username: string, password: string, role?) {
    try {
      const { user } = await request<{ user: User }>(() =>
        http.post("/auth/login", { username, password, role }),
      );
      return { ok: true as const, user };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;

      if (error.status === 401) {
        return {
          ok: false as const,
          reason: error.reason === "inactive" ? "inactive" : "invalid",
        };
      }

      if (error.status === 403 && error.reason === "role-mismatch") {
        return { ok: false as const, reason: "role-mismatch" as const };
      }

      throw error;
    }
  },
};