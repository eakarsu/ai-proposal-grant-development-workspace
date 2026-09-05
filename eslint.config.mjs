import next from "eslint-config-next/core-web-vitals";
const config = [...next, { ignores: [".next/**", "node_modules/**", "backend/**", "frontend/**", "prisma/seed.ts"] }, {files:["scripts/**"],rules:{"@next/next/no-assign-module-variable":"off"}}];
export default config;
