"use client";

import { createContext, useContext } from "react";
import type { FieldLayout } from "@/lib/field/formations";
import type { RegionKey } from "@/lib/field/renderer";

export interface FieldApi {
  mode: "pending" | "webgl" | "fallback";
  layout: FieldLayout | null;
  region: RegionKey | null;
  setRegion: (r: RegionKey | null) => void;
  reducedMotion: boolean;
}

export const FieldContext = createContext<FieldApi>({
  mode: "pending",
  layout: null,
  region: null,
  setRegion: () => {},
  reducedMotion: false,
});

export const useField = () => useContext(FieldContext);
