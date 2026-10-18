import { z } from 'zod';
import { objectId, rupiah } from '../../lib/schemas.js';

export const openShiftInput = z.object({
  openingFloat: rupiah,
});

export const closeShiftInput = z.object({
  counted: rupiah,
});

export const shiftQuery = z.object({ cashierId: objectId.optional() });

export type OpenShiftInput = z.infer<typeof openShiftInput>;
export type CloseShiftInput = z.infer<typeof closeShiftInput>;
export type ShiftQuery = z.infer<typeof shiftQuery>;
