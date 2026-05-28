import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './app.css'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5dk — veri bu süre boyunca "taze" kabul edilir
      gcTime: 10 * 60 * 1000,        // 10dk — kullanılmayan cache bellekte kalır
      refetchOnWindowFocus: false,    // Sekme değişiminde refetch yapma
      retry: 1,                       // Hata durumunda 1 kez tekrar dene
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
