"use client";

import { TAX_RATE_DEFAULT } from "@/types/pos";
import { adoptStoreTimezone } from "@/lib/repositories/report-math";
import type { ConfigRepository } from "@/lib/repositories/types";

export const configRepository: ConfigRepository = {
  async get() {
    // Same adoption as the HTTP repository, so both implementations teach the
    // calendar helpers their zone the same way.
    adoptStoreTimezone("Asia/Jakarta");
    return {
      taxRate: TAX_RATE_DEFAULT,
      storeTimezone: "Asia/Jakarta",
    };
  },
};
