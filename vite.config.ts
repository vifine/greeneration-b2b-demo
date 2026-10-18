import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the custom domain green-b2b.vifine.tech (see public/CNAME), so base is "/".
export default defineConfig({
  base: '/',
  plugins: [react()],
});
