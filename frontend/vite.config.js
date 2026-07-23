import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../shared'),
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        // Dev sunucusu: ortamdan gelen PORT'u kullan (5173 doluysa araç başka port atar)
        port: Number(process.env.PORT) || 5173,
        fs: {
            allow: ['..'],
        },
    },
})
