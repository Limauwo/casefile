import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// /** @type {import('@sveltejs/kit').Config} */
// const config = {
// 	preprocess: vitePreprocess(),
// 	kit: {
// 		adapter: adapter()
// 	}
// };

export default {
  kit: {
    adapter: adapter({ fallback: "404.html" }),
    paths: { base: process.env.NODE_ENV === "production" ? "/casefile" : "" },
  },
};

// export default config;
