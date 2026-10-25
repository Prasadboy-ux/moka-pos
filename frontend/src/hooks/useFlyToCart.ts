"use client";

import { useCallback, useState } from "react";
import type { Flight } from "@/components/motion/FlyToCart";

let flightId = 0;

export function useFlyToCart() {
  const [flight, setFlight] = useState<Flight | null>(null);

  const launch = useCallback((image: string, from: DOMRect, to: DOMRect) => {
    setFlight({
      id: (flightId += 1),
      image,
      from: {
        x: from.left,
        y: from.top,
        width: from.width,
        height: from.height,
      },
      to: {
        x: to.left + to.width / 2,
        y: to.top + to.height / 2,
      },
    });
  }, []);

  const clear = useCallback(() => setFlight(null), []);

  return { flight, launch, clear };
}
