"use client";

import { Mail, MessageCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, formatIDR } from "@/lib/format";
import { emailLink, whatsAppLink } from "@/lib/receipt";
import { PAYMENT_LABEL, type Order } from "@/types/pos";

interface ReceiptModalProps {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptModal({ order, onOpenChange }: ReceiptModalProps) {
  if (!order) return null;

  /**
   * Sending is a link out of the browser, not an API call. Until there is a
   * backend that holds an API key, wa.me and mailto are the only honest
   * implementation: both end in an app the customer controls, which is also what
   * keeps a receipt from being delivered to the wrong number by a bug here.
   */
  const whatsapp = whatsAppLink(order);
  const email = emailLink(order);

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Payment complete</DialogTitle>
          <DialogDescription>
            Receipt {order.receiptNo} is ready.
          </DialogDescription>
        </DialogHeader>

{/*
          `data-receipt` is what the print stylesheet in globals.css keys on.
          Without it `window.print()` would print the whole POS screen with the
          receipt floating in the middle of it.
        */}
        <div
          data-receipt
          className="mx-auto w-full max-w-[280px] rounded-lg border bg-white p-4 text-[11px] leading-snug text-black"
        >
          <div className="text-center">
            <p translate="no" className="text-sm font-bold tracking-tight">MOKA CAFE</p>
            <p className="tracking-[0.2em] text-[8px] font-semibold">
              POINT OF SALE
            </p>
          </div>

          <div className="my-2 border-t border-dashed" />

          <div className="space-y-0.5">
            <Row label="Receipt" value={order.receiptNo} />
            <Row label="Date" value={formatDateTime(order.createdAt)} />
            <Row label="Cashier" value={order.cashierName} />
            {/*
              Only the name goes on paper. The phone number is a routing detail
              for the send buttons — printing it puts a customer's number on a
              slip that gets left on the counter.
            */}
            {order.customer ? <Row label="Customer" value={order.customer.name} /> : null}
          </div>

          <div className="my-2 border-t border-dashed" />

          <table className="w-full">
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.productId} className="align-top">
                  <td className="py-0.5 pr-2">
                    <p className="font-medium">{line.name}</p>
                    <p className="text-[10px]">
                      {line.qty} × {formatIDR(line.price)}
                    </p>
                  </td>
                  <td className="py-0.5 text-right align-top font-medium tabular-nums whitespace-nowrap">
                    {formatIDR(line.price * line.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-2 border-t border-dashed" />

          <div className="space-y-0.5">
            <Row label="Subtotal" value={formatIDR(order.subtotal)} />
            <Row
              label={`PPN ${Math.round(order.taxRate * 100)}%`}
              value={formatIDR(order.taxAmount)}
            />
            <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatIDR(order.total)}</span>
            </div>
          </div>

          <div className="my-2 border-t border-dashed" />

          <div className="space-y-0.5">
            <Row label={PAYMENT_LABEL[order.paymentMethod]} value={formatIDR(order.paidAmount)} />
            {order.changeAmount > 0 ? (
              <Row label="Change" value={formatIDR(order.changeAmount)} />
            ) : null}
          </div>

          <div className="my-2 border-t border-dashed" />

          <p translate="no" className="text-center text-[9px]">
            Thank you for visiting Moka Cafe.
          </p>
        </div>

        {/*
          Outside `data-receipt` on purpose. These are actions on the till's
          screen, and the print stylesheet hides everything the receipt does not
          contain — leaving them inside would print a row of buttons on the
          customer copy.
        */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Print receipt
          </Button>

          {whatsapp ? (
            <Button variant="outline" asChild>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" aria-hidden />
                Send WhatsApp
              </a>
            </Button>
          ) : null}

          {email ? (
            <Button variant="outline" asChild>
              <a href={email}>
                <Mail className="size-4" aria-hidden />
                Send email
              </a>
            </Button>
          ) : null}

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            New order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}