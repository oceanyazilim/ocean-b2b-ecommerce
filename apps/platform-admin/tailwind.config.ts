import type { Config } from "tailwindcss";

import { oceanPreset } from "@ocean/config/tailwind/preset";

const config: Config = {
  presets: [oceanPreset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
