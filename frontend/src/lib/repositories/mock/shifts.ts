"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency } from "@/lib/repositories/mock/helpers";
import type { ShiftRepository } from "@/lib/repositories/types";
import { roundIDR, type Shift } from "@/types/pos";

/**
 * Cash shifts.
 *
 * A shift is not yet a gate on selling — the POS works without one — but the
 * reports split takings per shift, so the record has to exist before the report
 * screen is built rather than being retrofitted onto old orders.
 */
export const shiftRepository: ShiftRepository = {
  async current(userId) {
    await simulateLatency(80);
    const shift = readDb().shifts.find(
      (s) => s.userId === userId && s.status === "open",
    );
    return shift ? clone(shift) : null;
  },

  async list(query = {}) {
    await simulateLatency(160);
    const { cashierId } = query;

    return readDb()
      .shifts.map(clone)
      .filter((shift) => !cashierId || shift.userId === cashierId)
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  },

  async open(input) {
    await simulateLatency();
    return mutate((db) => {
      const alreadyOpen = db.shifts.find(
        (s) => s.userId === input.cashier.id && s.status === "open",
      );
      if (alreadyOpen) throw new Error("You already have an open shift.");

      const highest = db.shifts.reduce((max, shift) => {
        const suffix = Number.parseInt(shift.id.replace("sh-", ""), 10);
        return Number.isNaN(suffix) ? max : Math.max(max, suffix);
      }, 0);

      const shift: Shift = {
        id: `sh-${highest + 1}`,
        userId: input.cashier.id,
        userName: input.cashier.name,
        openedAt: new Date().toISOString(),
        openingFloat: roundIDR(input.openingFloat),
        closedAt: null,
        closingCounted: null,
        status: "open",
      };

      db.shifts.push(shift);
      return clone(shift);
    });
  },

  async close(id, counted) {
    await simulateLatency();
    return mutate((db) => {
      const shift = db.shifts.find((s) => s.id === id);
      if (!shift) throw new Error("Shift not found.");
      if (shift.status === "closed") throw new Error("That shift is already closed.");

      shift.status = "closed";
      shift.closedAt = new Date().toISOString();
      shift.closingCounted = roundIDR(counted);
      return clone(shift);
    });
  },
};