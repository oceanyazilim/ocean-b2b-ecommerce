"use client";

import type { CartDetail } from "@ocean/types";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/client-api";

interface CartContextValue {
  cart: CartDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (variantId: string, quantity: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: CartDetail }>("/cart");
      setCart(res.data);
    } catch {
      setError("Couldn't load your cart.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (variantId: string, quantity: number) => {
      setError(null);
      try {
        const res = await api<{ data: CartDetail }>("/cart/items", { body: { variantId, quantity } });
        setCart(res.data);
      } catch {
        setError("Couldn't add that to your cart.");
        throw new Error("add-item-failed");
      }
    },
    [],
  );

  const updateItem = useCallback(async (itemId: string, quantity: number) => {
    setError(null);
    try {
      const res = await api<{ data: CartDetail }>(`/cart/items/${itemId}`, { method: "PATCH", body: { quantity } });
      setCart(res.data);
    } catch {
      setError("Couldn't update that item.");
    }
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    setError(null);
    try {
      const res = await api<{ data: CartDetail }>(`/cart/items/${itemId}`, { method: "DELETE" });
      setCart(res.data);
    } catch {
      setError("Couldn't remove that item.");
    }
  }, []);

  return (
    <CartContext.Provider value={{ cart, loading, error, refresh, addItem, updateItem, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
