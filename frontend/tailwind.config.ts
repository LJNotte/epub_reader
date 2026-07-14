import type { Config } from "tailwindcss";
export default { content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: { colors: { ink: "#20221d", moss: "#29453b", paper: "#fffdf8" } } }, plugins: [] } satisfies Config;
