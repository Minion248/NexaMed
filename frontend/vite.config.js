/*import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})*/

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // Fixed the name here
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // This tells Vite both files exist
        main: resolve(__dirname, 'front.html'),
        app: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    // This ensures that when you go to localhost:5173, it looks for front.html
    open: '/front.html',
  }
});