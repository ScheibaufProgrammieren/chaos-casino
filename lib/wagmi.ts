// lib/wagmi.ts
'use client';

import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import { createWeb3Modal } from '@web3modal/wagmi/react';

export const CHAIN = baseSepolia;
const RPC_BASE = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA?.trim() || 'https://sepolia.base.org';
export const WALLETCONNECT_ID =
  (process.env.NEXT_PUBLIC_WC_PROJECT_ID && process.env.NEXT_PUBLIC_WC_PROJECT_ID !== 'demo'
    ? process.env.NEXT_PUBLIC_WC_PROJECT_ID
    : undefined) || '2f1ca25e2cf604c10a79dc3b1fb23b4a1';

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  transports: { [CHAIN.id]: http(RPC_BASE) },
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: WALLETCONNECT_ID }),
    coinbaseWallet({ appName: 'Chaos Casino' }),
  ],
});

let modalInited = false;
export function initWeb3Modal() {
  if (modalInited) return;
  createWeb3Modal({
    wagmiConfig,
    projectId: WALLETCONNECT_ID,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#22c55e',
      '--w3m-border-radius-master': '16px',
    },
    enableAnalytics: true,
  });
  modalInited = true;
}
