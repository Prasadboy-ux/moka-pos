import { CATEGORIES, INGREDIENTS } from "@/services/reference";
import type { Category, Ingredient, Product } from "@/types/pos";

/**
 * Mock catalogue adapter. Swap the bodies for axios calls when the API lands;
 * screens import from here and will not change.
 *
 * Every product maps 1:1 to an illustration in public/menu/.
 *
 * PRICES ARE PLACEHOLDERS. Replace this block when real pricing is confirmed.
 *
 * Drinks (coffee, non-coffee) consume ingredients via a recipe. Packaged goods
 * and merchandise (snack, retail) are counted directly, which is what the two
 * `stockMode` variants exist for.
 */

const PLACEHOLDER_PRICES = true;

const PRODUCTS: Product[] = [
  // ---------------------------------------------------------------- Coffee
  {
    id: "p-iced-latte",
    name: "Classic Iced Caffe Latte",
    categoryId: "c-coffee",
    price: PLACEHOLDER_PRICES ? 28000 : 0,
    image: "/menu/coffee/classic_iced_latte.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-milk-fresh", qty: 180 },
      { ingredientId: "i-ice", qty: 80 },
    ],
    isActive: true,
  },
  {
    id: "p-iced-americano",
    name: "Iced Americano",
    categoryId: "c-coffee",
    price: PLACEHOLDER_PRICES ? 26000 : 0,
    image: "/menu/coffee/iced_americano.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-ice", qty: 100 },
    ],
    isActive: true,
  },
  {
    id: "p-cold-foam-cappuccino",
    name: "Iced Cold Foam Cappuccino",
    categoryId: "c-coffee",
    price: PLACEHOLDER_PRICES ? 32000 : 0,
    image: "/menu/coffee/iced_cold_foam_cappuccino.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-milk-fresh", qty: 160 },
      { ingredientId: "i-ice", qty: 60 },
    ],
    isActive: true,
  },

  // ------------------------------------------------------------ Non Coffee
  {
    id: "p-brown-sugar-boba",
    name: "Brown Sugar Boba Milk",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 30000 : 0,
    image: "/menu/non-coffee/brown_sugar_boba_milk.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-tea", qty: 3 },
      { ingredientId: "i-brown-sugar", qty: 30 },
      { ingredientId: "i-milk-fresh", qty: 180 },
      { ingredientId: "i-boba", qty: 50 },
      { ingredientId: "i-ice", qty: 100 },
    ],
    isActive: true,
  },
  {
    id: "p-boba-frappe",
    name: "Boba Milk Tea Frappe",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 30000 : 0,
    image: "/menu/non-coffee/boba_milk_tea_frappe.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-tea", qty: 3 },
      { ingredientId: "i-milk-fresh", qty: 200 },
      { ingredientId: "i-boba", qty: 50 },
      { ingredientId: "i-ice", qty: 120 },
    ],
    isActive: true,
  },
  {
    id: "p-caramel-macchiato",
    name: "Iced Caramel Macchiato",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 32000 : 0,
    image: "/menu/non-coffee/iced_caramel_macchiato.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-milk-fresh", qty: 200 },
      { ingredientId: "i-caramel", qty: 30 },
      { ingredientId: "i-ice", qty: 80 },
    ],
    isActive: true,
  },
  {
    id: "p-mocha-frappe",
    name: "Iced Mocha Frappe",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 34000 : 0,
    image: "/menu/non-coffee/iced_mocha_frappe.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-chocolate", qty: 35 },
      { ingredientId: "i-milk-fresh", qty: 180 },
      { ingredientId: "i-ice", qty: 120 },
    ],
    isActive: true,
  },
  {
    id: "p-iced-lemon-tea",
    name: "Iced Lemon Tea",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 18000 : 0,
    image: "/menu/non-coffee/iced_lemon_tea.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-tea", qty: 3 },
      { ingredientId: "i-lemon", qty: 40 },
      { ingredientId: "i-sugar", qty: 25 },
      { ingredientId: "i-ice", qty: 150 },
    ],
    isActive: true,
  },

  // ----------------------------------------------------------------- Snack
  {
    id: "p-avocado-toast",
    name: "Avocado Toast",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 32000 : 0,
    image: "/menu/snack/avocado_toast.svg",
    stockMode: "direct",
    stock: 6,
    minStock: 8,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-basque-cheesecake",
    name: "Basque Cheesecake",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 28000 : 0,
    image: "/menu/snack/basque_cheesecake.svg",
    stockMode: "direct",
    stock: 4,
    minStock: 6,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-butter-croissant",
    name: "Butter Croissant",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 22000 : 0,
    image: "/menu/snack/butter_croissant.svg",
    stockMode: "direct",
    stock: 9,
    minStock: 12,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-choco-chip-cookie",
    name: "Chocolate Chip Cookie",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 12000 : 0,
    image: "/menu/snack/chocolate_chip_cookie.svg",
    stockMode: "direct",
    stock: 3,
    minStock: 15,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-cinnamon-roll",
    name: "Cinnamon Roll",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 24000 : 0,
    image: "/menu/snack/cinnamon_roll.svg",
    stockMode: "direct",
    stock: 7,
    minStock: 8,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-fudge-brownie",
    name: "Fudge Brownie",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 26000 : 0,
    image: "/menu/snack/fudge_brownie.svg",
    stockMode: "direct",
    stock: 5,
    minStock: 8,
    recipe: [],
    isActive: true,
  },

  // ---------------------------------------------------------------- Retail
  {
    id: "p-ceramic-mug",
    name: "Ceramic Mug",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 65000 : 0,
    image: "/menu/retail/ceramic_mug.svg",
    stockMode: "direct",
    stock: 5,
    minStock: 6,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-bean-bag",
    name: "Coffee Bean Bag 250g",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 95000 : 0,
    image: "/menu/retail/coffee_bean_bag.svg",
    stockMode: "direct",
    stock: 12,
    minStock: 6,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-mineral-water",
    name: "Mineral Water",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 5000 : 0,
    image: "/menu/retail/mineral_water.svg",
    stockMode: "direct",
    stock: 36,
    minStock: 24,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-paper-filters",
    name: "Paper Filters",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 35000 : 0,
    image: "/menu/retail/paper_filters.svg",
    stockMode: "direct",
    stock: 2,
    minStock: 8,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-pour-over-carafe",
    name: "Pour-Over Carafe",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 180000 : 0,
    image: "/menu/retail/pour_over_carafe.svg",
    stockMode: "direct",
    stock: 3,
    minStock: 4,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-travel-tumbler",
    name: "Travel Tumbler",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 120000 : 0,
    image: "/menu/retail/travel_tumbler.svg",
    stockMode: "direct",
    stock: 6,
    minStock: 5,
    recipe: [],
    isActive: true,
  },
];

function simulateLatency(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listCategories(): Promise<Category[]> {
  await simulateLatency(120);
  return [...CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listIngredients(): Promise<Ingredient[]> {
  await simulateLatency(160);
  return [...INGREDIENTS];
}

export async function listProducts(): Promise<Product[]> {
  await simulateLatency(220);
  return PRODUCTS.filter((p) => p.isActive);
}

export async function getIngredientsById(): Promise<Map<string, Ingredient>> {
  const list = await listIngredients();
  return new Map(list.map((i) => [i.id, i]));
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const list = await listProducts();
  return list.find((p) => p.id === id);
}