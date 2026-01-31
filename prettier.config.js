/* eslint-disable import/no-anonymous-default-export */
/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
export default {
  plugins: ["prettier-plugin-packagejson", "prettier-plugin-tailwindcss"],
  tailwindFunctions: ["cn", "cva"],
  tailwindStylesheet: "./src/styles/globals.css",
};
