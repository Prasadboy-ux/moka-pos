import { formatDateTime, formatIDR } from "@/lib/format";
import { PAYMENT_LABEL, type Order } from "@/types/pos";

/**
 * The plain-text form of a receipt.
 *
 * The printed receipt and the sent one have to say the same thing, so both are
 * built here rather than one being a hand-written summary of the other. Any
 * field added to the printed receipt has to be added here too, which is the
 * point: a customer who gets a different total by WhatsApp than on paper has
 * been handed a reason to distrust the till.
 */
export function receiptText(order: Order): string {
  const width = 28;
  const pad = (label: string, value: string) =>
    `${label.padEnd(width - value.length)}${value}`;

  const lines: string[] = [
    "MOKA CAFE - POINT OF SALE",
    "",
    pad("Receipt", order.receiptNo),
    pad("Date", formatDateTime(order.createdAt)),
    pad("Cashier", order.cashierName),
  ];

  if (order.customer) {
    lines.push(pad("Customer", order.customer.name));
    lines.push(pad("Phone", order.customer.phone));
  }

  lines.push("", "---");

  for (const line of order.lines) {
    lines.push(`${line.qty} x ${line.name}`);
    lines.push(pad("", formatIDR(line.price * line.qty)));
  }

  lines.push("", "---");
  lines.push(pad("Subtotal", formatIDR(order.subtotal)));
  lines.push(pad(`PPN ${Math.round(order.taxRate * 100)}%`, formatIDR(order.taxAmount)));
  lines.push(pad("TOTAL", formatIDR(order.total)));
  lines.push("", "---");
  lines.push(pad(PAYMENT_LABEL[order.paymentMethod], formatIDR(order.paidAmount)));

  if (order.changeAmount > 0) {
    lines.push(pad("Change", formatIDR(order.changeAmount)));
  }

  lines.push("", "Thank you for visiting Moka Cafe.");

  return lines.join("\n");
}

/**
 * A wa.me link carrying the receipt as a pre-typed message.
 *
 * `wa.me` rather than the `api.whatsapp.com/send` form because it needs no API
 * key and no backend: the send happens in the customer's WhatsApp app, which is
 * the only party that can decide it is really them.
 *
 * Null when the order has no number — a link with an empty recipient opens a
 * blank contact picker, which looks like a bug at the counter.
 */
export function whatsAppLink(order: Order): string | null {
  const phone = order.customer?.phone;
  if (!phone) return null;

  return `https://wa.me/${phone}?text=${encodeURIComponent(receiptText(order))}`;
}

/** A `mailto:` link. Same reasoning: the customer's own mail client sends it. */
export function emailLink(order: Order): string | null {
  const email = order.customer?.email;
  if (!email) return null;

  const subject = `Your receipt from Moka Cafe (${order.receiptNo})`;

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    receiptText(order),
  )}`;
}