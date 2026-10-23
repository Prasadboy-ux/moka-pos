"use client";

import { TAX_RATE_DEFAULT } from "@/types/pos";
import type { ConfigRepository } from "@/lib/repositories/types";

export const configRepository: ConfigRepository = {
  async get() {
    return {
      taxRate: TAX_RATE_DEFAULT,
      storeTimezone: "Asia/Jakarta",
    };
  },
};
