import { build } from "esbuild";
await build({
  stdin: {
    contents: 'export { default } from "@dagrejs/dagre";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  minify: true,
  outfile: "vendor/dagre.js",
});
await build({
  stdin: {
    contents: 'export { jsPDF } from "jspdf";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  minify: true,
  outfile: "vendor/jspdf.es.min.js",
});
