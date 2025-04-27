import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import App from './App.jsx';
import './styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import { defineChain } from 'viem';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

window.Buffer = window.Buffer || Buffer;

const queryClient = new QueryClient();

const luksoTestnet = defineChain({
  id: 4201,
  name: 'LUKSO Testnet',
  nativeCurrency: {
    name: 'LUKSO',
    symbol: 'LYXt',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.lukso.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'LUKSO Explorer',
      url: 'https://explorer.execution.testnet.lukso.network/',
    },
  },
  testnet: true,
});

const config = getDefaultConfig({
  appName: 'ArtGridStudio',
  projectId: '693d6c3f81483881280383012bb6b84d',
  chains: [luksoTestnet],
  ssr: false,
  metadata: {
    name: 'ArtGridStudio',
    description: 'NFT marketplace with engagement-based tiers',
    url: 'http://localhost:5173',
    icons: ['/favicon.ico'],
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider showRecentTransactions={true}>
          <App />
          <Toaster position="bottom-right" reverseOrder={true} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);