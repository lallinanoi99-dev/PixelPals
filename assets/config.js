// The one place to set contract addresses and links.
// Leave `contract` empty to run in preview mode (a local, simulated contract saved in this browser).
export const CONFIG = {
  networks: {
    mainnet: {
      chainId: 677,
      name: 'BOT Chain',
      rpc: 'https://rpc.botchain.ai',
      explorer: 'https://scan.botchain.ai',
      contract: '0x1D3fE4d23FbB681DD938B32357C045C4898b8b5e', // PixelPals on BOT Chain mainnet (deployed block 29573648)
    },
    testnet: {
      chainId: 968,
      name: 'BOT Chain Testnet',
      rpc: 'https://rpc.bohr.life',
      explorer: 'https://scan.bohr.life',
      contract: '', // ← testnet address (used with ?net=testnet)
    },
  },
  maxSupply: 677,
  maxPerWallet: 3,
  links: {
    botchain: 'https://botchain.ai',
    github: 'https://github.com/',
    x: 'https://x.com/',
  },
  storageKey: 'pixelpals',
};
